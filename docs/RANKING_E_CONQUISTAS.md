# Ranking semanal e conquistas

Checklist de entrega local, iniciado em 04/11/2026. A aplicação de migrations e os testes publicados ficam registrados à parte.

- [x] Conferir o cálculo existente e as regras de participação aprovadas.
- [x] Persistir XP por evento com deduplicação e bônus concedidos uma vez.
- [x] Criar ranking semanal da turma e opção separada para escola.
- [x] Proteger apelidos, acesso por turma e exclusão dos dados da conta.
- [x] Integrar catálogo de conquistas e progresso abaixo do avatar.
- [x] Atualizar o aviso de ranking, cadastro e exigência de novo aceite, consolidados na política 1.5 com a frente administrativa.
- [x] Executar prévia e testes SQL em banco isolado: 20 cenários de gamificação passaram em 04/11/2026.
- [x] Executar testes Python, React, build e validação visual desktop/mobile.
- [ ] Publicar migrations e aplicação e confirmar os fluxos no ambiente real.

## Regras

A semana começa segunda-feira às 00h em America/Sao_Paulo. XP semanal participa do ranking; XP total define o nível pessoal, com 250 XP por nível. Contas de estudantes e professores continuam com vencimento em 168 horas.

Uma aula concede 100 XP uma vez; o primeiro acerto de cada questão concede 10 XP; um dia com atividade pedagógica concede 20 XP. Repetir uma questão ou reabrir a conclusão de uma aula não gera novo XP. Bônus de conquistas têm registro único por conta.

O ranking da turma é automático após o aceite vigente e exige vínculo. O ranking escolar começa desligado. A saída do ranking escolar não altera o XP pessoal. Colegas recebem somente apelido, avatar, XP semanal, nível e posição. UUIDs de colegas, nomes completos, e-mails, notas e dificuldades não aparecem nesse contrato.

Empates de XP compartilham posição. Apelido e identificador interno só ordenam visualmente a lista. Professores consultam apenas suas turmas e disciplina, sem ranking escolar.

## Migração e operação

Antes de aplicar a migration, executar a prévia SQL de XP e comparar pontos antigos e deduplicados. Eventos legados sem horário confiável não devem ser atribuídos à semana corrente. Possíveis reduções decorrem da remoção de pontos por repetição.

Não aplicar migrations de gamificação isoladamente: elas dependem das migrations de política, ciclo de contas e estrutura pedagógica anteriores. O aceite 1.4 deve ser publicado junto com o frontend e a API. Uma aplicação antiga não deve continuar expondo o ranking com política anterior.

As tabelas de eventos e conquistas são exclusivas do servidor. Após exclusão, a conta sai do ranking e seus registros são removidos pelas chaves estrangeiras. Não há arquivo histórico identificável de temporadas.

Na turma, o ranking soma somente os eventos atribuídos à disciplina. Dias ativos e bônus globais entram no ranking escolar, sem revelar ao professor XP de outras matérias. A insígnia de pódio é calculada sobre a semana anterior e a participação escolar atual, sem bônus nem arquivo de identidades. Ela deixa de aparecer ao sair do ranking escolar ou ao mudar a semana de referência.

Os 20 cenários SQL aplicam migrations reais em PostgreSQL WASM. Auth, Storage e Cron são estruturas simuladas. As chaves únicas e locks transacionais foram exercitados no SQL, mas PGlite possui uma sessão: ainda falta comprovar disputa entre conexões independentes em homologação. Nenhuma migration ou limpeza foi executada no banco publicado nesta etapa.

## Evidências em 04/11/2026

| Verificação | Resultado |
| --- | --- |
| Python, checkout atual | 199 testes passaram |
| React/Vitest | 90 testes passaram em 13 arquivos |
| TypeScript e build Vite | Passaram; bundle principal de aproximadamente 688 kB, com aviso acima de 500 kB |
| Playwright desktop e mobile | 10 execuções passaram, incluindo 6 do ranking com endpoints simulados |
| SQL de gamificação | 20 cenários passaram, incluindo prévia anterior à migration |
| SQL das áreas anteriores | Privacidade: 19 cenários; administração: 11; ciclo de conta: script concluído |

As telas foram inspecionadas por capturas de navegador em desktop e viewport mobile. Isso comprova os componentes reais com respostas simuladas, não uma sessão Supabase publicada ou um aparelho físico. O CI passou a incluir o script de gamificação no comando de validação SQL.

Para produzir a prévia sem executar migrations: `node scripts/validation/gamification-database.mjs --preview`. O SQL emitido roda em transação somente leitura e compara XP-base antigo, base sem repetição, bônus previstos e diferença por conta. A saída contém identificadores administrativos e não deve ser publicada no GitHub.

A política do ranking entrou na 1.4 e foi consolidada na 1.5 para preservar a edição paralela do painel administrativo. Frontend, API e migration final exigem 1.5. As mudanças permanecem locais; publicação e teste concorrente com conexões independentes continuam pendentes.
