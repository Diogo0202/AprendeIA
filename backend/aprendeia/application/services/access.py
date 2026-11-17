"""Casos de uso de acesso: login protegido, sessão, aceite legal e saúde."""

from typing import Any

from aprendeia.application.ports.security import (
    AuditRecorder,
    CaptchaError,
    CaptchaUnavailable,
    CaptchaVerifier,
    CredentialsRejected,
    IdentityHasher,
    IdentityProvider,
    IdentityProviderThrottled,
    IdentityProviderUnavailable,
    LegalDocumentsRepository,
    LoginCredentials,
    LoginThrottle,
    PersistenceGate,
    ProfileRepository,
    RateLimiter,
    ReadinessProbe,
    SessionTokens,
)
from aprendeia.domain.account_lifecycle import check_access
from aprendeia.domain.errors import (
    ApplicationError,
    Conflict,
    ConsentRequired,
    Forbidden,
    InvalidInput,
    RateLimited,
    ServiceUnavailable,
    Unauthenticated,
    UpstreamFailure,
)
from aprendeia.domain.legal_documents import (
    LegalDocumentVersionsUnavailable,
    accepted_versions_are_current,
)
from aprendeia.domain.login_protection import RateLimitState, reached_lock_threshold

Row = dict[str, Any]

SERVICE_NAME = "aprendeIA"
BEARER_PREFIX = "Bearer "
PROVIDER_THROTTLE_SECONDS = 300
TOO_MANY_ATTEMPTS = "Muitas tentativas de acesso. Aguarde antes de tentar novamente."
AUTH_PROVIDER_DOWN = "O serviço de autenticação está temporariamente indisponível."
CONSENT_PENDING = "Aceite os Termos de Uso e a Política de Privacidade para continuar."
LEGAL_VERSIONS_DOWN = "Versões legais indisponíveis."


def _login_limit_error(*states: RateLimitState) -> RateLimited:
    """Monta uma resposta padrão sem confirmar se o e-mail existe."""

    retry_after = max(1, *(state.retry_after_seconds for state in states))
    return RateLimited(TOO_MANY_ATTEMPTS, retry_after_seconds=retry_after)


