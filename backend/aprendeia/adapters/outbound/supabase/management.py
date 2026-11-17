"""Repositórios Supabase do painel do professor, da administração e dos direitos do titular."""

from datetime import datetime, timezone
from typing import Any, Callable

from aprendeia.adapters.outbound.supabase.learning import SupabaseRepository, _first
from aprendeia.adapters.outbound.supabase.rpc_errors import STORAGE_PRECONDITION, error_code, rpc_error
from aprendeia.application.ports.management import InvalidExerciseSelection
from aprendeia.domain.errors import ApplicationError, Conflict, PayloadTooLarge

Row = dict[str, Any]

ROW_LIMIT = 10_000
EXPORT_PAGE_SIZE = 500
EXPORT_MAX_ROWS = 10_000
EXPORT_TOO_LARGE = "Exportação extensa. Solicite atendimento assistido à instituição."
RETENTION_BATCH_LIMIT = 25
AUDIT_FIELDS = (
    "id,user_id,role,action,resource,resource_id,created_at,metadata,actor_id,actor_role,"
    "request_method,route,status_code,outcome,request_id,occurred_at"
)
REQUEST_FIELDS = "id,user_id,kind,status,details,corrections,response,created_at,resolved_at,expires_at"

ACCOUNT_DELETION_ERRORS = {
    400: "Confira a confirmação e o motivo.",
    403: "Esta conta não pode ser excluída pelo painel.",
    404: "Conta não encontrada.",
    409: "A conta mudou durante a exclusão. Atualize a lista.",
    412: "A conta tem arquivos armazenados. Remova-os antes de excluir.",
    503: "Não foi possível excluir a conta agora.",
}
PRIVACY_ERRORS = {
    400: "Confira o tipo de pedido, os campos e a confirmação da ação.",
    403: "Pedido próprio e encerramento de conta administrativa não podem ser processados aqui.",
    404: "Pedido não encontrado ou fora do prazo de retenção.",
    409: "Pedido já processado ou já existe outro pedido desse tipo em aberto.",
    412: "A conta possui arquivos no Storage. Faça o atendimento assistido antes de encerrar a conta.",
    503: "Não foi possível processar o pedido agora.",
}
LIFECYCLE_REFUSED = "Operação de ciclo de conta indisponível ou recusada."
LIFECYCLE_ERRORS = {status: LIFECYCLE_REFUSED for status in (400, 403, 404, 409, 503)}

# Cada consulta filtra a pessoa antes de paginar. Não há SELECT * de Auth nem
# exportação dos históricos de colegas que compartilham a mesma turma.
EXPORT_TABLES = (
    ("profiles", "id", "id,email,full_name,role,grade,goal,created_at,updated_at,avatar_key,featured_badge_id,accent_theme,profile_setup_complete,requested_role,requested_subject,registration_status,privacy_policy_version,privacy_policy_accepted_at,terms_of_use_version,terms_of_use_accepted_at,auth_created_at,account_expires_at,age_band,admission_status,admission_version,email_difficulty_alerts,email_weekly_summary,notification_preferences_updated_at"),
    ("gamification_events", "student_id", "event_kind,event_key,xp,occurred_at,subject_id"),
    ("student_achievements", "student_id", "achievement_id,earned_at"),
    ("leaderboard_preferences", "student_id", "alias,school_opt_in"),
    ("account_admissions", "user_id", "id,responsible_name,responsible_contact,institutional_reference,version,decision,note,reviewed_at,created_at"),
    ("enrollments", "student_id", "subject_id,enrolled_at"),
    ("lesson_progress", "student_id", "lesson_id,completed,time_seconds,last_accessed_at"),
    ("question_attempts", "student_id", "id,question_id,selected_index,correct,response_time_seconds,answered_at"),
    ("student_difficulties", "student_id", "subject_id,topic,level,accuracy,attempts,updated_at"),
    ("difficulty_alerts", "student_id", "subject_id,topic,accuracy,attempts,status,opened_at,updated_at"),
    ("pedagogical_recommendations", "student_id", "id,subject_id,recommendation,created_at"),
    ("diagnostic_sessions", "student_id", "id,status,started_at,completed_at"),
    ("diagnostic_answers", "student_id", "id,session_id,question_id,selected_index,correct,response_time_seconds,answered_at"),
    ("student_activity_days", "student_id", "activity_date,last_activity_at"),
    ("lesson_exercise_completions", "student_id", "lesson_id,question_id,completed_at"),
    ("class_students", "student_id", "class_id,joined_at"),
    ("teacher_subjects", "teacher_id", "subject_id,created_at"),
    ("classes", "teacher_id", "id,subject_id,name,school_year,created_at"),
    ("learning_contents", "teacher_id", "id,subject_id,title,description,content_type,source_url,created_at"),
    ("questions", "created_by", "id,subject_id,topic,difficulty,question,options,correct_index,explanation,status,created_at"),
    ("messages", "sender_id", "id,conversation_id,body,created_at"),
    ("conversations", "created_by", "id,kind,created_at,last_message_at"),
    ("conversation_members", "user_id", "conversation_id,joined_at"),
    ("privacy_policy_acceptances", "user_id", "policy_version,terms_version,accepted_at"),
    ("privacy_requests", "user_id", "id,kind,status,details,corrections,response,created_at,resolved_at"),
    ("access_audit_logs", "user_id", "action,resource,resource_id,status_code,outcome,created_at"),
)

