"""Rotas semanais e adaptador de resumo persistido.

Integração em main: adicionar LEADERBOARD_RATE_LIMITS à política do limitador,
injetar dependências de aluno/professor que exijam a política de privacidade vigente (1.5)
e chamar register_leaderboard_routes. As RPCs conferem os vínculos no banco.
weekly_leaderboard retorna o envelope JSON definido por LeaderboardData;
preferências e resumo retornam objetos JSON. O adaptador aceita também uma
lista de um objeto no transporte PostgREST.
scope=class sem class_id consulta as turmas autorizadas para abrir o seletor;
a RPC devolve o envelope com entries vazio até a escolha da turma.
"""

import unicodedata
from typing import Any, Callable, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, ValidationError, field_validator

from rpc_errors import rpc_http_error


LEADERBOARD_RATE_LIMITS = {
    "leaderboard_read": (60, 15 * 60),
    "leaderboard_preferences": (10, 15 * 60),
}

# Referência do catálogo SQL atual. A autorização de destaque deve consultar
# achievements do resumo persistido, sem limitar campos ou IDs neste adaptador.
FEATURED_ACHIEVEMENT_IDS = frozenset({
    "first_lesson", "study_streak", "ten_correct_answers", "excellent_accuracy",
    "diagnostic_completed", "subject_explorer", "five_lessons", "ten_lessons",
    "twenty_five_correct", "fifty_correct", "five_active_days", "turnaround",
    "weekly_podium",
})

RPC_ERROR_MESSAGES = {
    400: "Confira os dados do ranking.",
    401: "Autenticação necessária.",
    403: "Você não tem permissão para este ranking.",
    404: "Ranking ou turma não encontrado.",
    409: "A preferência conflita com o estado atual da conta.",
    422: "Preferências de ranking inválidas.",
    429: "Limite de solicitações atingido.",
    503: "Ranking temporariamente indisponível.",
}


def _rpc(db: Any, name: str, params: dict[str, Any]) -> Any:
    try:
        return db.rpc(name, params).execute().data
    except Exception as error:
        raise rpc_http_error(error, RPC_ERROR_MESSAGES) from error


def _object(data: Any) -> dict[str, Any]:
    if isinstance(data, list) and len(data) == 1:
        data = data[0]
    if not isinstance(data, dict):
        raise HTTPException(503, "Ranking temporariamente indisponível.")
    return data


def read_summary(db: Any, user_id: str) -> dict[str, Any]:
    """Mantém todos os campos do resumo confiável; user_id vem da sessão."""
    return _object(_rpc(db, "gamification_summary", {"p_actor": user_id}))


def persistent_summary(db: Any, user_id: str) -> dict[str, Any]:
    """Nome alternativo para a integração do resumo em main."""
    return read_summary(db, user_id)


class LeaderboardPreferences(BaseModel):
    model_config = ConfigDict(extra="forbid")

    alias: str = Field(min_length=3, max_length=24)
    school_opt_in: StrictBool

    @field_validator("alias", mode="before")
    @classmethod
    def validate_alias(cls, value: Any) -> str:
        if not isinstance(value, str):
            raise ValueError("Informe um apelido de 3 a 24 caracteres.")
        # Examinar antes de strip evita apagar controles presentes no pedido.
        if any(unicodedata.category(char).startswith("C") for char in value):
            raise ValueError("O apelido contém caracteres de controle.")
        value = unicodedata.normalize("NFC", value).strip()
        # Sem @, pontos, links ou símbolos de contato. Sete dígitos também
        # bloqueiam telefones escritos com espaços ou hífens.
        if (not any(char.isalpha() for char in value)
                or sum(char.isdecimal() for char in value) >= 7
                or any(not (unicodedata.category(char)[0] in {"L", "M"}
                            or char.isdecimal() or char in " _-") for char in value)):
            raise ValueError("Escolha um apelido sem contatos ou links.")
        return value


