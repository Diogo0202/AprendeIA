# Projeto AprendeIA

## Ideia do sistema

O AprendeIA é um protótipo de plataforma de reforço escolar. A proposta é acompanhar o desempenho do estudante, ajustar a dificuldade das atividades e entregar informações úteis ao professor sem misturar dados de disciplinas diferentes.

## Perfis

| Perfil | Responsabilidade principal |
| --- | --- |
| Aluno | Estudar, responder questões e acompanhar o próprio progresso. |
| Professor | Acompanhar as turmas e os dados da única disciplina atribuída a ele. |
| Administração | Criar contas e aprovar solicitações de professor. |

## Arquitetura

```text
Navegador React
      |
      | HTTPS + token do usuário
      v
Backend FastAPI -----> OpenAI Responses API
      |
      | chave secreta somente no servidor
      v
Supabase Auth + PostgreSQL + RLS
```

- `frontend/` concentra as telas React, a sessão e a experiência de uso.
- `backend/` concentra validação, autorização, regras pedagógicas, IA e SMTP.
- `supabase/migrations/` define dados, vínculos, funções e políticas RLS.
- `docs/` explica o funcionamento sem exigir a leitura do código inteiro.

## Fluxo principal

1. A pessoa cria uma conta como aluno ou solicita acesso como professor.
2. O login passa pelo backend e recebe uma sessão do Supabase.
3. O backend confirma o cargo salvo em `profiles`; o cargo não vem de uma escolha da tela.
4. Cada perfil recebe apenas os endpoints permitidos para sua função.
5. As políticas RLS repetem os limites de acesso no banco.

## Funcionalidades implementadas

- Login e cadastro com Supabase Auth.
- Bloqueio após quatro senhas erradas por conta em quinze minutos.
- Perfil estudantil com matérias, progresso e gamificação.
- Banco de questões por matéria e dificuldade.
- Correção, explicação e ajuste de nível a partir dos acertos.
- Turmas, relatórios, histórico, conteúdos e recomendações no painel docente.
- Alertas imediatos e resumo semanal de dificuldades por disciplina.
- Cadastro administrativo e aprovação do professor com disciplina única.
- Deploy separado de frontend e backend por Docker/Railway.

## Estado das integrações

| Integração | Estado do código | O que falta no ambiente |
| --- | --- | --- |
| Supabase | Implementada | URL, chaves e migrations aplicadas. |
| OpenAI | Implementada | `OPENAI_API_KEY` válida. |
| SMTP | Implementada | Servidor, usuário, senha e remetente. |
| Railway | Preparada | Variáveis e serviços configurados no painel. |

## Limites atuais do protótipo

- A qualidade das questões geradas precisa de revisão pedagógica antes do uso real.
- A interface está concentrada em `frontend/src/App.tsx`; separar páginas e componentes facilitará o crescimento.
- Recuperação de senha e CAPTCHA ainda precisam ser configurados.
- O bloqueio personalizado do login vale para o endpoint do backend; o Supabase também mantém os próprios limites na API de autenticação.
