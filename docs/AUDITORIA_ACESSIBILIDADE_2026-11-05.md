# Auditoria de privacidade e acessibilidade, 05/11/2026

Entrega local no checkout `D:\AprendeIA`, branch `entrega-2809`. Referência: WCAG 2.2 AA. Nenhum commit, push ou deploy foi feito nesta auditoria. A conformidade integral com a LGPD permanece sem confirmação.

## Escopo e método

Playwright e axe examinam login, cadastro, recuperação, redefinição, documentos, cookies e painéis dos três cargos. Os componentes são os mesmos do aplicativo, montados em ambiente isolado, com rede externa bloqueada e API simulada. Há verificações das abas secundárias do professor e da administração. Não são sessões autenticadas com dados reais.

Quatro cores de destaque, vinho, oceano, floresta e âmbar, são combinadas com modos claro e escuro. A suíte calcula contraste a partir das cores renderizadas, sem tratar a simples presença de um token CSS como prova. Os testes bloqueiam violações automáticas críticas e sérias nos cenários cobertos. Itens incompletos do axe exigem análise humana.

## Correções entregues

| Achado | Correção | Evidência local |
| --- | --- | --- |
| Cores de destaque prejudicavam textos e botões | Separação de preenchimento e cor de texto; revisão de tons secundários, placeholders e foco | Oito paletas e análise axe das telas |
| Cartões do relatório e recomendação docente tinham contraste insuficiente | Fundos e textos vinculados à paleta; correção da especificidade do estado vazio | Abas secundárias do professor em claro e escuro |
| Indicador de dificuldade média pouco legível | Texto escuro sobre fundo claro compatível | Teste de contraste na aba docente |
| Conteúdo principal sem salto consistente | Link inicial para `main`, foco programático e rolagem sem alterar hash | Teclado no documento público e após consentir |
| Ampliação do dock interferia na navegação | Foco sem magnificação e rolagem para manter item visível | Teclado e movimento reduzido |
| Gráfico acadêmico sem equivalente textual completo | Figura, legenda e tabela expansível com semana e dificuldade | Estrutura do componente e navegação por teclado |
| Diálogos e cookies precisavam de verificação de foco | Diálogo nativo, nome acessível, Escape e retorno ao acionador | Testes no navegador |
| Tabelas administrativas com rolagem não recebiam foco em telas móveis | Região nomeada com `tabIndex={0}` em cada tabela rolável | Abas administrativas no projeto mobile Chromium |
| Armazenamento indisponível poderia quebrar preferências | Leitura defensiva; rastreamento opcional permanece bloqueado | Testes unitários e cenário de armazenamento indisponível |
| Revogação poderia deixar código de medição ativo | Interrupção e navegação para novo documento; evento entre abas | Testes de rede com provedores interceptados |

As 25 combinações de contraste por paleta cobrem textos sobre superfícies, preenchimento dos botões e foco. O menor contraste textual medido na matriz foi 5,20:1; o menor contraste de foco foi 6,74:1. Esses valores descrevem a matriz de tokens, não cada pixel de imagens ou todo conteúdo que ainda será cadastrado.

## Resultados reproduzíveis

Backend: **205 testes aprovados**. React: **108 testes aprovados em 15 arquivos**; após o ajuste das tabelas, os nove testes administrativos passaram novamente. **58 testes de navegador aprovados**, em Chromium desktop e emulação Pixel 7, incluindo 38 cenários de acessibilidade e dez de cookies. Não houve violações automáticas críticas ou sérias nos cenários cobertos pela suíte local. Build TypeScript/Vite aprovado, com aviso de bundle JavaScript de 713 kB antes de gzip. As cinco suítes SQL passaram: privacidade (28 cenários), ciclo de vida, administração (11), gamificação (20) e direitos ampliados (10). Os comandos são:

```powershell
# Executar na raiz D:\AprendeIA
.\backend\.venv\Scripts\python.exe -m unittest discover -s backend -q
npm --prefix frontend run test:run
npm --prefix frontend run build
npm --prefix frontend run test:e2e
npm --prefix scripts/validation test
```

Relatórios axe e `computed-contrast.json` são anexados pelo Playwright em `frontend/test-results/`, ignorado pelo Git. A suíte SQL aplica migrations reais em PGlite, com Auth, Storage e Cron simulados. Não comprova concorrência entre sessões nem configuração do Supabase hospedado.

## Rede e consentimento

Os cenários verificam bloqueio antes da escolha, recusa, categorias independentes, revogação e entrada em autenticação. Também cobrem escolha expirada, query sensível, armazenamento indisponível e revogação entre abas. IDs fictícios e scripts interceptados mantêm os fornecedores reais desligados.

O código limita medição ao visitante confirmado em `/sobre` sem query ou hash. O GA4 só carrega após escolha de estatísticas; o Clarity exige escolha de gravação. Flags, IDs válidos e aprovação de privacidade são exigidos separadamente. A política do fornecedor e a retenção externa ainda precisam de comprovação.

## Comparação com o site publicado

Inspeção somente de leitura em [site publicado](https://aprendeia-perfil-estudante.dig-mendes-baptista.chatgpt.site/), nas rotas `/` e `/sobre`. Ambas responderam HTTP 200 com o título AprendeIA e o cabeçalho Bem-vindo de volta. A rota `/sobre` continua exibindo a versão antiga do login.

| Observação pública | Resultado |
| --- | --- |
| Preferências de cookies da versão nova | Ausentes nas duas rotas |
| Scripts opcionais detectados | Nenhum nas visitas sem consentimento |
| Axe, violações sérias | Uma ocorrência `target-size` em cada rota |
| Axe, avaliações incompletas | Contraste e correspondência entre nome acessível e rótulo exigem revisão manual |
| Rede | Requisições observadas no próprio host; sem autenticação ou envio de formulários |
| Cookies da hospedagem | `__Host-appgarden-visitor`, `cf_clearance`, `__cf_bm`, Secure e HttpOnly; finalidade e retenção ainda não confirmadas |

Ausência de scripts nessas visitas não prova ausência de rastreamento em todo o serviço. As correções locais ainda precisam ser publicadas e reexaminadas.

## Checklist de aceite

- [x] Oito paletas examinadas em componentes reais.
- [x] Contraste de texto e foco corrigido nos cenários cobertos.
- [x] Teclado, Escape, retorno do foco e salto ao conteúdo testados no navegador.
- [x] Reflow em 320 CSS px e preferência de movimento reduzido testados.
- [x] Gráfico com alternativa textual.
- [x] Política 1.6, termos separados e seis novos tipos de pedido no código.
- [x] Escolhas opcionais independentes, revisáveis e bloqueadas por padrão.
- [ ] Zoom real de 200% pela interface do navegador e leitura com NVDA ou VoiceOver. O teste de reflow a 640 CSS px equivale à área de 1280 px com zoom, mas não substitui essa avaliação.
- [ ] Fluxos autenticados com banco e conteúdo reais; estados dinâmicos fora das fixtures.
- [ ] Container Nginx em execução, CSP efetiva e configuração hospedada.
- [ ] Publicação, aplicação das migrations e nova auditoria da versão publicada.
- [ ] Aprovação institucional do procedimento de menores e inventário de operadores, transferências e backups.
- [ ] Comprovação da retenção e exclusão externa antes de ativar medidores.

## Referências

[WCAG 2.2](https://www.w3.org/TR/WCAG22/), [LGPD](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html), [guia de cookies da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais), [Consent Mode básico](https://developers.google.com/tag-platform/security/guides/consent?consentmode=basic).
