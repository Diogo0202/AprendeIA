# Segurança do AprendeIA

## Regras de acesso

| Ação | Aluno | Professor | Administração |
| --- | --- | --- | --- |
| Ver o próprio progresso | Sim | Não | Não |
| Ver dados pedagógicos de alunos | Não | Apenas da própria disciplina | Não |
| Alterar progresso ou dificuldade de aluno | Apenas pelas próprias atividades | Não | Não |
| Organizar turmas | Não | Apenas as próprias | Não |
| Criar contas e aprovar professor | Não | Não | Sim |

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

## Senhas

O sistema não criptografa nem grava senhas na tabela de perfis. O Supabase Auth recebe a senha por HTTPS e mantém o hash apropriado no serviço de autenticação. A aplicação guarda somente tokens de sessão no cliente Supabase.

## Segredos necessários

- `SUPABASE_SECRET_KEY`
- `RATE_LIMIT_PEPPER`
- `OPENAI_API_KEY`
- `SMTP_PASSWORD`
- `WEEKLY_SUMMARY_CRON_SECRET`

Nenhum desses valores deve entrar no frontend, README, migration, log ou commit.

## Limite de login

O contador da conta usa o e-mail normalizado e o contador da rede usa o IP normalizado. Os dois valores são transformados em HMAC antes da gravação. A consulta e o incremento falham de forma fechada quando o banco ou a configuração de segurança não está disponível.

## Riscos e pendências conhecidos

- A proteção contra senhas presentes em vazamentos está desativada no Supabase e deve ser ligada no painel quando o plano permitir.
- CAPTCHA ainda não foi configurado para cadastro, login e recuperação de senha.
- Como o navegador precisa da chave publicável, um cliente avançado ainda pode chamar o Supabase Auth diretamente; os limites nativos do Supabase continuam sendo a proteção desse caminho. Um hook de verificação de senha seria o ponto central ideal quando disponível.
- O projeto precisa de testes E2E com contas reais de aluno, professor e administração antes de receber dados reais.
- Logs e alertas operacionais ainda precisam de uma ferramenta de monitoramento em produção.

## Verificações realizadas

- 33 testes Python passaram.
- O build React/TypeScript passou.
- As funções de limite foram executadas em uma transação real do Supabase.
- O advisor de segurança do Supabase não apontou falhas de RLS na nova tabela; permaneceu apenas o aviso de senhas vazadas.
