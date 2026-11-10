# Validação técnica do AprendeIA

Data: 18/10/2026. Revisão local em `D:\AprendeIA`, branch `entrega-2809`, sobre o commit `d7b97443c30cf6aa4a31b57936a16487290b452a` e as alterações presentes no diretório de trabalho. A branch estava seis commits à frente da referência remota local. Nenhum fetch foi feito para conferir o GitHub nesta revisão.

As suítes existentes aprovaram 89 verificações. Uma verificação adicional reproduziu uma falha na geração de questões: a API responde HTTP 500 depois de salvar o rascunho no banco simulado. Por isso, os testes aprovados não permitem declarar que todas as funcionalidades estão funcionando.

## Resultados executados

| Verificação | Resultado | Alcance |
| --- | --- | --- |
| Python, `python -m unittest discover -s backend -v` | 77 testes aprovados | Regras puras, dependências de autorização, HTTP com simuladores e inspeção de migrations. |
| React, `npm run test:run` | 8 testes aprovados em 4 arquivos | Componentes em jsdom, com API ou Supabase simulados. |
| Navegador, `npm run test:e2e` | 4 execuções aprovadas | Dois cenários de interface repetidos em Chromium desktop e perfil móvel Pixel 7. |
| TypeScript e Vite, `npm run build` | Aprovado, com aviso | Compilação e bundle de produção; JavaScript principal de 637,85 kB, ou 184,47 kB com gzip. |
| `python -m pip check` | Aprovado | Nenhum conflito declarado entre dependências instaladas. |
| Bandit nos 10 módulos de aplicação Python | Sem achados reportados | Análise estática, incluindo autenticação, IA, comunicação, auditoria e regras pedagógicas. |
| `python -m pip_audit -r backend/requirements.txt --format json` | Nenhuma vulnerabilidade conhecida reportada | Dependências Python resolvidas a partir do arquivo de requisitos. |
| `npm audit --json` | 1 vulnerabilidade alta | `source-map-js@1.2.1`, dependência transitiva de desenvolvimento. |
| `npm audit --omit=dev --json` | Nenhuma vulnerabilidade conhecida reportada | Dependências npm de produção. |
| `git diff --check` | Sem erros de whitespace | O Git emitiu avisos sobre futura conversão de LF para CRLF. |
| Geração de questão com banco e IA simulados | Falhou: HTTP 500 | A inserção do rascunho ocorreu uma vez antes da falha. |

Ambiente desta execução: Python 3.12.14, Node 25.9.0 e npm 11.12.1. O workflow configura Python 3.13 e Node 22; esta revisão não executou esses ambientes do CI.

### Testes Python por área

| Arquivo | Quantidade | Comportamentos conferidos |
| --- | ---: | --- |
| `backend/test_access_audit.py` | 13 | Catálogo de eventos, metadados permitidos, aceite vigente, fronteira administrativa e SQL de privacidade. |
| `backend/test_ai_security.py` | 4 | Entrada educacional normal, tentativas conhecidas de sobrescrever instruções e separação da política da IA. |
| `backend/test_auth_rate_limit.py` | 9 | Quinta falha, reserva de tentativas, concorrência simulada, HMAC, proxies e limpeza do contador. |
| `backend/test_captcha.py` | 2 | Token obrigatório quando há chave configurada e dispensa quando ela não existe. |
| `backend/test_communication_rules.py` | 4 | Pares de cargos permitidos, identificação da conversa e caracteres das mensagens. |
| `backend/test_communications_security.py` | 4 | Rotas, entrada da IA e regras presentes no SQL de comunicação e auditoria. |
| `backend/test_difficulty_alerts.py` | 6 | Limiar do alerta, conteúdo dos e-mails, separação por disciplina e segredo do job semanal. |
| `backend/test_gamification.py` | 4 | Pontos, sequência de dias, evidência mínima e escolha de insígnia conquistada. |
| `backend/test_learning_engine.py` | 4 | Domínio por tópico, separação de disciplinas, metadados e indicação de aulas incompletas. |
| `backend/test_required_exercises.py` | 3 | Vínculos sem duplicação, checks persistidos e proteção prevista na migration. |
| `backend/test_security.py` | 19 | Cargos, validações, gabarito oculto, limites, cabeçalhos, personalização e SQL de autorização. |
| `backend/test_teacher_dashboard.py` | 5 | Rotas docentes, limite de cargo, importação, CSV e evolução semanal. |

