"""Repositórios Supabase de conversas, questões, trilha do estudante e diagnóstico."""

from typing import Any

from aprendeia.adapters.outbound.supabase.client import DatabaseProvider
from aprendeia.adapters.outbound.supabase.rpc_errors import UNIQUE_VIOLATION, rpc_error
from aprendeia.application.ports.learning import DuplicateAnswer
from aprendeia.domain.errors import ServiceUnavailable

Row = dict[str, Any]

QUESTION_FIELDS = (
    "id,topic,difficulty,question,options,correct_index,explanation,"
    "status,review_notes,source,created_at,subjects(name)"
)
PRACTICE_QUESTION_FIELDS = "id,topic,difficulty,question,options,correct_index,explanation,status,subjects(name)"
DIAGNOSTIC_QUESTION_FIELDS = "id,subject_id,topic,difficulty,question,options,correct_index,explanation,subjects(name)"
LESSON_FIELDS = (
    "id,module_id,title,position,estimated_minutes,summary,content,learning_objectives,published,"
    "modules!inner(subject_id,title,subjects(name))"
)
REQUIRED_EXERCISE_FIELDS = (
    "question_id,position,"
    "questions!inner(id,topic,difficulty,question,options,correct_index,explanation,status)"
)
LEADERBOARD_UNAVAILABLE = "Ranking temporariamente indisponível."
LEADERBOARD_ERRORS = {
    400: "Confira os dados do ranking.",
    401: "Autenticação necessária.",
    403: "Você não tem permissão para este ranking.",
    404: "Ranking ou turma não encontrado.",
    409: "A preferência conflita com o estado atual da conta.",
    422: "Preferências de ranking inválidas.",
    429: "Limite de solicitações atingido.",
    503: LEADERBOARD_UNAVAILABLE,
}


class SupabaseRepository:
    """Base mínima: guarda o provedor do cliente da requisição."""

    def __init__(self, db: DatabaseProvider) -> None:
        self._db = db

    def _table(self, name: str):
        return self._db().table(name)

    def assignment_of(self, teacher_id: str) -> Row | None:
        rows = (
            self._table("teacher_subjects").select("subject_id,subjects(name)")
            .eq("teacher_id", teacher_id).limit(1).execute().data
        )
        return rows[0] if rows else None


def _first(rows: list[Row]) -> Row | None:
    return rows[0] if rows else None


