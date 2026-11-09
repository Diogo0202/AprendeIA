"""Valida a origem do frontend antes de expor uma API produtiva."""

import ipaddress
import re
from typing import Mapping
from urllib.parse import urlsplit


def production_environment(env: Mapping[str, str]) -> bool:
    return any(env.get(key, '').strip().lower() in {'production', 'prod'} for key in (
        'APP_ENV', 'ENVIRONMENT', 'RAILWAY_ENVIRONMENT_NAME', 'RAILWAY_ENVIRONMENT', 'NODE_ENV', 'ENV',
    ))


def frontend_origin(env: Mapping[str, str]) -> str:
    """Em produção, CORS exige uma origem HTTPS explícita e pública."""
    value = env.get('FRONTEND_URL', 'http://localhost:5173').strip().rstrip('/')
    if not production_environment(env):
        return value
    try:
        parsed = urlsplit(value)
        host = parsed.hostname
        if (parsed.scheme != 'https' or not host or parsed.username is not None
                or parsed.password is not None or parsed.path or parsed.query or parsed.fragment
                or '*' in value or any(character.isspace() for character in value)
                or parsed.port not in (None, 443)):
            raise ValueError
        if host in {'localhost', 'localhost.localdomain'} or host.endswith(('.localhost', '.local')):
            raise ValueError
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            if '.' not in host or not all(re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label) for label in host.split('.')):
                raise ValueError
        else:
            if not address.is_global:
                raise ValueError
    except ValueError:
        # A mensagem não inclui a configuração recebida, que pode conter credenciais.
        raise ValueError('FRONTEND_URL deve ser uma origem HTTPS pública e exata em produção.') from None
    return value