Os 8 testes React verificam o bloqueio do cadastro sem aceite, a abertura da recuperação, o checkbox obrigatório, a consulta da política, a confirmação da resposta diagnóstica, a comunicação demonstrativa e o botão do menu. O conjunto de comunicação contém dois testes; o mesmo arquivo contém um teste do menu.

Os testes Playwright abrem a recuperação de senha e alternam o cadastro para professor, conferindo o campo de disciplina e o botão de solicitação. Eles não concluem cadastro real, login com credenciais, recuperação por e-mail ou uma jornada autenticada completa.

## Falhas e limites encontrados

### Geração de questões retorna erro depois da inserção

Em `backend/main.py:1695`, `generate_question` recebe `request` como `QuestionRequest`, que é um modelo Pydantic com os parâmetros da questão. Em `backend/main.py:1720`, o código executa `request.state.audit_resource_id = created["id"]`. Esse objeto não tem o atributo `state`.

A reprodução substituiu Supabase e OpenAI por objetos simulados. A chamada direta produziu `AttributeError: 'QuestionRequest' object has no attribute 'state'`; a chamada HTTP por `TestClient` retornou 500 e confirmou uma inserção do rascunho.

O efeito previsto no fluxo conectado é o professor receber um erro mesmo depois de o rascunho ter sido gravado. Uma nova tentativa pode consumir outra geração e criar outro registro. A correção deve separar o corpo da requisição do objeto HTTP e incluir um teste da rota até a resposta final. A implementação não foi alterada nesta revisão.

### Dependência de desenvolvimento com alerta alto

O npm informou o advisory `GHSA-68fv-2mgg-jv7q` para `source-map-js@1.2.1`, com correção disponível a partir de 1.2.2. O lockfile registra a versão 1.2.1 em `frontend/package-lock.json:2615`. `npm explain source-map-js` mostrou caminhos por PostCSS/Vite e por jsdom.

O alerta descreve negação de serviço ao processar determinadas source maps. Nesta revisão, a dependência pertence ao conjunto de desenvolvimento; a auditoria sem dependências de desenvolvimento retornou zero. A atualização não foi feita, pois o pedido foi de validação.

### Escolha da próxima questão ainda é limitada

`backend/main.py:1780` consulta o nível mais recente da disciplina e retorna o primeiro registro encontrado entre as questões publicadas desse nível. O código não exclui questões já respondidas e não prioriza diretamente o tópico mais frágil nessa seleção. A leitura confirma essa limitação; não foi feito um experimento com um banco real nesta etapa.

O diagnóstico é uma medição inicial curta: seleciona até oito questões e no máximo duas por disciplina. Isso não garante cobertura de todos os tópicos nem oferece evidência suficiente para declarar domínio de uma matéria inteira.

### Auditoria pode perder eventos em falhas de persistência

`backend/main.py:93` tenta gravar o evento e, se a escrita falhar, emite `access_audit_write_failed`. A requisição principal continua. Essa escolha mantém o aplicativo disponível quando a auditoria falha, mas não oferece uma fila durável com reprocessamento de eventos perdidos.

### Documentação e operação ainda têm pendências

O texto de `docs/ARQUITETURA.md` ainda descreve permissões de escrita direta do estudante em aprendizagem. Migrations posteriores revogam a inserção direta em tentativas e a escrita direta em progresso. A explicação atual deve considerar o conjunto completo das migrations, não apenas o esquema inicial.

O modal de privacidade informa que o controlador, o canal de atendimento e a retenção dos dados acadêmicos dependem de confirmação da instituição. O prazo de até sete dias descrito no produto se refere aos logs e às evidências detalhadas de aceite. A tela não recebe pedidos de exclusão ou anonimização e não executa essas operações.

Identificação real da instituição, canal de privacidade e prazo acadêmico: [falta detalhe real].

## Arquitetura atual

