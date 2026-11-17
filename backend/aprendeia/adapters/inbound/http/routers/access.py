"""Rotas de login, saúde do serviço e aceite dos documentos legais."""

from fastapi import APIRouter, Request, Response

from aprendeia.adapters.inbound.http.dependencies import (
    Audit,
    CurrentUser,
    PendingPrivacyUser,
    RequestServices,
)
from aprendeia.adapters.inbound.http.schemas import LoginRequest, PrivacyPolicyAccept
from aprendeia.adapters.inbound.http.support import client_network

router = APIRouter()


@router.post("/auth/login")
def login(credentials: LoginRequest, request: Request, response: Response, services: RequestServices, audit: Audit):
    """Autentica com cinco tentativas e bloqueio progressivo por conta."""

    tokens = services.login.login(
        email=credentials.email,
        password=credentials.password,
        captcha_token=credentials.captcha_token,
        client_network=client_network(request),
        audit=audit,
    )
    response.headers["Cache-Control"] = "no-store"
    return tokens


@router.get("/health/live")
def liveness(services: RequestServices):
    """Sinal mínimo para o Railway saber que o processo está respondendo."""

    return services.health.liveness()


@router.get("/health/ready")
def readiness(services: RequestServices):
    """Confirma configuração essencial sem publicar valores sensíveis."""

    return services.health.readiness()


@router.get("/health")
def health(_user: CurrentUser, services: RequestServices):
    """Informa se os serviços essenciais estão configurados, sem expor chaves."""

    return services.health.summary()


@router.get("/legal/versions")
def current_legal_versions(response: Response, services: RequestServices):
    """Metadados públicos, sem sessão nem conteúdo de contas."""

    response.headers["Cache-Control"] = "no-store"
    return services.legal_consent.current_versions()


@router.post("/privacy/accept", status_code=201)
def accept_privacy_policy(
    payload: PrivacyPolicyAccept, user: PendingPrivacyUser, services: RequestServices, audit: Audit
):
    """Registra aceite pendente antes de liberar as demais rotas da conta."""

    return services.legal_consent.accept(
        user, policy_version=payload.policy_version, terms_version=payload.terms_version, audit=audit
    )
