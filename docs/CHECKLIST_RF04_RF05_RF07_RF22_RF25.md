# Checklist de execução dos cinco requisitos

Data: 03/11/2026. Branch de trabalho: `entrega-2809`.

Marcar um item local não comprova operação publicada. Os cinco RF permanecem em 50% até os respectivos testes reais.

## Implementação e verificação

- [x] Inspecionar os fluxos existentes e preservar o trabalho local.
- [x] Confirmar instituição e canais informados pelo responsável.
- [x] Solicitar restauração do Supabase AprendeIA, sem alterar outros projetos.
- [x] Testar contrato local do tutor para aluno e professor, isolamento e falha segura do provedor.
- [x] Sincronizar política 1.3 no cadastro, modal, API e migration.
- [ ] Integrar admissão institucional de menores e revisão administrativa.
- [ ] Bloquear acesso após 168 horas e testar preservação de materiais e dados alheios.
- [ ] Disponibilizar prévia da limpeza, deixando execução automática desativada.
- [ ] Fechar CAPTCHA em produção sem dupla verificação do mesmo token.
- [ ] Validar recuperação de senha e limpeza de credenciais da URL.
- [ ] Integrar registro atômico das entregas SMTP e tratamento de resultado ambíguo.
- [ ] Configurar resumo semanal para segunda-feira às 08h de São Paulo.
- [ ] Executar Python, frontend, SQL e verificações dos scripts afetados.

## Publicação e evidências externas

Atualização em 04/11/2026: **158 testes Python e 57 testes React passaram** na suíte atual. O TypeScript também passou. Esses resultados não encerram a integração nem comprovam os serviços reais. A execução da retenção continua desativada por padrão e o callback de resumo pré-exclusão ainda precisa ser ligado antes de habilitá-la.

- [ ] Reconectar Railway. A tentativa desta etapa retornou necessidade de reautenticação.
- [ ] Confirmar que Supabase restaurado está saudável e comparar migrations remotas.
- [ ] Configurar SMTP do Supabase Auth e seus redirects, sem copiar credenciais para o código.
- [ ] Configurar SMTP do backend e segredo do agendador.
- [ ] Configurar Turnstile no Supabase e na aplicação, incluindo domínio autorizado.
- [ ] Configurar OpenAI no backend. A chave local está vazia nesta inspeção.
- [ ] Publicar API HTTPS, CORS restrito e frontend apontando para ela.
- [ ] Validar link de recuperação recebido, expirado e reutilizado em conta descartável.
- [ ] Validar CAPTCHA real no cadastro, login e recuperação, incluindo rejeições.
- [ ] Confirmar aceitação SMTP e recebimento pelo destinatário autorizado separadamente.
- [ ] Confirmar chamadas reais do tutor para estudante e professor.
- [ ] Conferir prévia de contas vencidas antes de habilitar a limpeza horária.
- [ ] Registrar evidências sem dados pessoais e atualizar cada RF somente após sua comprovação.

## Fornecedores e cópias externas

| Serviço | Situação nesta etapa | Comprovação necessária |
| --- | --- | --- |
| Supabase Auth, PostgreSQL e Storage | Projeto AprendeIA em restauração | Migrations, redirects, SMTP Auth, revogação, limpeza e política de backups |
| Railway | Integração pede reconexão | API publicada, variáveis, região e retenção de logs |
| OpenAI | Integração no código, chave local vazia | Chamada real, configuração da conta e controles de retenção |
| SMTP | Campos locais de servidor e credenciais vazios | Identificação do provedor, TLS, remetente e retenção das mensagens |
| Cloudflare Turnstile | Integração no código | Chaves, hosts e verificação dos fluxos reais |
| ChatGPT Sites | Frontend público identificado | Publicação compatível com API e inventário do serviço |

Prazo do produto: estudantes e professores vencem 168 horas após criação; administradores são isentos. Bloqueio ocorre no vencimento, limpeza pode ocorrer no próximo ciclo horário. Backups e caixas de e-mail externas exigem controles próprios. Nenhum processo pode afirmar que apagou essas cópias apenas por remover registros da aplicação.

O canal `dig.mendes.baptista.mb@gmail.com` recebe atendimento de responsáveis. Uma mensagem para esse endereço não aprova acesso. A admissão exige revisão institucional registrada; contas de menores reais só entram após confirmação do procedimento e da representação.