O AprendeIA tem arquitetura cliente-servidor, com uma SPA React/TypeScript e uma API REST Python/FastAPI. Supabase fornece Auth e PostgreSQL. O backend é um monólito com módulos auxiliares, ainda com forte concentração de código em `main.py`.

| Parte | Responsabilidade | Evidência |
| --- | --- | --- |
| React e Vite | Login, cadastro, área de estudante, painel docente, administração e comunicação. | `frontend/src/App.tsx`, `frontend/src/components/` e `frontend/package.json`. |
| Cliente HTTP | Obtém o token da sessão e acrescenta `Authorization: Bearer` às chamadas da API. | `frontend/src/lib/api.ts`. |
| Supabase no navegador | Cadastro, recuperação de senha, manutenção da sessão e leitura autorizada do perfil. | `frontend/src/lib/supabase.ts` e fluxo de autenticação em `App.tsx`. |
| FastAPI | Valida identidade, cargo, propriedade do recurso, entrada e limites antes das operações privilegiadas. | `backend/main.py:737` e dependências de cargo. |
| Módulos de regras | Cálculos de aprendizagem, gamificação, alertas, importação, comunicação e proteção das entradas da IA. | `learning_engine.py`, `gamification.py` e módulos associados. |
| PostgreSQL e RPCs | Relações, restrições, autorização da Data API e operações atômicas selecionadas. | `supabase/migrations/`. |
| OpenAI | Geração de questões, tutor de conversa e recomendações pedagógicas ao professor. | Chamadas `responses.create` no backend. |
| SMTP | Alertas de dificuldade e resumos semanais. | `backend/main.py:688`. |

O fluxo típico é: o navegador envia uma operação autenticada, FastAPI valida o token no Supabase e lê o cargo persistido, confere o acesso ao recurso, executa a regra e responde com os dados permitidos. O middleware registra o resultado técnico.

RLS limita o acesso feito com a chave pública e a sessão do navegador. O cliente do backend recebe a chave privilegiada do Supabase, portanto a API precisa aplicar seus próprios filtros de usuário, disciplina e turma. RLS não substitui essas verificações nas consultas privilegiadas.

Essa estrutura é adequada ao estágio do projeto porque mantém as regras em uma aplicação que pode ser testada e publicada em conjunto. Não há evidência de microsserviços, arquitetura hexagonal completa ou separação rígida entre domínio e infraestrutura. `main.py` tem 3.339 linhas e `App.tsx`, 3.363; as telas e rotas ainda precisam de divisão para reduzir o custo de manutenção.

O frontend tem componentes separados para diagnóstico, leitura de aula, auditoria administrativa, editor de questões, política e comunicação. A divisão já começou, mas o componente principal ainda contém autenticação e boa parte dos painéis.

## Por que os dados foram organizados assim

As migrations declaram 29 tabelas de aplicação, incluindo as duas tabelas privadas de limitação de acesso. Essa contagem descreve os arquivos SQL locais; não comprova que todas foram criadas no Supabase remoto. `auth.users`, mantida pelo serviço de autenticação, fica fora dessa contagem.

O modelo é relacional e separa conteúdo compartilhado da atividade de cada estudante. A análise abaixo explica o que as relações permitem fazer e os custos dessas escolhas; ela não atribui aos autores uma decisão histórica que não esteja documentada.

