"""Regras do apelido público exibido no ranking semanal."""

import unicodedata
from typing import Any

MAX_DIGITS_IN_ALIAS = 6
ALIAS_SEPARATORS = " _-"


def _is_allowed_character(character: str) -> bool:
    return (
        unicodedata.category(character)[0] in {"L", "M"}
        or character.isdecimal()
        or character in ALIAS_SEPARATORS
    )


def validate_leaderboard_alias(value: Any) -> str:
    """Aceita só letras, poucos dígitos e separadores simples; nada que sirva de contato."""

    if not isinstance(value, str):
        raise ValueError("Informe um apelido de 3 a 24 caracteres.")
    # Examinar antes de strip evita apagar controles presentes no pedido.
    if any(unicodedata.category(character).startswith("C") for character in value):
        raise ValueError("O apelido contém caracteres de controle.")
    alias = unicodedata.normalize("NFC", value).strip()
    # Sem @, pontos, links ou símbolos de contato. Sete dígitos também
    # bloqueiam telefones escritos com espaços ou hífens.
    has_letter = any(character.isalpha() for character in alias)
    digit_count = sum(character.isdecimal() for character in alias)
    if not has_letter or digit_count > MAX_DIGITS_IN_ALIAS or not all(map(_is_allowed_character, alias)):
        raise ValueError("Escolha um apelido sem contatos ou links.")
    return alias
