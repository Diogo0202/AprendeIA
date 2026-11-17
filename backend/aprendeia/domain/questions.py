"""Regras do banco de questões: contrato, gabarito e nível recomendado."""

import re
from typing import Any

from aprendeia.domain.errors import InvalidInput

DIFFICULTY_LEVELS = ("basic", "intermediate", "advanced")
SOLUTION_FIELDS = frozenset({"correct_index", "explanation"})
QUESTION_ID_PATTERN = re.compile(r"[A-Za-z0-9-]{1,100}")

ADVANCED_ACCURACY = 0.8
ADVANCED_MIN_ATTEMPTS = 3
BASIC_ACCURACY = 0.6

DIAGNOSTIC_QUESTIONS_PER_SUBJECT = 2
DIAGNOSTIC_MAX_QUESTIONS = 8


def validate_question_id(value: str) -> str:
    """Mantém o identificador em um formato simples antes de consultar o banco."""

    normalized = value.strip()
    if not QUESTION_ID_PATTERN.fullmatch(normalized):
        raise InvalidInput("Identificador de questão inválido.")
    return normalized


def serialize_question(row: dict[str, Any]) -> dict[str, Any]:
    """Normaliza registros do banco para o contrato usado pelo React."""

    subject = row.get("subjects") or {}
    return {
        "id": row["id"],
        "subject": subject.get("name", row.get("subject", "")),
        "topic": row["topic"],
        "difficulty": row["difficulty"],
        "question": row["question"],
        "options": row["options"],
        "correct_index": row["correct_index"],
        "explanation": row["explanation"],
        "status": row.get("status", "published"),
        "review_notes": row.get("review_notes", ""),
        "source": row.get("source", "seed"),
        "created_at": row.get("created_at"),
    }


def hide_question_solution(question: dict[str, Any]) -> dict[str, Any]:
    """Remove o gabarito do conteúdo que chega ao estudante antes da tentativa."""

    # O backend guarda a resposta certa para corrigir depois, mas o navegador não
    # precisa conhecê-la enquanto a pessoa ainda está decidindo a alternativa.
    return {key: value for key, value in question.items() if key not in SOLUTION_FIELDS}


def next_difficulty_level(accuracy: float, attempts: int) -> str:
    """Sobe de nível só com acerto alto e sustentado; abaixo de 60% volta ao básico."""

    if accuracy >= ADVANCED_ACCURACY and attempts >= ADVANCED_MIN_ATTEMPTS:
        return "advanced"
    if accuracy < BASIC_ACCURACY:
        return "basic"
    return "intermediate"


def select_diagnostic_questions(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Duas questões por disciplina deixam a avaliação curta e variada."""

    per_subject: dict[str, int] = {}
    selected: list[dict[str, Any]] = []
    for row in rows:
        if per_subject.get(row["subject_id"], 0) >= DIAGNOSTIC_QUESTIONS_PER_SUBJECT:
            continue
        selected.append(row)
        per_subject[row["subject_id"]] = per_subject.get(row["subject_id"], 0) + 1
        if len(selected) >= DIAGNOSTIC_MAX_QUESTIONS:
            break
    return selected


def lesson_requirements_complete(required_exercises: list[dict[str, Any]]) -> bool:
    """A ausência de exercícios não bloqueia aulas antigas; os configurados bloqueiam."""

    return all(exercise.get("checked") for exercise in required_exercises)
