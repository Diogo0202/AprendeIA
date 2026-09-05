import json
import os
import uuid
from collections import defaultdict

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from pydantic import BaseModel, Field

load_dotenv()
app = FastAPI(title="aprendeIA API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:5173"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

QUESTION_SCHEMA = {
    "type": "object", "additionalProperties": False,
    "properties": {
        "question": {"type": "string"}, "options": {"type": "array", "items": {"type": "string"}, "minItems": 4, "maxItems": 4},
        "correct_index": {"type": "integer", "minimum": 0, "maximum": 3}, "explanation": {"type": "string"}, "skill": {"type": "string"}
    }, "required": ["question", "options", "correct_index", "explanation", "skill"]
}

SEED_QUESTIONS = [
    {"id": "seed-fracoes-1", "subject": "Matemática", "topic": "Frações", "difficulty": "basic", "question": "Qual fração representa a metade de uma pizza?", "options": ["1/2", "1/3", "2/3", "3/4"], "correct_index": 0, "explanation": "Uma metade significa dividir o todo em duas partes iguais e considerar uma delas: 1/2."},
    {"id": "seed-portugues-1", "subject": "Português", "topic": "Interpretação de texto", "difficulty": "basic", "question": "Em um texto, a ideia principal é:", "options": ["o assunto mais importante", "uma palavra difícil", "o nome do autor", "a última frase"], "correct_index": 0, "explanation": "A ideia principal é a mensagem mais importante que o texto comunica."},
]
question_bank = list(SEED_QUESTIONS)
performance = defaultdict(lambda: defaultdict(lambda: {"attempts": 0, "correct": 0, "difficulty": "basic"}))

class LoginRequest(BaseModel):
    email: str
    password: str
class Profile(BaseModel):
    name: str
    email: str
    grade: str = ""
    goal: str = ""
class UserCreate(BaseModel):
    name: str
    email: str
    role: str
class QuestionRequest(BaseModel):
    student_id: str = "demo-student"
    subject: str = Field(min_length=2, max_length=60)
    topic: str = Field(default="conteúdo da disciplina", max_length=100)
    difficulty: str = "basic"
class AnswerRequest(BaseModel):
    student_id: str = "demo-student"
    selected_index: int = Field(ge=0, le=3)

def client() -> OpenAI:
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="A integração de IA ainda não está configurada.")
    return OpenAI()

def generate_with_ai(request: QuestionRequest) -> dict:
    prompt = f"""Crie UMA questão objetiva de múltipla escolha, em português do Brasil, para reforço escolar.
Disciplina: {request.subject}. Conteúdo: {request.topic}. Dificuldade: {request.difficulty}.
A questão deve ser pedagogicamente correta, apropriada para estudantes e conter quatro alternativas plausíveis.
Explique a resposta de forma clara, acolhedora e curta. Não use dados pessoais."""
    try:
        response = client().responses.create(
            model=os.getenv("OPENAI_MODEL", "gpt-5-mini"), input=prompt, store=False,
            text={"format": {"type": "json_schema", "name": "educational_question", "strict": True, "schema": QUESTION_SCHEMA}},
        )
        generated = json.loads(response.output_text)
        return {"id": str(uuid.uuid4()), "subject": request.subject, "topic": request.topic, "difficulty": request.difficulty, **generated}
    except Exception as error:
        raise HTTPException(status_code=502, detail="Não foi possível gerar a questão agora.") from error

@app.get("/health")
def health():
    return {"status": "ok", "service": "aprendeIA", "ai_configured": bool(os.getenv("OPENAI_API_KEY"))}
@app.post("/auth/login")
def login(payload: LoginRequest):
    if not payload.password: raise HTTPException(status_code=401, detail="Credenciais inválidas")
    return {"access_token": "mvp-token", "token_type": "bearer", "profile": {"name": "Diogo Mendes Baptista", "email": payload.email, "grade": "Graduação", "goal": "Reforçar meus estudos"}}
@app.post("/auth/register", response_model=Profile)
def register(profile: Profile): return profile

@app.get("/question-bank")
def list_questions(subject: str | None = None, difficulty: str | None = None):
    return [question for question in question_bank if (not subject or question["subject"] == subject) and (not difficulty or question["difficulty"] == difficulty)]

@app.post("/question-bank/generate")
def generate_question(request: QuestionRequest):
    question = generate_with_ai(request)
    question_bank.append(question)
    return question

@app.get("/question-bank/next")
def next_question(student_id: str = "demo-student", subject: str = "Matemática"):
    subject_progress = performance[student_id][subject]
    desired = subject_progress["difficulty"]
    candidates = [q for q in question_bank if q["subject"] == subject and q["difficulty"] == desired]
    if not candidates:
        candidates = [q for q in question_bank if q["subject"] == subject] or question_bank
    return candidates[subject_progress["attempts"] % len(candidates)]

@app.post("/question-bank/{question_id}/answer")
def answer_question(question_id: str, answer: AnswerRequest):
    question = next((item for item in question_bank if item["id"] == question_id), None)
    if not question: raise HTTPException(status_code=404, detail="Questão não encontrada")
    result = performance[answer.student_id][question["subject"]]
    correct = answer.selected_index == question["correct_index"]
    result["attempts"] += 1; result["correct"] += int(correct)
    accuracy = result["correct"] / result["attempts"]
    result["difficulty"] = "advanced" if accuracy >= .8 and result["attempts"] >= 3 else "basic" if accuracy < .6 else "intermediate"
    return {"correct": correct, "correct_index": question["correct_index"], "explanation": question["explanation"], "next_difficulty": result["difficulty"], "accuracy": round(accuracy * 100)}

@app.get("/student/subjects")
def student_subjects():
    return [{"name": "Matemática", "completed_lessons": 5, "total_lessons": 8, "difficulty": "Alta"}]
@app.get("/teacher/students")
def teacher_students():
    return [{"name": "Ana Souza", "subject": "Matemática", "time_minutes": 155, "difficulty": "Alta"}]
@app.post("/admin/users", response_model=UserCreate)
def create_user(user: UserCreate):
    if user.role not in {"student", "teacher"}: raise HTTPException(status_code=400, detail="O cargo deve ser student ou teacher")
    return user
