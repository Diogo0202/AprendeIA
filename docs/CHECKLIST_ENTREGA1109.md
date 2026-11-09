# Checklist da entrega 1109

Revisão de 09/11/2026, branch `entrega1109`. Os marcadores descrevem evidência, não intenção. Publicação e operação real permanecem separadas dos testes locais.

## Equipe e integração

- [x] Quatro agentes GPT-6 Luna atuaram em e-mails, configuração Vercel, CI/monitor e autenticação.
- [x] O modelo coordenador revisou os diffs e integrou os contratos compartilhados.
- [x] SMTP permanece disponível e Resend HTTPS tem estado próprio de aceitação.
- [x] O resumo semanal reconhece aceitação HTTPS, sem inventar recebimento.
- [x] Monitor mantém abertura, deduplicação e encerramento de alertas; flags externas começam desativadas.
- [x] Vercel tem configuração de SPA e cabeçalhos na raiz correta do frontend; o proxy para o domínio antigo foi removido.
- [x] Produção sem configuração não abre a demonstração de aluno ou professor.
- [x] CORS produtivo exige origem HTTPS pública e exata.
- [x] Readiness verifica também contratos de admissão, e-mails e gamificação, sem buscar registros pessoais.
- [x] Política 1.7 e Termos 1.0 estão sincronizados no código; a nova versão exige nova ciência.
- [x] GA4 e Clarity permanecem desligados; CSP da Vercel bloqueia seus scripts.

## Supabase real

- [x] Projeto `auwwfetxedberounjglo` restaurado e confirmado `ACTIVE_HEALTHY`.
- [x] Dez migrations antigas identificadas pelo nome antes da atualização.
- [x] Prévia: duas contas antigas, sem progresso, tentativas ou dias de atividade; nenhuma conta excluída.
- [x] Migrations pendentes até `email_https_transport` aplicadas, preservando as duas contas.
- [x] Falha de ownership no Storage corrigida: a migration não altera tabelas internas gerenciadas.
- [x] Política 1.7 e proteção de ciclo de conta no envio aplicadas; total de 35 migrations. RLS ausente em zero tabelas públicas; duas contas preservadas e nenhuma política nova na tabela interna Storage migrations.
- [ ] Rotina de exclusão automática de contas validada e habilitada. Continua desativada: faltam RPCs de execução e o callback de resumo pré-exclusão.
- [ ] Proteção do Supabase Auth contra senhas vazadas habilitada, se disponível no plano atual. Advisor retornou aviso; não houve upgrade.

A ausência de políticas em `private.anonymous_learning_totals` aparece como informação do advisor. A tabela privada tem RLS e acesso negado ao navegador; isso não equivale a uma tabela pública aberta.

## Verificações locais

- [x] Python: 218 testes aprovados após a integração final.
- [x] React: 115 testes aprovados e build TypeScript/Vite concluído; aviso de bundle de aproximadamente 714 kB antes de gzip.
- [x] Seis suítes PostgreSQL isoladas aprovadas, incluindo aceitação HTTPS (não recebimento) e expiração entre claim e envio.
- [x] Node: 40 testes do monitor, agendador e verificador de deploy aprovados.
- [x] Playwright: 64 cenários aprovados em desktop e emulação móvel.
- [x] Bandit aprovado e varredura de padrões de credenciais em 600 arquivos sem achados; arquivos ignorados não entram no commit.

Esses resultados são da execução local final de 09/11/2026. PostgreSQL isolado tem Auth/Storage/Cron simulados; não prova concorrência entre conexões.

## Publicação e testes reais

- [ ] Vercel: criar e configurar projeto. API retornou 403; CLI aguarda autenticação do titular.
- [ ] Railway: reconectar integração, publicar API e confirmar HTTPS e readiness.
- [ ] RF-04: configurar Gmail SMTP no Supabase e receber recuperação; testar expiração e reutilização.
- [ ] RF-05: configurar widget e CAPTCHA do Supabase; testar login, cadastro, recuperação e chamadas diretas sem token.
- [ ] RF-07: aprovar procedimento institucional de menores e confirmar contratos, retenção externa e execução da limpeza.
- [ ] RF-22: configurar Resend e receber alerta/resumo no e-mail verificado da própria conta.
- [ ] RF-22: liberar outros destinatários somente após domínio verificado; não comprar domínio automaticamente.
- [ ] RF-25: concluir configuração segura da chave OpenAI e executar conversas reais pelos dois cargos.
- [ ] RF-31: commit/push, PR para `main`, CI aprovado e confirmação do SHA servido em produção.
- [ ] RF-32: ativar flags e URLs só após publicação; comprovar saúde, incidente, deduplicação e recuperação.
- [ ] Confirmar uma execução automática do agendamento semanal; disparo manual não comprova cron.

RF-29 permanece em 50%, por decisão de manter medidores desligados. Os demais RF listados não sobem para 100% apenas porque os testes locais passaram.

## Bloqueios de acesso e segredos

O controle do navegador foi encerrado porque não conseguiu confirmar a URL da janela do Opera. Não houve tentativa de contornar essa barreira. A autorização Vercel precisa ser concluída pelo titular; Railway requer reconexão. O fluxo seguro OpenAI foi aberto e aguarda seleção do projeto e confirmação do destino local. SMTP Gmail, Turnstile e Resend ainda dependem de configuração autorizada. Nenhuma senha ou chave deve ser enviada por chat.

Guias: [publicação](VERCEL_RAILWAY_PUBLICACAO.md), [CI e monitor](CI_PUBLICACAO_VALIDADA.md), [autenticação real](AUTENTICACAO_VALIDACAO_REAL.md), [operadores](INVENTARIO_FORNECEDORES.md) e [menores](PROCEDIMENTO_MENORES.md).