| Conjunto | Relação e finalidade | Motivo prático |
| --- | --- | --- |
| `auth.users` e `profiles` | Um perfil aponta para a identidade autenticada com o mesmo UUID. | Dados acadêmicos e cargo ficam separados das credenciais. Não existe coluna de senha em `profiles`. |
| `subjects`, `modules`, `lessons` | Uma disciplina contém módulos; um módulo contém aulas ordenadas. | A aula é cadastrada uma vez e pode atender vários alunos. Restrições de posição evitam duas aulas no mesmo lugar do módulo. |
| `enrollments` | Chave composta de estudante e disciplina. | Impede matrícula duplicada e permite conferir acesso ao catálogo. Triggers preveem matrícula dos estudantes em todas as disciplinas. |
| `teacher_subjects` | Professor é único e disciplina é chave primária. | Garante no máximo uma disciplina por professor e no máximo um professor por disciplina. A existência de uma atribuição depende do fluxo de criação ou aprovação. |
| `teacher_students` | Vínculo explícito entre professor e estudante. | Dá suporte às regras de relacionamento, sem misturar o vínculo com as respostas do aluno. |
| `classes`, `class_students` | Uma turma pertence a professor e disciplina; uma tabela associativa lista os alunos. | A turma organiza o trabalho docente. Remover o vínculo de turma preserva o histórico acadêmico do estudante. |
| `lesson_progress` | Chave composta de estudante e aula, com conclusão e tempo acumulado informado. | Cada aluno avança em ritmo próprio sem copiar a aula. O tempo é informado pelo cliente e não constitui medição antifraude de presença. |
| `questions`, `question_attempts` | A questão guarda enunciado e gabarito; cada tentativa guarda aluno, alternativa, acerto e tempo. | Permite corrigir no servidor e calcular resultados históricos sem entregar o gabarito antes da resposta. A prática aceita novas tentativas da mesma questão. |
| `student_difficulties` | Resumo por estudante, disciplina e tópico. | Evita refazer toda a agregação para escolher o nível seguinte e montar painéis. É um resumo derivado, com o custo de manter consistência com as tentativas. |
| `diagnostic_sessions`, `diagnostic_answers` | Sessão inicial e respostas únicas por sessão/questão. | Permite retomar o diagnóstico e impedir duplicação de resposta nessa avaliação. O código atual trata o diagnóstico como uma etapa inicial única. |
| `lesson_required_exercises`, `lesson_exercise_completions` | Ligação aula/questão e confirmação do aluno para esse par. | A chave estrangeira composta impede confirmar um exercício que não pertence ao conjunto obrigatório da aula. |
| `student_activity_days` | Chave de estudante e data. | Várias ações no mesmo dia contam como um único dia de consistência. Pontos e insígnias são calculados a partir da atividade. |
| `difficulty_alerts`, `weekly_summary_runs` | Um alerta por aluno/disciplina/tópico e controle de envio por semana. | Reaproveita o alerta ativo e registra o estado da execução semanal. A tabela semanal, sozinha, não comprova entrega de e-mail. |
| `learning_contents`, `pedagogical_recommendations` | Materiais por autor/disciplina e orientações associadas à turma ou aluno. | Mantém autoria e contexto do professor e permite consultar recomendações anteriores. |
| `conversations`, `conversation_members`, `messages` | Conversa, participantes e mensagens separados. | Autoriza a leitura pela participação na conversa, com regras adicionais para os cargos envolvidos. |
| `access_audit_logs`, `privacy_policy_acceptances` | Eventos técnicos e evidência de aceite vinculada ao usuário e à versão. | Separa rastreabilidade de acesso da avaliação pedagógica e dá a cada registro um prazo próprio. |
| `private.login_rate_limits`, `private.api_rate_limits` | Contadores internos e RPCs com acesso restrito ao servidor. | Permite compartilhar limites entre processos da API. Travas de linha previstas no SQL protegem a reserva concorrente. |

UUIDs identificam as entidades e chaves estrangeiras impedem referências a pais inexistentes. UUID não concede privacidade por si só: cada leitura continua dependendo da autorização. Eventos de auditoria e aceites usam identificadores numéricos gerados pelo banco.

As chaves compostas impedem repetir vínculos. Campos `check` restringem níveis, tamanhos e valores como índices de alternativas; índices por professor, aluno e data apoiam consultas frequentes. Exclusões em cascata removem registros dependentes, enquanto algumas referências de autoria ou auditoria passam a nulo. Essas regras não substituem um procedimento completo de exclusão e anonimização de conta.

O esquema combina tabelas relacionadas com JSONB. As quatro alternativas de uma questão cabem em um array com tamanho validado, e a orientação da IA cabe em um objeto estruturado. A lista de questões da sessão diagnóstica também está em JSONB, mas ali há uma concessão de integridade: cada identificador do array não recebe uma chave estrangeira individual. Uma tabela de itens da sessão seria uma evolução se o diagnóstico precisar de versões ou reavaliações.

