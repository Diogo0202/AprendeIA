# 🤖 Guia de modelos locais com Ollama

Este guia organiza os modelos locais usados pelo time de IA. Ele serve para escolher o modelo certo para cada tarefa, em vez de baixar toda a biblioteca do Ollama sem necessidade.

> O catálogo do Ollama muda com frequência. Antes de escolher ou atualizar um modelo, consulte o [índice oficial da documentação](https://docs.ollama.com/llms.txt) e a [biblioteca oficial](https://ollama.com/library).

## 🧭 Regra principal

Não existe um único modelo “melhor” para tudo. A escolha depende da tarefa, do contexto necessário e da memória disponível. Baixe apenas os modelos que serão usados:

```powershell
# Mostra os modelos já instalados nesta máquina.
ollama list

# Baixa apenas um modelo escolhido para a tarefa.
ollama pull qwen3:4b-thinking
```

O endpoint local `GET http://localhost:11434/api/tags` também lista os modelos instalados e seus detalhes. A [referência da API](https://docs.ollama.com/api/tags) explica o formato da resposta.

## 🧩 Classificação recomendada

| Tipo de tarefa | Modelo principal | Alternativa econômica | Quando usar |
| --- | --- | --- | --- |
| ⚡ Resumos, classificação e tarefas repetitivas | `qwen3:4b-thinking` | `gemma3:1b` | Trabalhos curtos, rascunhos e organização inicial |
| 🧠 Raciocínio, matemática e planejamento | `qwen3:30b` | `qwen3:4b-thinking` | Decisões que precisam de mais análise ou checagem |
| 💻 Código complexo e repositórios grandes | `qwen3-coder:30b` | `devstral:24b` | Implementação, refatoração, testes e leitura de muitos arquivos |
| 🧰 Agentes com ferramentas | `qwen3:30b` | `ministral-3:8b` | Fluxos que chamam terminal, APIs ou funções estruturadas |
| 👁️ Imagens, telas e documentos visuais | `qwen3-vl:8b-thinking` | `gemma3:4b` | Leitura de screenshots, diagramas, interfaces e imagens |
| 🔎 Busca semântica e RAG | `embeddinggemma` | `embeddinggemma:300m-qat-q4_0` | Criar embeddings para pesquisa, materiais e base de conhecimento |

As classificações são recomendações de uso, não garantias de qualidade. Teste com exemplos reais do projeto antes de mudar o modelo padrão.

## 📦 Tamanho e contexto: escolha prática

| Modelo | Uso principal | Referência de tamanho | Contexto |
| --- | --- | --- | --- |
| `embeddinggemma:300m-qat-q4_0` | Embeddings em máquinas simples | ~239 MB | 2K |
| `qwen3:4b-thinking` | Raciocínio leve e tarefas rápidas | ~2,5 GB | depende da configuração |
| `gemma3:4b` | Texto e visão com consumo moderado | ~3,3 GB | 128K |
| `qwen3-vl:8b-thinking` | Visão e raciocínio multimodal | ~6,1 GB | depende da configuração |
| `devstral:24b` | Agente de programação | ~14 GB | 128K |
| `qwen3-coder:30b` | Programação e contexto longo | ~19 GB | 256K |

Os tamanhos são aproximados e variam conforme a quantização. Modelos maiores pedem mais RAM ou VRAM; por exemplo, o `qwen3-coder:480b` requer centenas de GB e não é uma escolha local comum.

## 🧑‍💻 Papéis do time de IA

Para manter o fluxo consistente, use esta divisão:

- **Tarefas repetitivas:** modelo pequeno, como `qwen3:4b-thinking`.
- **Código complexo:** `qwen3-coder:30b` ou `devstral:24b`.
- **Pesquisa visual:** `qwen3-vl:8b-thinking` ou `gemma3:4b`.
- **Pesquisa nos materiais do projeto:** `embeddinggemma` para encontrar conteúdo; um modelo de texto responde usando os trechos encontrados.
- **Decisão final, segurança e integração:** revisão humana e testes automatizados continuam obrigatórios.

Ollama suporta tool calling, então modelos que entendem ferramentas podem chamar funções e trabalhar em ciclos de agente. Mesmo assim, cada ferramenta deve validar entradas e limitar permissões antes de executar qualquer ação. Veja a [documentação de tool calling](https://docs.ollama.com/capabilities/tool-calling).

## 🔌 Integrações úteis

- **Codex:** a documentação recomenda contexto de pelo menos 64K para trabalhar bem com repositórios. Use um modelo com contexto amplo, como `qwen3-coder:30b`, quando o hardware permitir. [Guia Codex + Ollama](https://docs.ollama.com/integrations/codex)
- **OpenCode:** pode usar o Ollama como provider local e precisa de 64K ou mais de contexto para projetos maiores. [Guia OpenCode + Ollama](https://docs.ollama.com/integrations/opencode)
- **Windows:** o Ollama expõe a API local em `http://localhost:11434`; use `OLLAMA_MODELS` se os modelos precisarem ficar em outro disco. [Guia para Windows](https://docs.ollama.com/windows)

## ✅ Antes de instalar modelos

1. Verifique a RAM, VRAM e espaço livre em disco.
2. Instale o Ollama pelo instalador oficial.
3. Comece com um modelo pequeno e uma tarefa real do projeto.
4. Meça tempo de resposta, qualidade e consumo de memória.
5. Só então adicione um modelo maior para tarefas que realmente precisem dele.

Modelos locais ajudam a manter dados de desenvolvimento na máquina, mas não eliminam a necessidade de proteger chaves, revisar permissões e validar respostas antes de usar conteúdo com estudantes.

## 📚 Fontes oficiais consultadas

- [Índice da documentação do Ollama](https://docs.ollama.com/llms.txt)
- [Qwen3 Coder](https://ollama.com/library/qwen3-coder)
- [Devstral](https://ollama.com/library/devstral)
- [Qwen3](https://ollama.com/library/qwen3)
- [Qwen3 VL](https://ollama.com/library/qwen3-vl)
- [Gemma 3](https://ollama.com/library/gemma3)
- [EmbeddingGemma](https://ollama.com/library/embeddinggemma)