class SupabaseConversations(SupabaseRepository):
    def enrollments_with_subject(self, student_id: str) -> list[Row]:
        return self._table("enrollments").select("subject_id,subjects(name)").eq("student_id", student_id).execute().data

    def teacher_assignments_for(self, subject_ids: list[str]) -> list[Row]:
        return (
            self._table("teacher_subjects").select("teacher_id,subject_id")
            .in_("subject_id", subject_ids).execute().data
        )

    def students_enrolled_in(self, subject_id: str) -> list[str]:
        rows = self._table("enrollments").select("student_id").eq("subject_id", subject_id).execute().data
        return [row["student_id"] for row in rows]

    def active_profiles(self, role: str, ids: list[str] | None = None) -> list[Row]:
        """Perfis ativos de um cargo; ids vazio devolve [] sem consultar o banco."""

        if ids is not None and not ids:
            return []
        query = self._table("profiles").select("id,full_name,role")
        if ids is not None:
            query = query.in_("id", ids)
        return query.eq("role", role).eq("registration_status", "active").execute().data

    def conversation_ids_of(self, user_id: str) -> list[str]:
        rows = self._table("conversation_members").select("conversation_id").eq("user_id", user_id).execute().data
        return [row["conversation_id"] for row in rows]

    def conversations(self, conversation_ids: list[str]) -> list[Row]:
        return (
            self._table("conversations").select("id,kind,created_at,last_message_at")
            .in_("id", conversation_ids).order("last_message_at", desc=True).execute().data
        )

    def members(self, conversation_ids: list[str]) -> list[Row]:
        return (
            self._table("conversation_members").select("conversation_id,user_id")
            .in_("conversation_id", conversation_ids).execute().data
        )

    def profiles(self, user_ids: list[str]) -> list[Row]:
        return self._table("profiles").select("id,full_name,role").in_("id", user_ids).execute().data

    def recent_messages(self, conversation_ids: list[str]) -> list[Row]:
        return (
            self._table("messages").select("conversation_id,body,created_at,sender_kind")
            .in_("conversation_id", conversation_ids).order("created_at", desc=True).limit(500).execute().data
        )

    def is_member(self, conversation_id: str, user_id: str) -> bool:
        rows = (
            self._table("conversation_members").select("conversation_id")
            .eq("conversation_id", conversation_id).eq("user_id", user_id).limit(1).execute().data
        )
        return bool(rows)

    def find_conversation(self, conversation_id: str) -> Row | None:
        return _first(
            self._table("conversations").select("id,kind,created_by,created_at,last_message_at")
            .eq("id", conversation_id).limit(1).execute().data
        )

    def find_recipient(self, user_id: str) -> Row | None:
        return _first(
            self._table("profiles").select("id,role,registration_status")
            .eq("id", user_id).limit(1).execute().data
        )

    def open_direct_conversation(self, actor_id: str, recipient_id: str) -> Any:
        return self._db().rpc(
            "get_or_create_direct_conversation", {"p_actor_id": actor_id, "p_recipient_id": recipient_id}
        ).execute().data

    def open_ai_conversation(self, actor_id: str) -> Any:
        return self._db().rpc("get_or_create_ai_conversation", {"p_actor_id": actor_id}).execute().data

    def messages(self, conversation_id: str) -> list[Row]:
        return (
            self._table("messages").select("id,sender_id,sender_kind,body,created_at")
            .eq("conversation_id", conversation_id).order("created_at").limit(200).execute().data
        )

    def add_message(self, conversation_id: str, sender_id: str, body: str, sent_at: str) -> Row:
        saved = self._table("messages").insert({
            "conversation_id": conversation_id,
            "sender_id": sender_id,
            "sender_kind": "user",
            "body": body,
            "created_at": sent_at,
        }).execute().data[0]
        self._table("conversations").update({"last_message_at": sent_at}).eq("id", conversation_id).execute()
        return saved

    def latest_bodies(self, conversation_id: str, limit: int) -> list[Row]:
        return (
            self._table("messages").select("sender_kind,body")
            .eq("conversation_id", conversation_id).order("created_at", desc=True).limit(limit).execute().data
        )

    def append_ai_exchange(self, actor_id: str, conversation_id: str, question: str, answer: str) -> Any:
        return self._db().rpc("append_ai_exchange", {
            "p_actor": actor_id, "p_conversation": conversation_id,
            "p_question": question, "p_answer": answer,
        }).execute().data