class LeaderboardRow(BaseModel):
    # O banco pode acrescentar colunas internas sem expor identidades no HTTP.
    model_config = ConfigDict(extra="ignore")

    alias: str
    avatar_key: str | None
    weekly_xp: StrictInt = Field(ge=0)
    level: StrictInt = Field(ge=1)
    rank: StrictInt = Field(ge=1)
    is_me: StrictBool


class LeaderboardClass(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: UUID
    name: str


class LeaderboardData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    entries: list[LeaderboardRow] = Field(max_length=50)
    my_position: LeaderboardRow | None
    total: StrictInt = Field(ge=0)
    page: StrictInt = Field(ge=1, le=1000000)
    page_size: StrictInt = Field(ge=1, le=50)
    week_start: str
    week_end: str
    classes: list[LeaderboardClass]
    school_opt_in: StrictBool
    alias: str


def register_leaderboard_routes(
    app: FastAPI,
    *,
    database: Callable[[], Any],
    student_dependency: Callable[..., dict[str, Any]],
    teacher_dependency: Callable[..., dict[str, Any]],
    enforce_limit: Callable[[Any, str, str], None],
) -> None:
    """Autenticação, consentimento e limite persistido são injetados por main."""

    def weekly(user: dict[str, Any], scope: str, class_id: UUID | None,
               page: int, page_size: int) -> dict[str, Any]:
        db = database()
        enforce_limit(db, user["id"], "leaderboard_read")
        data = _rpc(db, "weekly_leaderboard", {
            "p_actor": user["id"], "p_scope": scope,
            "p_class_id": str(class_id) if class_id is not None else None,
            "p_page": page, "p_page_size": page_size,
        })
        try:
            result = LeaderboardData.model_validate(_object(data))
        except ValidationError as error:
            raise HTTPException(503, "Ranking temporariamente indisponível.") from error
        if (result.page != page or result.page_size != page_size
                or len(result.entries) > page_size
                or (result.my_position is not None and not result.my_position.is_me)):
            raise HTTPException(503, "Ranking temporariamente indisponível.")
        return result.model_dump(mode="json")

    @app.get("/student/leaderboard", response_model=LeaderboardData)
    def student_leaderboard(
        response: Response,
        scope: Literal["class", "school"] = "class",
        class_id: UUID | None = None,
        page: int = Query(1, ge=1, le=1000000),
        page_size: int = Query(20, ge=1, le=50),
        user: dict[str, Any] = Depends(student_dependency),
    ):
        if scope == "school" and class_id is not None:
            raise HTTPException(422, "Informe class_id somente para o ranking da turma.")
        response.headers["Cache-Control"] = "no-store"
        return weekly(user, scope, class_id, page, page_size)

    @app.get("/teacher/classes/{class_id}/leaderboard", response_model=LeaderboardData)
    def teacher_leaderboard(
        class_id: UUID,
        response: Response,
        page: int = Query(1, ge=1, le=1000000),
        page_size: int = Query(20, ge=1, le=50),
        user: dict[str, Any] = Depends(teacher_dependency),
    ):
        response.headers["Cache-Control"] = "no-store"
        return weekly(user, "class", class_id, page, page_size)

    @app.put("/student/leaderboard-preferences", response_model=LeaderboardPreferences)
    def update_preferences(
        preferences: LeaderboardPreferences,
        response: Response,
        user: dict[str, Any] = Depends(student_dependency),
    ):
        db = database()
        enforce_limit(db, user["id"], "leaderboard_preferences")
        data = _object(_rpc(db, "update_leaderboard_preferences", {
            "p_actor": user["id"], "p_alias": preferences.alias,
            "p_school_opt_in": preferences.school_opt_in,
        }))
        try:
            result = LeaderboardPreferences.model_validate({
                "alias": data.get("alias"), "school_opt_in": data.get("school_opt_in"),
            })
        except ValidationError as error:
            raise HTTPException(503, "Ranking temporariamente indisponível.") from error
        response.headers["Cache-Control"] = "no-store"
        return result
