"""Dependências FastAPI: casos de uso da requisição, sessão, cargo e segredos internos."""

import hmac
from functools import lru_cache
from typing import Annotated, Any, Callable

from fastapi import Depends, Header, Request

from aprendeia.adapters.inbound.http.support import RequestAudit
from aprendeia.application.services.access import authorize_role
from aprendeia.config import settings
from aprendeia.container import Services
from aprendeia.domain.difficulty_alerts import is_valid_cron_secret
from aprendeia.domain.errors import Forbidden, ServiceUnavailable

User = dict[str, Any]


def get_services() -> Services:
    """Uma composição por requisição; o FastAPI reaproveita o valor entre dependências."""

    return Services()


def request_audit(request: Request) -> RequestAudit:
    return RequestAudit(request)


RequestServices = Annotated[Services, Depends(get_services)]
Audit = Annotated[RequestAudit, Depends(request_audit)]


def authenticated_profile(
    request: Request | None,
    authorization: str | None = None,
    *,
    require_privacy_consent: bool = True,
    services: Services | None = None,
) -> User:
    """Valida a sessão; o cargo vem do banco, nunca de dado enviado pelo cliente."""

    audit = RequestAudit(request) if request is not None else None
    return (services or get_services()).sessions.authenticate(
        authorization, require_consent=require_privacy_consent, audit=audit
    )


def current_user(
    request: Request,
    services: RequestServices,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """Dependência padrão: só libera a plataforma após o aceite vigente."""

    return authenticated_profile(request, authorization, require_privacy_consent=True, services=services)


def current_user_pending_privacy(
    request: Request,
    services: RequestServices,
    authorization: Annotated[str | None, Header()] = None,
) -> User:
    """Para o aceite inicial e os direitos do titular, que valem antes do consentimento."""

    return authenticated_profile(request, authorization, require_privacy_consent=False, services=services)


@lru_cache(maxsize=None)
def require_role(*roles: str) -> Callable[..., User]:
    """Constrói a dependência que restringe uma rota por cargo.

    O cache devolve sempre o mesmo objeto para os mesmos cargos, o que permite
    substituí-lo em ``app.dependency_overrides``.
    """

    def dependency(user: User = Depends(current_user)) -> User:
        return authorize_role(user, roles)

    return dependency


CurrentUser = Annotated[User, Depends(current_user)]
PendingPrivacyUser = Annotated[User, Depends(current_user_pending_privacy)]
StudentUser = Annotated[User, Depends(require_role("student"))]
TeacherUser = Annotated[User, Depends(require_role("teacher"))]
AdminUser = Annotated[User, Depends(require_role("admin"))]
LearnerOrTeacher = Annotated[User, Depends(require_role("student", "teacher"))]
CommunicationUser = Annotated[User, Depends(require_role("student", "teacher", "admin"))]
# O tutor de IA continua restrito a quem estuda ou ensina.
AITutorUser = LearnerOrTeacher


def require_weekly_summary_secret(x_cron_secret: Annotated[str | None, Header()] = None) -> None:
    """Fecha o job interno para chamadas autenticadas pelo segredo do Railway."""

    expected = settings.weekly_summary_secret()
    if not expected:
        raise ServiceUnavailable("Resumo semanal ainda não está configurado.")
    if not is_valid_cron_secret(x_cron_secret, expected):
        raise Forbidden("Credencial do resumo semanal inválida.")


def require_retention_secret(x_account_retention_secret: Annotated[str | None, Header()] = None) -> None:
    expected = settings.account_retention_secret()
    if not expected:
        raise ServiceUnavailable("Segredo de retenção ausente.")
    if not x_account_retention_secret or not hmac.compare_digest(
        x_account_retention_secret.encode(), expected.encode()
    ):
        raise Forbidden("Credencial de retenção inválida.")
