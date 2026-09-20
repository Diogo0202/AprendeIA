"""Regras pedagógicas puras usadas pelo painel do estudante.

Este módulo não conhece FastAPI nem Supabase. Assim conseguimos testar a
classificação dos tópicos sem montar banco, sessão ou requisição HTTP.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Iterable


def classify_mastery(accuracy: float, attempts: int) -> str:
    """Transforma desempenho em uma faixa fácil de explicar ao estudante."""

    if attempts >= 3 and accuracy >= 80:
        return "mastered"
    if attempts >= 2 and accuracy < 60:
        return "fragile"
    return "developing"


def build_topic_mastery(attempts: Iterable[dict[str, Any]]) -> list[dict[str, Any]]:
    """Agrupa respostas por disciplina e tópico, sem usar nível genérico."""

    grouped: dict[tuple[str, str, str], dict[str, int]] = defaultdict(
        lambda: {"attempts": 0, "correct": 0}
    )
    for attempt in attempts:
        subject_id = str(attempt.get("subject_id", ""))
        subject = str(attempt.get("subject", "Disciplina"))
        topic = str(attempt.get("topic", "Conteúdo"))
        bucket = grouped[(subject_id, subject, topic)]
        bucket["attempts"] += 1
        bucket["correct"] += int(bool(attempt.get("correct")))

    mastery = []
    for (subject_id, subject, topic), values in grouped.items():
        total = values["attempts"]
        accuracy = round(values["correct"] / total * 100, 1) if total else 0.0
        mastery.append(
            {
                "subject_id": subject_id,
                "subject": subject,
                "topic": topic,
                "attempts": total,
                "accuracy": accuracy,
                "status": classify_mastery(accuracy, total),
            }
        )

    priority = {"fragile": 0, "developing": 1, "mastered": 2}
    return sorted(
        mastery,
        key=lambda item: (
            priority[item["status"]],
            item["accuracy"],
            item["subject"].casefold(),
            item["topic"].casefold(),
        ),
    )


def build_study_recommendations(
    mastery: Iterable[dict[str, Any]], lessons: Iterable[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Liga tópicos frágeis a aulas reais da mesma disciplina."""

    lesson_rows = list(lessons)
    recommendations = []
    for topic in mastery:
        if topic["status"] == "mastered":
            continue
        same_subject = [
            lesson
            for lesson in lesson_rows
            if str(lesson.get("subject_id", "")) == str(topic["subject_id"])
            and not bool(lesson.get("completed"))
        ]
        topic_terms = {word.casefold() for word in topic["topic"].split() if len(word) > 3}

        # Primeiro tentamos uma aula com nome parecido. Se não existir, usamos a
        # próxima aula incompleta da disciplina para não deixar uma dica vazia.
        matching = []
        for lesson in same_subject:
            searchable = f"{lesson.get('title', '')} {lesson.get('summary', '')}".casefold()
            if topic_terms and any(term in searchable for term in topic_terms):
                matching.append(lesson)
        selected = (matching or same_subject)[:2]
        recommendations.append(
            {
                **topic,
                "reason": (
                    "Revisar este tópico agora pode destravar as próximas atividades."
                    if topic["status"] == "fragile"
                    else "Mais uma rodada curta ajuda a consolidar o conteúdo."
                ),
                "lessons": selected,
            }
        )
    return recommendations[:8]


def infer_subject_category(name: str, stored_category: str | None = None) -> str:
    """Mantém dados antigos organizados até a categoria ser preenchida no admin."""

    if stored_category and stored_category.strip():
        return stored_category.strip()
    normalized = name.casefold()
    if normalized in {"matemática", "física", "química"}:
        return "Ciências Exatas"
    if normalized in {"português", "inglês", "espanhol", "literatura"}:
        return "Linguagens"
    if normalized in {"ciências", "biologia"}:
        return "Ciências da Natureza"
    if normalized in {"história", "geografia", "sociologia", "filosofia"}:
        return "Ciências Humanas"
    return "Outras"


def subject_code(name: str) -> str:
    """Cria uma sigla curta e previsível sem depender de texto no frontend."""

    words = [word for word in name.strip().split() if word]
    if not words:
        return "--"
    if len(words) == 1:
        return words[0][:2].upper()
    return "".join(word[0] for word in words[:3]).upper()


def subject_difficulty(difficulties: Iterable[dict[str, Any]]) -> dict[str, str]:
    """Resume tópicos sem apagar os detalhes usados nas recomendações."""

    rows = list(difficulties)
    if not rows:
        return {"label": "A mapear", "tone": "neutral"}
    weighted_attempts = sum(max(1, int(row.get("attempts", 0))) for row in rows)
    weighted_accuracy = sum(
        float(row.get("accuracy", 0)) * max(1, int(row.get("attempts", 0)))
        for row in rows
    ) / weighted_attempts
    if weighted_accuracy < 60:
        return {"label": "Alta", "tone": "high"}
    if weighted_accuracy < 80:
        return {"label": "Média", "tone": "medium"}
    return {"label": "Baixa", "tone": "low"}
