"""Raiz de composição: liga cada caso de uso aos adaptadores de saída.

Uma instância vale por uma requisição. O cliente do banco só é criado quando o
primeiro repositório precisa dele, e todos os repositórios da requisição o
compartilham. Qualquer porta pode ser substituída no construtor, o que deixa os
testes trocarem banco, IA, e-mail ou limites sem tocar nos casos de uso.
"""

from functools import cached_property
from typing import Callable

from aprendeia.adapters.outbound.email_delivery import EmailTeacherNotifier
from aprendeia.adapters.outbound.openai_tutor import OpenAITutor
from aprendeia.adapters.outbound.supabase.client import DatabaseProvider, RequestDatabase, SupabaseGate
from aprendeia.adapters.outbound.supabase.learning import (
    SupabaseConversations,
    SupabaseDiagnostics,
    SupabaseDifficultyAlerts,
    SupabaseGamification,
    SupabaseLeaderboard,
    SupabaseQuestions,
    SupabaseStudentLearning,
)
from aprendeia.adapters.outbound.supabase.management import (
    SupabaseAccountLifecycle,
    SupabaseAdministration,
    SupabasePrivacyRequests,
    SupabaseTeachers,
)
from aprendeia.adapters.outbound.supabase.security import (
    EnvironmentIdentityHasher,
    SupabaseIdentityProvider,
    SupabaseLegalDocuments,
    SupabaseLoginThrottle,
    SupabaseProfiles,
    SupabaseRateLimiter,
    SupabaseReadinessProbe,
    TurnstileCaptcha,
)
from aprendeia.application.ports.learning import TeacherNotifier, TutorModel
from aprendeia.application.ports.security import CaptchaVerifier, IdentityHasher, RateLimiter
from aprendeia.application.services.access import (
    HealthService,
    LegalConsentService,
    LoginService,
    SessionAuthenticator,
)
from aprendeia.application.services.account_rights import (
    AccountLifecycleService,
    LeaderboardService,
    PrivacyRequestService,
    WeeklySummaryService,
)
from aprendeia.application.services.administration import (
    AccountProvisioningService,
    AdminOverviewService,
    EditorialCatalogService,
    SchoolPerformanceService,
)
from aprendeia.application.services.communications import (
    ContactDirectory,
    ConversationService,
    TutorConversationService,
)
from aprendeia.application.services.question_bank import DifficultyAlertService, QuestionBankService
from aprendeia.application.services.student_learning import (
    DiagnosticService,
    LessonService,
    StudentProfileService,
    StudyPlanService,
)
from aprendeia.application.services.teaching import (
    ClassroomAccess,
    ClassroomService,
    NotificationPreferenceService,
    TeacherContentService,
    TeacherOverviewService,
    TeacherRecommendationService,
)
from aprendeia.config import settings


