# Área da administração

## Responsabilidade

A administração cuida das contas e dos cargos. Ela não participa da análise pedagógica e não recebe permissão para consultar dificuldades, tentativas ou relatórios dos estudantes.

## Ações disponíveis

- Criar aluno com nome, e-mail, senha e série.
- Criar professor já vinculado a uma disciplina disponível.
- Listar solicitações de cadastro docente pendentes.
- Aprovar uma solicitação e atribuir a disciplina na mesma transação.

## Cadastro de professor

No cadastro público, o futuro professor continua com cargo de aluno até a aprovação. A RPC `approve_teacher_registration` altera o cargo e cria o vínculo em `teacher_subjects` na mesma transação. Se a disciplina já possui professor, a restrição do banco impede a duplicação.

## Endpoints

| Método | Rota | Uso |
| --- | --- | --- |
| `GET` | `/admin/teacher-requests` | Lista pedidos pendentes. |
| `POST` | `/admin/teacher-requests/{user_id}/approve` | Aprova e atribui a matéria. |
| `POST` | `/admin/users` | Cria aluno ou professor. |

Todas as rotas exigem `require_role("admin")` e a chave secreta do Supabase fica no backend.

## Primeira conta administrativa

O sistema não permite escolher `admin` na tela. A primeira conta deve ser promovida manualmente pelo responsável do projeto no SQL Editor; depois ela passa a cadastrar as demais pessoas.

## Arquivos principais

- `frontend/src/App.tsx` — `AdminProfile`.
- `backend/main.py` — modelos e rotas `/admin/*`.
- `supabase/migrations/20260911120000_teacher_registration_workflow.sql` — solicitação e aprovação docente.
- [CADASTRO_PROFESSOR.md](CADASTRO_PROFESSOR.md) — fluxo mais detalhado.
