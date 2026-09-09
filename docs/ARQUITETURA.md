# Arquitetura e raciocínio do AprendeIA

Este documento explica as decisões do projeto de forma breve. Os comentários nos arquivos mostram o propósito local de cada bloco; aqui fica a visão do conjunto.

## Visão geral

O sistema foi dividido em três camadas:

1. **React** apresenta login, perfis e prática adaptativa.
2. **FastAPI** protege ações privilegiadas, valida sessões e chama a OpenAI.
3. **Supabase** mantém autenticação, dados PostgreSQL e autorização por linha.

Essa divisão evita colocar chaves secretas ou decisões de autorização no navegador.

## Autenticação e cargos

O React autentica e recebe uma sessão do Supabase. Depois lê o perfil autorizado pela política RLS. O cargo não é escolhido no login e não usa `user_metadata`, pois esse campo pode ser alterado pelo próprio usuário.

Novos cadastros públicos sempre recebem o cargo `student`. Professores e administradores são definidos por uma operação privilegiada no backend. A primeira conta administrativa precisa ser promovida manualmente no SQL Editor, conforme o README.

## Banco de dados

O modelo usa tabelas separadas para:

- identidade: `profiles`;
- conteúdo: `subjects`, `modules` e `lessons`;
- relações: `teacher_students` e `enrollments`;
- aprendizagem: `lesson_progress`, `question_attempts` e `student_difficulties`;
- questões: `questions`.

O painel docente acrescenta `classes`, `class_students`, `learning_contents` e `pedagogical_recommendations`. A turma é uma organização de trabalho: remover um vínculo não apaga o histórico do estudante.

Tentativas são armazenadas como eventos imutáveis. Dificuldades são um resumo atualizado para selecionar rapidamente o próximo nível.

## Segurança

Todas as tabelas do schema público têm RLS. O papel `anon` não recebe acesso às tabelas. Usuários autenticados recebem apenas as operações necessárias:

- estudante consulta e atualiza seus próprios dados de aprendizagem;
- professor consulta estudantes que tenham vínculo explícito com ele;
- administradora cria contas pelo FastAPI;
- a chave secreta do Supabase existe somente no backend.

## Inteligência artificial

A OpenAI gera uma questão por vez usando saída estruturada. O schema exige quatro alternativas, índice correto e explicação. O backend persiste o resultado e nunca envia a chave da OpenAI ao frontend.

Depois da resposta, o servidor calcula a taxa de acerto. Com pelo menos três tentativas, desempenho a partir de 80% avança para `advanced`; abaixo de 60% retorna para `basic`; os demais casos usam `intermediate`.

As recomendações pedagógicas usam métricas sem nomes ou e-mails, saída JSON estruturada e `store=False`. Antes da chamada, o backend confirma professor, disciplina, turma e estudante.

## Modo demonstrativo

Quando as variáveis do Supabase não existem, o projeto usa dados locais. Essa escolha facilita apresentações acadêmicas offline. O modo é claramente separado da execução conectada e não deve ser usado em produção.

## Arquivos gerados

`package-lock.json` e `tsconfig.tsbuildinfo` são gerados por ferramentas. O lockfile é versionado para reproduzir dependências; o arquivo de build é ignorado. Arquivos JSON não recebem comentários porque comentários invalidariam o formato. Suas funções são documentadas neste arquivo e no README.
