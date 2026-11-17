"""Cabeçalhos de segurança, log estruturado e auditoria de cada requisição."""

import json
import logging
import time
import uuid

from fastapi import FastAPI, Request, Response
from starlette.concurrency import run_in_threadpool

from aprendeia.adapters.inbound.http.support import client_network
from aprendeia.application.ports.security import AuditTrail, IdentityHasher
from aprendeia.domain.access_audit import audit_action_for, build_access_audit_record

logger = logging.getLogger("aprendeia")

SECURITY_HEADERS = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}
UNMATCHED_ROUTE = "unmatched"


def _request_id(request: Request) -> str:
    """Aceita o identificador do cliente só quando é um UUID; senão gera um novo."""

    try:
        return str(uuid.UUID(request.headers.get("X-Request-ID", "")))
    except ValueError:
        return str(uuid.uuid4())


def _route_path(request: Request) -> str:
    # Sem uma rota reconhecida, não usamos a URL crua porque ela pode conter
    # UUID ou outro identificador fornecido pelo usuário.
    return getattr(request.scope.get("route"), "path", "")


def _log_request(request: Request, request_id: str, route_path: str, status_code: int, started_at: float) -> None:
    logger.info(
        json.dumps(
            {
                "event": "http_request",
                "request_id": request_id,
                "method": request.method,
                "path": route_path or UNMATCHED_ROUTE,
                "status": status_code,
                "duration_ms": round((time.perf_counter() - started_at) * 1000, 2),
            },
            ensure_ascii=False,
        )
    )


def _network_hash(request: Request, hasher: IdentityHasher) -> str | None:
    try:
        return hasher.audit_network(client_network(request))
    except Exception:
        # A requisição continua; o evento ainda terá usuário, ação e
        # request_id mesmo quando o pepper não estiver configurado.
        return None


def install_security_middleware(app: FastAPI, *, audit_trail: AuditTrail, hasher: IdentityHasher) -> None:
    @app.middleware("http")
    async def add_security_headers(request: Request, call_next):
        """Aplica cabeçalhos e audita cada funcionalidade protegida."""

        started_at = time.perf_counter()
        request_id = _request_id(request)
        request.state.request_id = request_id
        response: Response | None = None
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
            for header, value in SECURITY_HEADERS.items():
                response.headers.setdefault(header, value)
            response.headers.setdefault("X-Request-ID", request_id)
        finally:
            route_path = _route_path(request)
            _log_request(request, request_id, route_path, status_code, started_at)
            action = audit_action_for(request.method, route_path, status_code)
            if action:
                state = request.state
                record = build_access_audit_record(
                    actor_id=getattr(state, "audit_actor_id", None),
                    actor_role=getattr(state, "audit_actor_role", None),
                    subject_hash=getattr(state, "audit_subject_hash", None),
                    action=action,
                    method=request.method,
                    route=route_path,
                    status_code=status_code,
                    request_id=request_id,
                    network_hash=_network_hash(request, hasher),
                    resource_id=getattr(state, "audit_resource_id", None),
                    metadata=getattr(state, "audit_metadata", {}),
                )
                await run_in_threadpool(audit_trail.record, record)

        if response is None:
            raise RuntimeError("A resposta HTTP não foi criada.")
        return response
