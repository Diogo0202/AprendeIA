# Inventário de fornecedores

Inspeção de 09/11/2026. Instituição: Escola Diogo Mendes teste. Canal de privacidade: `dig.mendes.baptista@gmail.com`. Este documento distingue infraestrutura observada de integração preparada.

| Fornecedor | Finalidade e dados previstos | Situação verificada | Retenção externa |
| --- | --- | --- | --- |
| Supabase, região sa-east-1 | Auth, perfil, conteúdo, progresso, auditoria e Storage | Projeto restaurado; migrations em atualização. RLS e grants inspecionados. | Backups, Auth e eliminação física: [falta detalhe real]. |
| Vercel | Frontend público, arquivos estáticos e metadados HTTP | Configuração local pronta; criação por API recusada com 403 e CLI sem autenticação concluída. | Logs, CDN e backups: [falta detalhe real]. |
| Railway | API e variáveis exclusivas do servidor | Conector requer reconexão; não há deploy novo comprovado. | Logs, região efetiva e backups: [falta detalhe real]. |
| Google Gmail SMTP | E-mail de recuperação de conta, endereço e link temporário | Escolhido para testes; SMTP do Supabase ainda não configurado. Não é o transporte docente do backend. | Mensagens na caixa de entrada e cópias Google: [falta detalhe real]. |
| Resend HTTPS | Destinatário docente, aviso e link para painel, sem nome de aluno ou métricas individuais | Transporte implementado; conta, chave e destinatário ainda não validados. | Logs e conteúdo armazenado pelo provedor: [falta detalhe real]. |
| Cloudflare Turnstile | Proteção dos formulários e dados técnicos de verificação | Código validado com simulação; widget e CAPTCHA no Auth ainda sem prova real. | Prazos e transferências: [falta detalhe real]. |
| OpenAI | Mensagem, até dez mensagens anteriores e parâmetros pedagógicos; recomendações sem nome de aluno | Fluxo seguro de chave aberto; nenhuma chamada real comprovada nesta entrega. | `store=false` não prova retenção zero; confirmar projeto e controles contratados. |
| GitHub Actions | Código, artefatos de teste e resultados operacionais sanitizados | Workflows preparados; execução final do commit ainda precisa ser confirmada. | Confirmar retenção dos logs e artefatos na conta. Nunca enviar prompts, tokens ou dados acadêmicos. |
| GA4 e Microsoft Clarity | Medição opcional somente em `/sobre` | Desligados por decisão do responsável e bloqueados no CSP da Vercel. | Sem ativação enquanto os prazos externos não forem aprovados. |

## Controles obrigatórios antes da ativação

- [ ] Identificar conta/projeto, região e responsável de cada serviço efetivamente ativo.
- [ ] Registrar finalidade, base aplicável, transferências e condições contratuais aprovadas pela instituição.
- [ ] Confirmar retenção de logs, backups, mensagens e procedimento para exclusão externa.
- [ ] Restringir o sandbox Resend ao e-mail da própria conta verificada; domínio de teste não libera destinatários gerais.
- [ ] Desativar rastreamento de abertura e cliques nas notificações docentes, quando o provedor oferecer esses controles.
- [ ] Conferir a política 1.7 e a operação real antes de admitir estudantes menores.

O prazo acadêmico definido é de 168 horas após criação da conta de estudante ou professor. A expiração bloqueia o acesso; a exclusão automática ainda não está validada. Nenhum teste desta entrega comprova eliminação de cópias em fornecedores em sete dias. O inventário não representa declaração de conformidade integral com a LGPD.