class Services:
    """Casos de uso prontos para uma requisição."""

    def __init__(
        self,
        database: DatabaseProvider | None = None,
        *,
        limiter: RateLimiter | None = None,
        tutor: TutorModel | None = None,
        notifier: TeacherNotifier | None = None,
        hasher: IdentityHasher | None = None,
        captcha: CaptchaVerifier | None = None,
        retention_enabled: Callable[[], bool] = settings.account_retention_enabled,
        deliver_retention_summary: Callable | None = None,
    ) -> None:
        self.db = RequestDatabase(database)
        self.persistence = SupabaseGate(self.db)
        self.limiter = limiter or SupabaseRateLimiter(self.db)
        self.tutor = tutor or OpenAITutor()
        self.notifier = notifier or EmailTeacherNotifier(self.db)
        self.hasher = hasher or EnvironmentIdentityHasher()
        self.captcha = captcha or TurnstileCaptcha()
        self._retention_enabled = retention_enabled
        self._deliver_retention_summary = deliver_retention_summary

    # --- acesso -----------------------------------------------------------

    @cached_property
    def identity(self) -> SupabaseIdentityProvider:
        return SupabaseIdentityProvider(self.db)

    @cached_property
    def legal_documents(self) -> SupabaseLegalDocuments:
        return SupabaseLegalDocuments(self.db)

    @cached_property
    def login(self) -> LoginService:
        return LoginService(
            persistence=self.persistence,
            identity=self.identity,
            throttle=SupabaseLoginThrottle(self.db),
            captcha=self.captcha,
            hasher=self.hasher,
            profiles=SupabaseProfiles(self.db),
        )

    @cached_property
    def sessions(self) -> SessionAuthenticator:
        return SessionAuthenticator(
            persistence=self.persistence,
            identity=self.identity,
            profiles=SupabaseProfiles(self.db),
            legal=self.legal_documents,
        )

    @cached_property
    def legal_consent(self) -> LegalConsentService:
        return LegalConsentService(legal=self.legal_documents, limiter=self.limiter)

    @cached_property
    def health(self) -> HealthService:
        return HealthService(
            persistence=self.persistence,
            captcha=self.captcha,
            probe=SupabaseReadinessProbe(self.db),
            ai_configured=settings.openai_configured(),
        )

    # --- comunicação ------------------------------------------------------

    @cached_property
    def _conversation_repository(self) -> SupabaseConversations:
        return SupabaseConversations(self.db)

    @cached_property
    def contacts(self) -> ContactDirectory:
        return ContactDirectory(self._conversation_repository)

    @cached_property
    def conversations(self) -> ConversationService:
        return ConversationService(conversations=self._conversation_repository, limiter=self.limiter)

    @cached_property
    def tutor_conversations(self) -> TutorConversationService:
        return TutorConversationService(
            conversations=self._conversation_repository,
            ownership=self.conversations,
            tutor=self.tutor,
            limiter=self.limiter,
        )

    # --- questões e trilha do estudante ----------------------------------

    @cached_property
    def difficulty_alerts(self) -> DifficultyAlertService:
        return DifficultyAlertService(alerts=SupabaseDifficultyAlerts(self.db), notifier=self.notifier)

    @cached_property
    def question_bank(self) -> QuestionBankService:
        return QuestionBankService(
            questions=SupabaseQuestions(self.db),
            tutor=self.tutor,
            limiter=self.limiter,
            alerts=self.difficulty_alerts,
        )

    @cached_property
    def _learning_repository(self) -> SupabaseStudentLearning:
        return SupabaseStudentLearning(self.db)

    @cached_property
    def study_plan(self) -> StudyPlanService:
        return StudyPlanService(self._learning_repository)

    @cached_property
    def lessons(self) -> LessonService:
        return LessonService(learning=self._learning_repository, limiter=self.limiter)

    @cached_property
    def diagnostics(self) -> DiagnosticService:
        return DiagnosticService(
            diagnostics=SupabaseDiagnostics(self.db), study_plan=self.study_plan, limiter=self.limiter
        )

    @cached_property
    def student_profile(self) -> StudentProfileService:
        return StudentProfileService(
            gamification=SupabaseGamification(self.db),
            learning=self._learning_repository,
            limiter=self.limiter,
        )

    @cached_property
    def leaderboard(self) -> LeaderboardService:
        return LeaderboardService(leaderboard=SupabaseLeaderboard(self.db), limiter=self.limiter)

    # --- professor --------------------------------------------------------

    @cached_property
    def _teacher_repository(self) -> SupabaseTeachers:
        return SupabaseTeachers(self.db)

    @cached_property
    def _classroom_access(self) -> ClassroomAccess:
        return ClassroomAccess(self._teacher_repository)

    @cached_property
    def teacher_overview(self) -> TeacherOverviewService:
        return TeacherOverviewService(teachers=self._teacher_repository, access=self._classroom_access)

    @cached_property
    def classrooms(self) -> ClassroomService:
        return ClassroomService(
            teachers=self._teacher_repository, access=self._classroom_access, limiter=self.limiter
        )

    @cached_property
    def teacher_contents(self) -> TeacherContentService:
        return TeacherContentService(teachers=self._teacher_repository, limiter=self.limiter)

    @cached_property
    def teacher_recommendations(self) -> TeacherRecommendationService:
        return TeacherRecommendationService(
            teachers=self._teacher_repository,
            access=self._classroom_access,
            tutor=self.tutor,
            limiter=self.limiter,
        )

    @cached_property
    def notification_preferences(self) -> NotificationPreferenceService:
        return NotificationPreferenceService(teachers=self._teacher_repository, limiter=self.limiter)

    # --- administração ----------------------------------------------------

    @cached_property
    def _admin_repository(self) -> SupabaseAdministration:
        return SupabaseAdministration(self.db)

    @cached_property
    def admin_overview(self) -> AdminOverviewService:
        return AdminOverviewService(admin=self._admin_repository, limiter=self.limiter)

    @cached_property
    def editorial_catalog(self) -> EditorialCatalogService:
        return EditorialCatalogService(admin=self._admin_repository, limiter=self.limiter)

    @cached_property
    def accounts(self) -> AccountProvisioningService:
        return AccountProvisioningService(
            persistence=self.persistence,
            admin=self._admin_repository,
            identity=self.identity,
            hasher=self.hasher,
            limiter=self.limiter,
        )

    @cached_property
    def school_performance(self) -> SchoolPerformanceService:
        return SchoolPerformanceService(admin=self._admin_repository, limiter=self.limiter)

    # --- direitos do titular e rotinas internas ---------------------------

    @cached_property
    def privacy_requests(self) -> PrivacyRequestService:
        return PrivacyRequestService(
            requests=SupabasePrivacyRequests(self.db), hasher=self.hasher, limiter=self.limiter
        )

    @cached_property
    def account_lifecycle(self) -> AccountLifecycleService:
        return AccountLifecycleService(
            lifecycle=SupabaseAccountLifecycle(self.db),
            limiter=self.limiter,
            retention_enabled=self._retention_enabled,
            deliver_summary=self._deliver_retention_summary,
        )

    @cached_property
    def weekly_summary(self) -> WeeklySummaryService:
        return WeeklySummaryService(persistence=self.persistence, notifier=self.notifier)
