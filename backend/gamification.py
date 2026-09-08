"""Cálculos puros da jornada do estudante no AprendeIA."""

from datetime import date, timedelta


POINTS_PER_COMPLETED_LESSON = 100
POINTS_PER_CORRECT_ANSWER = 10
POINTS_PER_ACTIVE_DAY = 20
POINTS_PER_LEVEL = 250


def calculate_current_streak(activity_days: list[date], *, today: date) -> int:
    """Conta dias consecutivos sem dar pontos extras por várias ações no mesmo dia."""

    available_days = set(activity_days)
    streak = 0
    cursor = today
    while cursor in available_days:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def build_gamification_summary(
    *,
    completed_lessons: int,
    correct_answers: int,
    attempts: int,
    active_days: int,
    current_streak: int,
) -> dict[str, object]:
    """Transforma totais de estudo em uma jornada simples e explicável."""

    points = (
        completed_lessons * POINTS_PER_COMPLETED_LESSON
        + correct_answers * POINTS_PER_CORRECT_ANSWER
        + active_days * POINTS_PER_ACTIVE_DAY
    )
    level = (points // POINTS_PER_LEVEL) + 1
    next_level_points = level * POINTS_PER_LEVEL
    accuracy_percent = round((correct_answers / attempts) * 100) if attempts else 0
    achievements = []

    # As medalhas só aparecem quando o dado que as justifica já existe no banco.
    if completed_lessons >= 1:
        achievements.append(
            {
                "id": "first_lesson",
                "title": "Primeiro passo",
                "description": "Concluiu a primeira aula.",
                "icon": "🌱",
            }
        )
    if current_streak >= 3:
        achievements.append(
            {
                "id": "study_streak",
                "title": "Ritmo de estudo",
                "description": f"Estuda há {current_streak} dias seguidos.",
                "icon": "🔥",
            }
        )
    if correct_answers >= 10:
        achievements.append(
            {
                "id": "ten_correct_answers",
                "title": "Mente afiada",
                "description": "Acertou 10 questões.",
                "icon": "🎯",
            }
        )
    if attempts >= 5 and accuracy_percent >= 80:
        achievements.append(
            {
                "id": "excellent_accuracy",
                "title": "Em ótima fase",
                "description": f"Mantém {accuracy_percent}% de acertos.",
                "icon": "⭐",
            }
        )

    return {
        "points": points,
        "level": level,
        "next_level_points": next_level_points,
        "level_progress": round(((points % POINTS_PER_LEVEL) / POINTS_PER_LEVEL) * 100),
        "accuracy_percent": accuracy_percent,
        "active_days": active_days,
        "current_streak": current_streak,
        "achievements": achievements,
    }
