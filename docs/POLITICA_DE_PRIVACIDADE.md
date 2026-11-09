# Política de Privacidade do AprendeIA

**Versão:** 1.7
**Data desta versão:** 09/11/2026
**Status:** política atualizada para a Escola Diogo Mendes teste. A migration `20261109140000_privacy_policy_v1_7.sql` exige nova ciência e preserva os Termos de Uso 1.0. Publicação do frontend e validação de fornecedores reais continuam pendentes.

**Mudança da 1.7:** define o prazo acadêmico de 168 horas, informa que a limpeza automática de contas ainda está desativada, corrige a descrição dos e-mails para aviso sem métricas individuais e identifica os operadores previstos para a publicação. Isso não confirma sua ativação nem seus prazos externos.

**Regras vigentes:** contas student e teacher expiram 168 horas após a criação original; admin é isento. Login e nova ciência não reiniciam o prazo. Menores precisam de admissão administrativa verificável antes dos recursos. Enviar e-mail ou confirmar a leitura da política não comprova aprovação.

**Mudança da 1.6:** separa ciência obrigatória da política e aceite dos Termos de Uso 1.0 dos consentimentos opcionais de medição. Acrescenta direitos com atendimento assistido e define escolhas independentes para GA4 e Clarity, restritas a `/sobre`, desligadas por padrão e válidas por sete dias no navegador. Os controles estão presentes no código local; a inspeção não comprova sua operação no ambiente publicado.

## Painel da administração, versão 1.5

- **Desempenho:** a administração vê, por turma e por professor, número de alunos, tentativas, taxa de acerto, aulas concluídas, alertas ativos e a tendência de acerto das últimas 4 semanas. São somente totais: o painel não mostra nome, respostas nem resultado de um aluno. Grupos com menos de 3 alunos têm os indicadores ocultos.
- **Professores e turmas:** a administração vê todos os professores (nome, e-mail, disciplina e situação) e todas as turmas (nome, série, disciplina, professor e número de alunos).
- **Histórico de atividades:** a administração consulta os registros de auditoria de todo o sistema ou de uma pessoa específica, dentro do prazo de 7 dias da seção 6.
- **Mensagens:** administração e professores podem trocar mensagens diretas. Administração e estudantes não têm conversa direta. As mensagens ficam no banco do AprendeIA e são removidas quando a conta de um dos participantes é excluída.
- **Exclusão pela administração:** ver seção 7.

## Ranking e conquistas, desde a versão 1.4

Esta política foi preparada a partir do documento fornecido para o projeto. CPF e endereço do controlador, que constavam no arquivo de origem, não foram reproduzidos neste repositório; a identificação e o canal da seção 10 bastam para o titular exercer seus direitos.


A versão 1.4 acrescenta a participação automática no ranking das turmas às quais o estudante pertence. O ranking da escola exige escolha separada, desligada por padrão. Exibimos somente apelido, avatar, XP semanal, nível e posição; nome completo, e-mail, notas e dificuldades não entram nas respostas do ranking.

O estudante pode sair do ranking escolar sem perder o XP pessoal. A semana começa na segunda-feira às 00h no fuso America/Sao_Paulo. O encerramento da conta remove sua participação, seus pontos e suas conquistas; não mantemos arquivo de identidades de temporadas encerradas. O ranking é apoio à participação pedagógica e não define nota ou aprovação.

O novo aceite é obrigatório antes da exposição entre colegas. A implementação local não comprova publicação da 1.4. A instituição é a Escola Diogo Mendes teste, com os canais já informados neste documento.

## 1. Dados tratados

O AprendeIA trata dados de cadastro e perfil (nome, e-mail, função e etapa escolar), dados acadêmicos (disciplinas, módulos, aulas, respostas, acertos, dificuldades, tempo de estudo, recomendações e participação em turmas) e dados técnicos de autenticação, segurança, suporte e auditoria. O cadastro também pode conter a disciplina solicitada pelo professor.

Senhas são gerenciadas pelo provedor de autenticação e não devem ser copiadas para tabelas de perfil ou auditoria. Logs não devem conter senha, token, corpo de requisição, conteúdo de mensagens, resposta integral da IA ou endereço IP em texto puro.

## 2. Finalidades

Os dados são usados para criar e proteger contas, apresentar cursos e aulas, acompanhar o progresso, recomendar atividades, produzir relatórios educacionais para professores autorizados, administrar turmas e disciplinas, enviar ao professor da disciplina alertas e resumos semanais de dificuldades, prevenir abuso e diagnosticar falhas técnicas.

