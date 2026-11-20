# Painel administrativo

A área da administração foi reorganizada em abas: Visão geral, Desempenho, Professores e turmas, Usuários, Atividades, Mensagens, Conteúdo e Privacidade. Todas as rotas exigem o cargo `admin` no servidor; a interface apenas organiza o que a API já autoriza.

## Desempenho por turma e professor

`GET /admin/performance` (filtros opcionais `teacher_id` e `subject_id`) devolve, por turma e por professor:

- alunos vinculados;
- tentativas e taxa de acerto na disciplina da turma;
- aulas concluídas da disciplina;
- alertas de dificuldade ativos;
- tendência de acerto das últimas 4 semanas (segunda a domingo).

Só há totais. Nenhum nome, identificador ou resposta de aluno sai da rota. Grupos com menos de **3 alunos** recebem `small_sample: true` e os indicadores vêm nulos, para que um número não revele o desempenho de uma pessoa. As consultas são limitadas a 10.000 linhas por tabela.

O cálculo fica em `backend/admin_panel.py` (`summarize_group` e `build_performance`), testado sem banco em `backend/test_admin_panel.py`.

## Professores e turmas

- `GET /admin/teachers`: professores com e-mail, disciplina, situação, número de turmas e de alunos distintos.
- `GET /admin/classes`: turmas com disciplina, série, professor e número de alunos. Turma de professor excluído aparece como "Sem professor".

São telas de consulta; não editam turmas.

## Histórico de atividades e logs por usuário

A aba Atividades usa `GET /admin/audit-logs`, que agora aceita `user_id`. Em Usuários, o botão "Ver atividades" abre o histórico da pessoa. A retenção continua em **7 dias**: registros mais antigos são apagados pela rotina de limpeza e não podem ser consultados.

## Exclusão de contas

`POST /admin/users/{user_id}/delete` com `{"confirmation": "EXCLUIR", "reason": "..."}`.

- Exclui estudantes e professores. A administração não exclui a própria conta nem outras contas administrativas (API e RPC recusam).
- O motivo tem de 5 a 300 caracteres e fica na auditoria (evento `DELETE_USER`, com `deleted_role` e `reason`) pelos mesmos 7 dias. A tela pede para não incluir dados pessoais.
- A RPC `public.admin_delete_account` (migration `20261105120000_admin_panel.sql`) repete a limpeza do pedido de exclusão do titular: conversas, mensagens, auditoria da pessoa, aceites, limites e pedidos; depois remove a conta do Auth. O progresso dos outros alunos é preservado e as turmas do professor ficam sem professor.
- Conta com arquivos no Storage não é excluída (409) até os arquivos serem removidos pela Storage API.
- Só `service_role` executa a RPC; `anon` e `authenticated` recebem erro de permissão.

## Mensagens com professores

A administração conversa com professores ativos, e os professores veem a administração nos contatos. Administração e estudante continuam sem conversa direta. O tutor de IA segue restrito a estudantes e professores (`AITutorUser`).

A mesma migration redefine `get_or_create_direct_conversation` com o par administração–professor. Ela também corrige um erro antigo: as variáveis `student_id` e `teacher_id` eram ambíguas com as colunas de `teacher_subjects` e `enrollments`, e o PostgreSQL recusava (42702) toda conversa entre aluno e professor. As variáveis agora usam o prefixo `v_`.

## Validação

```powershell
.\backend\.venv\Scripts\python.exe -m unittest backend.test_admin_panel backend.test_communication_rules backend.test_communications_security
cd scripts\validation; node admin-database.mjs
cd frontend; npx vitest run src/components/admin/AdminPanels.test.tsx
```

## Pendências

- Aplicar as migrations `20261105120000_admin_panel.sql` e `20261107110000_privacy_policy_v1_5.sql` no Supabase junto com o deploy do backend e do frontend.

## Política de Privacidade 1.5

A versão 1.5 descreve este painel (seção "Painel da administração", seções 4 e 7) e exige novo aceite. A migration `20261107110000_privacy_policy_v1_5.sql` passa o cadastro e o aceite para `1.5` e redefine `private.gamification_visible`, para que o ranking semanal reconheça quem aceitou a 1.5. A API (`PrivacyPolicyAccept` e o bloqueio de rotas) e o modal usam a mesma versão.
