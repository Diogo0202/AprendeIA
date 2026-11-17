"""Respostas do modo demonstrativo, usadas somente sem banco configurado."""

from typing import Any, Protocol

from aprendeia.application.ports.learning import TutorModel
from aprendeia.application.ports.security import AuditRecorder
from aprendeia.application.services.question_bank import (
    generate_question_with_ai,
    validate_difficulty_filter,
    visible_to,
)
from aprendeia.domain.errors import NotFound
from aprendeia.domain.gamification import build_gamification_summary
from aprendeia.domain.learning_engine import build_study_recommendations
from aprendeia.domain.questions import hide_question_solution, next_difficulty_level

Row = dict[str, Any]

DEMO_SUBJECT: Row = {
    "id": "demo-math",
    "name": "Matemática",
    "description": "Raciocínio lógico, números e resolução de problemas.",
    "category": "Ciências Exatas",
    "code": "MA",
    "completed_lessons": 1,
    "total_lessons": 2,
    "remaining_lessons": 1,
    "difficulty": "Alta",
    "tone": "high",
    "topics": [{"topic": "Frações", "accuracy": 40, "attempts": 5}],
    "modules": [
        {
            "id": "demo-module",
            "title": "Frações e porcentagens",
            "position": 1,
            "completed_lessons": 1,
            "total_lessons": 2,
            "lessons": [
                {"id": "demo-lesson-1", "title": "Conceito de fração", "position": 1, "estimated_minutes": 15, "summary": "Entenda as partes de uma fração.", "learning_objectives": [], "completed": True, "time_seconds": 900},
                {"id": "demo-lesson-2", "title": "Frações equivalentes", "position": 2, "estimated_minutes": 15, "summary": "Compare frações com o mesmo valor.", "learning_objectives": [], "completed": False, "time_seconds": 0},
            ],
        }
    ],
}
DEMO_MASTERY: list[Row] = [
    {"subject_id": "demo-math", "subject": "Matemática", "topic": "Frações", "attempts": 5, "accuracy": 40, "status": "fragile"}
]
DEMO_TEACHER_STUDENTS: list[Row] = [
    {"name": "Ana Souza", "subject": "Matemática", "time_minutes": 155, "difficulty": "Alta"}
]
DEMO_ALERTS: list[Row] = [
    {"id": "demo-alert", "student_name": "Ana Souza", "subject": "Matemática", "topic": "Frações", "accuracy": 40, "attempts": 5, "status": "active"}
]


class DemoQuestionStore(Protocol):
    question_bank: list[Row]
    performance: dict[str, dict[str, Row]]


class DemoLearningService:
    """Mantém o protótipo navegável sem banco; nada aqui é persistido."""

    def __init__(self, *, tutor: TutorModel, store: DemoQuestionStore, seed_questions: list[Row]) -> None:
        self._tutor = tutor
        self._store = store
        self._seed_questions = seed_questions

    def list_questions(self, user: Row, subject: str | None, difficulty: str | None) -> list[Row]:
        validate_difficulty_filter(difficulty)
        questions = [
            question
            for question in self._store.question_bank
            if (not subject or question["subject"] == subject)
            and (not difficulty or question["difficulty"] == difficulty)
        ]
        return visible_to(user["role"], questions)

    def generate(self, *, subject: str, topic: str, difficulty: str, audit: AuditRecorder) -> Row:
        question = generate_question_with_ai(self._tutor, subject=subject, topic=topic, difficulty=difficulty)
        self._store.question_bank.append(question)
        audit.resource(question["id"])
        return question

    def next_question(self, user: Row, subject: str) -> Row:
        bank = self._store.question_bank
        progress = self._store.performance[user["id"]][subject]
        of_subject = [question for question in bank if question["subject"] == subject]
        at_level = [question for question in of_subject if question["difficulty"] == progress["difficulty"]]
        candidates = at_level or of_subject or bank
        return hide_question_solution(candidates[progress["attempts"] % len(candidates)])

    def answer(self, user: Row, question_id: str, *, selected_index: int) -> Row:
        question = next((item for item in self._store.question_bank if item["id"] == question_id), None)
        if not question:
            raise NotFound("Questão não encontrada")
        result = self._store.performance[user["id"]][question["subject"]]
        correct = selected_index == question["correct_index"]
        result["attempts"] += 1
        result["correct"] += int(correct)
        accuracy = result["correct"] / result["attempts"]
        result["difficulty"] = next_difficulty_level(accuracy, result["attempts"])
        return {
            "correct": correct,
            "correct_index": question["correct_index"],
            "explanation": question["explanation"],
            "next_difficulty": result["difficulty"],
            "accuracy": round(accuracy * 100),
        }

    @staticmethod
    def subjects() -> list[Row]:
        return [DEMO_SUBJECT]

    @staticmethod
    def recommendations() -> Row:
        return {"mastery": DEMO_MASTERY, "recommendations": build_study_recommendations(DEMO_MASTERY, [])}

    def diagnostic(self) -> Row:
        return {
            "status": "open",
            "session_id": "demo-diagnostic",
            "answered_question_ids": [],
            "questions": [hide_question_solution(question) for question in self._seed_questions],
        }

    @staticmethod
    def gamification() -> Row:
        return build_gamification_summary(
            completed_lessons=2, correct_answers=12, attempts=15, active_days=4, current_streak=3
        )

    @staticmethod
    def teacher_students() -> list[Row]:
        return DEMO_TEACHER_STUDENTS

    @staticmethod
    def teacher_alerts() -> list[Row]:
        return DEMO_ALERTS
