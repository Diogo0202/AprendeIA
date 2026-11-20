# Aba "Termos e privacidade"

Estudantes, professores e administração têm no menu lateral a opção **Termos e privacidade** (ícone `TP`). Ela reúne três documentos em `frontend/src/components/LegalDocuments.tsx`:

| Documento | Conteúdo |
| --- | --- |
| Política de Privacidade | O mesmo texto do modal de cadastro e login (`PrivacyPolicyContent`, versão 1.5). Há uma única fonte, então a aba e o modal não divergem. |
| Termos de Uso | Versão 1.0 (04/11/2026): contas e acesso, uso permitido, condutas proibidas, IA, direitos autorais, ranking, suspensão e exclusão, disponibilidade, alterações e contato. |
| LGPD e referências | Lei nº 13.709/2018 com link oficial, artigos da LGPD ligados a cada seção da política (7º, 14, 15 e 16, 18, 20, 33 a 36, 41, 46 e 48), as quatro orientações da ANPD citadas no documento da política e a referência acadêmica. |

## Onde aparece

- **Estudante:** item no menu e no link "Termos e política" da conta; ambos levam à seção `#student-legal`, no fim da página.
- **Professor:** aba `legal` no painel.
- **Administração:** aba `legal` no painel.

A aba é só de consulta e não chama a API.

## Aceite obrigatório dos Termos de Uso 1.0

Migration `20261108110000_terms_of_use_v1_0.sql`:

- `profiles` ganha `terms_of_use_version` e `terms_of_use_accepted_at`. O navegador não altera essas colunas, porque `authenticated` só atualiza nome, série e objetivo.
- `privacy_policy_acceptances` ganha `terms_version`. O índice único passa a incluir a versão dos termos, para que quem aceitou só a política possa registrar o novo aceite.
- O gatilho de cadastro recusa conta pública sem `terms_of_use_accepted=true` e `terms_of_use_version='1.0'`, além da política. Perfil, evidência e auditoria (`CREATE_USER`) guardam a versão dos termos.
- `record_privacy_policy_acceptance` passa a ter 3 argumentos (usuário, política e termos), executáveis só por `service_role`. A versão de 2 argumentos foi removida.
- A limpeza recorrente apaga o horário do aceite dos termos após 6 dias e mantém a versão, como já faz com a política.

API: `POST /privacy/accept` exige `terms_version: "1.0"`. Contas sem os termos recebem `428` ("Aceite os Termos de Uso e a Política de Privacidade para continuar"), e a auditoria registra `terms_version`.

Interface: o cadastro e a tela de novo aceite têm duas caixas obrigatórias, os termos e a política, e um botão "Ler os Termos de Uso". Contas que já aceitaram a política, incluindo as provisionadas pela administração, passam pela tela de novo aceite no próximo acesso.

A migration da política 1.6 (`20261109110000_privacy_policy_v1_6.sql`, de outra frente) mantém esse contrato dos termos.

## Limites

- Os resumos dos artigos usam linguagem simples e não substituem o texto da lei. Termos e política precisam de validação jurídica antes do uso público.
- O documento original da política cita a LGPD e as orientações da ANPD sem indicar artigos. O texto do repositório cita o artigo 14. Os demais artigos foram associados pelo tema de cada seção.

## Testes

```powershell
cd frontend; npx vitest run src/components/LegalDocuments.test.tsx
```
