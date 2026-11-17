"""Escopo pedagógico do professor: uma única disciplina atribuída."""

from typing import Any

from aprendeia.application.ports.learning import TeacherAssignmentReader
from aprendeia.domain.errors import Conflict

Row = dict[str, Any]
DEFAULT_SUBJECT_NAME = "Disciplina"


def subject_name_of(row: Row, default: str = DEFAULT_SUBJECT_NAME) -> str:
    """Lê o nome da disciplina de uma linha com a relação subjects(name)."""

    return (row.get("subjects") or {}).get("name", default)


def require_assignment(reader: TeacherAssignmentReader, teacher_id: str) -> dict[str, str]:
    """Localiza a única disciplina atribuída ao professor autenticado."""

    assignment = reader.assignment_of(teacher_id)
    if not assignment:
        raise Conflict("Professor ainda não possui disciplina atribuída.")
    return {"subject_id": assignment["subject_id"], "subject": subject_name_of(assignment)}
