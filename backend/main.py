"""API principal do AprendeIA.

O backend concentra operações que exigem confiança, como validar sessões,
administrar usuários, chamar a OpenAI e gravar resultados com privilégios de
servidor. O frontend usa apenas a chave publicável do Supabase.
"""

import json
import os
import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Annotated, Any

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field
from supabase import Client, create_client
from supabase.lib.client_options import ClientOptions

# Carrega somente variáveis locais; o arquivo .env fica fora do Git.
load_dotenv()

# A URL permitida é configurável para evitar CORS aberto em produção.
app = FastAPI(title="aprendeIA API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL", "http://localhost:5173")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# O schema estrito garante que a IA sempre devolva quatro alternativas e os
# campos necessários para corrigir e explicar a resposta.
QUESTION_SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "question": {"type": "string"},
        "options": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 4},
        "correct_index": {"type": "integer", "minimum": 0, "maximum": 3},
        "explanation": {"type": "string"},
        "skill": {"type": "string"},
    },
    "required": ["question", "options", "correct_index", "explanation", "skill"],
}

# As questões iniciais mantêm o protótipo utilizável sem banco ou OpenAI.
SEED_QUESTIONS = [
    {"id": "seed-fracoes-1", "subject": "Matemática", "topic": "Frações", "difficulty": "basic", "question": "Qual fração representa a metade de uma pizza?", "options": ["1/2", "1/3", "2/3", "3/4"], "correct_index": 0, "explanation": "Uma metade significa dividir o todo em duas partes iguais e considerar uma delas: 1/2."},
    {"id": "seed-portugues-1", "subject": "Português", "topic": "Interpretação de texto", "difficulty": "basic", "question": "Em um texto, a ideia principal é:", "options": ["o assunto mais importante", "uma palavra difícil", "o nome do autor", "a última frase"], "correct_index": 0, "explanation": "A ideia principal é a mensagem mais importante que o texto comunica."},
]
# Estes objetos existem apenas no modo demonstrativo. Quando o Supabase está
# configurado, a fonte de verdade passa a ser o PostgreSQL.
question_bank = list(SEED_QUESTIONS)
performance = defaultdict(lambda: defaultdict(lambda: {"attempts": 0, "correct": 0, "difficulty": "basic"}))


class UserCreate(BaseModel):
    """Dados que somente uma administradora pode usar para criar uma conta."""

    name: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=5, max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
    password: str = Field(min_length=8, max_length=128)
    role: str


class QuestionRequest(BaseModel):
    """Parâmetros pedagógicos enviados ao gerador de questões."""

    subject: str = Field(min_length=2, max_length=60)
    topic: str = Field(default="conteúdo da disciplina", max_length=100)
    difficulty: str = Field(default="basic", pattern="^(basic|intermediate|advanced)$")


class AnswerRequest(BaseModel):
    """Resposta do estudante e tempo opcional gasto na atividade."""

    selected_index: int = Field(ge=0, le=3)
    response_time_seconds: int = Field(default=0, ge=0, le=7200)


def supabase_configured() -> bool:
    """Indica se o servidor recebeu URL e chave secreta do Supabase."""

    return bool(os.getenv("SUPABASE_URL") and os.getenv("SUPABASE_SECRET_KEY"))


def database() -> Client:
    """Cria um cliente privilegiado sem persistir sessão no servidor.

    A chave secreta nunca é compartilhada com o navegador. Cada chamada recebe
    um cliente sem auto-refresh para não misturar sessões entre requisições.
    """

    if not supabase_configured():
        raise HTTPException(status_code=503, detail="Supabase ainda não está configurado no backend.")
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SECRET_KEY"],
        options=ClientOptions(auto_refresh_token=False, persist_session=False),
    )


def current_user(authorization: Annotated[str | None, Header()] = None) -> dict[str, Any]:
    """Valida o JWT no Supabase e devolve o perfil confiável do banco.

    O cargo não vem de dados editáveis do usuário. Ele é lido de ``profiles``
    pelo backend, impedindo que alguém se declare professor ou administrador.
    """

    if not supabase_configured():
        return {"id": "demo-student", "role": "student", "email": "demo@aprendeia.local"}
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Sessão ausente ou inválida.")
    token = authorization.removeprefix("Bearer ").strip()
    try:
        db = database()
        auth_user = db.auth.get_user(token).user
        if not auth_user:
            raise ValueError("User not found")
        rows = db.table("profiles").select("id,email,role,full_name,grade,goal").eq("id", str(auth_user.id)).limit(1).execute().data
        if not rows:
            raise ValueError("Profile not found")
        return rows[0]
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=401, detail="Sessão expirada ou inválida.") from error


