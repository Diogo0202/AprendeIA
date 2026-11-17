"""Desempenho agregado para a administração, sem dados individuais.

A administração vê totais por turma e por professor, nunca respostas de um
aluno. Grupos com menos de MIN_GROUP_SIZE alunos têm os indicadores ocultos
para que um número não identifique uma pessoa.
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any

MIN_GROUP_SIZE = 3
TREND_WEEKS = 4
UNASSIGNED_TEACHER = "Sem professor"
UNASSIGNED_SUBJECT = "Sem disciplina"

Row = dict[str, Any]
StudentSubject = tuple[str, str]


def _parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _accuracy(rows: list[Row]) -> float | None:
    if not rows:
        return None
    return round(100 * sum(1 for row in rows if row["correct"]) / len(rows), 1)


def _weekly_trend(attempts: list[Row], now: datetime) -> list[Row]:
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    trend = []
    for offset in range(TREND_WEEKS - 1, -1, -1):
        start = week_start - timedelta(weeks=offset)
        end = start + timedelta(weeks=1)
        week = [row for row in attempts if start <= _parse_time(row["answered_at"]) < end]
        trend.append({
            "week_start": start.date().isoformat(),
            "attempts": len(week),
            "accuracy": _accuracy(week),
        })
    return trend


def summarize_group(
    student_ids: set[str],
    attempts: list[Row],
    completed_lessons: int,
    active_alerts: int,
    now: datetime,
) -> Row:
    """Indicadores de um grupo; abaixo do mínimo, só o tamanho é revelado."""

    size = len(student_ids)
    if size < MIN_GROUP_SIZE:
        return {
            "students": size, "small_sample": True, "attempts": None, "accuracy": None,
            "completed_lessons": None, "active_alerts": None, "trend": [],
        }
    return {
        "students": size,
        "small_sample": False,
        "attempts": len(attempts),
        "accuracy": _accuracy(attempts),
        "completed_lessons": completed_lessons,
        "active_alerts": active_alerts,
        "trend": _weekly_trend(attempts, now),
    }


def _count_by_student_subject(rows: list[Row]) -> dict[StudentSubject, int]:
    counts: dict[StudentSubject, int] = defaultdict(int)
    for row in rows:
        counts[(row["student_id"], row["subject_id"])] += 1
    return counts


def students_by_class(members: list[Row]) -> dict[str, set[str]]:
    grouped: dict[str, set[str]] = defaultdict(set)
    for row in members:
        grouped[row["class_id"]].add(row["student_id"])
    return grouped


def build_performance(
    *,
    classes: list[Row],
    members: list[Row],
    teachers: dict[str, Row],
    subjects: dict[str, str],
    attempts: list[Row],
    completions: list[Row],
    alerts: list[Row],
    now: datetime,
) -> Row:
    """Junta turmas e professores; tentativas contam só na disciplina da turma.

    attempts: student_id, subject_id, correct, answered_at
    completions: student_id, subject_id (uma linha por aula concluída)
    alerts: student_id, subject_id (alertas ativos)
    """

    class_students = students_by_class(members)
    attempts_by_key: dict[StudentSubject, list[Row]] = defaultdict(list)
    for row in attempts:
        attempts_by_key[(row["student_id"], row["subject_id"])].append(row)
    completions_by_key = _count_by_student_subject(completions)
    alerts_by_key = _count_by_student_subject(alerts)

    def metrics(student_ids: set[str], subject_id: str) -> Row:
        return summarize_group(
            student_ids,
            [row for student in student_ids for row in attempts_by_key[(student, subject_id)]],
            sum(completions_by_key[(student, subject_id)] for student in student_ids),
            sum(alerts_by_key[(student, subject_id)] for student in student_ids),
            now,
        )

    class_rows = []
    teacher_students: dict[str, set[str]] = defaultdict(set)
    teacher_class_counts: dict[str, int] = defaultdict(int)
    for item in classes:
        students = class_students[item["id"]]
        teacher_students[item["teacher_id"]] |= students
        teacher_class_counts[item["teacher_id"]] += 1
        class_rows.append({
            "id": item["id"],
            "name": item["name"],
            "school_year": item["school_year"],
            "subject": subjects.get(item["subject_id"], "Disciplina"),
            "teacher_id": item["teacher_id"],
            # Turma de professor excluído é preservada com teacher_id nulo.
            "teacher_name": teachers.get(item["teacher_id"], {}).get("full_name", UNASSIGNED_TEACHER),
            **metrics(students, item["subject_id"]),
        })

    teacher_rows = []
    for teacher_id, teacher in teachers.items():
        subject_id = teacher.get("subject_id")
        group = metrics(teacher_students[teacher_id], subject_id) if subject_id else summarize_group(set(), [], 0, 0, now)
        teacher_rows.append({
            "id": teacher_id,
            "full_name": teacher["full_name"],
            "subject": subjects.get(subject_id, UNASSIGNED_SUBJECT) if subject_id else UNASSIGNED_SUBJECT,
            "classes": teacher_class_counts[teacher_id],
            **group,
        })

    class_rows.sort(key=lambda row: (row["teacher_name"].casefold(), row["name"].casefold()))
    teacher_rows.sort(key=lambda row: row["full_name"].casefold())
    return {"min_group_size": MIN_GROUP_SIZE, "classes": class_rows, "teachers": teacher_rows}


def list_teacher_overview(teachers: dict[str, Row], subjects: dict[str, str], classes: list[Row], members: list[Row]) -> list[Row]:
    """Todos os professores, com disciplina, turmas e alunos vinculados."""

    class_students = students_by_class(members)
    classes_by_teacher: dict[str, list[str]] = defaultdict(list)
    for row in classes:
        classes_by_teacher[row["teacher_id"]].append(row["id"])
    result = []
    for teacher_id, teacher in teachers.items():
        class_ids = classes_by_teacher[teacher_id]
        student_ids: set[str] = set().union(*[class_students[class_id] for class_id in class_ids]) if class_ids else set()
        result.append({
            "id": teacher_id,
            "full_name": teacher["full_name"],
            "email": teacher["email"],
            "registration_status": teacher["registration_status"],
            "subject": subjects.get(teacher["subject_id"]) if teacher["subject_id"] else None,
            "classes": len(class_ids),
            "students": len(student_ids),
            "created_at": teacher["created_at"],
        })
    return sorted(result, key=lambda row: row["full_name"].casefold())


def list_class_overview(teachers: dict[str, Row], subjects: dict[str, str], classes: list[Row], members: list[Row]) -> list[Row]:
    """Todas as turmas com professor, disciplina e número de alunos."""

    counts: dict[str, int] = defaultdict(int)
    for row in members:
        counts[row["class_id"]] += 1
    result = [
        {
            "id": row["id"],
            "name": row["name"],
            "school_year": row["school_year"],
            "subject": subjects.get(row["subject_id"], "Disciplina"),
            "teacher_id": row["teacher_id"],
            "teacher_name": teachers.get(row["teacher_id"], {}).get("full_name", UNASSIGNED_TEACHER),
            "students": counts[row["id"]],
            "created_at": row["created_at"],
        }
        for row in classes
    ]
    return sorted(result, key=lambda row: (row["teacher_name"].casefold(), row["name"].casefold()))
