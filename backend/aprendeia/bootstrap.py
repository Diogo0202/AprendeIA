"""Monta a aplicação FastAPI a partir dos adaptadores de entrada."""

import logging
import os
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from aprendeia.adapters.inbound.http.middleware import install_security_middleware
from aprendeia.adapters.inbound.http.routers import (
    access,
    account_rights,
    administration,
    communications,
    learning,
    teaching,
)
from aprendeia.adapters.inbound.http.support import install_error_handlers
from aprendeia.adapters.outbound import turnstile
from aprendeia.adapters.outbound.supabase.security import EnvironmentIdentityHasher, SupabaseAuditTrail
from aprendeia.config import settings
from aprendeia.config.deployment import frontend_origin

API_TITLE = "aprendeIA API"
API_VERSION = "0.3.0"
ALLOWED_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
ALLOWED_HEADERS = ["Authorization", "Content-Type", "X-Request-ID"]
ROUTERS = (
    access.router,
    communications.router,
    learning.router,
    teaching.router,
    administration.router,
    account_rights.router,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Recusa subir em produção sem a verificação de segurança do login."""

    if turnstile.captcha_required() and not turnstile.captcha_configured():
        raise RuntimeError("Verificação de segurança não configurada para produção.")
    yield


def registered_routes() -> list:
    """Rotas de todos os routers, com o caminho completo, para inspeção e auditoria."""

    return [route for router in ROUTERS for route in router.routes]


def create_app() -> FastAPI:
    # Carrega somente variáveis locais; o arquivo .env fica fora do Git.
    load_dotenv()
    logging.getLogger("aprendeia").setLevel(settings.log_level())

    # A API não publica Swagger em produção: até a documentação revela nomes de
    # rotas e modelos que não precisam ficar disponíveis para qualquer visitante.
    app = FastAPI(
        title=API_TITLE, version=API_VERSION, docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
    )
    # A URL permitida é configurável para evitar CORS aberto em produção.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[frontend_origin(os.environ)],
        allow_credentials=True,
        allow_methods=ALLOWED_METHODS,
        allow_headers=ALLOWED_HEADERS,
    )
    install_security_middleware(app, audit_trail=SupabaseAuditTrail(), hasher=EnvironmentIdentityHasher())
    install_error_handlers(app)
    for router in ROUTERS:
        app.include_router(router)
    return app