class SupabaseQuestions(SupabaseRepository):
    def list_questions(self, *, difficulty: str | None, published_only: bool) -> list[Row]:
        query = self._table("questions").select(QUESTION_FIELDS)
        if difficulty:
            query = query.eq("difficulty", difficulty)
        if published_only:
            query = query.eq("status", "published")
        return query.limit(100).execute().data

    def subject_id_by_name(self, name: str) -> str | None:
        rows = self._table("subjects").select("id").eq("name", name).limit(1).execute().data
        return rows[0]["id"] if rows else None

    def assigned_subject_id(self, teacher_id: str) -> str | None:
        rows = (
            self._table("teacher_subjects").select("subject_id")
            .eq("teacher_id", teacher_id).limit(1).execute().data
        )
        return rows[0]["subject_id"] if rows else None

    def insert_question(self, values: Row) -> Row:
        return self._table("questions").insert(values).execute().data[0]

    def questions_of_subject(self, subject_id: str) -> list[Row]:
        return (
            self._table("questions").select(QUESTION_FIELDS)
            .eq("subject_id", subject_id).order("created_at", desc=True).limit(300).execute().data
        )

    def question_in_subject(self, question_id: str, subject_id: str) -> bool:
        rows = (
            self._table("questions").select("id")
            .eq("id", question_id).eq("subject_id", subject_id).limit(1).execute().data
        )
        return bool(rows)

    def update_question(self, question_id: str, subject_id: str, values: Row) -> list[Row]:
        return (
            self._table("questions").update(values)
            .eq("id", question_id).eq("subject_id", subject_id).execute().data
        )

    def latest_level(self, student_id: str, subject_id: str) -> str | None:
        rows = (
            self._table("student_difficulties").select("level")
            .eq("student_id", student_id).eq("subject_id", subject_id)
            .order("updated_at", desc=True).limit(1).execute().data
        )
        return rows[0]["level"] if rows else None

    def published_questions(self, subject_id: str, difficulty: str | None) -> list[Row]:
        query = self._table("questions").select(PRACTICE_QUESTION_FIELDS).eq("subject_id", subject_id)
        if difficulty:
            query = query.eq("difficulty", difficulty)
        return query.eq("status", "published").limit(20).execute().data

    def published_question(self, question_id: str) -> Row | None:
        return _first(
            self._table("questions").select("id,subject_id,topic,correct_index,explanation,subjects(name)")
            .eq("id", question_id).eq("status", "published").limit(1).execute().data
        )

    def record_attempt(self, values: Row) -> None:
        self._table("question_attempts").insert(values).execute()

    def topic_attempts(self, student_id: str, subject_id: str, topic: str) -> list[Row]:
        return (
            self._table("question_attempts").select("correct,questions!inner(subject_id,topic)")
            .eq("student_id", student_id)
            .eq("questions.subject_id", subject_id)
            .eq("questions.topic", topic)
            .execute().data
        )

    def save_difficulty(self, values: Row) -> None:
        self._table("student_difficulties").upsert(values, on_conflict="student_id,subject_id,topic").execute()


class SupabaseDifficultyAlerts(SupabaseRepository):
    def teacher_of_subject(self, subject_id: str) -> str | None:
        rows = (
            self._table("teacher_subjects").select("teacher_id")
            .eq("subject_id", subject_id).limit(1).execute().data
        )
        return rows[0]["teacher_id"] if rows else None

    def find_alert(self, student_id: str, subject_id: str, topic: str) -> Row | None:
        return _first(
            self._table("difficulty_alerts").select("id,status")
            .eq("student_id", student_id).eq("subject_id", subject_id).eq("topic", topic)
            .limit(1).execute().data
        )

    def resolve_alert(self, alert_id: str, resolved_at: str) -> None:
        self._table("difficulty_alerts").update(
            {"status": "resolved", "updated_at": resolved_at}
        ).eq("id", alert_id).execute()

    def open_alert(self, values: Row) -> None:
        self._table("difficulty_alerts").upsert(values, on_conflict="student_id,subject_id,topic").execute()