O histórico guarda o acerto no instante da tentativa, mas a questão pode ser editada pelo professor. Não há uma revisão imutável do enunciado vinculada a cada tentativa. Se for necessário reconstruir exatamente a prova respondida, será preciso versionar o conteúdo ou registrar uma cópia dos campos pedagógicos da questão.

## Como aprendizagem e IA funcionam

O cálculo de dificuldades está no código Python. Não há rotina de treinamento de um modelo próprio neste repositório. A OpenAI recebe parâmetros ou contexto para gerar respostas; o aplicativo calcula progresso e permissões com regras explícitas.

`learning_engine.py:13` classifica um tópico como dominado com pelo menos três tentativas e acerto de 80% ou mais. Com pelo menos duas tentativas e resultado abaixo de 60%, marca o tópico como frágil. Os outros resultados permanecem em desenvolvimento. O tempo de resposta é armazenado, mas essa classificação usa acertos e quantidade de tentativas.

Para uma resposta de prática, a API calcula o nível da próxima questão: avançado a partir de 80% com pelo menos três tentativas, básico abaixo de 60%, intermediário nos outros casos. Esse nível e o estado de domínio são indicadores diferentes. Um alerta alto exige pelo menos três tentativas e acerto abaixo de 60%.

A recomendação ao estudante procura aulas incompletas da mesma disciplina e compara palavras do tópico com título e resumo das aulas. Prioriza tópicos frágeis, sugere até duas aulas por tópico e limita a lista a oito recomendações. Esse mecanismo é determinístico; não usa embeddings nem treinamento com os dados do estudante.

Na geração de questões, OpenAI devolve JSON com quatro alternativas, resposta correta, explicação e habilidade. O backend salva o resultado como rascunho, e o professor dispõe de uma tela de revisão e publicação. O erro de execução descrito neste relatório afeta a resposta HTTP desse fluxo.

As entradas da IA separam instrução do sistema, solicitação e contexto. Filtros recusam alguns padrões conhecidos de prompt injection e reduzem conteúdo suspeito do contexto. A saída estruturada e a ausência de ferramentas de execução no tutor reduzem sua capacidade de agir sobre o sistema. Os quatro testes específicos não cobrem todas as formas possíveis de ataque.

As chamadas OpenAI passam `store=False`. A geração usa disciplina, tópico e nível; o tutor também recebe texto de conversa. Um usuário pode escrever dados pessoais nessa mensagem, portanto não se deve afirmar que todo conteúdo enviado ao provedor foi anonimizado. A chamada e a política do provedor não foram verificadas em produção nesta etapa.

A gamificação atribui 100 pontos por aula concluída, 10 por resposta correta e 20 por dia ativo. Cada 250 pontos aumenta o nível. Por exemplo, duas aulas, cinco acertos e três dias ativos produzem 310 pontos e nível 2. A possibilidade de responder novamente à mesma questão precisa ser considerada ao interpretar esses pontos.

## Acesso, privacidade e operação

O backend lê o cargo de `profiles`; escolher professor no cadastro registra uma solicitação, e a promoção depende de aprovação administrativa. As rotas docentes filtram a disciplina atribuída e a propriedade da turma. O histórico individual e a exportação também conferem a matrícula do aluno na turma.

O módulo de comunicação permite ao estudante falar com professor autorizado e IA. Professores podem falar com seus alunos, outros professores e IA. A leitura de mensagens exige participação na conversa; a administração não participa desse módulo.

O cadastro exige o checkbox da política 1.1. As rotas protegidas recusam perfis cuja versão aceita não seja a vigente; o endpoint de aceite é a exceção necessária para registrar a concordância. A migration mais recente atualiza o trigger de cadastro e a RPC para essa versão.

O modelo de auditoria contém `id`, `user_id`, `role`, `action`, `resource`, `resource_id`, `ip_hash`, `created_at` e `metadata`. Campos anteriores, como `actor_id` e `occurred_at`, convivem com os novos por compatibilidade. O código filtra metadados e usa HMAC para correlacionar a rede sem persistir IP puro; isso é pseudonimização, não garantia de anonimato.