## 3. Recursos de inteligência artificial

O AprendeIA envia à API da OpenAI os prompts escritos no assistente e, quando houver uma conversa, até as 10 mensagens mais recentes para manter o contexto. A geração de questões envia disciplina, tópico e dificuldade. Recomendações para professores enviam métricas acadêmicas sem nome do estudante. As chamadas verificadas usam `store=false`; isso não substitui a análise dos termos, controles de retenção e configurações da conta do fornecedor antes da publicação.

As respostas e indicadores acadêmicos podem apoiar a geração de questões, explicações e recomendações personalizadas. As mensagens do assistente ficam registradas no banco do AprendeIA. As saídas de IA são apoio pedagógico, não substituem a avaliação do professor e devem ser revistas antes de decisões relevantes. Evite inserir nome, e-mail ou outros dados pessoais nos prompts e mensagens.

## 4. Acesso e compartilhamento

- Estudantes acessam seu próprio perfil, aulas, resultados e recomendações.
- Professores acessam dados pedagógicos dos estudantes vinculados às suas turmas e à sua disciplina, sem editar resultados do estudante.
- Administradores gerenciam contas e configurações operacionais conforme as permissões do sistema. Também veem a lista de professores e turmas, o desempenho agregado por turma e professor (sem dados individuais de estudantes), os registros de auditoria dos últimos 7 dias e trocam mensagens diretas com professores.
- Alertas e resumos enviados por e-mail contêm um aviso e um link para o painel autenticado, sem nome de aluno ou métricas individuais. O destinatário continua limitado ao professor da disciplina.
- Supabase mantém Auth, banco e Storage. OpenAI atende à IA quando configurada. Gmail SMTP foi escolhido para recuperação de senha; Resend HTTPS para notificações docentes; Vercel e Railway para a publicação. Estes últimos são destinos previstos, sem comprovação de ativação nesta revisão. Cloudflare Turnstile verifica os formulários quando configurado. O [inventário operacional](INVENTARIO_FORNECEDORES.md) separa serviços ativos, previstos e pendências. GA4 e Clarity permanecem desligados.

## 5. Segurança e auditoria

O AprendeIA aplica controle de acesso por função, validação no backend, proteção de credenciais e registros técnicos. Os eventos de auditoria incluem ator, função, ação, recurso, identificador do recurso, horário e metadados permitidos. O IP é representado por hash HMAC quando disponível. O acesso aos registros completos é restrito aos serviços de backend e à administração autorizada.

## 6. Retenção

O prazo operacional previsto para logs de acesso e evidências detalhadas de aceite é de **7 dias**. A execução das rotinas de remoção precisa ser confirmada no ambiente publicado. O perfil mantém somente a versão da política atualmente aceita para permitir o controle de acesso; o horário detalhado do aceite também é removido em até 7 dias. Contas `student` e `teacher` expiram **168 horas após a criação original da conta**; `admin` é isento. Login e novo aceite não reiniciam o prazo. Expiração de acesso não comprova exclusão dos dados. O prazo acadêmico definido acompanha as 168 horas da conta. A limpeza automática de contas está desativada até a validação do executor, portanto o bloqueio de acesso não comprova exclusão. A instituição precisa atender à remoção assistida nesse intervalo. Backups, réplicas e registros dos fornecedores podem seguir ciclos próprios; não há promessa de remoção imediata dessas cópias. A instituição precisa confirmar os fornecedores ativos e seus prazos contratuais. `store=false` não garante retenção zero no fornecedor.

## 7. Direitos dos titulares

As turmas de um professor excluído são preservadas sem professor vinculado. Materiais institucionais permanecem sem referência pessoal ao autor; o progresso de outros estudantes não é apagado pela exclusão da conta docente.

O titular pode abrir e acompanhar pedidos de acesso, correção de perfil, anonimização e exclusão na área Meus dados. Um pedido pendente pode ser cancelado pelo próprio titular. A administração analisa o pedido; no acesso aprovado, a pessoa baixa um JSON dos dados vinculados à própria conta. Correções deste fluxo abrangem nome, etapa escolar e objetivo de estudo, sem alterar cargo ou credenciais.

Exclusão e anonimização exigem confirmação administrativa e encerram a conta, removendo histórico identificável, conversas e vínculos dependentes. A anonimização conserva somente somas globais sem identificador individual. Turmas e materiais da conta docente são preservados sem professor, e o progresso dos demais alunos também é preservado.

