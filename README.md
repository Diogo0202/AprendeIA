# AprendeIA

Projeto de conclusão de curso: plataforma de reforço escolar com apoio de inteligência artificial.

## Baixar o projeto

[Baixar aprendeia-plataforma.zip](./aprendeia-plataforma.zip). Extraia o arquivo e abra a pasta `educational-platform`.

O pacote contém o código-fonte React + TypeScript (Vite), o backend Python + FastAPI, os arquivos de dependências e um exemplo de configuração. Credenciais e dependências instaladas não estão incluídas.

## Funcionalidades da versão atual

- Interfaces demonstrativas de estudante, professor e administradora.
- Estudante: visualização de matérias, progresso e dificuldades com dados de exemplo.
- Professor: seleção de estudantes e acompanhamento demonstrativo de tempo e dificuldade.
- Administradora: inclusão local de nomes nos cargos de estudante ou professor.
- Área de prática: alternativas, correção e explicação.
- Backend: endpoint de geração de questões com a Responses API da OpenAI e classificação de dificuldade baseada na taxa de acertos.

## Executar o frontend

Instale Node.js compatível com a versão do Vite registrada no package-lock.json. No terminal:

```sh
cd educational-platform/frontend
npm ci
npm run dev
```

Abra http://localhost:5173. Para compilar: `npm run build`.

## Executar o backend

Use Python 3.10 ou superior. No PowerShell:

```powershell
cd educational-platform/backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

Configure localmente `backend/.env` usando `.env.example` como referência. A variável `OPENAI_API_KEY` é exclusiva do backend; `OPENAI_MODEL` permite configurar o modelo. Nunca publique o arquivo `.env` ou uma chave real.

```sh
python -m uvicorn main:app --reload --host 127.0.0.1
```

API: http://localhost:8000. Documentação interativa: http://localhost:8000/docs.

## Endpoints de questões

| Método | Caminho | Função |
| --- | --- | --- |
| POST | `/question-bank/generate` | Solicita uma questão à OpenAI |
| GET | `/question-bank` | Lista questões em memória |
| GET | `/question-bank/next` | Seleciona uma questão existente |
| POST | `/question-bank/{question_id}/answer` | Corrige e atualiza o desempenho em memória |

## Limitações e próximos passos

Esta versão é um protótipo local, não uma aplicação pronta para produção. Login e cargos são demonstrativos, sem autenticação ou autorização reais. O banco de questões e o desempenho ficam em memória e são perdidos ao reiniciar o backend; PostgreSQL está planejado, mas não integrado.

O botão de próxima questão consulta questões existentes e ainda não aciona automaticamente o gerador de IA. Se a API falhar, a interface usa uma questão local de exemplo. Os endpoints atuais expõem gabaritos, e ainda faltam controle de acesso, limites de chamadas, persistência, diagnóstico por habilidade e validação pedagógica. O build React foi verificado; chamadas reais à OpenAI e a execução do backend não foram validadas nesta entrega.

Conteúdo gerado por IA requer revisão pedagógica antes de uso com estudantes reais.
