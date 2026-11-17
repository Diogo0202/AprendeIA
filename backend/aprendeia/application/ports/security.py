"""Portas de segurança: identidade, limites de uso, CAPTCHA e auditoria."""

from dataclasses import dataclass
from typing import Any, Protocol

from aprendeia.domain.login_protection import RateLimitState

Row = dict[str, Any]


@dataclass(frozen=True)
class SessionTokens:
    """Sessão emitida pelo provedor de identidade após um login correto."""

    access_token: str
    refresh_token: str
    expires_in: Any
    token_type: str
    user_id: str


@dataclass(frozen=True)
class LoginCredentials:
    """E-mail já normalizado, senha e o token do desafio, quando houver."""

    email: str
    password: str
    captcha_token: str | None = None


class CredentialsRejected(Exception):
    """O provedor recusou e-mail ou senha (erro do cliente, não do serviço)."""


class IdentityProviderThrottled(Exception):
    """O próprio provedor de identidade pediu para aguardar."""


class IdentityProviderUnavailable(Exception):
    """O provedor falhou por motivo que não depende de quem tentou entrar."""


class CaptchaError(ValueError):
    """O desafio não foi resolvido ou expirou; a mensagem é segura para exibir."""


class CaptchaUnavailable(CaptchaError):
    """Produção sem chave: é falha de configuração, não erro de quem tenta entrar."""


class AuditRecorder(Protocol):
    """Anotações que o caso de uso acrescenta ao evento de auditoria da requisição."""

    def subject(self, subject_hash: str) -> None: ...

    def actor(self, actor_id: str | None, role: str | None) -> None: ...

    def resource(self, resource_id: str | None) -> None: ...

    def metadata(self, values: Row) -> None: ...


class PersistenceGate(Protocol):
    def ensure_available(self) -> None:
        """Levanta ServiceUnavailable quando o banco não está configurado."""

    def configured(self) -> bool: ...


class IdentityProvider(Protocol):
    def sign_in(self, credentials: LoginCredentials) -> SessionTokens | None:
        """Devolve a sessão ou None quando o provedor não emitiu tokens completos."""

    def user_id_for_token(self, access_token: str) -> str | None: ...

    def create_confirmed_user(self, *, email: str, password: str, full_name: str) -> str | None: ...

    def delete_user(self, user_id: str) -> None: ...


class LoginThrottle(Protocol):
    def network_status(self, network_hash: str) -> RateLimitState: ...

    def reserve_attempt(self, identity_hash: str) -> RateLimitState: ...

    def record_network_failure(self, network_hash: str) -> RateLimitState: ...

    def clear_identity_failures(self, identity_hash: str) -> None: ...


class CaptchaVerifier(Protocol):
    def verify(self, token: str | None, remote_ip: str | None, *, expected_action: str) -> None: ...

    def required(self) -> bool: ...

    def configured(self) -> bool: ...


class IdentityHasher(Protocol):
    def identity(self, email: str) -> str: ...

    def network(self, address: str) -> str: ...

    def audit_network(self, address: str) -> str: ...


class RateLimiter(Protocol):
    def enforce(self, user_id: str, action: str) -> None:
        """Reserva uma chamada ou levanta RateLimited/ServiceUnavailable."""


class AuditTrail(Protocol):
    def record(self, event: Row) -> None: ...


class ProfileRepository(Protocol):
    def session_profile(self, user_id: str) -> Row | None: ...

    def role_of(self, user_id: str) -> str | None: ...


class LegalDocumentsRepository(Protocol):
    def current(self) -> Row:
        """Versões vigentes; levanta LegalDocumentVersionsUnavailable se incompletas."""

    def record_acceptance(self, user_id: str, policy_version: str, terms_version: str) -> Any: ...


class ReadinessProbe(Protocol):
    def check_schema(self) -> None:
        """Confirma que as tabelas essenciais respondem; levanta se não."""
