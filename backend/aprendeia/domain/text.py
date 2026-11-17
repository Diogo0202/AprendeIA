"""Validação de textos curtos que viram filtro de banco ou contexto de IA."""

import re

FORBIDDEN_MARKUP = re.compile(r"[{}<>]")
DELETE_CHARACTER = 127
FIRST_PRINTABLE_CHARACTER = 32


def has_control_character(value: str) -> bool:
    return any(
        ord(character) < FIRST_PRINTABLE_CHARACTER or ord(character) == DELETE_CHARACTER
        for character in value
    )


def sanitize_prompt_value(value: str, max_length: int = 100) -> str:
    """Aceita apenas texto curto de conteúdo, sem controle ou quebra de linha."""

    normalized = value.strip()
    if not normalized or len(normalized) > max_length:
        raise ValueError("O texto precisa ter entre 1 e 100 caracteres.")
    if has_control_character(normalized):
        raise ValueError("O texto não pode conter caracteres de controle.")
    if FORBIDDEN_MARKUP.search(normalized):
        raise ValueError("O texto contém caracteres não permitidos.")
    return normalized
