# Documentação do AprendeIA

Este diretório reúne a visão geral e a explicação de cada área. A revisão de RF-08 e RF-32 é de **02/11/2026**; documentos históricos mantêm a data da própria verificação. O status funcional e o resumo de continuidade registram as pendências atuais de ativação.

## Comece por aqui

- [Checklist da entrega 1109](CHECKLIST_ENTREGA1109.md): implementação por agentes, evidências locais e bloqueios externos.
- [Inventário de fornecedores](INVENTARIO_FORNECEDORES.md): operadores ativos e previstos, retenção e comprovações pendentes.
- [Procedimento de menores](PROCEDIMENTO_MENORES.md): proposta operacional sujeita à aprovação institucional.
- [Projeto](PROJETO.md) — objetivo, arquitetura, perfis e estado atual.
- [Status dos requisitos funcionais](STATUS_REQUISITOS_FUNCIONAIS.md) — varredura do código, percentuais por requisito e pendências verificadas.
- [Pedidos de privacidade](PEDIDOS_DE_PRIVACIDADE.md): fluxo do titular, revisão e execução do RF-08.
- [Monitor externo](MONITORAMENTO_EXTERNO.md): configuração, alertas e ativação do RF-32.
- [Continuidade RF-08 e RF-32](CONTINUIDADE_RF08_RF32_2026-11-02.md): resumo da entrega local, testes e porcentagens.
- [Mapa do projeto](MAPA_DO_PROJETO.md) — localização rápida das partes principais do código.
- [Autenticação e acesso](AUTENTICACAO_E_ACESSO.md) — cadastro, login, cargos e limite de tentativas.
- [Área do aluno](AREA_DO_ALUNO.md) — matérias, progresso, prática adaptativa e conquistas.
- [Área do professor](AREA_DO_PROFESSOR.md) — turmas, estudantes, relatórios, conteúdos e alertas.
- [Área da administração](AREA_DA_ADMINISTRACAO.md) — criação de contas e aprovação de professores.
- [IA e banco de questões](IA_E_BANCO_DE_QUESTOES.md) — geração, correção e recomendações pedagógicas.
- [Banco de dados](BANCO_DE_DADOS.md) — tabelas, relações, funções e migrations.
- [Segurança](SEGURANCA.md) — fronteiras de acesso, segredos e riscos conhecidos.
- [Auditoria de acessos](AUDITORIA_DE_ACESSOS.md) — eventos registrados, privacidade, retenção e consulta.
- [Execução e deploy](EXECUCAO_E_DEPLOY.md) — ambiente local, Railway e configurações externas.
- [Testes](TESTES.md) — comandos, cobertura atual e verificações ainda necessárias.
- [Jornada adaptativa](JORNADA_ADAPTATIVA.md) — diagnóstico, domínio por tópico, aulas e recomendações.
- [CI/CD e monitoramento](OBSERVABILIDADE_E_CICD.md) — testes automáticos, healthchecks, logs e Railway.

## Documentos específicos já existentes

- [Privacidade, cookies e checklist](PRIVACIDADE_COOKIES_ACESSIBILIDADE.md)
- [Auditoria de acessibilidade de 05/11/2026](AUDITORIA_ACESSIBILIDADE_2026-11-05.md)
- [Arquitetura](ARQUITETURA.md)
- [Gamificação](GAMIFICACAO.md)
- [Ranking semanal, conquistas e checklist](RANKING_E_CONQUISTAS.md)
- [Painel do professor](PAINEL_PROFESSOR.md)
- [Cadastro de professor](CADASTRO_PROFESSOR.md)
- [Alertas de dificuldade](ALERTAS_DIFICULDADE.md)

## Como interpretar o estado

- **Implementado:** existe no código e possui caminho funcional.
- **Configurável:** o código existe, mas depende de chave, SMTP ou variável de ambiente.
- **Pendente:** ainda exige implementação, validação humana ou configuração externa.

Os arquivos são Markdown comum e podem ser importados no Obsidian sem conversão.
