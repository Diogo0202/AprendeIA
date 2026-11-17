"""Dados em memória do modo demonstrativo.

Estes objetos existem apenas quando o Supabase não está configurado. Com o
banco ligado, a fonte de verdade passa a ser o PostgreSQL.
"""

from collections import defaultdict
from typing import Any

Row = dict[str, Any]

# As questões iniciais mantêm o protótipo utilizável sem banco ou OpenAI.
SEED_QUESTIONS: list[Row] = [
    {"id": "seed-fracoes-1", "subject": "Matemática", "topic": "Frações", "difficulty": "basic", "question": "Qual fração representa a metade de uma pizza?", "options": ["1/2", "1/3", "2/3", "3/4"], "correct_index": 0, "explanation": "Uma metade significa dividir o todo em duas partes iguais e considerar uma delas: 1/2."},
    {"id": "seed-portugues-1", "subject": "Português", "topic": "Interpretação de texto", "difficulty": "basic", "question": "Em um texto, a ideia principal é:", "options": ["o assunto mais importante", "uma palavra difícil", "o nome do autor", "a última frase"], "correct_index": 0, "explanation": "A ideia principal é a mensagem mais importante que o texto comunica."},
]


def _new_performance() -> Row:
    return {"attempts": 0, "correct": 0, "difficulty": "basic"}


class DemoStore:
    """Banco de questões e desempenho por estudante, perdidos ao reiniciar o processo."""

    def __init__(self) -> None:
        self.question_bank: list[Row] = list(SEED_QUESTIONS)
        self.performance: dict[str, dict[str, Row]] = defaultdict(lambda: defaultdict(_new_performance))


demo_store = DemoStore()
