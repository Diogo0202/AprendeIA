# Área da administração

## Responsabilidade

A administração cuida das contas e dos cargos. Ela não participa da análise pedagógica e não recebe permissão para consultar dificuldades, tentativas ou relatórios dos estudantes.

## Ações disponíveis

- Criar aluno com nome, e-mail, senha e série.
- Criar professor já vinculado a uma disciplina disponível.
- Listar solicitações de cadastro docente pendentes.
- Aprovar uma solicitação e atribuir a disciplina na mesma transação.
- Consultar a visão geral de usuários, disciplinas, aulas e questões.
- Criar e editar disciplinas.
- Criar módulos e aulas, incluindo conteúdo e objetivos.
- Publicar ou despublicar uma aula sem apagar o histórico.
- Consultar a auditoria de acessos por período, perfil e resultado, sem visualizar senhas, tokens ou IP puro.

## Cadastro de professor

No cadastro público, o futuro professor continua com cargo de aluno até a aprovação. A RPC `approve_teacher_registration` altera o cargo e cria o vínculo em `teacher_subjects` na mesma transação. Se a disciplina já possui professor, a restrição do banco impede a duplicação.

## Endpoints

| Método | Rota | Uso |
| --- | --- | --- |
| `GET` | `/admin/teacher-requests` | Lista pedidos pendentes. |
| `POST` | `/admin/teacher-requests/{user_id}/approve` | Aprova e atribui a matéria. |
| `POST` | `/admin/users` | Cria aluno ou professor. |
| `GET` | `/admin/overview` | Resume usuários e conteúdos do sistema. |
| `GET/POST` | `/admin/subjects` | Lista ou cria disciplinas. |
| `PUT` | `/admin/subjects/{subject_id}` | Atualiza uma disciplina. |
| `POST` | `/admin/subjects/{subject_id}/modules` | Cria um módulo. |
| `POST` | `/admin/modules/{module_id}/lessons` | Cria uma aula. |
| `PUT` | `/admin/lessons/{lesson_id}` | Atualiza ou despublica uma aula. |
| `GET` | `/admin/contents` | Lista aulas e materiais docentes. |
| `GET` | `/admin/audit-logs` | Consulta eventos técnicos de acesso com filtros. |

Todas as rotas exigem `require_role("admin")` e a chave secreta do Supabase fica no backend.

## Primeira conta administrativa

O sistema não permite escolher `admin` na tela. A primeira conta deve ser promovida manualmente pelo responsável do projeto no SQL Editor; depois ela passa a cadastrar as demais pessoas.

## Arquivos principais

- `frontend/src/App.tsx` — coordenação do perfil administrativo.
- `frontend/src/components/admin/AdminCatalog.tsx` — visão geral e árvore de conteúdo.
- `frontend/src/components/admin/AuditLogPanel.tsx` — consulta segura da trilha de acesso.
- `backend/main.py` — modelos e rotas `/admin/*`.
- `backend/access_audit.py` — catálogo das ações auditadas.
- `supabase/migrations/20260911120000_teacher_registration_workflow.sql` — solicitação e aprovação docente.
- [CADASTRO_PROFESSOR.md](CADASTRO_PROFESSOR.md) — fluxo mais detalhado.
