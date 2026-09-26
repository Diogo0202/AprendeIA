# Política de Privacidade do AprendeIA

**Versão:** 1.0  
**Data da versão-base:** 23/09/2026  
**Status:** conteúdo-base e retenção confirmados pelo responsável do projeto; preencher dados institucionais antes da publicação.

Esta política foi preparada a partir do documento fornecido para o projeto. Dados pessoais de identificação que constavam no arquivo de origem não foram reproduzidos neste repositório.

## 1. Dados tratados

O AprendeIA pode tratar dados de cadastro e perfil (nome, e-mail, função e etapa escolar), dados acadêmicos (disciplinas, módulos, aulas, respostas, acertos, dificuldades, tempo de estudo, recomendações e participação em turmas) e dados técnicos necessários para autenticação, segurança, suporte e auditoria.

Senhas são gerenciadas pelo provedor de autenticação e não devem ser copiadas para tabelas de perfil ou auditoria. Logs não devem conter senha, token, corpo de requisição, conteúdo de mensagens, resposta integral da IA ou endereço IP em texto puro.

## 2. Finalidades

Os dados são usados para criar e proteger contas, apresentar cursos e aulas, acompanhar o progresso, recomendar atividades, produzir relatórios educacionais para professores autorizados, administrar turmas e disciplinas, prevenir abuso e diagnosticar falhas técnicas.

## 3. Recursos de inteligência artificial

O sistema pode usar respostas e indicadores acadêmicos para gerar questões, explicações e recomendações personalizadas. As saídas são apoio pedagógico, não substituem a avaliação profissional do professor e devem ser revisadas antes de qualquer decisão relevante. Usuários devem evitar inserir dados pessoais desnecessários em prompts ou mensagens.

## 4. Acesso e compartilhamento

- Estudantes acessam seu próprio perfil, aulas, resultados e recomendações.
- Professores acessam dados pedagógicos dos estudantes vinculados às suas turmas e à sua disciplina, sem editar resultados do estudante.
- Administradores gerenciam contas e configurações operacionais conforme as permissões do sistema.
- Provedores de infraestrutura e serviços integrados podem processar dados para autenticação, hospedagem, IA, envio de e-mail e observabilidade, conforme a configuração efetivamente publicada e os contratos aplicáveis.

## 5. Segurança e auditoria

O AprendeIA aplica controle de acesso por função, validação no backend, proteção de credenciais e registros técnicos. Os eventos de auditoria incluem ator, função, ação, recurso, identificador do recurso, horário e metadados permitidos. O IP é representado por hash HMAC quando disponível. O acesso aos registros completos é restrito aos serviços de backend e à administração autorizada.

## 6. Retenção

Os logs técnicos de acesso e as evidências detalhadas de aceite ficam armazenados por no máximo **7 dias** e são removidos pela rotina automática após o vencimento. O perfil mantém somente a versão da política atualmente aceita para permitir o controle de acesso; o horário detalhado do aceite também é removido após 7 dias. A retenção de dados acadêmicos é distinta e deve seguir o prazo definido pela instituição responsável.

## 7. Direitos dos titulares

O titular pode solicitar confirmação de tratamento, acesso, correção, anonimização, bloqueio, eliminação quando aplicável, portabilidade nos termos cabíveis e informações sobre compartilhamento. Solicitações devem ser encaminhadas ao canal de privacidade definido pela instituição responsável.

## 8. Crianças e adolescentes

Se a plataforma atender crianças ou adolescentes, a instituição deve adotar salvaguardas adequadas, avaliar a necessidade de autorização do responsável e observar o melhor interesse do estudante e as normas aplicáveis.

## 9. Cookies e tecnologias de medição

Cookies estritamente necessários podem ser usados para autenticação e funcionamento. Ferramentas opcionais de análise devem permanecer desativadas até que a instituição defina a base legal, transparência e mecanismo de escolha aplicáveis.

## 10. Controlador e contato

**Antes de publicar:** preencher a identificação da instituição/controlador, o canal de privacidade, os fornecedores efetivamente usados e o procedimento de atendimento a solicitações. O prazo máximo para logs e evidências detalhadas de aceite foi confirmado como 7 dias; a retenção de dados acadêmicos continua distinta e precisa de definição institucional.

## 11. Registro do aceite

No cadastro público, o usuário precisa marcar a caixa de concordância. O sistema registra a versão `1.0`, o horário do aceite e o evento `CREATE_USER`. O gatilho do banco não cria um perfil de cadastro público se a confirmação ou a versão esperada estiver ausente. Contas antigas ou provisionadas pela administração não são registradas como se o usuário tivesse aceitado: no primeiro acesso, a API bloqueia as demais rotas até que o próprio titular leia e aceite a versão vigente.

## Revisão necessária antes de produção

O conteúdo-base e o prazo máximo de 7 dias para logs/evidências detalhadas foram confirmados pelo responsável do projeto. Antes de publicar, ainda é necessário informar a instituição/controlador, o canal de privacidade e os fornecedores realmente usados. A retenção de dados acadêmicos é separada e precisa ser definida pela instituição. A confirmação do projeto não substitui eventual validação jurídica institucional.
