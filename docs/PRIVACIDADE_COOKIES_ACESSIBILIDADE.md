# Checklist de privacidade, cookies e acessibilidade

Revisão integrada em 05/11/2026. Política 1.6, Termos de Uso 1.0 e direitos ampliados. Este inventário não certifica conformidade legal ou acessibilidade. A seção de evidências registra os testes locais; configurações externas e validação publicada permanecem separadas.

## Política e tratamento de dados

| Controle | Estado | Evidência e próximo passo |
| --- | --- | --- |
| Ciência da política separada de consentimento opcional | Implementado local no texto | `frontend/src/components/PrivacyPolicyAccess.tsx`, seções iniciais, 9 e 11. Conferir rótulos dos formulários na integração do parent. |
| Termos 1.0 preservados | Implementado local na migration | Base: `20261108110000_terms_of_use_v1_0.sql`. A nova migration conserva campos dos termos, auditoria e assinatura de três argumentos. Aplicação remota pendente. |
| Política vigente no ranking | Implementado e testado localmente | `private.gamification_visible` exige 1.6 e termos 1.0; preserva admissão e limite de 168 horas. A expiração da evidência detalhada após seis dias não revoga a ciência vigente no perfil. Horários futuros são recusados. |
| Backend alinhado à 1.6 | Implementado local pela frente parent | `backend/main.py` contém `Literal["1.6"]` e bloqueio por política 1.6/termos 1.0 na inspeção atual. Não foi editado neste escopo; validação remota pendente. |
| Identificação do controlador institucional | Pendente externo | Escola Diogo Mendes teste; responsável pelo projeto Diogo Mendes Baptista. Identificação formal institucional: [falta detalhe real]. |
| Canal de privacidade | Implementado local no texto | `dig.mendes.baptista@gmail.com`; operação, confirmação de identidade e prazo de resposta precisam de definição institucional. |
| Finalidades e hipóteses legais | Pendente externo | Mapear cada finalidade, inclusive ranking e recursos de IA. Ciência obrigatória não serve de consentimento geral. |
| Inventário de operadores e transferências | Pendente externo | Referências locais a Supabase, OpenAI e Turnstile; GA4 e Clarity condicionados à configuração aprovada. Confirmar fornecedores efetivamente ativos, SMTP, hospedagem, contratos e países de processamento. |
| Crianças e adolescentes | Implementado local; externo pendente | `InstitutionalAdmission.tsx` e `backend/account_lifecycle.py` bloqueiam conforme resposta do servidor. Canal: `dig.mendes.baptista.mb@gmail.com`. Validar admissão publicada e hipótese legal com melhor interesse. |
| Contas de teste | Implementado local; externo pendente | Contas student e teacher expiram 168 horas após a criação original; admin isento. Nova ciência e login não renovam o prazo. Verificar bloqueio remoto; expiração não significa exclusão. |
| Auditoria e evidências de aceite | Implementado local; externo pendente | Migration de termos mantém versões e limpa horários após seis dias, dentro do limite de sete dias. Confirmar rotinas e agendamento no ambiente publicado. |
| Retenção acadêmica e backups | Pendente externo | Prazos: [falta detalhe real]. Não há comprovação de exclusão em fornecedores nem em cópias externas. |

## Direitos dos titulares

