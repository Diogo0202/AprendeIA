# Auditoria SEO completa — AprendeIA

- **Data da coleta:** 21/09/2026
- **URL auditada:** https://aprendeia-web-production.up.railway.app/
- **Tipo de negócio detectado:** aplicação educacional/SaaS, com áreas para estudante, professor e administração
- **Escopo:** SEO técnico, conteúdo, dados estruturados, desempenho, experiência de busca, acessibilidade, presença em mecanismos de IA e sinais externos

## Resumo executivo

**SEO Health Score: 41/100 — crítico.**

Esse número é uma avaliação editorial ponderada desta auditoria, não uma métrica do Google. O Lighthouse atribuiu 91/100 ao checklist técnico de SEO, mas a nota isolada não representa a capacidade real de descoberta do produto. A página pública atual é apenas o formulário de login, entrega pouco conteúdo indexável e publica respostas inválidas para arquivos fundamentais.

O maior problema não é uma meta tag isolada. A produção está desatualizada: os cabeçalhos HTTP indicam uma versão de **10/09/2026**, enquanto `index.html`, `robots.txt`, `sitemap.xml`, `llms.txt`, a imagem Open Graph e os cabeçalhos de segurança já existem no repositório local desde 15/09. Um novo deploy do frontend destrava várias correções ao mesmo tempo.

| Área | Nota | Diagnóstico resumido |
|---|---:|---|
| Rastreamento e indexação | 25/100 | `robots.txt` e `sitemap.xml` retornam HTML da SPA |
| SEO on-page e conteúdo | 24/100 | raiz pública é login, conteúdo muito curto e título genérico |
| Dados estruturados | 0/100 | nenhum JSON-LD na produção atual |
| Performance técnica | 90/100 | laboratório rápido, mas sem cache duradouro e com JS ocioso |
| Acessibilidade e SXO | 78/100 | layout responsivo; controle de senha pequeno e jornada pública inexistente |
| GEO/descoberta por IA | 12/100 | `llms.txt` inválido em produção e nenhuma base pública citável |
| Autoridade e marca | 18/100 | domínio não apareceu na busca testada e há forte colisão de nome |

## Evidências observadas

### Produção publicada

- `/` responde `200`, `text/html`, com apenas 744 bytes de HTML inicial.
- O HTML inicial contém `<div id="root"></div>`; todo o conteúdo depende de JavaScript.
- Título: `aprendeIA`.
- Meta description: `Plataforma educacional adaptativa com apoio de inteligência artificial.`
- Não há canonical, Open Graph, Twitter Cards, `meta robots` ou JSON-LD na versão publicada.
- O conteúdo renderizado contém um único H1, `Bem-vindo de volta`, e nenhum H2.
- A única âncora rastreável é `Esqueci minha senha`, apontando para `#forgot`.
- `robots.txt`, `sitemap.xml`, `llms.txt`, `og-aprendeia.png` e `ai-catalog.json` retornam o mesmo HTML da página inicial com status `200`.
- Os assets têm compactação gzip em requisições GET, mas não têm `Cache-Control`.
- A produção não retornou HSTS, CSP, `X-Frame-Options` ou outros cabeçalhos de proteção já previstos no `nginx.conf` local.
- Não ocorreram erros de console durante a renderização automatizada.

### Diferença entre repositório e produção

O repositório atual já contém:

- título e descrição mais específicos;
- canonical;
- Open Graph e Twitter Cards;
- JSON-LD `WebApplication`;
- `robots.txt`, `sitemap.xml` e `llms.txt` reais;
- imagem `og-aprendeia.png`;
- cabeçalhos de segurança no Nginx.

Esses recursos não chegaram ao endereço público auditado. No momento da coleta, a branch `entrega-2809` também estava dois commits à frente de `origin/entrega-2809`. Antes de qualquer otimização adicional, é necessário confirmar qual branch e qual diretório o serviço Railway usa para construir o frontend.

## Resultados de laboratório

Coleta feita com Lighthouse 13.5.0 e Chromium limpo, sem sessão autenticada.

