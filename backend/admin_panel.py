"""Painel administrativo: professores, turmas, desempenho agregado e exclusão de contas.

A administração vê totais por turma e por professor, nunca respostas de um
aluno. Grupos com menos de MIN_GROUP_SIZE alunos têm os indicadores ocultos
para que um número não identifique uma pessoa.
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Callable, Literal
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, Query, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

MIN_GROUP_SIZE = 3
TREND_WEEKS = 4
ROW_LIMIT = 10_000


class AdminAccountDeletion(BaseModel):
    """A confirmação digitada e o motivo evitam exclusão por clique acidental."""

    model_config = ConfigDict(extra="forbid")

    confirmation: Literal["EXCLUIR"]
    reason: str = Field(min_length=5, max_length=300)

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 5:
            raise ValueError("Informe o motivo com pelo menos 5 caracteres.")
        return value


def _parse_time(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def summarize_group(
    student_ids: set[str],
    attempts: list[dict[str, Any]],
    completed_lessons: int,
    active_alerts: int,
    now: datetime,
) -> dict[str, Any]:
    """Indicadores de um grupo; abaixo do mínimo, só o tamanho é revelado."""

    size = len(student_ids)
    if size < MIN_GROUP_SIZE:
        return {
            "students": size, "small_sample": True, "attempts": None, "accuracy": None,
            "completed_lessons": None, "active_alerts": None, "trend": [],
        }
    correct = sum(1 for row in attempts if row["correct"])
    week_start = (now - timedelta(days=now.weekday())).replace(hour=0, minute=0, second=0, microsecond=0)
    trend = []
    for offset in range(TREND_WEEKS - 1, -1, -1):
        start = week_start - timedelta(weeks=offset)
        end = start + timedelta(weeks=1)
        week = [row for row in attempts if start <= _parse_time(row["answered_at"]) < end]
        trend.append({
            "week_start": start.date().isoformat(),
            "attempts": len(week),
            "accuracy": round(100 * sum(1 for row in week if row["correct"]) / len(week), 1) if week else None,
        })
    return {
        "students": size,
        "small_sample": False,
        "attempts": len(attempts),
        "accuracy": round(100 * correct / len(attempts), 1) if attempts else None,
        "completed_lessons": completed_lessons,
        "active_alerts": active_alerts,
        "trend": trend,
    }


def build_performance(
    *,
    classes: list[dict[str, Any]],
    members: list[dict[str, Any]],
    teachers: dict[str, dict[str, Any]],
    subjects: dict[str, str],
    attempts: list[dict[str, Any]],
    completions: list[dict[str, Any]],
    alerts: list[dict[str, Any]],
    now: datetime,
) -> dict[str, Any]:
    """Junta turmas e professores; tentativas contam só na disciplina da turma.

    attempts: student_id, subject_id, correct, answered_at
    completions: student_id, subject_id (uma linha por aula concluída)
    alerts: student_id, subject_id (alertas ativos)
    """

    students_by_class: dict[str, set[str]] = defaultdict(set)
    for row in members:
        students_by_class[row["class_id"]].add(row["student_id"])
    attempts_by_key: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in attempts:
        attempts_by_key[(row["student_id"], row["subject_id"])].append(row)
    completions_by_key: dict[tuple[str, str], int] = defaultdict(int)
    for row in completions:
        completions_by_key[(row["student_id"], row["subject_id"])] += 1
    alerts_by_key: dict[tuple[str, str], int] = defaultdict(int)
    for row in alerts:
        alerts_by_key[(row["student_id"], row["subject_id"])] += 1

    def metrics(student_ids: set[str], subject_id: str) -> dict[str, Any]:
        return summarize_group(
            student_ids,
            [row for student in student_ids for row in attempts_by_key[(student, subject_id)]],
            sum(completions_by_key[(student, subject_id)] for student in student_ids),
            sum(alerts_by_key[(student, subject_id)] for student in student_ids),
            now,
        )

    class_rows = []
    teacher_groups: dict[tuple[str, str], set[str]] = defaultdict(set)
    teacher_class_counts: dict[str, int] = defaultdict(int)
    for item in classes:
        students = students_by_class[item["id"]]
        teacher_groups[(item["teacher_id"], item["subject_id"])] |= students
        teacher_class_counts[item["teacher_id"]] += 1
        class_rows.append({
            "id": item["id"],
            "name": item["name"],
            "school_year": item["school_year"],
            "subject": subjects.get(item["subject_id"], "Disciplina"),
            "teacher_id": item["teacher_id"],
            # Turma de professor excluído é preservada com teacher_id nulo.
            "teacher_name": teachers.get(item["teacher_id"], {}).get("full_name", "Sem professor"),
            **metrics(students, item["subject_id"]),
        })

    teacher_rows = []
    for teacher_id, teacher in teachers.items():
        subject_id = teacher.get("subject_id")
        students = set().union(*[s for (t, _), s in teacher_groups.items() if t == teacher_id]) if teacher_class_counts[teacher_id] else set()
        teacher_rows.append({
            "id": teacher_id,
            "full_name": teacher["full_name"],
            "subject": subjects.get(subject_id, "Sem disciplina") if subject_id else "Sem disciplina",
            "classes": teacher_class_counts[teacher_id],
            **(metrics(students, subject_id) if subject_id else summarize_group(set(), [], 0, 0, now)),
        })

    class_rows.sort(key=lambda row: (row["teacher_name"].casefold(), row["name"].casefold()))
    teacher_rows.sort(key=lambda row: row["full_name"].casefold())
    return {"min_group_size": MIN_GROUP_SIZE, "classes": class_rows, "teachers": teacher_rows}


def register_admin_panel_routes(
    app: FastAPI,
    *,
    database: Callable[[], Any],
    admin_dependency: Callable[..., dict[str, Any]],
    enforce_limit: Callable[[Any, str, str], None],
    identity_hash: Callable[[str], str],
) -> None:
    """Liga as rotas usando a autenticação e os limites configurados em main."""

    def load_teachers(db: Any) -> dict[str, dict[str, Any]]:
        profiles = (
            db.table("profiles").select("id,full_name,email,registration_status,created_at")
            .eq("role", "teacher").limit(ROW_LIMIT).execute().data
        )
        assignments = db.table("teacher_subjects").select("teacher_id,subject_id").limit(ROW_LIMIT).execute().data
        subject_by_teacher = {row["teacher_id"]: row["subject_id"] for row in assignments}
        return {row["id"]: {**row, "subject_id": subject_by_teacher.get(row["id"])} for row in profiles}

    def load_subjects(db: Any) -> dict[str, str]:
        return {row["id"]: row["name"] for row in db.table("subjects").select("id,name").limit(ROW_LIMIT).execute().data}

    def load_classes(db: Any, teacher_id: str | None = None, subject_id: str | None = None):
        query = db.table("classes").select("id,teacher_id,subject_id,name,school_year,created_at")
        if teacher_id:
            query = query.eq("teacher_id", teacher_id)
        if subject_id:
            query = query.eq("subject_id", subject_id)
        classes = query.limit(ROW_LIMIT).execute().data
        class_ids = [row["id"] for row in classes]
        members = (
            db.table("class_students").select("class_id,student_id").in_("class_id", class_ids).limit(ROW_LIMIT).execute().data
            if class_ids else []
        )
        return classes, members

    @app.get("/admin/teachers")
    def admin_teachers(admin: dict = Depends(admin_dependency)):
        """Todos os professores, com disciplina, turmas e alunos vinculados."""

        db = database()
        teachers = load_teachers(db)
        subjects = load_subjects(db)
        classes, members = load_classes(db)
        students_by_class: dict[str, set[str]] = defaultdict(set)
        for row in members:
            students_by_class[row["class_id"]].add(row["student_id"])
        classes_by_teacher: dict[str, list[str]] = defaultdict(list)
        for row in classes:
            classes_by_teacher[row["teacher_id"]].append(row["id"])
        result = []
        for teacher_id, teacher in teachers.items():
            class_ids = classes_by_teacher[teacher_id]
            result.append({
                "id": teacher_id,
                "full_name": teacher["full_name"],
                "email": teacher["email"],
                "registration_status": teacher["registration_status"],
                "subject": subjects.get(teacher["subject_id"]) if teacher["subject_id"] else None,
                "classes": len(class_ids),
                "students": len(set().union(*[students_by_class[c] for c in class_ids])) if class_ids else 0,
                "created_at": teacher["created_at"],
            })
        return sorted(result, key=lambda row: row["full_name"].casefold())

    @app.get("/admin/classes")
    def admin_classes(admin: dict = Depends(admin_dependency)):
        """Todas as turmas com professor, disciplina e número de alunos."""

        db = database()
        teachers = load_teachers(db)
        subjects = load_subjects(db)
        classes, members = load_classes(db)
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
                "teacher_name": teachers.get(row["teacher_id"], {}).get("full_name", "Sem professor"),
                "students": counts[row["id"]],
                "created_at": row["created_at"],
            }
            for row in classes
        ]
        return sorted(result, key=lambda row: (row["teacher_name"].casefold(), row["name"].casefold()))

    @app.get("/admin/performance")
    def admin_performance(
        teacher_id: UUID | None = Query(default=None),
        subject_id: UUID | None = Query(default=None),
        admin: dict = Depends(admin_dependency),
    ):
        """Desempenho agregado por turma e por professor, sem dados individuais."""

        db = database()
        enforce_limit(db, admin["id"], "admin_performance_read")
        teachers = load_teachers(db)
        if teacher_id:
            teachers = {key: value for key, value in teachers.items() if key == str(teacher_id)}
        if subject_id:
            teachers = {key: value for key, value in teachers.items() if value["subject_id"] == str(subject_id)}
        subjects = load_subjects(db)
        classes, members = load_classes(
            db, str(teacher_id) if teacher_id else None, str(subject_id) if subject_id else None,
        )
        student_ids = list({row["student_id"] for row in members})
        subject_ids = list({row["subject_id"] for row in classes})
        attempts: list[dict[str, Any]] = []
        completions: list[dict[str, Any]] = []
        alerts: list[dict[str, Any]] = []
        if student_ids and subject_ids:
            questions = db.table("questions").select("id,subject_id").in_("subject_id", subject_ids).limit(ROW_LIMIT).execute().data
            question_subject = {row["id"]: row["subject_id"] for row in questions}
            raw_attempts = (
                db.table("question_attempts").select("student_id,question_id,correct,answered_at")
                .in_("student_id", student_ids).limit(ROW_LIMIT).execute().data
            )
            attempts = [
                {**row, "subject_id": question_subject[row["question_id"]]}
                for row in raw_attempts if row["question_id"] in question_subject
            ]
            modules = db.table("modules").select("id,subject_id").in_("subject_id", subject_ids).limit(ROW_LIMIT).execute().data
            module_subject = {row["id"]: row["subject_id"] for row in modules}
            lessons = (
                db.table("lessons").select("id,module_id").in_("module_id", list(module_subject)).limit(ROW_LIMIT).execute().data
                if module_subject else []
            )
            lesson_subject = {row["id"]: module_subject[row["module_id"]] for row in lessons}
            progress = (
                db.table("lesson_progress").select("student_id,lesson_id").eq("completed", True)
                .in_("student_id", student_ids).limit(ROW_LIMIT).execute().data
            )
            completions = [
                {"student_id": row["student_id"], "subject_id": lesson_subject[row["lesson_id"]]}
                for row in progress if row["lesson_id"] in lesson_subject
            ]
            alerts = (
                db.table("difficulty_alerts").select("student_id,subject_id").eq("status", "active")
                .in_("student_id", student_ids).limit(ROW_LIMIT).execute().data
            )
        return build_performance(
            classes=classes, members=members, teachers=teachers, subjects=subjects,
            attempts=attempts, completions=completions, alerts=alerts, now=datetime.now(timezone.utc),
        )

    @app.post("/admin/users/{user_id}/delete")
    def admin_delete_user(
        user_id: UUID, payload: AdminAccountDeletion, request: Request, admin: dict = Depends(admin_dependency),
    ):
        """Exclui um aluno ou professor; a RPC repete todas as verificações."""

        if str(user_id) == admin["id"]:
            raise HTTPException(403, "A administração não exclui a própria conta.")
        db = database()
        enforce_limit(db, admin["id"], "admin_user_delete")
        rows = db.table("profiles").select("email,role").eq("id", str(user_id)).limit(1).execute().data
        if not rows:
            raise HTTPException(404, "Conta não encontrada.")
        if rows[0]["role"] == "admin":
            raise HTTPException(403, "Contas administrativas não são excluídas pelo painel.")
        try:
            result = db.rpc("admin_delete_account", {
                "p_admin_id": admin["id"], "p_target_id": str(user_id), "p_confirmation": payload.confirmation,
                "p_reason": payload.reason, "p_identity_hash": identity_hash(rows[0]["email"]),
            }).execute().data
        except Exception as error:
            code = str(getattr(error, "code", ""))
            status, message = {
                "PT400": (400, "Confira a confirmação e o motivo."),
                "PT403": (403, "Esta conta não pode ser excluída pelo painel."),
                "PT404": (404, "Conta não encontrada."),
                "PT409": (409, "A conta mudou durante a exclusão. Atualize a lista."),
                "PT412": (409, "A conta tem arquivos armazenados. Remova-os antes de excluir."),
            }.get(code, (503, "Não foi possível excluir a conta agora."))
            raise HTTPException(status, message) from error
        deleted_role = (result or {}).get("deleted_role", rows[0]["role"])
        # O evento guarda o cargo e o motivo; o identificador da conta some com ela.
        request.state.audit_metadata = {"deleted_role": deleted_role, "reason": payload.reason}
        return {"deleted": True, "deleted_role": deleted_role}