class SupabaseStudentLearning(SupabaseRepository):
    def enrolled_subject_ids(self, student_id: str) -> list[str]:
        rows = self._table("enrollments").select("subject_id").eq("student_id", student_id).execute().data
        return [row["subject_id"] for row in rows]

    def catalog_rows(self, student_id: str, subject_ids: list[str]) -> tuple[list[Row], ...]:
        """Carrega disciplinas, módulos, aulas publicadas, progresso e dificuldades."""

        subject_rows = (
            self._table("subjects").select("id,name,description,category")
            .in_("id", subject_ids).order("name").execute().data
        )
        module_rows = (
            self._table("modules").select("id,subject_id,title,position")
            .in_("subject_id", subject_ids).order("position").execute().data
        )
        module_ids = [row["id"] for row in module_rows]
        lesson_rows = (
            self._table("lessons")
            .select("id,module_id,title,position,estimated_minutes,summary,learning_objectives,published")
            .in_("module_id", module_ids).eq("published", True).order("position").execute().data
            if module_ids else []
        )
        lesson_ids = [row["id"] for row in lesson_rows]
        progress_rows = (
            self._table("lesson_progress").select("lesson_id,completed,time_seconds,last_accessed_at")
            .eq("student_id", student_id).in_("lesson_id", lesson_ids).execute().data
            if lesson_ids else []
        )
        difficulty_rows = (
            self._table("student_difficulties").select("subject_id,topic,level,accuracy,attempts,updated_at")
            .eq("student_id", student_id).in_("subject_id", subject_ids).execute().data
        )
        return subject_rows, module_rows, lesson_rows, progress_rows, difficulty_rows

    def all_questions(self) -> list[Row]:
        return self._table("questions").select("id,subject_id,topic,subjects(name)").limit(5000).execute().data

    def practice_attempts(self, student_id: str) -> list[Row]:
        return (
            self._table("question_attempts").select("question_id,correct,answered_at")
            .eq("student_id", student_id).limit(10_000).execute().data
        )

    def diagnostic_attempts(self, student_id: str) -> list[Row]:
        return (
            self._table("diagnostic_answers").select("question_id,correct,answered_at")
            .eq("student_id", student_id).limit(1000).execute().data
        )

    def published_lesson(self, lesson_id: str) -> Row | None:
        return _first(
            self._table("lessons").select(LESSON_FIELDS)
            .eq("id", lesson_id).eq("published", True).limit(1).execute().data
        )

    def is_enrolled(self, student_id: str, subject_id: str) -> bool:
        rows = (
            self._table("enrollments").select("student_id")
            .eq("student_id", student_id).eq("subject_id", subject_id).limit(1).execute().data
        )
        return bool(rows)

    def lesson_progress(self, student_id: str, lesson_id: str) -> Row | None:
        return _first(
            self._table("lesson_progress").select("completed,time_seconds,last_accessed_at")
            .eq("student_id", student_id).eq("lesson_id", lesson_id).limit(1).execute().data
        )

    def required_exercise_links(self, lesson_id: str) -> list[Row]:
        return (
            self._table("lesson_required_exercises").select(REQUIRED_EXERCISE_FIELDS)
            .eq("lesson_id", lesson_id).eq("questions.status", "published").order("position").execute().data
        )

    def attempted_question_ids(self, student_id: str, question_ids: list[str]) -> set[str]:
        rows = (
            self._table("question_attempts").select("question_id")
            .eq("student_id", student_id).in_("question_id", question_ids).execute().data
        )
        return {row["question_id"] for row in rows}

    def completed_exercise_ids(self, student_id: str, lesson_id: str, question_ids: list[str]) -> set[str]:
        rows = (
            self._table("lesson_exercise_completions").select("question_id")
            .eq("student_id", student_id).eq("lesson_id", lesson_id)
            .in_("question_id", question_ids).execute().data
        )
        return {row["question_id"] for row in rows}

    def save_lesson_progress(self, values: Row) -> Row:
        return self._table("lesson_progress").upsert(values, on_conflict="student_id,lesson_id").execute().data[0]

    def save_exercise_completion(self, values: Row) -> Row:
        return (
            self._table("lesson_exercise_completions")
            .upsert(values, on_conflict="student_id,lesson_id,question_id").execute().data[0]
        )

    def update_profile(self, student_id: str, values: Row) -> list[Row]:
        return self._table("profiles").update(values).eq("id", student_id).execute().data