A administração também pode excluir contas de estudantes e professores por iniciativa própria, por exemplo quando a pessoa deixa a escola. A exclusão exige confirmação digitada e um motivo, tem o mesmo efeito da exclusão pedida pelo titular e não pode ser desfeita. O registro de auditoria guarda apenas o cargo da conta excluída e o motivo, pelo prazo de 7 dias. Contas administrativas não são excluídas por esse caminho, e a administração não exclui a própria conta. Arquivos no Storage impedem a execução até atendimento assistido; o aplicativo não apaga metadados de arquivos para contornar essa restrição. Pedidos e respostas detalhados expiram em seis dias com limpeza horária, dentro do prazo máximo de sete dias adotado nesta etapa.

A área Meus dados e o canal da seção 10 recebem pedidos assistidos de confirmação da existência de tratamento (`confirmation`) e informação sobre compartilhamento (`sharing`). Também atende oposição (`opposition`), revogação do consentimento (`revocation`), portabilidade (`portability`) e revisão de decisões tomadas unicamente com base em tratamento automatizado que afetem os interesses do titular (`automated_review`). Esses tipos constam do frontend, da API e da migration `20261109120000_extended_privacy_rights.sql` na inspeção atual. O canal recebe pedidos de bloqueio, eliminação de dados excessivos e informação sobre a possibilidade de negar consentimento e suas consequências, conforme as condições legais aplicáveis.

A área Meus dados também oferece acesso, correção, anonimização e exclusão. Os seis tipos assistidos registram pedido e resposta administrativa, sem executar automaticamente medidas externas. Oposição e revogação exigem confirmação administrativa da medida aplicada. O download em JSON é uma cópia de acesso, sem comprovação de atendimento à portabilidade. O atendimento assistido pode exigir confirmação razoável de identidade; deve registrar a resposta e encaminhar pedidos sobre dados em fornecedores ou cópias externas. Prazos de resposta e responsáveis pela operação precisam de confirmação institucional.

## 8. Crianças e adolescentes

Na Escola Diogo Mendes teste, menores precisam de **admissão administrativa verificável antes de acessar os recursos**. O canal [dig.mendes.baptista.mb@gmail.com](mailto:dig.mendes.baptista.mb@gmail.com) atende menores e responsáveis. Enviar e-mail ou aceitar a política não comprova aprovação. Sem decisão aprovada vinculada à conta, referência verificável, administrador identificado e data válida, os recursos permanecem bloqueados. Faixa etária desconhecida também bloqueia. O frontend não atesta consentimento do responsável por conta própria.

O AprendeIA é uma plataforma de reforço escolar e pode atender crianças e adolescentes. O controlador deve avaliar cada finalidade, definir a hipótese legal aplicável e garantir o melhor interesse do estudante. Quando o consentimento for a hipótese aplicável ao tratamento de dados de uma criança, ele deve ser específico e destacado e dado por ao menos um dos pais ou responsável legal. As informações devem ser claras e adequadas também ao entendimento do estudante. Essa seção não substitui a avaliação jurídica da instituição. Referências: [artigo 14 da LGPD](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm) e [orientação da ANPD sobre crianças e adolescentes](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes).

## 9. Cookies e tecnologias de medição

Supabase Auth mantém a sessão e suas credenciais no armazenamento do navegador. Cloudflare Turnstile verifica solicitações contra abuso nos formulários de autenticação. A finalidade necessária de acesso e segurança fica separada da medição opcional. Armazenamento local e cookies são tecnologias distintas. Dados técnicos e prazos de cada fornecedor precisam constar do inventário institucional.

| Ferramenta opcional | Finalidade | Onde pode operar | Escolha |
| --- | --- | --- | --- |
| Google Analytics 4 (GA4) | Estatísticas de navegação | Somente `/sobre` | Consentimento próprio, desligado por padrão |
| Microsoft Clarity | Gravação de sessões (session replay) para análise de uso | Somente `/sobre` | Consentimento próprio, desligado por padrão |

As escolhas são independentes. Recusar ambas não impede o acesso. A ciência da política e o aceite dos termos não autorizam essas ferramentas. Identificadores e dados de navegação podem constituir dados pessoais; mascaramento não elimina esse risco.