class LoginService:
    """Autentica com cinco tentativas e bloqueio progressivo por conta."""

    def __init__(
        self,
        *,
        persistence: PersistenceGate,
        identity: IdentityProvider,
        throttle: LoginThrottle,
        captcha: CaptchaVerifier,
        hasher: IdentityHasher,
        profiles: ProfileRepository,
    ) -> None:
        self._persistence = persistence
        self._identity = identity
        self._throttle = throttle
        self._captcha = captcha
        self._hasher = hasher
        self._profiles = profiles

    def login(
        self,
        *,
        email: str,
        password: str,
        captcha_token: str | None,
        client_network: str,
        audit: AuditRecorder,
    ) -> Row:
        self._persistence.ensure_available()
        self._verify_captcha(captcha_token, client_network)
        identity_hash = self._hasher.identity(email)
        audit.subject(identity_hash)
        network_hash = self._hasher.network(client_network)
        identity_state = self._reserve_attempt(identity_hash, network_hash)

        session = self._sign_in(email, password, captcha_token, identity_state, network_hash)
        self._note_actor(session, audit)
        self._throttle.clear_identity_failures(identity_hash)
        return {
            "access_token": session.access_token,
            "refresh_token": session.refresh_token,
            "expires_in": session.expires_in,
            "token_type": session.token_type,
        }

    def _verify_captcha(self, captcha_token: str | None, client_network: str) -> None:
        try:
            self._captcha.verify(captcha_token, client_network, expected_action="login")
        except CaptchaUnavailable as error:
            raise ServiceUnavailable(str(error)) from error
        except CaptchaError as error:
            raise InvalidInput(str(error)) from error

    def _reserve_attempt(self, identity_hash: str, network_hash: str) -> RateLimitState:
        """Confere a rede e só então reserva uma das tentativas da conta."""

        network_state = self._throttle.network_status(network_hash)
        if not network_state.allowed:
            raise _login_limit_error(network_state)
        identity_state = self._throttle.reserve_attempt(identity_hash)
        if not identity_state.allowed:
            raise _login_limit_error(identity_state)
        return identity_state

    def _sign_in(
        self,
        email: str,
        password: str,
        captcha_token: str | None,
        identity_state: RateLimitState,
        network_hash: str,
    ) -> SessionTokens:
        try:
            session = self._identity.sign_in(LoginCredentials(email, password, captcha_token))
        except IdentityProviderThrottled as error:
            raise RateLimited(TOO_MANY_ATTEMPTS, retry_after_seconds=PROVIDER_THROTTLE_SECONDS) from error
        except CredentialsRejected:
            raise self._failed_login(identity_state, network_hash) from None
        except IdentityProviderUnavailable as error:
            raise UpstreamFailure(AUTH_PROVIDER_DOWN, no_store=True) from error
        if session is None:
            raise self._failed_login(identity_state, network_hash)
        return session

    def _failed_login(self, identity_state: RateLimitState, network_hash: str) -> ApplicationError:
        """Registra a falha e responde sem revelar qual parte da credencial errou."""

        network_state = self._throttle.record_network_failure(network_hash)
        blocked = tuple(
            state for state in (identity_state, network_state) if reached_lock_threshold(state)
        )
        if blocked:
            return _login_limit_error(*blocked)
        return Unauthenticated("E-mail ou senha inválidos.", no_store=True)

    def _note_actor(self, session: SessionTokens, audit: AuditRecorder) -> None:
        if not session.user_id:
            return
        try:
            role = self._profiles.role_of(session.user_id)
        except Exception:
            # O login continua válido; o ID ainda permite identificar o ator.
            role = None
        audit.actor(session.user_id, role)


class SessionAuthenticator:
    """Valida a sessão e, salvo no endpoint de aceite, exige concordância atual.

    O cargo não vem de dados editáveis do usuário. Ele é lido de ``profiles``
    pelo backend, impedindo que alguém se declare professor ou administrador.
    """

    def __init__(
        self,
        *,
        persistence: PersistenceGate,
        identity: IdentityProvider,
        profiles: ProfileRepository,
        legal: LegalDocumentsRepository,
    ) -> None:
        self._persistence = persistence
        self._identity = identity
        self._profiles = profiles
        self._legal = legal

    def authenticate(
        self,
        authorization: str | None,
        *,
        require_consent: bool,
        audit: AuditRecorder | None = None,
    ) -> Row:
        # Sem banco não existe identidade confiável; liberar um usuário demo
        # aqui faria qualquer visitante atravessar as dependências de autorização.
        if not self._persistence.configured():
            raise ServiceUnavailable("Autenticação ainda não está configurada no backend.")
        if not authorization or not authorization.startswith(BEARER_PREFIX):
            raise Unauthenticated("Sessão ausente ou inválida.")
        token = authorization.removeprefix(BEARER_PREFIX).strip()
        try:
            profile = self._load_profile(token)
            if audit is not None:
                # O adaptador HTTP só lê esse estado depois que JWT e cargo
                # foram validados no banco; nada vem de cabeçalho inventado.
                audit.actor(profile["id"], profile["role"])
            if require_consent:
                self._require_current_consent(profile)
                check_access(profile)
            return profile
        except ApplicationError:
            raise
        except Exception as error:
            raise Unauthenticated("Sessão expirada ou inválida.") from error

    def _load_profile(self, token: str) -> Row:
        user_id = self._identity.user_id_for_token(token)
        if not user_id:
            raise ValueError("User not found")
        profile = self._profiles.session_profile(user_id)
        if not profile:
            raise ValueError("Profile not found")
        return profile

    def _require_current_consent(self, profile: Row) -> None:
        if not (profile.get("privacy_policy_version") and profile.get("terms_of_use_version")):
            raise ConsentRequired(CONSENT_PENDING)
        try:
            documents = self._legal.current()
        except LegalDocumentVersionsUnavailable as error:
            raise ServiceUnavailable(LEGAL_VERSIONS_DOWN) from error
        if not accepted_versions_are_current(
            documents,
            policy_version=profile["privacy_policy_version"],
            terms_version=profile["terms_of_use_version"],
        ):
            raise ConsentRequired(CONSENT_PENDING)


