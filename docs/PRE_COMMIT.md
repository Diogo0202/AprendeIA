# Pre-commit do AprendeIA

O frontend usa Husky, lint-staged e Prettier para impedir que um commit seja criado com formatação, tipagem ou testes quebrados.

## O que roda antes de cada commit

1. Prettier somente nos arquivos preparados para commit.
2. TypeScript com `tsc --noEmit` em todo o frontend.
3. Testes do Vitest em modo não interativo.

O hook está em `frontend/.husky/pre-commit`. Os executáveis são chamados diretamente pelo Node para funcionar também em instalações reduzidas do Git para Windows que não oferecem todos os utilitários Bash usados pelos atalhos `npx` e `npm`.

## Instalação local

```powershell
cd D:\AprendeIA\frontend
npm install
npm run prepare
```

O script `prepare` configura `core.hooksPath` como `frontend/.husky/_`, pois o repositório Git fica um nível acima do `package.json`.

## Execução manual

```powershell
cd D:\AprendeIA
git hook run pre-commit
```

Também é possível executar cada verificação separadamente:

```powershell
cd D:\AprendeIA\frontend
npx lint-staged
npm run typecheck
npm run test:run
```

No pre-commit, o Prettier atua somente nos arquivos preparados para evitar alterações fora do commit atual. A base ainda contém arquivos históricos fora do padrão global; eles serão normalizados gradualmente quando forem modificados, sem gerar uma reescrita ampla e difícil de revisar.
