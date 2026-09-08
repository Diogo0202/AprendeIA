"""Regras pequenas para alertas pedagógicos e mensagens de e-mail."""

import hmac


def is_high_difficulty(accuracy_percent: float, attempts: int) -> bool:
    """Indica quando já há evidência suficiente para avisar o professor."""

    # Três respostas evitam transformar um erro isolado em um alerta para a turma.
    return attempts >= 3 and accuracy_percent < 60


def is_valid_cron_secret(provided: str | None, expected: str | None) -> bool:
    """Compara o segredo sem deixar diferença de tempo denunciar seu valor."""

    return bool(provided and expected and hmac.compare_digest(provided, expected))


def build_immediate_email(
    *,
    teacher_name: str,
    student_name: str,
    subject_name: str,
    topic: str,
    accuracy_percent: float,
    attempts: int,
) -> tuple[str, str]:
    """Monta um aviso curto para o professor agir enquanto o caso é recente."""

    subject = f"AprendeIA: atenção em {subject_name}"
    body = (
        f"Olá, {teacher_name}!\n\n"
        f"{student_name} apresentou uma dificuldade importante em {topic}, na disciplina de {subject_name}. "
        f"O aproveitamento atual é de {accuracy_percent:g}% em {attempts} tentativas.\n\n"
        "O alerta também está disponível na área do professor para você acompanhar com calma.\n\n"
        "Equipe AprendeIA"
    )
    return subject, body


def build_weekly_email(
    *,
    teacher_name: str,
    subject_name: str,
    alerts: list[dict[str, object]],
) -> tuple[str, str]:
    """Resume somente os alertas da disciplina de quem recebe a mensagem."""

    lines = [f"Olá, {teacher_name}!", "", f"Resumo semanal de dificuldades — {subject_name}:", ""]
    for alert in alerts:
        lines.append(
            "- {student_name}: {topic} ({accuracy_percent:g}% em {attempts} tentativas)".format(
                **alert,
            )
        )
    lines.extend(["", "Veja os detalhes na área do professor.", "", "Equipe AprendeIA"])
    return f"AprendeIA: resumo semanal de {subject_name}", "\n".join(lines)
