"""Montagem do catálogo de disciplinas, módulos e aulas a partir de linhas já carregadas."""

from collections import defaultdict
from typing import Any

from aprendeia.domain.learning_engine import infer_subject_category, subject_code, subject_difficulty

Row = dict[str, Any]


def _group_by(rows: list[Row], key: str) -> dict[str, list[Row]]:
    grouped: dict[str, list[Row]] = defaultdict(list)
    for row in rows:
        grouped[row[key]].append(row)
    return grouped


def _count(lessons: list[Row], *, completed: bool) -> int:
    return sum(1 for lesson in lessons if bool(lesson["completed"]) is completed)


def _lessons_with_progress(lesson_rows: list[Row], progress_rows: list[Row]) -> list[Row]:
    progress_by_lesson = {row["lesson_id"]: row for row in progress_rows}
    lessons = []
    for lesson in lesson_rows:
        progress = progress_by_lesson.get(lesson["id"], {})
        lessons.append({
            **lesson,
            "completed": bool(progress.get("completed")),
            "time_seconds": int(progress.get("time_seconds", 0)),
            "last_accessed_at": progress.get("last_accessed_at"),
        })
    return lessons


def _modules_with_lessons(module_rows: list[Row], lessons: list[Row]) -> list[Row]:
    lessons_by_module = _group_by(lessons, "module_id")
    modules = []
    for module in module_rows:
        module_lessons = lessons_by_module[module["id"]]
        modules.append({
            **module,
            "lessons": module_lessons,
            "completed_lessons": _count(module_lessons, completed=True),
            "total_lessons": len(module_lessons),
        })
    return modules


def _weakest_topics_first(difficulties: list[Row]) -> list[Row]:
    return sorted(difficulties, key=lambda item: (float(item["accuracy"]), -int(item["attempts"])))


def build_subject_catalog(
    subject_rows: list[Row],
    module_rows: list[Row],
    lesson_rows: list[Row],
    progress_rows: list[Row],
    difficulty_rows: list[Row],
) -> list[Row]:
    """Agrupa as linhas já carregadas no contrato do catálogo; não consulta o banco."""

    lessons = _lessons_with_progress(lesson_rows, progress_rows)
    modules_by_subject = _group_by(_modules_with_lessons(module_rows, lessons), "subject_id")
    difficulties_by_subject = _group_by(difficulty_rows, "subject_id")

    catalog = []
    for subject in subject_rows:
        modules = modules_by_subject[subject["id"]]
        subject_lessons = [lesson for module in modules for lesson in module["lessons"]]
        difficulties = difficulties_by_subject[subject["id"]]
        difficulty = subject_difficulty(difficulties)
        catalog.append({
            **subject,
            "category": infer_subject_category(subject["name"], subject.get("category")),
            "code": subject_code(subject["name"]),
            "modules": modules,
            "completed_lessons": _count(subject_lessons, completed=True),
            "total_lessons": len(subject_lessons),
            "remaining_lessons": _count(subject_lessons, completed=False),
            "difficulty": difficulty["label"],
            "tone": difficulty["tone"],
            "topics": _weakest_topics_first(difficulties),
        })
    return catalog


def catalog_lessons(catalog: list[Row]) -> list[Row]:
    """Achata o catálogo na lista de aulas usada pelas recomendações de estudo."""

    return [
        {
            "id": lesson["id"],
            "subject_id": subject["id"],
            "subject": subject["name"],
            "module": module["title"],
            "title": lesson["title"],
            "summary": lesson["summary"],
            "completed": lesson["completed"],
        }
        for subject in catalog
        for module in subject["modules"]
        for lesson in module["lessons"]
    ]


def normalize_attempts(attempts: list[Row], questions: list[Row]) -> list[Row]:
    """Liga cada resposta à disciplina e ao tópico da questão; órfãs são ignoradas."""

    by_question = {row["id"]: row for row in questions}
    normalized = []
    for attempt in attempts:
        question = by_question.get(attempt["question_id"])
        if not question:
            continue
        normalized.append({
            "subject_id": question["subject_id"],
            "subject": (question.get("subjects") or {}).get("name", "Disciplina"),
            "topic": question["topic"],
            "correct": attempt["correct"],
        })
    return normalized


def build_editorial_catalog(
    subjects: list[Row], modules: list[Row], lessons: list[Row], required_rows: list[Row]
) -> list[Row]:
    """Árvore editorial completa da administração, com a contagem de exercícios obrigatórios."""

    required_counts: dict[str, int] = defaultdict(int)
    for required in required_rows:
        required_counts[required["lesson_id"]] += 1
    counted_lessons = [
        {**lesson, "required_exercise_count": required_counts[lesson["id"]]} for lesson in lessons
    ]
    lessons_by_module = _group_by(counted_lessons, "module_id")
    modules_by_subject = _group_by(
        [{**module, "lessons": lessons_by_module[module["id"]]} for module in modules],
        "subject_id",
    )
    return [{**subject, "modules": modules_by_subject[subject["id"]]} for subject in subjects]