| Direito | Estado | Evidência e atendimento |
| --- | --- | --- |
| Acesso e correção | Implementado local; externo pendente | `PrivacyRequests.tsx` e `backend/privacy_requests.py` oferecem acesso em JSON e correção de nome, etapa e objetivo. Confirmar fluxo publicado. |
| Anonimização e exclusão | Implementado local; externo pendente | Pedidos sujeitos a decisão administrativa, encerramento de conta e restrição para Storage. Confirmar que o encerramento preserva turmas e materiais sem professor, conforme o contrato atual. |
| Confirmação da existência (`confirmation`) | Implementado local; operação externa pendente | Área Meus dados e canal de privacidade. Tipo presente na API e na migration de direitos; requer resposta administrativa. |
| Informação sobre compartilhamento (`sharing`) | Implementado local; operação externa pendente | Informar entidades destinatárias a partir de inventário confirmado. |
| Oposição (`opposition`) | Implementado local; operação externa pendente | Analisar a hipótese legal e as condições do pedido. |
| Revogação (`revocation`) | Assistido; cookies implementados localmente | Canal para demais finalidades; painel de cookies permite mudar cada escolha. Validar interrupção das coletas na rede. |
| Portabilidade (`portability`) | Implementado local; operação externa pendente | JSON de acesso não comprova portabilidade. Definir formato e procedimento conforme condições legais aplicáveis. |
| Revisão de decisões automatizadas (`automated_review`) | Implementado local; operação externa pendente | Canal recebe pedidos sobre decisões unicamente automatizadas que afetem interesses. Definir análise e informação sobre critérios. |
| Bloqueio e informação sobre recusa | Assistido; operação pendente | Canal recebe pedido de bloqueio, dados excessivos e dúvidas sobre negar consentimento e suas consequências. |

A API local inspecionada admite `access`, `correction`, `anonymization` e `deletion`, com os seis tipos assistidos descritos acima. `PrivacyRequests.tsx`, `backend/privacy_requests.py` e `20261109120000_extended_privacy_rights.sql` registram os novos pedidos. Concluir um pedido assistido registra a resposta; não altera automaticamente a sessão, o consentimento ou dados nos fornecedores. Oposição e revogação exigem confirmação administrativa MEDIDA CONFIRMADA. A operação assistida e a publicação ainda dependem de validação externa.

## Cookies e medição em `/sobre`

| Controle exigido pela política 1.6 | Estado observado | Evidência e pendência |
| --- | --- | --- |
| Supabase Auth separado da medição | Distinção implementada no texto | Sessão e credenciais no armazenamento do navegador, conforme `frontend/src/lib/supabase.ts`. Inventariar chaves e prazos reais no ambiente publicado. |
| Turnstile separado da medição | Distinção implementada no texto | `TurnstileWidget.tsx` carrega a verificação Cloudflare nos formulários. Confirmar configuração e tratamento técnico pelo fornecedor. |
| GA4 para estatísticas | Implementado local; externo pendente | `lib/tracking.ts` confere flag, aprovação e ID; exige escolha de estatísticas. Confirmar configuração e eventos reais na rede. |
| Clarity para session replay | Implementado local; externo pendente | `lib/tracking.ts` confere flag, aprovação e ID; exige escolha de gravação separada do GA4. O carregador legado foi removido. Confirmar projeto e mascaramento reais. |
| Medição somente em `/sobre` | Implementado local; externo pendente | `main.tsx` renderiza `AboutPage` nessa rota e verifica ausência de sessão. `publicTrackingPage()` exige `/sobre`, sem query/hash e visitante confirmado. Validar entrada e saída na rede. |
| Consentimentos separados e desligados por padrão | Implementado local; externo pendente | `CookieConsent.tsx` inicia ambas as escolhas em `false`, oferece aceitar, recusar e personalizar. `loadOptionalTracking()` verifica cada permissão. Validar ausência de coleta antes da escolha. |
| Escolha local com validade de sete dias | Implementado local; externo pendente | `CONSENT_TTL_MS` vale sete dias. `readCookieConsent()` rejeita escolha expirada; observação ocorre a cada 30 segundos, no foco e por evento de armazenamento. Confirmar interrupção de coleta na expiração. |
| Link permanente e revogação | Implementado local; externo pendente | Rodapé permanente com Preferências de cookies abre o diálogo. `saveCookieConsent()` chama interrupção na revogação; o carregador limpa cookies conhecidos e recarrega o documento quando já há scripts ativos. Validar na rede de cada fornecedor. |
| Descrição fiel do rastreamento | Implementado local no texto | O aviso legado foi removido. A política 1.6 reconhece dados pessoais e limites do mascaramento; o painel identifica estatísticas e gravação separadamente. |
| Retenção e exclusão externa | Pendente externo | Sete dias dizem respeito à escolha local; não apagam dados enviados. Confirmar configurações Google/Microsoft e procedimento de exclusão. |

