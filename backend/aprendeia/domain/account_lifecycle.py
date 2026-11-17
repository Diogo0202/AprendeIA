"""RF07: acesso por prazo e admissão institucional de menores."""

from datetime import datetime, timedelta, timezone
from typing import Any

from aprendeia.domain.errors import Forbidden, ServiceUnavailable

ADMISSION_VERSION = "1"
ACCOUNT_LIFETIME = timedelta(hours=168)
LIFECYCLE_ROLES = frozenset({"student", "teacher"})
DECLARED_AGE_BANDS = frozenset({"adult", "minor"})
LIFECYCLE_UNAVAILABLE = "lifecycle_unavailable"


def _blocked(reason: str) -> dict[str, Any]:
    return {"allowed": False, "reason": reason, "expires_at": None}


def _expiration(profile: dict[str, Any], now: datetime) -> datetime:
    created = datetime.fromisoformat(profile["auth_created_at"].replace("Z", "+00:00"))
    if created.tzinfo is None or profile.get("role") not in LIFECYCLE_ROLES:
        raise ValueError("Invalid lifecycle identity")
    if created > now:
        raise ValueError("Future Auth timestamp")
    return created + ACCOUNT_LIFETIME


def _has_current_admission(profile: dict[str, Any]) -> bool:
    return (
        profile.get("admission_status") == "approved"
        and profile.get("admission_version") == ADMISSION_VERSION
    )


def _access_reason(profile: dict[str, Any], now: datetime, expires: datetime) -> str:
    if now >= expires:
        return "account_expired"
    if profile.get("age_band") not in DECLARED_AGE_BANDS:
        return "age_declaration_required"
    if profile["age_band"] == "minor" and not _has_current_admission(profile):
        return "institutional_admission_required"
    return "active"


def account_status(profile: dict[str, Any], *, now: datetime | None = None) -> dict[str, Any]:
    """Explica se a conta pode usar a plataforma e, se não, por quê."""

    if profile.get("role") == "admin":
        return {"allowed": True, "reason": "admin_exempt", "expires_at": None}
    moment = now or datetime.now(timezone.utc)
    try:
        expires = _expiration(profile, moment)
    except (KeyError, ValueError, TypeError, AttributeError, OverflowError):
        return _blocked(LIFECYCLE_UNAVAILABLE)
    reason = _access_reason(profile, moment, expires)
    return {"allowed": reason == "active", "reason": reason, "expires_at": expires.isoformat()}


def check_access(profile: dict[str, Any]) -> dict[str, Any]:
    """Libera o perfil ou explica o bloqueio com o próprio estado da conta."""

    status = account_status(profile)
    if status["allowed"]:
        return profile
    if status["reason"] == LIFECYCLE_UNAVAILABLE:
        raise ServiceUnavailable(status)
    raise Forbidden(status)