def authorize_role(user: Row, roles: tuple[str, ...]) -> Row:
    """Compara o cargo persistido com a lista permitida pela operação."""

    if user["role"] not in roles:
        raise Forbidden("Você não tem permissão para esta operação.")
    # Quem pediu para ser professor segue como estudante até a aprovação;
    # sem esta checagem só a interface impediria o uso das rotas de aluno.
    if user.get("registration_status", "active") != "active":
        raise Forbidden("Seu cadastro ainda aguarda aprovação.")
    return user


class LegalConsentService:
    """Consulta as versões vigentes e registra o aceite da pessoa autenticada."""

    def __init__(self, *, legal: LegalDocumentsRepository, limiter: RateLimiter) -> None:
        self._legal = legal
        self._limiter = limiter

    def current_versions(self) -> Row:
        try:
            return self._legal.current()
        except LegalDocumentVersionsUnavailable as error:
            raise ServiceUnavailable(LEGAL_VERSIONS_DOWN) from error

    def accept(self, user: Row, *, policy_version: str, terms_version: str, audit: AuditRecorder) -> Row:
        self._limiter.enforce(user["id"], "privacy_accept")
        documents = self.current_versions()
        if not accepted_versions_are_current(
            documents, policy_version=policy_version, terms_version=terms_version
        ):
            raise Conflict("Os documentos foram atualizados. Leia as versões vigentes.")
        try:
            accepted_at = self._legal.record_acceptance(user["id"], policy_version, terms_version)
        except Exception as error:
            # A RPC verifica a fonte de novo: publicação concorrente não autoriza
            # um aceite antigo, nem devolve detalhes internos do PostgreSQL.
            raise ServiceUnavailable(
                "Não foi possível registrar o aceite. Consulte as versões vigentes."
            ) from error
        versions = {"policy_version": policy_version, "terms_version": terms_version}
        audit.resource(user["id"])
        audit.metadata(versions)
        return {"accepted": True, **versions, "accepted_at": accepted_at}


class HealthService:
    """Sinais de vida e prontidão, sem publicar valores sensíveis."""

    def __init__(
        self,
        *,
        persistence: PersistenceGate,
        captcha: CaptchaVerifier,
        probe: ReadinessProbe,
        ai_configured: bool,
    ) -> None:
        self._persistence = persistence
        self._captcha = captcha
        self._probe = probe
        self._ai_configured = ai_configured

    @staticmethod
    def liveness() -> Row:
        return {"status": "ok", "service": SERVICE_NAME}

    def readiness(self) -> Row:
        if not self._persistence.configured():
            raise ServiceUnavailable("Banco de dados não configurado.")
        # O monitor externo acusa a produção que ficaria sem login por falta da chave.
        if self._captcha.required() and not self._captcha.configured():
            raise ServiceUnavailable("Verificação de segurança não configurada.")
        try:
            self._probe.check_schema()
        except Exception as error:
            raise ServiceUnavailable("Banco de dados ainda não está pronto.") from error
        return {
            "status": "ready",
            "service": SERVICE_NAME,
            "ai_configured": self._ai_configured,
            "captcha_configured": self._captcha.configured(),
        }

    def summary(self) -> Row:
        return {
            "status": "ok",
            "service": SERVICE_NAME,
            "ai_configured": self._ai_configured,
            "supabase_configured": self._persistence.configured(),
            "captcha_configured": self._captcha.configured(),
            "captcha_required": self._captcha.required(),
        }