| Métrica | Mobile | Desktop | Leitura |
|---|---:|---:|---|
| Performance | 99 | 100 | excelente em laboratório |
| Acessibilidade | 95 | 95 | boa, com falha de alvo de toque |
| Boas práticas | 100 | 100 | checklist do Lighthouse aprovado |
| SEO Lighthouse | 91 | 91 | perde pontos principalmente pelo `robots.txt` inválido |
| FCP | 1,6 s | 0,44 s | bom |
| LCP | 1,6 s | 0,44 s | bom |
| TBT | 0 ms | 0 ms | bom |
| CLS | 0 | 0 | bom |

Esses são dados de laboratório, não Core Web Vitals de usuários reais. A API pública do PageSpeed Insights respondeu `429 Too Many Requests`, portanto não foi possível confirmar dados de campo do CrUX. A validação definitiva deve ser feita no Search Console. Os limites de referência atuais são LCP até 2,5 s, INP até 200 ms e CLS até 0,1 no percentil 75, conforme a documentação de [Core Web Vitals](https://web.dev/articles/vitals).

Diagnósticos adicionais:

- aproximadamente 85 KiB, ou 69,6% do JavaScript transferido na tela de login, ficaram sem uso no teste;
- o bundle publicado tem 444.021 bytes antes da compactação;
- a compilação local atual gerou um bundle principal de 621,68 kB minificado e 179,51 kB em gzip, com alerta do Vite para chunks acima de 500 kB;
- CSS e `runtime-config.js` entram no caminho crítico, mas o impacto medido foi baixo;
- o botão de mostrar senha mede 23 × 18 px; o Lighthouse exige pelo menos 24 × 24 px de área segura.

## Achados priorizados

### P0 — publicar a versão correta do frontend

**Impacto:** rastreamento, apresentação social, schema, segurança, GEO e confiabilidade.

**Dependências:** confirmar branch de deploy, diretório raiz `frontend`, Dockerfile e variáveis do Railway.

**Ação:** gerar `dist`, verificar se os arquivos públicos estão dentro dele, publicar e repetir as requisições abaixo.

Critérios de aceite:

- `/robots.txt` responde `text/plain`, não HTML;
- `/sitemap.xml` responde XML válido;
- `/llms.txt` responde Markdown com H1 e links;
- `/og-aprendeia.png` responde `image/png`;
- a raiz contém canonical, metadados sociais e JSON-LD;
- respostas públicas recebem os cabeçalhos previstos no Nginx.

**Como esta hipótese pode falhar:** se o novo deploy concluir e a data/ETag permanecerem antigos, o problema está no serviço, branch ou contexto de build, não nos arquivos do repositório.

### P0 — criar uma página inicial pública e separar o login

Hoje a URL que deve apresentar o produto mostra somente autenticação. Isso limita palavras-chave, proposta de valor, confiança e links rastreáveis.

Estrutura recomendada:

- `/` — página pública com proposta de valor, funcionamento e CTA;
- `/entrar` — autenticação;
- `/cadastro` — criação de conta;
- `/recuperar-senha` — recuperação;
- `/para-estudantes` — trilhas, questões, recomendações e gamificação;
- `/para-professores` — acompanhamento pedagógico e relatórios;
- `/sobre` — autoria, objetivo acadêmico, metodologia e responsáveis;
- `/privacidade` e `/termos` — documentos legais públicos.

A homepage deve explicar, com conteúdo próprio e verificável, o problema atendido, os três perfis do sistema, limites da IA e como começar. Uma faixa de 500 a 800 palavras é suficiente se cada seção acrescentar informação; não deve haver preenchimento artificial por palavras-chave.

O Google consegue renderizar JavaScript, mas o app shell introduz uma etapa adicional e outros robôs podem não executar o código. Pré-renderizar a homepage e as páginas institucionais reduz essa dependência. Consulte as orientações oficiais de [SEO para JavaScript](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

**Como esta hipótese pode falhar:** se uma landing page indexada não aumentar impressões não relacionadas à marca em 8 a 12 semanas, revisar intenção, termos-alvo e autoridade externa antes de aumentar o volume de conteúdo.

### P1 — corrigir a semântica de rotas e respostas HTTP

- Não usar fragmentos como `#forgot` para páginas que precisam de URL própria.
- Transformar navegação para cadastro e recuperação em links reais com `href`.
- Manter painéis privados fora do sitemap e protegidos por autenticação.
- Responder `404` para arquivos e rotas públicas inexistentes; o fallback da SPA não deve transformar todo arquivo ausente em HTML `200`.
- Para páginas privadas que eventualmente devolvam shell público, acrescentar `noindex` e exigir autenticação antes de fornecer dados.

O Google recomenda URLs rastreáveis, History API e códigos HTTP significativos para SPAs. Veja [JavaScript SEO Basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics).

**Como esta hipótese pode falhar:** se o Search Console continuar classificando URLs como soft 404 após a mudança, conferir a resposta recebida pelo Googlebot e o HTML renderizado na inspeção de URL.

### P1 — enviar sitemap e acompanhar indexação

Depois do deploy:

1. cadastrar a propriedade no Google Search Console;
2. enviar `/sitemap.xml`;
3. inspecionar a homepage e solicitar indexação;
4. acompanhar páginas descobertas, indexadas, excluídas e soft 404;
5. criar propriedade no Bing Webmaster Tools e enviar o mesmo sitemap.

O sitemap deve conter somente URLs canônicas e públicas. A orientação oficial está em [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap).

**Como esta hipótese pode falhar:** sitemap aceito sem crescimento de páginas indexadas indica problema de qualidade, descoberta, canonicalização ou acesso — o sitemap não garante indexação.

### P1 — fortalecer identidade e confiança

O nome `AprendeIA` concorre com projetos já estabelecidos em `aprendeia.org`, `aprendeia.com` e `aprendeia.es`. Na busca feita durante a auditoria, o domínio Railway não apareceu para a consulta de marca/plataforma.

Ações:

- usar uma qualificação consistente, como `AprendeIA — reforço escolar adaptativo com IA`;
- adotar domínio próprio quando o projeto estiver pronto para divulgação;
- publicar autoria, instituição, objetivo do TCC, contato e data de atualização;
- deixar Termos de Uso e Política de Privacidade acessíveis antes do login;
- explicar que respostas de IA apoiam o processo pedagógico e podem exigir revisão docente;
- publicar demonstrações e resultados reais sem inventar depoimentos, números ou eficácia.

**Como esta hipótese pode falhar:** se a marca continuar invisível mesmo com páginas indexadas, será necessário trabalhar menções externas e links de fontes acadêmicas/institucionais, além da otimização interna.

### P2 — melhorar schema e descoberta por agentes

O `WebApplication` existente no repositório é adequado ao produto, mas deve ser validado depois do deploy. Recomenda-se complementar, apenas quando o conteúdo correspondente existir, com:

- `WebSite` para identidade do site;
- `Person` ou `Organization` para autoria/responsabilidade;
- `WebPage` nas páginas institucionais;
- `Article` em conteúdos acadêmicos ou guias com autor e datas reais.

Não incluir avaliações, preços, cursos ou resultados que não existam na interface. Schema ajuda máquinas a compreender entidades, mas não garante rich result nem citação por IA.

O `llms.txt` é complementar e ainda não substitui HTML rastreável, sitemap ou Search Console. O arquivo local tem estrutura útil, porém a produção devolve HTML. O Lighthouse 13.5 também procurou `ai-catalog.json`; como o projeto não mantém esse manifesto, o servidor deve devolver `404` ou um JSON válido — nunca o shell HTML.

**Como esta hipótese pode falhar:** schema válido sem alteração de tráfego é um resultado possível; seu principal objetivo aqui é reduzir ambiguidade, não prometer ranking.

### P2 — reduzir JavaScript inicial e configurar cache

- dividir o grande `App.tsx` por rota e perfil com `React.lazy`/imports dinâmicos;
- carregar painéis de estudante, professor e administração somente após autenticação;
- definir cache longo e `immutable` para `/assets/*`, cujos nomes já têm hash;
- manter `index.html` e `runtime-config.js` com cache curto ou `no-store` conforme a função;
- preservar gzip e avaliar Brotli somente se a infraestrutura suportar sem complexidade excessiva.

**Como esta hipótese pode falhar:** se a landing page continuar rápida e o bundle não afetar usuários reais, code splitting passa a ser melhoria de manutenção/custo, não prioridade de SEO.

### P2 — corrigir o alvo de toque

Aumentar a área clicável do botão `Mostrar senha` para pelo menos 24 × 24 px, idealmente 44 × 44 px para maior conforto, sem alterar o tamanho visual do ícone. Repetir a auditoria de teclado, foco e contraste nas telas de cadastro, recuperação e painéis.

**Como esta hipótese pode falhar:** a nota pode permanecer em 95 se outro controle pequeno surgir em uma viewport diferente; testar ao menos 360, 390 e 412 px de largura.

## Conteúdo e arquitetura recomendados

```text
Homepage pública
├── Como funciona
├── Para estudantes
├── Para professores
├── Segurança e privacidade
├── Sobre o projeto/TCC
├── Termos de Uso
└── Política de Privacidade
    └── Entrar / Cadastrar
        ├── Área do estudante
        ├── Área do professor
        └── Administração
```

As áreas autenticadas não devem ser tratadas como páginas de aquisição. O conteúdo público precisa responder perguntas reais: como a personalização funciona, que dados são usados, quais são os limites da IA, o que o professor controla e como os três perfis se diferenciam.

SEO local e Google Maps não se aplicam neste momento porque a plataforma é digital e não apresenta atendimento presencial verificável. Não criar perfil local ou páginas de cidade sem operação real.

## Plano de execução por dependência

### Primeiras 48 horas

1. Confirmar serviço, branch e contexto de build no Railway.
2. Publicar a versão atual do frontend.
3. Validar todos os arquivos estáticos e cabeçalhos.
4. Enviar sitemap ao Search Console e Bing.

### Próximas 2 semanas

1. Separar homepage pública e login.
2. Criar rotas reais para cadastro, recuperação, termos e privacidade.
3. Adicionar páginas `Sobre`, estudantes e professores.
4. Corrigir fallback 200, alvo de toque e cache de assets.
5. Validar JSON-LD no Schema.org Validator e no Rich Results Test quando aplicável.

### Próximos 30 a 90 dias

1. Publicar conteúdo demonstrável ligado ao TCC, metodologia e uso pedagógico.
2. Obter menções institucionais e acadêmicas legítimas.
3. Medir consultas de marca e não marca no Search Console.
4. Comparar conversão da landing page para cadastro.
5. Repetir Lighthouse, inspeção renderizada e auditoria de indexação.

## Indicadores de acompanhamento

- número de URLs públicas válidas enviadas e indexadas;
- impressões e cliques de consultas não relacionadas à marca;
- posição e CTR da homepage para o nome qualificado do projeto;
- conversão de visita pública para início e conclusão de cadastro;
- LCP, INP e CLS de campo no percentil 75;
- páginas citadas ou mencionadas por buscadores/assistentes, registrando consulta, data e fonte;
- erros de `robots.txt`, sitemap, soft 404 e schema iguais a zero.

## Próxima auditoria

Repetir a coleta imediatamente após o deploy correto e novamente após 30 dias de dados no Search Console. A próxima auditoria deve verificar se os arquivos locais chegaram à produção, se a homepage pública passou a ser a URL canônica e se começaram a surgir impressões não relacionadas à marca.

## Limitações

- Não houve acesso às propriedades privadas do Search Console, Bing Webmaster Tools, Railway ou analytics.
- A API PageSpeed Insights limitou a consulta com HTTP 429; não há confirmação de CrUX nesta coleta.
- A visibilidade foi testada por buscas públicas e não prova ausência absoluta em todos os índices ou regiões.
- As notas de conteúdo, autoridade e GEO são avaliações da evidência disponível, não fatores ou pontuações publicadas pelo Google.
