"""Regras puras usadas pelo painel do professor.

As funções deste arquivo não acessam banco nem serviços externos. Isso deixa os
cálculos de relatório e os filtros de importação fáceis de testar sem credenciais.
"""

import csv
import io
import json
import re
from collections import defaultdict
from datetime import datetime
from typing import Any


CONTENT_TYPES = {"lesson", "exercise", "video", "link"}


def difficulty_label(accuracy: float, attempts: int) -> str:
    """Traduz desempenho em uma leitura simples para o painel."""

    if attempts < 3:
        return "Em observação"
    if accuracy < 60:
        return "Alta"
    if accuracy < 80:
        return "Média"
    return "Baixa"


def build_difficulty_trend(attempts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Agrupa tentativas por semana e mostra se a dificuldade está diminuindo."""

    weeks: dict[str, dict[str, int]] = defaultdict(lambda: {"attempts": 0, "correct": 0})
    for attempt in attempts:
        raw_date = str(attempt.get("answered_at", ""))
        try:
            moment = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
        except ValueError:
            continue
        year, week, _ = moment.isocalendar()
        key = f"{year}-S{week:02d}"
        weeks[key]["attempts"] += 1
        weeks[key]["correct"] += int(bool(attempt.get("correct")))

    trend = []
    for week, values in sorted(weeks.items()):
        accuracy = round(values["correct"] / values["attempts"] * 100, 1)
        trend.append(
            {
                "week": week,
                "accuracy": accuracy,
                "difficulty_score": round(100 - accuracy, 1),
                "attempts": values["attempts"],
                "level": difficulty_label(accuracy, values["attempts"]),
            }
        )
    return trend[-12:]


def parse_content_import(raw_content: str, content_format: str) -> list[dict[str, str]]:
    """Aceita JSON ou CSV pequeno e devolve apenas campos pedagógicos conhecidos."""

    if len(raw_content.encode("utf-8")) > 100_000:
        raise ValueError("O arquivo deve ter no máximo 100 KB.")
    if content_format == "json":
        parsed = json.loads(raw_content)
        if not isinstance(parsed, list):
            raise ValueError("O JSON precisa conter uma lista de conteúdos.")
        rows = parsed
    elif content_format == "csv":
        rows = list(csv.DictReader(io.StringIO(raw_content)))
    else:
        raise ValueError("Formato de importação inválido.")

    if not 1 <= len(rows) <= 100:
        raise ValueError("Envie entre 1 e 100 conteúdos por importação.")

    cleaned = []
    for row in rows:
        if not isinstance(row, dict):
            raise ValueError("Cada conteúdo precisa ser um objeto.")
        title = str(row.get("title", "")).strip()
        description = str(row.get("description", "")).strip()
        content_type = str(row.get("content_type", "lesson")).strip().lower()
        source_url = str(row.get("source_url", "")).strip()
        if not 2 <= len(title) <= 120 or len(description) > 1000:
            raise ValueError("Título ou descrição fora do limite permitido.")
        if content_type not in CONTENT_TYPES:
            raise ValueError("Tipo de conteúdo inválido.")
        if source_url and (len(source_url) > 500 or not source_url.startswith(("https://", "http://"))):
            raise ValueError("O link do conteúdo precisa usar HTTP ou HTTPS.")
        cleaned.append(
            {
                "title": title,
                "description": description,
                "content_type": content_type,
                "source_url": source_url,
            }
        )
    return cleaned


def safe_csv_cell(value: object) -> str:
    """Evita que uma planilha execute fórmulas vindas de texto do banco."""

    text = str(value if value is not None else "")
    return f"'{text}" if text.startswith(("=", "+", "-", "@")) else text


def build_report_csv(subject: str, class_name: str, students: list[dict[str, Any]]) -> str:
    """Monta um CSV simples para coordenação ou reunião pedagógica."""

    output = io.StringIO()
    writer = csv.writer(output, lineterminator="\n")
    writer.writerow(["Turma", "Disciplina", "Estudante", "Série", "Acertos (%)", "Tentativas", "Dificuldade", "Tempo (min)"])
    for student in students:
        writer.writerow(
            [
                safe_csv_cell(class_name),
                safe_csv_cell(subject),
                safe_csv_cell(student.get("full_name", "Estudante")),
                safe_csv_cell(student.get("grade", "")),
                student.get("accuracy", 0),
                student.get("attempts", 0),
                safe_csv_cell(student.get("difficulty", "Em observação")),
                student.get("time_minutes", 0),
            ]
        )
    return output.getvalue()


RECENT_ATTEMPTS_SHOWN = 12
RECOMMENDATION_TOPICS_SHOWN = 8


def _group_rows(rows: list[dict[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row[key]].append(row)
    return grouped


def _student_summary(
    profile: dict[str, Any],
    attempts: list[dict[str, Any]],
    progress: list[dict[str, Any]],
    difficulties: list[dict[str, Any]],
) -> dict[str, Any]:
    attempt_count = len(attempts)
    correct = sum(1 for row in attempts if row["correct"])
    accuracy = round(correct / attempt_count * 100, 1) if attempt_count else 0
    lesson_seconds = sum(int(row.get("time_seconds", 0)) for row in progress)
    answer_seconds = sum(int(row.get("response_time_seconds", 0)) for row in attempts)
    return {
        **profile,
        "accuracy": accuracy,
        "attempts": attempt_count,
        "difficulty": difficulty_label(accuracy, attempt_count),
        "time_minutes": round((lesson_seconds + answer_seconds) / 60),
        "completed_lessons": sum(1 for row in progress if row.get("completed")),
        "difficulties": difficulties,
        "trend": build_difficulty_trend(attempts),
        "recent_attempts": attempts[:RECENT_ATTEMPTS_SHOWN],
    }


def build_student_summaries(
    *,
    profiles: list[dict[str, Any]],
    questions: list[dict[str, Any]],
    attempts: list[dict[str, Any]],
    progress: list[dict[str, Any]],
    difficulties: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Junta desempenho da disciplina por estudante, em ordem alfabética."""

    topics_by_question = {row["id"]: row["topic"] for row in questions}
    for row in attempts:
        row["topic"] = topics_by_question.get(row["question_id"], "Conteúdo")
    attempts_by_student = _group_rows(attempts, "student_id")
    progress_by_student = _group_rows(progress, "student_id")
    difficulties_by_student = _group_rows(difficulties, "student_id")
    summaries = [
        _student_summary(
            profile,
            attempts_by_student[profile["id"]],
            progress_by_student[profile["id"]],
            difficulties_by_student[profile["id"]],
        )
        for profile in profiles
    ]
    return sorted(summaries, key=lambda item: item["full_name"].casefold())


def weighted_accuracy(summaries: list[dict[str, Any]]) -> float:
    """Média ponderada pelas tentativas, para um aluno com uma resposta não distorcer a turma."""

    attempts = sum(student["attempts"] for student in summaries)
    if not attempts:
        return 0
    return round(sum(student["accuracy"] * student["attempts"] for student in summaries) / attempts, 1)


def anonymous_metrics(summaries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Métricas enviadas à IA: nenhum nome, e-mail ou identificador."""

    return [
        {
            "accuracy": student["accuracy"],
            "attempts": student["attempts"],
            "difficulty": student["difficulty"],
            "completed_lessons": student["completed_lessons"],
            "topics": [item["topic"] for item in student["difficulties"][:RECOMMENDATION_TOPICS_SHOWN]],
        }
        for student in summaries
    ]


def report_filename(class_name: str) -> str:
    """Nome de arquivo sem caracteres que quebrem o cabeçalho Content-Disposition."""

    return re.sub(r"[^A-Za-z0-9_-]", "-", class_name).strip("-") or "turma"
