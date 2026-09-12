# Cadastro de professor

O cadastro docente acontece em duas etapas para não deixar qualquer pessoa marcar
“Professor” no navegador e receber acesso às informações dos alunos.

## Como funciona

1. Na criação da conta, a pessoa escolhe **Aluno** ou **Professor**.
2. O aluno recebe o perfil `student` normalmente.
3. O professor informa a disciplina e envia uma solicitação. A conta nasce com o
   cargo real `student`, mas fica com o estado `pending_teacher` e não entra na
   área de estudos nem no painel docente.
4. A administradora abre a fila de solicitações, confere a disciplina e aprova.
5. A função `approve_teacher_registration` troca o cargo e cria o vínculo com a
   matéria na mesma transação. Se a matéria já tiver professor, nada é alterado.
6. No próximo login, o perfil aprovado é direcionado ao dashboard do professor.

## Decisões de segurança

- O cargo nunca vem do estado do React ou de um campo confiado pelo backend.
- Todo cadastro público continua nascendo como `student` no gatilho do banco.
- A solicitação não grava senha. Senhas e sessões continuam no Supabase Auth.
- Apenas uma sessão com cargo `admin`, lido da tabela `profiles`, acessa a fila e
  chama a aprovação.
- A função de aprovação aceita chamadas somente da chave secreta usada pelo
  backend e mantém a regra de um professor por disciplina.

## Arquivos principais

- `frontend/src/App.tsx`: escolha do perfil, tela pendente e fila da administração.
- `backend/main.py`: listagem e aprovação protegidas por cargo.
- `supabase/migrations/20260911120000_teacher_registration_workflow.sql`:
  estado da solicitação, gatilho e aprovação transacional.

Antes de publicar o frontend novo, aplique a migration no Supabase. Isso evita
que uma versão da interface tente ler colunas que ainda não existem.