A escolha opcional vale por **7 dias no navegador**. Sem escolha válida, a medição deve permanecer desligada. O link permanente **Preferências de cookies** deve reabrir as escolhas e permitir revogar separadamente cada consentimento, de forma gratuita e a qualquer momento. Revogação e expiração devem impedir novas coletas, inclusive após troca de rota. A integração precisa garantir que GA4 e Clarity não operem fora de `/sobre`.

O prazo local não comprova exclusão externa. Limpar preferências ou cookies no navegador não apaga eventos e gravações já enviados ao Google ou à Microsoft. Prazos de retenção e pedidos de exclusão nesses fornecedores precisam de confirmação específica. A ativação depende de verificação dos controles descritos, conforme o [guia de cookies da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais).

## 10. Controlador e contato

| Informação | Definição |
| --- | --- |
| Instituição de teste | Escola Diogo Mendes teste |
| Responsável pelo projeto | Diogo Mendes Baptista |
| Identificação formal do controlador institucional | [falta detalhe real] |
| Canal de privacidade | Diogo Mendes |
| Contato | [dig.mendes.baptista@gmail.com](mailto:dig.mendes.baptista@gmail.com) |
| Menores e responsáveis | [dig.mendes.baptista.mb@gmail.com](mailto:dig.mendes.baptista.mb@gmail.com) |

O canal recebe pedidos sobre dados pessoais e pode solicitar confirmação razoável de identidade. O controlador registra o pedido, a decisão, a data e as medidas tomadas.

**Pendente antes de publicar:** os fornecedores efetivamente usados, os prazos acadêmicos e de backups e a identificação formal do controlador institucional. O prazo máximo para logs e evidências detalhadas de aceite é de 7 dias. A confirmação do projeto não substitui validação jurídica.

## 11. Registro do aceite

No cadastro público, a pessoa confirma a leitura da política 1.6 e aceita os Termos de Uso 1.0 em caixas próprias, sem autorizar medição opcional. A ciência registra transparência; a instituição deve definir a hipótese legal de cada finalidade. Não corresponde a consentimento geral. Quem confirmou uma versão anterior precisa confirmar a versão 1.6 para continuar.

A migration nova redefine `private.handle_new_user()` a partir da versão de 08/11, com validação dos dois documentos, campos dos termos no perfil e `terms_version` na evidência e auditoria. Mantém `record_privacy_policy_acceptance(uuid, text, text)` restrita a `service_role`, rejeita versões diferentes de política 1.6 e termos 1.0 e não restaura a função de dois argumentos. O índice composto e a rotina de limpeza dos termos da migration anterior permanecem. `private.gamification_visible` passa a exigir política 1.6 e termos 1.0, preservando os filtros de admissão e ciclo de conta existentes.

A evidência detalhada tem prazo máximo de sete dias. A rotina existente limpa os horários do perfil após seis dias, conservando as versões. Contas provisionadas pela administração continuam sem aceite presumido; o titular precisa confirmar os documentos. A migration nova não altera as regras de 168 horas nem comprova execução no Supabase hospedado.

## Inventário e pendências de publicação

| Item | Evidência local inspecionada | Pendência |
| --- | --- | --- |
| Política 1.6 e termos 1.0 | Componente, migration nova e backend com validação 1.6/1.0 | Validar publicação e aceites com autenticação real |
| Direitos assistidos | Canal de contato; seis novos tipos no frontend, na API e na migration de direitos | Confirmar procedimento, responsáveis e medidas externas efetivamente aplicadas |
| GA4 e Clarity separados | `tracking.ts`, `CookieConsent.tsx`, `AboutPage.tsx` e integração em `main.tsx` | Confirmar configurações aprovadas, coleta restrita e interrupção na rede publicada |
| Retenção | Rotinas locais de auditoria e aceite | Confirmar agendamento remoto, retenção acadêmica, backups e prazos externos |
| Fornecedores | Supabase, OpenAI e Turnstile referenciados; SMTP e hospedagem dependem da configuração | Confirmar serviços ativos, contratos e transferências internacionais |
| Menores e acessibilidade | Admissão e controles semânticos no código | Validar servidor publicado e navegação com tecnologias assistivas |

O [checklist de privacidade, cookies e acessibilidade](PRIVACIDADE_COOKIES_ACESSIBILIDADE.md) detalha a evidência e as pendências. Esta edição não certifica conformidade com a LGPD. Os direitos seguem as condições dos [artigos 18 a 20 da LGPD](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html); a revisão institucional deve confirmar bases legais, procedimentos e os responsáveis pelo atendimento.