def require_role(*roles: str):
    """Constrói uma dependência FastAPI que restringe uma rota por cargo."""

    def dependency(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
        """Compara o cargo persistido com a lista permitida pela rota."""

        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="Você não tem permissão para esta operação.")
        return user
    return dependency


def openai_client() -> OpenAI:
    """Entrega o cliente OpenAI apenas quando a chave está configurada."""

    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="A integração de IA ainda não está configurada.")
    return OpenAI()


def generate_with_ai(request: QuestionRequest) -> dict[str, Any]:
    """Gera uma questão estruturada e apropriada ao contexto educacional."""

    prompt = f"""Crie UMA questão objetiva de múltipla escolha, em português do Brasil, para reforço escolar.
Disciplina: {request.subject}. Conteúdo: {request.topic}. Dificuldade: {request.difficulty}.
A questão deve ser pedagogicamente correta, apropriada para estudantes e conter quatro alternativas plausíveis.
Explique a resposta de forma clara, acolhedora e curta. Não use dados pessoais."""
    try:
        response = openai_client().responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-5-mini"),
            input=prompt,
            store=False,
            text={"format": {"type": "json_schema", "name": "educational_question", "strict": True, "schema": QUESTION_SCHEMA}},
        )
        generated = json.loads(response.output_text)
        return {"id": str(uuid.uuid4()), "subject": request.subject, "topic": request.topic, "difficulty": request.difficulty, **generated}
    except HTTPException:
        raise
    except Exception as error:
        raise HTTPException(status_code=502, detail="Não foi possível gerar a questão agora.") from error


def serialize_question(row: dict[str, Any]) -> dict[str, Any]:
    """Normaliza registros do Supabase para o contrato usado pelo React."""

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
    }


@app.get("/health")
def health():
    """Informa se os serviços essenciais estão configurados, sem expor chaves."""

    return {"status": "ok", "service": "aprendeIA", "ai_configured": bool(os.getenv("OPENAI_API_KEY")), "supabase_configured": supabase_configured()}


@app.get("/question-bank")
def list_questions(subject: str | None = None, difficulty: str | None = None, _user: dict = Depends(current_user)):
    """Lista questões e permite filtros simples para uso pedagógico."""

    if not supabase_configured():
        return [q for q in question_bank if (not subject or q["subject"] == subject) and (not difficulty or q["difficulty"] == difficulty)]
    query = database().table("questions").select("id,topic,difficulty,question,options,correct_index,explanation,subjects(name)")
    if difficulty:
        query = query.eq("difficulty", difficulty)
    rows = query.limit(100).execute().data
    questions = [serialize_question(row) for row in rows]
    return [q for q in questions if not subject or q["subject"] == subject]


@app.post("/question-bank/generate")
def generate_question(request: QuestionRequest, _user: dict = Depends(require_role("student", "teacher", "admin"))):
    """Gera com IA e persiste a nova questão quando existe banco configurado."""

    question = generate_with_ai(request)
    if not supabase_configured():
        question_bank.append(question)
        return question
    db = database()
    subjects = db.table("subjects").select("id").eq("name", request.subject).limit(1).execute().data
    if not subjects:
        raise HTTPException(status_code=404, detail="Disciplina não encontrada.")
    payload = {**question, "subject_id": subjects[0]["id"], "source": "openai"}
    payload.pop("id", None); payload.pop("subject", None); payload.pop("skill", None)
    created = db.table("questions").insert(payload).execute().data[0]
    created["subjects"] = {"name": request.subject}
    return serialize_question(created)


@app.get("/question-bank/next")
def next_question(subject: str = "Matemática", user: dict = Depends(require_role("student"))):
    """Seleciona uma questão no nível calculado para o estudante autenticado."""

    if not supabase_configured():
        progress = performance[user["id"]][subject]
        candidates = [q for q in question_bank if q["subject"] == subject and q["difficulty"] == progress["difficulty"]]
        candidates = candidates or [q for q in question_bank if q["subject"] == subject] or question_bank
        return candidates[progress["attempts"] % len(candidates)]
    db = database()
    subject_rows = db.table("subjects").select("id").eq("name", subject).limit(1).execute().data
    if not subject_rows:
        raise HTTPException(status_code=404, detail="Disciplina não encontrada.")
    subject_id = subject_rows[0]["id"]
    difficulty_rows = db.table("student_difficulties").select("level").eq("student_id", user["id"]).eq("subject_id", subject_id).order("updated_at", desc=True).limit(1).execute().data
    desired = difficulty_rows[0]["level"] if difficulty_rows else "basic"
    rows = db.table("questions").select("id,topic,difficulty,question,options,correct_index,explanation,subjects(name)").eq("subject_id", subject_id).eq("difficulty", desired).limit(20).execute().data
    if not rows:
        rows = db.table("questions").select("id,topic,difficulty,question,options,correct_index,explanation,subjects(name)").eq("subject_id", subject_id).limit(20).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Ainda não há questões para esta disciplina.")
    return serialize_question(rows[0])


