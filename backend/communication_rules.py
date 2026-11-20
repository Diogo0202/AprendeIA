"""Regras de domínio da comunicação entre usuários do AprendeIA."""

import unicodedata


ALLOWED_DIRECT_PAIRS = {
    ("student", "teacher"),
    ("teacher", "student"),
    ("teacher", "teacher"),
    ("teacher", "admin"),
    ("admin", "teacher"),
}


def can_start_direct_conversation(actor_role: str, recipient_role: str) -> bool:
    """Aluno fala com professor; professor fala com aluno, professor ou administração.

    Administração e aluno não têm conversa direta.
    """

    return (actor_role, recipient_role) in ALLOWED_DIRECT_PAIRS


def validate_message_body(value: str, *, max_length: int = 2000) -> str:
    """Mantém a mensagem legível sem aceitar controles invisíveis."""

    normalized = unicodedata.normalize("NFKC", value).replace("\r\n", "\n").replace("\r", "\n").strip()
    if not normalized or len(normalized) > max_length:
        raise ValueError(f"A mensagem precisa ter entre 1 e {max_length} caracteres.")
    if any(ord(character) < 32 and character not in {"\n", "\t"} for character in normalized):
        raise ValueError("A mensagem contém caracteres de controle não permitidos.")
    return normalized


def direct_conversation_key(first_user_id: str, second_user_id: str) -> str:
    """A ordem estável impede duas conversas para a mesma dupla."""

    first, second = sorted((first_user_id, second_user_id))
    return f"direct:{first}:{second}"
