"""Rotas dos direitos do titular, do ciclo de vida da conta e das rotinas internas.

Os direitos do titular usam a sessão sem exigir aceite: continuam disponíveis
mesmo antes de a pessoa concordar com a política vigente.
"""

from uuid import UUID

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from aprendeia.adapters.inbound.http.dependencies import (
    AdminUser,
    Audit,
    PendingPrivacyUser,
    RequestServices,
    require_retention_secret,
    require_weekly_summary_secret,
)
from aprendeia.adapters.inbound.http.schemas import (
    AdmissionRequest,
    AdmissionReview,
    AgeDeclaration,
    PrivacyRequestCreate,
    PrivacyRequestResolve,
)

router = APIRouter()

EXPORT_HEADERS = {
    "Content-Disposition": 'attachment; filename="meus-dados-aprendeia.json"',
    "Cache-Control": "no-store",
}


@router.get("/privacy/requests")
def list_own_requests(user: PendingPrivacyUser, services: RequestServices):
    return services.privacy_requests.own_requests(user)


@router.post("/privacy/requests", status_code=201)
def create_request(payload: PrivacyRequestCreate, user: PendingPrivacyUser, services: RequestServices, audit: Audit):
    return services.privacy_requests.create(
        user, kind=payload.kind, details=payload.details, corrections=payload.correction_values(), audit=audit
    )


@router.post("/privacy/requests/{request_id}/cancel")
def cancel_request(request_id: UUID, user: PendingPrivacyUser, services: RequestServices, audit: Audit):
    return services.privacy_requests.cancel(user, str(request_id), audit)


@router.get("/privacy/requests/{request_id}/export")
def export_request(request_id: UUID, user: PendingPrivacyUser, services: RequestServices, audit: Audit):
    content = services.privacy_requests.export(user, str(request_id), audit)
    return JSONResponse(content, headers=EXPORT_HEADERS)


@router.get("/admin/privacy-requests")
def list_admin_requests(admin: AdminUser, services: RequestServices):
    return services.privacy_requests.all_requests(admin)


@router.post("/admin/privacy-requests/{request_id}/resolve")
def resolve_request(
    request_id: UUID, payload: PrivacyRequestResolve, admin: AdminUser, services: RequestServices, audit: Audit
):
    return services.privacy_requests.resolve(
        admin,
        str(request_id),
        decision=payload.decision,
        response=payload.response,
        confirmation=payload.confirmation,
        audit=audit,
    )


@router.get("/account/status")
def account_status(user: PendingPrivacyUser, services: RequestServices):
    return services.account_lifecycle.status(user)


@router.put("/account/age-band")
def declare_age(payload: AgeDeclaration, user: PendingPrivacyUser, services: RequestServices):
    return services.account_lifecycle.declare_age(user, payload.age_band)


@router.post("/account/admission", status_code=201)
def request_admission(payload: AdmissionRequest, user: PendingPrivacyUser, services: RequestServices):
    return services.account_lifecycle.request_admission(user, payload.model_dump())


@router.get("/admin/account-admissions")
def list_admissions(admin: AdminUser, services: RequestServices):
    return services.account_lifecycle.admissions(admin)


@router.post("/admin/account-admissions/{request_id}/review")
def review_admission(request_id: UUID, payload: AdmissionReview, admin: AdminUser, services: RequestServices):
    return services.account_lifecycle.review_admission(admin, str(request_id), payload.model_dump())


@router.post("/internal/account-retention/preview", dependencies=[Depends(require_retention_secret)])
def preview_retention(services: RequestServices):
    return services.account_lifecycle.preview_retention()


@router.post("/internal/account-retention/execute", dependencies=[Depends(require_retention_secret)])
def execute_retention(services: RequestServices):
    return services.account_lifecycle.execute_retention()


@router.post("/internal/weekly-difficulty-summary", dependencies=[Depends(require_weekly_summary_secret)])
def send_weekly_difficulty_summary(services: RequestServices, audit: Audit):
    """Processa a semana anterior antes de qualquer limpeza de retenção."""

    return services.weekly_summary.send(audit)