EXPORT_ORDER = {
    "gamification_events": ("event_kind", "event_key"),
    "student_achievements": ("achievement_id",),
    "leaderboard_preferences": ("student_id",),
    "enrollments": ("subject_id",), "lesson_progress": ("lesson_id",),
    "student_difficulties": ("subject_id", "topic"), "student_activity_days": ("activity_date",),
    "lesson_exercise_completions": ("lesson_id", "question_id"), "class_students": ("class_id",),
    "teacher_subjects": ("subject_id",), "conversation_members": ("conversation_id",),
    "privacy_policy_acceptances": ("policy_version",),
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class SupabaseTeachers(SupabaseRepository):
    def enrolled_student_ids(self, subject_id: str) -> list[str]:
        rows = self._table("enrollments").select("student_id").eq("subject_id", subject_id).execute().data
        return [row["student_id"] for row in rows]

    def student_cards(self, student_ids: list[str]) -> list[Row]:
        return self._table("profiles").select("id,full_name,grade").in_("id", student_ids).execute().data

    def active_alerts(self, teacher_id: str, subject_id: str) -> list[Row]:
        return (
            self._table("difficulty_alerts")
            .select("id,student_id,topic,accuracy,attempts,status,opened_at,updated_at")
            .eq("teacher_id", teacher_id).eq("subject_id", subject_id).eq("status", "active")
            .order("updated_at", desc=True).limit(100).execute().data
        )

    def count_active_alerts(self, teacher_id: str, subject_id: str) -> int:
        return (
            self._table("difficulty_alerts").select("id", count="exact")
            .eq("teacher_id", teacher_id).eq("subject_id", subject_id).eq("status", "active")
            .execute().count
            or 0
        )

    def class_ids_of(self, teacher_id: str) -> list[str]:
        rows = self._table("classes").select("id").eq("teacher_id", teacher_id).execute().data
        return [row["id"] for row in rows]

    def classes_of(self, teacher_id: str, subject_id: str) -> list[Row]:
        return (
            self._table("classes").select("id,name,school_year,created_at")
            .eq("teacher_id", teacher_id).eq("subject_id", subject_id).order("created_at").execute().data
        )

    def class_memberships(self, class_ids: list[str]) -> list[Row]:
        return self._table("class_students").select("class_id").in_("class_id", class_ids).execute().data

    def student_ids_in_classes(self, class_ids: list[str]) -> list[str]:
        rows = self._table("class_students").select("student_id").in_("class_id", class_ids).execute().data
        return [row["student_id"] for row in rows]

    def owned_class(self, teacher_id: str, class_id: str) -> Row | None:
        return _first(
            self._table("classes").select("id,name,school_year,subject_id,subjects(name)")
            .eq("id", class_id).eq("teacher_id", teacher_id).limit(1).execute().data
        )

    def class_exists(self, teacher_id: str, name: str, school_year: str) -> bool:
        rows = (
            self._table("classes").select("id")
            .eq("teacher_id", teacher_id).eq("name", name).eq("school_year", school_year)
            .limit(1).execute().data
        )
        return bool(rows)

    def create_class(self, values: Row) -> Row:
        return self._table("classes").insert(values).execute().data[0]

    def class_student_ids(self, class_id: str) -> list[str]:
        rows = self._table("class_students").select("student_id").eq("class_id", class_id).execute().data
        return [row["student_id"] for row in rows]

    def student_by_email(self, email: str) -> Row | None:
        return _first(
            self._table("profiles").select("id,full_name,grade,email,role")
            .eq("email", email).eq("role", "student").limit(1).execute().data
        )

    def is_enrolled(self, student_id: str, subject_id: str) -> bool:
        rows = (
            self._table("enrollments").select("student_id")
            .eq("student_id", student_id).eq("subject_id", subject_id).limit(1).execute().data
        )
        return bool(rows)

    def is_class_member(self, class_id: str, student_id: str) -> bool:
        rows = (
            self._table("class_students").select("student_id")
            .eq("class_id", class_id).eq("student_id", student_id).limit(1).execute().data
        )
        return bool(rows)

    def add_class_member(self, class_id: str, student_id: str) -> None:
        self._table("class_students").insert({"class_id": class_id, "student_id": student_id}).execute()

    def remove_class_member(self, class_id: str, student_id: str) -> None:
        self._table("class_students").delete().eq("class_id", class_id).eq("student_id", student_id).execute()

    def performance_rows(self, subject_id: str, student_ids: list[str]) -> Row:
        profiles = self._table("profiles").select("id,full_name,grade,email").in_("id", student_ids).execute().data
        questions = self._table("questions").select("id,topic").eq("subject_id", subject_id).limit(5000).execute().data
        question_ids = [row["id"] for row in questions]
        attempts = (
            self._table("question_attempts")
            .select("student_id,question_id,correct,response_time_seconds,answered_at")
            .in_("student_id", student_ids).in_("question_id", question_ids)
            .order("answered_at", desc=True).limit(ROW_LIMIT).execute().data
            if question_ids else []
        )
        modules = self._table("modules").select("id").eq("subject_id", subject_id).execute().data
        module_ids = [row["id"] for row in modules]
        lessons = self._table("lessons").select("id").in_("module_id", module_ids).execute().data if module_ids else []
        lesson_ids = [row["id"] for row in lessons]
        progress = (
            self._table("lesson_progress").select("student_id,time_seconds,completed,last_accessed_at")
            .in_("student_id", student_ids).in_("lesson_id", lesson_ids).limit(ROW_LIMIT).execute().data
            if lesson_ids else []
        )
        difficulties = (
            self._table("student_difficulties").select("student_id,topic,accuracy,attempts,level,updated_at")
            .in_("student_id", student_ids).eq("subject_id", subject_id).limit(5000).execute().data
        )
        return {
            "profiles": profiles, "questions": questions, "attempts": attempts,
            "progress": progress, "difficulties": difficulties,
        }

    def contents_of(self, teacher_id: str, subject_id: str) -> list[Row]:
        return (
            self._table("learning_contents").select("id,title,description,content_type,source_url,created_at")
            .eq("teacher_id", teacher_id).eq("subject_id", subject_id)
            .order("created_at", desc=True).limit(200).execute().data
        )

    def create_content(self, values: Row) -> Row:
        return self._table("learning_contents").insert(values).execute().data[0]

    def create_contents(self, records: list[Row]) -> list[Row]:
        return self._table("learning_contents").insert(records).execute().data

    def save_recommendation(self, values: Row) -> Row:
        return self._table("pedagogical_recommendations").insert(values).execute().data[0]

    def notification_preferences(self, teacher_id: str) -> Row | None:
        return _first(
            self._table("profiles")
            .select("email_difficulty_alerts,email_weekly_summary,notification_preferences_updated_at")
            .eq("id", teacher_id).limit(1).execute().data
        )

    def update_notification_preferences(self, teacher_id: str, values: Row) -> list[Row]:
        return self._table("profiles").update(values).eq("id", teacher_id).execute().data


class SupabaseAdministration(SupabaseRepository):
    def profile_roles(self) -> list[Row]:
        return self._table("profiles").select("role").limit(ROW_LIMIT).execute().data

    def count_subjects(self) -> int:
        return self._table("subjects").select("id", count="exact").execute().count or 0

    def count_lessons(self) -> int:
        return self._table("lessons").select("id", count="exact").execute().count or 0

    def question_statuses(self) -> list[Row]:
        return self._table("questions").select("status").limit(ROW_LIMIT).execute().data

    def users(self) -> list[Row]:
        return (
            self._table("profiles").select("id,full_name,email,role,grade,registration_status,created_at")
            .order("created_at", desc=True).limit(500).execute().data
        )

    def audit_events(self, *, since: str, role: str | None, outcome: str | None,
                     action: str | None, user_id: str | None, limit: int) -> list[Row]:
        query = self._table("access_audit_logs").select(AUDIT_FIELDS).gte("created_at", since)
        if role:
            query = query.eq("role", role)
        if outcome:
            query = query.eq("outcome", outcome)
        if action:
            query = query.eq("action", action)
        if user_id:
            # Histórico de uma pessoa: o que ela fez, dentro da mesma retenção de 7 dias.
            query = query.eq("user_id", user_id)
        return query.order("created_at", desc=True).limit(limit).execute().data

    def profiles(self, user_ids: list[str]) -> list[Row]:
        return self._table("profiles").select("id,full_name,role").in_("id", user_ids).execute().data

    def editorial_rows(self) -> tuple[list[Row], list[Row], list[Row], list[Row]]:
        """Carrega a árvore editorial completa para a administração."""

        subjects = self._table("subjects").select("id,name,description,category,created_at").order("name").execute().data
        subject_ids = [row["id"] for row in subjects]
        modules = (
            self._table("modules").select("id,subject_id,title,position")
            .in_("subject_id", subject_ids).order("position").execute().data
            if subject_ids else []
        )
        module_ids = [row["id"] for row in modules]
        lessons = (
            self._table("lessons")
            .select("id,module_id,title,position,estimated_minutes,summary,content,learning_objectives,published")
            .in_("module_id", module_ids).order("position").execute().data
            if module_ids else []
        )
        lesson_ids = [row["id"] for row in lessons]
        required = (
            self._table("lesson_required_exercises").select("lesson_id").in_("lesson_id", lesson_ids).execute().data
            if lesson_ids else []
        )
        return subjects, modules, lessons, required

    def subject_name_taken(self, name: str) -> bool:
        return bool(self._table("subjects").select("id").eq("name", name).limit(1).execute().data)

    def create_subject(self, values: Row) -> Row:
        return self._table("subjects").insert(values).execute().data[0]

    def update_subject(self, subject_id: str, values: Row) -> list[Row]:
        return self._table("subjects").update(values).eq("id", subject_id).execute().data

    def subject_exists(self, subject_id: str) -> bool:
        return bool(self._table("subjects").select("id").eq("id", subject_id).limit(1).execute().data)

    def create_module(self, values: Row) -> Row:
        return self._table("modules").insert(values).execute().data[0]

    def module_exists(self, module_id: str) -> bool:
        return bool(self._table("modules").select("id").eq("id", module_id).limit(1).execute().data)

    def create_lesson(self, values: Row) -> Row:
        return self._table("lessons").insert(values).execute().data[0]

    def update_lesson(self, lesson_id: str, values: Row) -> list[Row]:
        return self._table("lessons").update(values).eq("id", lesson_id).execute().data

    def lesson_subject_id(self, lesson_id: str) -> str | None:
        rows = (
            self._table("lessons").select("id,modules!inner(subject_id)")
            .eq("id", lesson_id).limit(1).execute().data
        )
        return rows[0]["modules"]["subject_id"] if rows else None

    def required_exercise_ids(self, lesson_id: str) -> list[str]:
        rows = (
            self._table("lesson_required_exercises").select("question_id,position")
            .eq("lesson_id", lesson_id).order("position").execute().data
        )
        return [row["question_id"] for row in rows]

    def published_subject_questions(self, subject_id: str) -> list[Row]:
        return (
            self._table("questions").select("id,topic,difficulty,question")
            .eq("subject_id", subject_id).eq("status", "published")
            .order("created_at", desc=True).limit(100).execute().data
        )

    def replace_required_exercises(self, lesson_id: str, question_ids: list[str]) -> None:
        try:
            self._db().rpc(
                "replace_lesson_required_exercises",
                {"p_lesson_id": lesson_id, "p_question_ids": question_ids},
            ).execute()
        except Exception as error:
            if "invalid_questions" in str(error) or "duplicate_questions" in str(error):
                raise InvalidExerciseSelection() from error
            raise

    def official_lessons(self) -> list[Row]:
        return (
            self._table("lessons").select("id,title,summary,published,modules(title,subjects(name))")
            .order("title").limit(1000).execute().data
        )

    def teacher_materials(self) -> list[Row]:
        return (
            self._table("learning_contents")
            .select(
                "id,title,description,content_type,source_url,created_at,subjects(name),"
                "profiles!learning_contents_teacher_id_fkey(full_name)"
            )
            .order("created_at", desc=True).limit(1000).execute().data
        )

    def pending_teacher_requests(self) -> list[Row]:
        return (
            self._table("profiles").select("id,email,full_name,requested_subject,created_at")
            .eq("requested_role", "teacher").eq("registration_status", "pending_teacher")
            .order("created_at").limit(100).execute().data
        )

    def pending_teacher_request(self, user_id: str) -> Row | None:
        return _first(
            self._table("profiles").select("id,email,full_name,registration_status")
            .eq("id", user_id).eq("requested_role", "teacher").eq("registration_status", "pending_teacher")
            .limit(1).execute().data
        )

    def subject_id_by_name(self, name: str) -> str | None:
        rows = self._table("subjects").select("id").eq("name", name).limit(1).execute().data
        return rows[0]["id"] if rows else None

    def subject_has_teacher(self, subject_id: str) -> bool:
        rows = (
            self._table("teacher_subjects").select("teacher_id")
            .eq("subject_id", subject_id).limit(1).execute().data
        )
        return bool(rows)

    def approve_teacher(self, user_id: str, subject_name: str) -> list[Row]:
        return self._db().rpc(
            "approve_teacher_registration",
            {"target_user_id": user_id, "approved_subject_name": subject_name},
        ).execute().data

    def set_profile_role(self, user_id: str, full_name: str, role: str) -> None:
        self._table("profiles").update({"full_name": full_name, "role": role}).eq("id", user_id).execute()

    def assign_teacher(self, teacher_id: str, subject_id: str) -> None:
        self._table("teacher_subjects").insert({"teacher_id": teacher_id, "subject_id": subject_id}).execute()

    def account_identity(self, user_id: str) -> Row | None:
        return _first(self._table("profiles").select("email,role").eq("id", user_id).limit(1).execute().data)

    def delete_account(self, *, admin_id: str, target_id: str, confirmation: str,
                       reason: str, identity_hash: str) -> Row | None:
        try:
            return self._db().rpc("admin_delete_account", {
                "p_admin_id": admin_id, "p_target_id": target_id, "p_confirmation": confirmation,
                "p_reason": reason, "p_identity_hash": identity_hash,
            }).execute().data
        except Exception as error:
            if error_code(error) == STORAGE_PRECONDITION:
                # Arquivos pendentes são um conflito de estado que a administração resolve antes.
                raise Conflict(ACCOUNT_DELETION_ERRORS[412]) from error
            raise rpc_error(error, ACCOUNT_DELETION_ERRORS) from error

    def teachers_with_subject(self) -> dict[str, Row]:
        profiles = (
            self._table("profiles").select("id,full_name,email,registration_status,created_at")
            .eq("role", "teacher").limit(ROW_LIMIT).execute().data
        )
        assignments = self._table("teacher_subjects").select("teacher_id,subject_id").limit(ROW_LIMIT).execute().data
        subject_by_teacher = {row["teacher_id"]: row["subject_id"] for row in assignments}
        return {row["id"]: {**row, "subject_id": subject_by_teacher.get(row["id"])} for row in profiles}

    def subject_names(self) -> dict[str, str]:
        rows = self._table("subjects").select("id,name").limit(ROW_LIMIT).execute().data
        return {row["id"]: row["name"] for row in rows}

    def classes_with_members(self, teacher_id: str | None = None,
                             subject_id: str | None = None) -> tuple[list[Row], list[Row]]:
        query = self._table("classes").select("id,teacher_id,subject_id,name,school_year,created_at")
        if teacher_id:
            query = query.eq("teacher_id", teacher_id)
        if subject_id:
            query = query.eq("subject_id", subject_id)
        classes = query.limit(ROW_LIMIT).execute().data
        class_ids = [row["id"] for row in classes]
        members = (
            self._table("class_students").select("class_id,student_id")
            .in_("class_id", class_ids).limit(ROW_LIMIT).execute().data
            if class_ids else []
        )
        return classes, members

    def group_activity(self, student_ids: list[str], subject_ids: list[str]) -> tuple[list[Row], list[Row], list[Row]]:
        questions = (
            self._table("questions").select("id,subject_id")
            .in_("subject_id", subject_ids).limit(ROW_LIMIT).execute().data
        )
        question_subject = {row["id"]: row["subject_id"] for row in questions}
        raw_attempts = (
            self._table("question_attempts").select("student_id,question_id,correct,answered_at")
            .in_("student_id", student_ids).limit(ROW_LIMIT).execute().data
        )
        attempts = [
            {**row, "subject_id": question_subject[row["question_id"]]}
            for row in raw_attempts if row["question_id"] in question_subject
        ]
        modules = (
            self._table("modules").select("id,subject_id")
            .in_("subject_id", subject_ids).limit(ROW_LIMIT).execute().data
        )
        module_subject = {row["id"]: row["subject_id"] for row in modules}
        lessons = (
            self._table("lessons").select("id,module_id")
            .in_("module_id", list(module_subject)).limit(ROW_LIMIT).execute().data
            if module_subject else []
        )
        lesson_subject = {row["id"]: module_subject[row["module_id"]] for row in lessons}
        progress = (
            self._table("lesson_progress").select("student_id,lesson_id").eq("completed", True)
            .in_("student_id", student_ids).limit(ROW_LIMIT).execute().data
        )
        completions = [
            {"student_id": row["student_id"], "subject_id": lesson_subject[row["lesson_id"]]}
            for row in progress if row["lesson_id"] in lesson_subject
        ]
        alerts = (
            self._table("difficulty_alerts").select("student_id,subject_id").eq("status", "active")
            .in_("student_id", student_ids).limit(ROW_LIMIT).execute().data
        )
        return attempts, completions, alerts


def _pages(fetch_page: Callable[[int], list[Row]]) -> list[Row]:
    """Página cheia exige próxima consulta; um limite não pode cortar o arquivo em silêncio."""

    rows: list[Row] = []
    # O teto evita uma resposta sem limite de memória. Contas acima dele
    # recebem erro explícito e precisam de exportação assistida pela instituição.
    for offset in range(0, EXPORT_MAX_ROWS + 1, EXPORT_PAGE_SIZE):
        page = fetch_page(offset)
        rows.extend(page)
        if len(rows) > EXPORT_MAX_ROWS:
            raise PayloadTooLarge(EXPORT_TOO_LARGE)
        if len(page) < EXPORT_PAGE_SIZE:
            break
    return rows


def personal_export(db: Any, user_id: str) -> Row:
    """Reúne só os dados da própria pessoa, tabela por tabela."""

    result: Row = {"generated_at": _now(), "data": {}}
    for table, owner_column, fields in EXPORT_TABLES:
        def owned_page(offset: int, table=table, owner_column=owner_column, fields=fields) -> list[Row]:
            query = db.table(table).select(fields).eq(owner_column, user_id)
            for column in EXPORT_ORDER.get(table, ("id",)):
                query = query.order(column)
            return query.range(offset, offset + EXPORT_PAGE_SIZE - 1).execute().data

        result["data"][table] = _pages(owned_page)
    # Respostas do tutor pertencem ao contexto individual. Mensagens recebidas
    # em conversas humanas não entram no arquivo de outro titular.
    ai_ids = [row["id"] for row in result["data"]["conversations"] if row["kind"] == "ai"]

    def ai_page(offset: int) -> list[Row]:
        return db.table("messages").select("id,conversation_id,sender_kind,body,created_at").in_(
            "conversation_id", ai_ids
        ).order("created_at").order("id").range(offset, offset + EXPORT_PAGE_SIZE - 1).execute().data

    result["data"]["ai_messages"] = _pages(ai_page) if ai_ids else []
    return result


def _privacy_guard(operation: Callable[[], Any]) -> Any:
    """Códigos controlados preservam o estado sem divulgar respostas do provedor."""

    try:
        return operation()
    except ApplicationError:
        raise
    except Exception as error:
        raise rpc_error(error, PRIVACY_ERRORS) from error


class SupabasePrivacyRequests(SupabaseRepository):
    def own_requests(self, user_id: str) -> list[Row]:
        return _privacy_guard(lambda: (
            self._table("privacy_requests").select(REQUEST_FIELDS).eq("user_id", user_id)
            .gt("expires_at", _now()).order("created_at", desc=True).limit(100).execute().data
        ))

    def all_requests(self) -> list[Row]:
        return _privacy_guard(lambda: (
            self._table("privacy_requests").select(REQUEST_FIELDS)
            .gt("expires_at", _now()).order("created_at", desc=True).limit(100).execute().data
        ))

    def create(self, values: Row) -> Row:
        return _privacy_guard(lambda: self._table("privacy_requests").insert(values).execute().data[0])

    def cancel(self, actor_id: str, request_id: str) -> Any:
        return _privacy_guard(lambda: self._db().rpc(
            "cancel_privacy_request", {"p_actor_id": actor_id, "p_request_id": request_id}
        ).execute().data)

    def find(self, request_id: str, user_id: str | None = None) -> Row | None:
        def query() -> Row | None:
            builder = self._table("privacy_requests").select(REQUEST_FIELDS).eq("id", request_id)
            if user_id is not None:
                builder = builder.eq("user_id", user_id)
            return _first(builder.gt("expires_at", _now()).limit(1).execute().data)

        return _privacy_guard(query)

    def personal_export(self, user_id: str) -> Row:
        return _privacy_guard(lambda: personal_export(self._db(), user_id))

    def account_email(self, user_id: str) -> str | None:
        rows = _privacy_guard(
            lambda: self._table("profiles").select("email").eq("id", user_id).limit(1).execute().data
        )
        return rows[0]["email"] if rows else None

    def resolve(self, *, admin_id: str, request_id: str, decision: str, response: str,
                confirmation: str, identity_hash: str | None) -> Any:
        return _privacy_guard(lambda: self._db().rpc("resolve_privacy_request", {
            "p_admin_id": admin_id, "p_request_id": request_id, "p_decision": decision,
            "p_response": response, "p_confirmation": confirmation, "p_identity_hash": identity_hash,
        }).execute().data)


def run_account_retention(db: Any, *, deliver_summary: Callable, limit: int = RETENTION_BATCH_LIMIT) -> Row:
    """API-first, com lease e recibo persistido antes de qualquer remoção.

    deliver_summary(user_id, summary, idempotency_key) deve retornar True somente
    após o envio confirmado. Resultado ambíguo exige reconciliação pelo remetente.
    """

    if not 1 <= limit <= 100:
        raise ValueError("Limite de lote inválido")
    candidates = db.rpc("account_retention_candidates", {"p_limit": limit}).execute().data
    if not isinstance(candidates, list):
        raise RuntimeError("Lista de retenção inválida")
    completed = failed = skipped = 0
    for user_id in candidates:
        try:
            if _retain_account(db, user_id, deliver_summary):
                completed += 1
            else:
                skipped += 1
        except Exception:
            failed += 1
            # Não divulgamos PII, tokens ou erros do provedor no endpoint interno.
            # O lease permite retomar a mesma chave de resumo após uma falha.
    return {"completed": completed, "failed": failed, "skipped": skipped}


def _retain_account(db: Any, user_id: str, deliver_summary: Callable) -> bool:
    """Executa a retenção de uma conta; False quando outro processo já a reservou."""

    job = db.rpc("claim_account_retention", {"p_user": user_id}).execute().data
    if not job:
        return False
    fence = {"p_job": job["id"], "p_token": job["token"]}
    if not job["summary_sent"]:
        if deliver_summary(user_id, job["summary"], job["id"]) is not True:
            raise RuntimeError("Resumo sem confirmação")
        db.rpc("confirm_account_retention_summary", fence).execute()
    manifest = db.rpc("prepare_account_retention", fence).execute().data
    if not isinstance(manifest, list):
        raise RuntimeError("Manifesto Storage inválido")
    # A RPC recusou dependências compartilhadas antes de fornecer paths.
    for item in manifest:
        if not item.get("bucket_id") or not item.get("name"):
            raise RuntimeError("Objeto Storage inválido")
        db.storage.from_(item["bucket_id"]).remove([item["name"]])
    db.rpc("authorize_account_retention_delete", fence).execute()
    db.auth.admin.delete_user(user_id, should_soft_delete=False)
    # Confirma o commit Auth; uma resposta HTTP incerta não vira sucesso.
    result = db.rpc("account_retention_result", {"p_job": job["id"]}).execute().data
    if result != "completed":
        raise RuntimeError("Exclusão Auth sem confirmação")
    return True


class SupabaseAccountLifecycle(SupabaseRepository):
    def call(self, operation: str, params: Row) -> Any:
        try:
            return self._db().rpc(operation, params).execute().data
        except Exception as error:
            raise rpc_error(error, LIFECYCLE_ERRORS) from error

    def run_retention(self, deliver_summary: Callable) -> Row:
        return run_account_retention(self._db(), deliver_summary=deliver_summary)