class SupabaseDiagnostics(SupabaseRepository):
    def last_completed_session(self, student_id: str) -> Row | None:
        return _first(
            self._table("diagnostic_sessions").select("id,completed_at")
            .eq("student_id", student_id).eq("status", "completed")
            .order("completed_at", desc=True).limit(1).execute().data
        )

    def open_session(self, student_id: str) -> Row | None:
        """Busca só a avaliação em andamento da pessoa autenticada."""

        return _first(
            self._table("diagnostic_sessions").select("id,student_id,question_ids,status,started_at")
            .eq("student_id", student_id).eq("status", "open").limit(1).execute().data
        )

    def published_candidates(self) -> list[Row]:
        return (
            self._table("questions").select(DIAGNOSTIC_QUESTION_FIELDS)
            .eq("status", "published").order("created_at").limit(200).execute().data
        )

    def create_session(self, student_id: str, question_ids: list[str]) -> Row:
        return (
            self._table("diagnostic_sessions")
            .insert({"student_id": student_id, "question_ids": question_ids}).execute().data[0]
        )

    def questions_by_ids(self, question_ids: list[str]) -> list[Row]:
        return self._table("questions").select(DIAGNOSTIC_QUESTION_FIELDS).in_("id", question_ids).execute().data

    def answered_question_ids(self, session_id: str, student_id: str) -> list[str]:
        rows = (
            self._table("diagnostic_answers").select("question_id")
            .eq("session_id", session_id).eq("student_id", student_id).execute().data
        )
        return [row["question_id"] for row in rows]

    def has_answer(self, session_id: str, question_id: str) -> bool:
        rows = (
            self._table("diagnostic_answers").select("id")
            .eq("session_id", session_id).eq("question_id", question_id).limit(1).execute().data
        )
        return bool(rows)

    def correct_index_of(self, question_id: str) -> int | None:
        rows = (
            self._table("questions").select("correct_index")
            .eq("id", question_id).eq("status", "published").limit(1).execute().data
        )
        return rows[0]["correct_index"] if rows else None

    def save_answer(self, values: Row) -> None:
        try:
            self._table("diagnostic_answers").insert(values).execute()
        except Exception as error:
            if getattr(error, "code", None) == UNIQUE_VIOLATION:
                raise DuplicateAnswer() from error
            raise

    def count_answers(self, session_id: str) -> int:
        return (
            self._table("diagnostic_answers").select("id", count="exact")
            .eq("session_id", session_id).execute().count
            or 0
        )

    def complete_session(self, session_id: str, student_id: str, completed_at: str) -> None:
        self._table("diagnostic_sessions").update(
            {"status": "completed", "completed_at": completed_at}
        ).eq("id", session_id).eq("student_id", student_id).execute()


def leaderboard_rpc(db: Any, name: str, params: Row) -> Any:
    try:
        return db.rpc(name, params).execute().data
    except Exception as error:
        raise rpc_error(error, LEADERBOARD_ERRORS) from error


def single_object(data: Any) -> Row:
    """O transporte PostgREST pode embrulhar o objeto em uma lista de um item."""

    if isinstance(data, list) and len(data) == 1:
        data = data[0]
    if not isinstance(data, dict):
        raise ServiceUnavailable(LEADERBOARD_UNAVAILABLE)
    return data


def read_summary(db: Any, user_id: str) -> Row:
    """Mantém todos os campos do resumo confiável; user_id vem da sessão."""

    return single_object(leaderboard_rpc(db, "gamification_summary", {"p_actor": user_id}))


class SupabaseGamification(SupabaseRepository):
    def summary(self, student_id: str) -> Row:
        return read_summary(self._db(), student_id)


class SupabaseLeaderboard(SupabaseRepository):
    def weekly(self, *, actor_id: str, scope: str, class_id: str | None, page: int, page_size: int) -> Row:
        return single_object(leaderboard_rpc(self._db(), "weekly_leaderboard", {
            "p_actor": actor_id, "p_scope": scope, "p_class_id": class_id,
            "p_page": page, "p_page_size": page_size,
        }))

    def update_preferences(self, *, actor_id: str, alias: str, school_opt_in: bool) -> Row:
        return single_object(leaderboard_rpc(self._db(), "update_leaderboard_preferences", {
            "p_actor": actor_id, "p_alias": alias, "p_school_opt_in": school_opt_in,
        }))
