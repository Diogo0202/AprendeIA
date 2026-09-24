# Segurança do AprendeIA

## Regras de acesso

| Ação                                      | Aluno                            | Professor                    | Administração |
| ----------------------------------------- | -------------------------------- | ---------------------------- | ------------- |
| Ver o próprio progresso                   | Sim                              | Não                          | Não           |
| Ver dados pedagógicos de alunos           | Não                              | Apenas da própria disciplina | Não           |
| Alterar progresso ou dificuldade de aluno | Apenas pelas próprias atividades | Não                          | Não           |
| Organizar turmas                          | Não                              | Apenas as próprias           | Não           |
| Criar contas e aprovar professor          | Não                              | Não                          | Sim           |

Essas regras aparecem no FastAPI e nas políticas RLS. Conhecer um ID não é suficiente para abrir um recurso de outra pessoa.

## Proteções implementadas

- Endpoints fechados por token e cargo.
- Professor limitado à disciplina vinculada em `teacher_subjects`.
- Administração fora dos dados pedagógicos.
- Chaves secretas apenas no backend e em arquivos `.env` ignorados pelo Git.
- Documentação OpenAPI desativada em produção.
- Gabarito removido antes da resposta do aluno.
- Entrada de prompt limitada e sem caracteres de controle.
- Exportação CSV protegida contra fórmulas.
- Recomendações de IA sem nomes ou e-mails.
- SMTP com senha somente em variável de ambiente.
- Resumo semanal protegido por `X-Cron-Secret`.
- Login limitado por conta e rede, com reserva atômica antes da senha e dados anonimizados por HMAC.
- Cabeçalho de IP aceito apenas de proxy explicitamente confiável.
- Gabaritos não podem mais ser consultados diretamente pela chave pública do Supabase.
- Tentativas e progresso são gravados somente pelo backend, evitando pontos ou conclusões forjadas pelo navegador.
- Operações caras e gravações importantes usam limite atômico por usuário no PostgreSQL.
- API e Nginx enviam CSP, `nosniff`, proteção contra iframe, política de permissões e HSTS.
- Funcionalidades protegidas geram auditoria com usuário, ação, resultado e `request_id`.
- Auditoria não grava token, senha, payload, query string ou IP puro; a rede usa HMAC.
- Somente a administração consulta os eventos, e os hashes internos nunca saem da API.

## Senhas

O sistema não criptografa nem grava senhas na tabela de perfis. O Supabase Auth recebe a senha por HTTPS e mantém o hash apropriado no serviço de autenticação. A aplicação guarda somente tokens de sessão no cliente Supabase.

Cadastro e redefinição exigem de 6 a 128 caracteres, com pelo menos uma letra maiúscula, uma minúscula e um número; a rota administrativa aplica a mesma política. O cadastro público depende ainda da configuração compatível no Supabase Auth. Recomenda-se ativar a verificação contra senhas vazadas quando disponível e evitar reutilização.

## Recuperação e confirmação de e-mail

A recuperação usa Supabase Auth, resposta neutra para evitar enumeração de contas e encerramento da sessão depois da troca. O cadastro direciona a confirmação de e-mail para a origem do frontend. Confirmação obrigatória, URL do site, modelos de e-mail e lista de redirecionamento precisam ser conferidos no painel Supabase antes de produção.

## Segredos necessários

- `SUPABASE_SECRET_KEY`
- `RATE_LIMIT_PEPPER`
- `OPENAI_API_KEY`
- `SMTP_PASSWORD`
- `WEEKLY_SUMMARY_CRON_SECRET`

Nenhum desses valores deve entrar no frontend, README, migration, log ou commit.

## Limite de login

O contador da conta usa o e-mail normalizado e o contador da rede usa o IP normalizado. Os dois valores são transformados em HMAC antes da gravação. A consulta e o incremento falham de forma fechada quando o banco ou a configuração de segurança não está disponível.

## Limites da API

Geração de questões, recomendações pedagógicas, respostas, personalização, conteúdo, turmas e operações administrativas reservam uma chamada em `private.api_rate_limits` antes de continuar. O incremento usa trava de linha, funciona com mais de uma instância no Railway e falha fechado se o contador estiver indisponível.

## Comunicação e prompt injection

Mensagens diretas exigem participação na conversa e nunca entram no contexto da IA. A criação da conversa repete no PostgreSQL a matriz de cargos e o vínculo pedagógico já conferidos pelo FastAPI. O tutor individual normaliza a entrada, recusa tentativas explícitas de substituir instruções, sanitiza contexto indireto, limita o histórico e usa saída estruturada sem armazenamento no provedor.

Essa defesa reduz o risco, mas não torna a saída do modelo confiável para executar comandos. O frontend trata respostas somente como texto e nenhuma ferramenta, consulta ao banco ou ação administrativa é disponibilizada ao modelo.

## Riscos e pendências conhecidos

- A proteção contra senhas presentes em vazamentos está desativada no Supabase e deve ser ligada no painel quando o plano permitir.
- CAPTCHA ainda não foi configurado para cadastro, login e recuperação de senha.
- Confirmar no painel Supabase: confirmação de e-mail ligada, política de senha compatível, proteção contra senhas vazadas se disponível e rate limits para envio de e-mail, verificação e tokens. O limite local do backend não substitui os limites nativos do Auth.
- Como o navegador precisa da chave publicável, um cliente avançado ainda pode chamar o Supabase Auth diretamente; os limites nativos do Supabase continuam sendo a proteção desse caminho. Um hook de verificação de senha seria o ponto central ideal quando disponível.
- O projeto precisa de testes E2E com contas reais de aluno, professor e administração antes de receber dados reais.
- Logs e alertas operacionais ainda precisam de uma ferramenta de monitoramento em produção.
- A expiração física dos eventos de auditoria precisa agendar `purge_expired_access_audit_logs`; cada linha já recebe `expires_at` de 180 dias e a aplicação não possui exclusão direta.
- A migration `20260923100000_secure_communications.sql` ainda precisa ser aplicada e validada em homologação antes de liberar mensagens reais.
- A migration `20260915120000_api_security_hardening.sql` precisa ser aplicada no Supabase e o frontend precisa de novo deploy para os cabeçalhos entrarem em produção.
- A varredura exploratória do Strix não foi executada porque Strix e Docker não estão disponíveis no PATH desta máquina.

## Verificações realizadas

- 39 testes Python passaram.
- O build React/TypeScript passou.
- `npm audit` não encontrou vulnerabilidades conhecidas, incluindo dependências de desenvolvimento.
- `pip-audit` não encontrou vulnerabilidades conhecidas nas dependências do backend.
- Bandit não encontrou problema médio ou alto; os dois avisos de código de baixa gravidade foram corrigidos.
- As funções de limite foram executadas em uma transação real do Supabase.
- O advisor de segurança do Supabase não apontou falhas de RLS na nova tabela; permaneceu apenas o aviso de senhas vazadas.
