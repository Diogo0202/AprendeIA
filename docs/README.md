# Documentação do AprendeIA

Este diretório reúne a visão geral do projeto e a explicação de cada área do sistema. Os textos refletem o código e as migrations existentes em 15 de setembro de 2026.

## Comece por aqui

- [Projeto](PROJETO.md) — objetivo, arquitetura, perfis e estado atual.
- [Mapa do projeto](MAPA_DO_PROJETO.md) — localização rápida das partes principais do código.
- [Autenticação e acesso](AUTENTICACAO_E_ACESSO.md) — cadastro, login, cargos e limite de tentativas.
- [Área do aluno](AREA_DO_ALUNO.md) — matérias, progresso, prática adaptativa e conquistas.
- [Área do professor](AREA_DO_PROFESSOR.md) — turmas, estudantes, relatórios, conteúdos e alertas.
- [Área da administração](AREA_DA_ADMINISTRACAO.md) — criação de contas e aprovação de professores.
- [IA e banco de questões](IA_E_BANCO_DE_QUESTOES.md) — geração, correção e recomendações pedagógicas.
- [Banco de dados](BANCO_DE_DADOS.md) — tabelas, relações, funções e migrations.
- [Segurança](SEGURANCA.md) — fronteiras de acesso, segredos e riscos conhecidos.
- [Execução e deploy](EXECUCAO_E_DEPLOY.md) — ambiente local, Railway e configurações externas.
- [Testes](TESTES.md) — comandos, cobertura atual e verificações ainda necessárias.

## Documentos específicos já existentes

- [Arquitetura](ARQUITETURA.md)
- [Gamificação](GAMIFICACAO.md)
- [Painel do professor](PAINEL_PROFESSOR.md)
- [Cadastro de professor](CADASTRO_PROFESSOR.md)
- [Alertas de dificuldade](ALERTAS_DIFICULDADE.md)

## Como interpretar o estado

- **Implementado:** existe no código e possui caminho funcional.
- **Configurável:** o código existe, mas depende de chave, SMTP ou variável de ambiente.
- **Pendente:** ainda exige implementação, validação humana ou configuração externa.

Os arquivos são Markdown comum e podem ser importados no Obsidian sem conversão.
