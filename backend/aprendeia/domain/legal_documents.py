"""Formato das versões legais vigentes.

Contrato da API:
{"privacy": {"version": "1.7", "effective_at": "<ISO 8601>"},
 "terms": {"version": "1.0", "effective_at": "<ISO 8601>"}}.
Nenhum fallback local ou cache deve autorizar uma versão após a publicação de
outra: a fonte é sempre consultada e a resposta precisa estar completa.
"""

import re
from datetime import datetime
from typing import Any, TypedDict

LEGAL_DOCUMENT_VERSION_PATTERN = r"(0|[1-9][0-9]{0,8})[.](0|[1-9][0-9]{0,8})"
LEGAL_DOCUMENT_KINDS = frozenset({"privacy", "terms"})


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


def _parse_document(value: Any) -> LegalDocument:
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


def parse_legal_documents(data: Any) -> LegalDocuments:
    """Aceita somente a resposta com os dois documentos e nada além deles."""

    if not isinstance(data, dict) or set(data) != LEGAL_DOCUMENT_KINDS:
        raise ValueError("Resposta legal incompleta.")
    return {"privacy": _parse_document(data["privacy"]), "terms": _parse_document(data["terms"])}


def accepted_versions_are_current(
    documents: LegalDocuments, *, policy_version: Any, terms_version: Any
) -> bool:
    return (
        policy_version == documents["privacy"]["version"]
        and terms_version == documents["terms"]["version"]
    )