## Acessibilidade

| Controle | Estado observado | Próxima verificação |
| --- | --- | --- |
| Política com título associado | Implementado local | `PrivacyPolicyAccess.tsx` associa `dialog` ao título com `aria-labelledby`. Validar anúncio com leitor de tela. |
| Checkbox identificado e obrigatório | Implementado local | `label`, `required`, `aria-required` e descrição por `aria-describedby`. Confirmar clareza dos rótulos na integração. |
| Abrir e fechar com teclado | Testado localmente no navegador | Escape, navegação e retorno do foco cobertos por Playwright; leitura com tecnologia assistiva permanece pendente. |
| Banner e painel de cookies | Testado localmente | Rótulos, diálogo, foco e escolhas independentes; aceitar e recusar têm destaque equivalente. |
| Página Sobre | Testado localmente | Região principal, títulos e salto ao conteúdo; o salto preserva a URL sem hash, inclusive após consentir. |
| Contraste e telas pequenas | Corrigido e testado localmente | Oito paletas, textos e foco, viewport de 320 CSS px, movimento reduzido e reflow equivalente a zoom. Zoom real e leitor de tela continuam pendentes. |

## Evidências da integração

- Backend: 205 testes aprovados em 05/11/2026.
- Frontend: 108 testes aprovados e build TypeScript/Vite concluído. Navegador: 58 testes aprovados em desktop e emulação móvel. A suíte local não encontrou violações automáticas críticas ou sérias nos cenários cobertos.
- As migrations são executadas em PostgreSQL isolado PGlite com Auth, Storage e Cron simulados. A suíte de privacidade cobre 28 cenários, incluindo aceite, isolamento e exclusão sem deixar dados do responsável órfãos.
- A exportação inclui admissão, eventos de XP, conquistas e preferências do próprio titular; um teste impede inclusão de registros de colegas.
- Testes de cookies interceptam os provedores com IDs fictícios. Nenhum fornecedor real foi ativado por esta auditoria.
- Relatório: [auditoria de acessibilidade](AUDITORIA_ACESSIBILIDADE_2026-11-05.md). Resultados completos de frontend e banco estão registrados nesse documento.
- O site publicado diverge do código local: `/sobre` ainda mostra o login, sem a nova central de cookies. Uma ocorrência séria de tamanho de alvo foi encontrada em cada URL pública examinada.
- Cookies observados na hospedagem: `__Host-appgarden-visitor`, `cf_clearance` e `__cf_bm`, com Secure e HttpOnly. Finalidade detalhada, base e prazos do provedor: [falta detalhe real]. Não foram classificados automaticamente como necessários.
- Nginx e Docker não estavam disponíveis para validar o container. A CSP foi revisada no código; falta `nginx -t` e verificação da imagem executada.
- Confirmar Enhanced Measurement, retenção e exclusão no GA4 e no Clarity antes da ativação. Sete dias no navegador não comprovam eliminação externa.

## Referências e limites da entrega

Direitos e revogação: [LGPD, artigos 8, 18 a 20](https://www2.camara.leg.br/legin/fed/lei/2018/lei-13709-14-agosto-2018-787077-normaatualizada-pl.html). Escolhas de cookies: [guia orientativo da ANPD](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia_orientativo_cookies_e_protecao_de_dados_pessoais).

Este checklist combina inspeção e testes locais. Não comprova migration remota, publicação, atendimento jurídico, comportamento dos provedores reais ou certificação WCAG. Revalidar as linhas externas no ambiente publicado. A conclusão integral depende de operação institucional, contratos e comprovações dos fornecedores.