As migrations de privacidade configuram expiração em seis dias e limpeza horária, deixando margem para a regra de até sete dias. A limpeza remove o horário de aceite do perfil e preserva a versão. O prazo dos dados acadêmicos continua separado e sem definição concreta no produto.

O login inicia bloqueio na quinta falha. A espera começa em cinco minutos e dobra em novas rodadas, até 24 horas. O teste concorrente usa um banco simulado com trava em memória; a trava PostgreSQL e as RPCs precisam de validação no banco de homologação. Há limites próprios para ações de custo ou escrita, e não um único limite global para todas as leituras.

O CAPTCHA é condicionado à configuração. A ausência da chave secreta dispensa a verificação; o teste dessa dispensa não prova que o CAPTCHA esteja ativo no ambiente publicado.

SMTP envia com SSL ou STARTTLS, conforme a configuração. O resumo semanal tem endpoint interno protegido por segredo e controle de execução. Nenhum e-mail foi enviado durante esta validação.

O workflow `.github/workflows/quality-and-deploy.yml` prevê Python, React, Playwright e acionamento de hooks do Railway após sucesso em pushes para `main` ou `entrega-2809`. A presença do workflow não confirma secrets configurados nem uma execução remota aprovada.

Os Dockerfiles preveem frontend estático em Nginx e FastAPI com Uvicorn. Existe configuração local de proxy para hospedar o frontend na Vercel e encaminhar `/api` à API Railway. Esta revisão não publicou um site, não inspecionou o estado dos provedores e não testou imagens Docker.

## Evolução registrada no Git

| Data do commit | Etapa | Referência |
| --- | --- | --- |
| 05/09/2026 | Código organizado em frontend/backend e integração Supabase com documentação da arquitetura. | `7d6db12`, `2107d55` |
| 07/09/2026 | Atualização identificada no histórico como segurança e deploy. O título não foi tratado como comprovação do estado atual do provedor. | `8e0a744` |
| 08/09/2026 | Alertas por disciplina e jornada de gamificação. | `a906271`, `5fd4954` |
| 09/09/2026 | Painel docente, políticas do banco e ajuste do container web. | `899accd`, `ba55409`, `90d1fe0` |
| 12 e 13/09/2026 | Cadastro de professores e configuração de execução no VS Code. | `324dee7`, `2dbafdd` |
| 14 e 15/09/2026 | Marco da entrega e evolução de perfil e segurança. | `556a241`, `a9c3f7d` |
| 20 e 21/09/2026 | Jornada adaptativa, gestão educacional, painel lateral e modo escuro. | `cfb060d`, `6e93baf` |
| 24/09/2026 | Comunicação e novas proteções da plataforma. | `f034cda` |
| 26 e 27/09/2026 | Registro de consentimento, retenção dos logs e melhoria do aceite na interface. | `221389a`, `3b45ee8` |
| 28/09/2026 | Ajustes e remoção da auditoria SEO, conforme o título do último commit local. | `d7b9744` |

Há também alterações ainda sem commit na auditoria e na política, incluindo uma migration com data de 06/10. Elas participaram desta revisão local, mas não são apresentadas como código publicado no GitHub ou aplicado no banco remoto.

## Evidência que falta para confirmar a operação completa

Faltam testes com identidades reais em homologação para comprovar isolamento entre alunos, entre professores de disciplinas distintas e entre cargos em chamadas HTTP e na Data API. A suíte atual contém verificações úteis dessas regras, mas não executa toda essa matriz no PostgreSQL real.

Também não foram executados o cadastro real com aceite persistido, a limpeza agendada, o envio SMTP, a chamada OpenAI, a recuperação por e-mail ou o ciclo completo diagnóstico/aula/atividade/relatório. Nenhuma migration foi aplicada nesta etapa. A comprovação de produção exige evidência dessas operações e do estado do deploy.

A revisão seguiu as karpathy-guidelines para manter o escopo em validação e o humanizer para redigir o relatório. O arquivo da skill graft foi lido; a consulta ao grafo não pôde ocorrer porque não havia executável disponível no PATH, ferramenta MCP nem diretório `graft/` neste checkout. As evidências vieram dos arquivos e comandos indicados acima. Nenhuma estimativa de economia de tokens foi atribuída ao graft.
