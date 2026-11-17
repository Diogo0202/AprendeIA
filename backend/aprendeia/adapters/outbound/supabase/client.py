"""Criação dos clientes Supabase usados pelos adaptadores de saída."""

from typing import Callable

from supabase import Client, create_client
from supabase.lib.client_options import SyncClientOptions

from aprendeia.config import settings
from aprendeia.domain.errors import ServiceUnavailable

DatabaseProvider = Callable[[], Client]


def _stateless_options() -> SyncClientOptions:
    # O backend usa o cliente síncrono do Supabase. A opção base não possui
    # o armazenamento esperado e só falha quando a primeira consulta real acontece.
    return SyncClientOptions(auto_refresh_token=False, persist_session=False)


def database() -> Client:
    """Cria um cliente privilegiado sem persistir sessão no servidor.

    A chave secreta nunca é compartilhada com o navegador. Cada chamada recebe
    um cliente sem auto-refresh para não misturar sessões entre requisições.
    """

    if not settings.supabase_configured():
        raise ServiceUnavailable("Supabase ainda não está configurado no backend.")
    return create_client(settings.supabase_url(), settings.supabase_secret_key(), options=_stateless_options())


def public_auth_client() -> Client:
    """Cliente com a chave publicável, usado quando o Auth valida o CAPTCHA.

    Uma chave privilegiada pode dispensar CAPTCHA no Auth; por isso o login
    nesse modo não usa o cliente do servidor.
    """

    return create_client(settings.supabase_url(), settings.supabase_publishable_key(), options=_stateless_options())


class RequestDatabase:
    """Um cliente por requisição, criado só quando a primeira consulta precisa dele."""

    def __init__(self, factory: DatabaseProvider | None = None) -> None:
        self._factory = factory
        self._client: Client | None = None

    def __call__(self) -> Client:
        if self._client is None:
            # O nome é resolvido na chamada para que a fábrica possa ser trocada em teste.
            self._client = (self._factory or database)()
        return self._client


class SupabaseGate:
    """Informa se há persistência configurada antes de um caso de uso depender dela."""

    def __init__(self, db: DatabaseProvider) -> None:
        self._db = db

    def ensure_available(self) -> None:
        self._db()

    def configured(self) -> bool:
        return settings.supabase_configured()
