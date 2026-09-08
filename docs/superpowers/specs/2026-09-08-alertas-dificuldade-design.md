# Alertas de dificuldade por disciplina

## Objetivo

Avisar o professor responsável por uma disciplina quando um estudante acumular uma dificuldade importante e mandar, uma vez por semana, um resumo dos alertas ainda ativos.

## Regras de negócio

- Cada disciplina tem exatamente um professor e cada professor acompanha uma única disciplina neste MVP.
- Estudantes permanecem matriculados em todas as disciplinas.
- Uma dificuldade importante acontece com ao menos três tentativas e aproveitamento menor que 60% no mesmo tópico.
- O alerta fica visível apenas para o professor da disciplina correspondente.
- Quando o alerta abre, o backend tenta enviar um e-mail imediato. Falha de e-mail não impede o registro do alerta.
- Um job protegido por segredo envia o resumo semanal; cada semana é marcada no banco para não disparar duas vezes.
- Professores recebem somente leitura. A administradora só cria contas e atribui a disciplina ao criar um professor.

## Segurança

- Senhas de usuários são responsabilidade do Supabase Auth e não entram em tabelas próprias.
- Credenciais SMTP e o segredo do job ficam apenas nas variáveis do Railway, nunca no Git ou no banco.
- RLS limita perfis, progresso, tentativas e dificuldades à disciplina atribuída ao professor.
- A API repete essa checagem antes de devolver alertas, mesmo usando a chave de serviço no servidor.

## Contratos

- `GET /teacher/difficulty-alerts`: exige professor e devolve apenas os alertas da sua disciplina.
- `POST /internal/weekly-difficulty-summary`: exige `X-Cron-Secret` e não aceita sessão de navegador como substituto.
- `POST /admin/users`: para `teacher`, exige o nome de uma disciplina existente e ainda sem professor.