@app.post("/question-bank/{question_id}/answer")
def answer_question(question_id: str, answer: AnswerRequest, user: dict = Depends(require_role("student"))):
    """Corrige, registra a tentativa e recalcula a dificuldade recomendada."""

    if not supabase_configured():
        question = next((item for item in question_bank if item["id"] == question_id), None)
        if not question:
            raise HTTPException(status_code=404, detail="Questão não encontrada")
        result = performance[user["id"]][question["subject"]]
        correct = answer.selected_index == question["correct_index"]
        result["attempts"] += 1; result["correct"] += int(correct)
        accuracy = result["correct"] / result["attempts"]
        result["difficulty"] = "advanced" if accuracy >= .8 and result["attempts"] >= 3 else "basic" if accuracy < .6 else "intermediate"
        return {"correct": correct, "correct_index": question["correct_index"], "explanation": question["explanation"], "next_difficulty": result["difficulty"], "accuracy": round(accuracy * 100)}
    db = database()
    rows = db.table("questions").select("id,subject_id,topic,correct_index,explanation").eq("id", question_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Questão não encontrada.")
    question = rows[0]; correct = answer.selected_index == question["correct_index"]
    db.table("question_attempts").insert({"student_id": user["id"], "question_id": question_id, "selected_index": answer.selected_index, "correct": correct, "response_time_seconds": answer.response_time_seconds}).execute()
    attempts = db.table("question_attempts").select("correct,questions!inner(subject_id)").eq("student_id", user["id"]).eq("questions.subject_id", question["subject_id"]).execute().data
    accuracy = (sum(1 for item in attempts if item["correct"]) / len(attempts)) if attempts else 0
    next_level = "advanced" if accuracy >= .8 and len(attempts) >= 3 else "basic" if accuracy < .6 else "intermediate"
    db.table("student_difficulties").upsert({"student_id": user["id"], "subject_id": question["subject_id"], "topic": question["topic"], "level": next_level, "accuracy": round(accuracy * 100, 2), "attempts": len(attempts), "updated_at": datetime.now(timezone.utc).isoformat()}, on_conflict="student_id,subject_id,topic").execute()
    return {"correct": correct, "correct_index": question["correct_index"], "explanation": question["explanation"], "next_difficulty": next_level, "accuracy": round(accuracy * 100)}


@app.get("/student/subjects")
def student_subjects(user: dict = Depends(require_role("student"))):
    """Retorna somente as matrículas pertencentes ao estudante atual."""

    if not supabase_configured():
        return [{"name": "Matemática", "completed_lessons": 5, "total_lessons": 8, "difficulty": "Alta"}]
    return database().table("enrollments").select("subject_id,subjects(id,name,modules(id,title,lessons(id)))").eq("student_id", user["id"]).execute().data


@app.get("/teacher/students")
def teacher_students(user: dict = Depends(require_role("teacher"))):
    """Lista estudantes explicitamente vinculados ao professor atual."""

    if not supabase_configured():
        return [{"name": "Ana Souza", "subject": "Matemática", "time_minutes": 155, "difficulty": "Alta"}]
    db = database()
    links = db.table("teacher_students").select("student_id").eq("teacher_id", user["id"]).execute().data
    ids = [item["student_id"] for item in links]
    if not ids:
        return []
    return db.table("profiles").select("id,full_name,email,grade").in_("id", ids).execute().data


@app.post("/admin/users")
def create_user(payload: UserCreate, _admin: dict = Depends(require_role("admin"))):
    """Cria uma conta pelo Admin API e define o cargo no perfil protegido."""

    if payload.role not in {"student", "teacher"}:
        raise HTTPException(status_code=400, detail="O cargo deve ser student ou teacher.")
    if not supabase_configured():
        return {"name": payload.name, "email": payload.email, "role": payload.role}
    db = database()
    try:
        created = db.auth.admin.create_user({"email": str(payload.email), "password": payload.password, "email_confirm": True, "user_metadata": {"full_name": payload.name}})
        if not created.user:
            raise ValueError("User was not created")
        db.table("profiles").update({"full_name": payload.name, "role": payload.role}).eq("id", str(created.user.id)).execute()
        return {"id": str(created.user.id), "name": payload.name, "email": payload.email, "role": payload.role}
    except Exception as error:
        raise HTTPException(status_code=400, detail="Não foi possível criar o usuário. Verifique se o e-mail já está cadastrado.") from error
