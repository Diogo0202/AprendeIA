"""Versões legais vigentes, lidas do banco a cada chamada, inclusive no aceite.

Integração: get_current_legal_documents(database()) devolve o JSON da API:
{"privacy": {"version": "1.7", "effective_at": "<ISO 8601>"},
 "terms": {"version": "1.0", "effective_at": "<ISO 8601>"}}.
O cliente recebido deve ser o cliente servidor, com service_role. O chamador
mapeia LegalDocumentVersionsUnavailable para HTTP 503, sem expor o erro original.
Os campos de entrada policy_version/terms_version podem chamar
validate_legal_document_version em seus validadores. A RPC existente
record_privacy_policy_acceptance continua sendo a autoridade do aceite:
target_user_id, target_policy_version e target_terms_version. Nenhum fallback
local ou cache deve autorizar uma versão após a publicação de outra.
"""

import re
from datetime import datetime
from typing import Any, TypedDict


LEGAL_DOCUMENT_VERSION_PATTERN = r"(0|[1-9][0-9]{0,8})[.](0|[1-9][0-9]{0,8})"


class LegalDocument(TypedDict):
    version: str
    effective_at: str


class LegalDocuments(TypedDict):
    privacy: LegalDocument
    terms: LegalDocument


class LegalDocumentVersionsUnavailable(RuntimeError):
    """A fonte central não respondeu com ambos os documentos válidos."""


def validate_legal_document_version(value: Any) -> str:
    """Formato canônico major.minor, até 9 dígitos por parte, sem coerção."""

    if not isinstance(value, str) or re.fullmatch(LEGAL_DOCUMENT_VERSION_PATTERN, value) is None:
        raise ValueError("Versão legal inválida. Informe major.minor, sem zeros à esquerda.")
    return value


def _document(value: Any) -> LegalDocument:
    if not isinstance(value, dict):
        raise ValueError("Documento legal ausente.")
    version = validate_legal_document_version(value.get("version"))
    effective_at = value.get("effective_at")
    if not isinstance(effective_at, str):
        raise ValueError("Data de vigência ausente.")
    parsed = datetime.fromisoformat(effective_at.replace("Z", "+00:00"))
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("A data de vigência precisa de fuso horário.")
    return {"version": version, "effective_at": effective_at}


def get_current_legal_documents(db: Any) -> LegalDocuments:
    """Consulta sem cache. Falhas nunca retornam versões fixas ou dados parciais."""

    try:
        data = db.rpc("get_current_legal_document_versions", {}).execute().data
        if not isinstance(data, dict) or set(data) != {"privacy", "terms"}:
            raise ValueError("Resposta legal incompleta.")
        return {"privacy": _document(data["privacy"]), "terms": _document(data["terms"])}
    except Exception as error:
        raise LegalDocumentVersionsUnavailable("Versões legais vigentes indisponíveis.") from error
