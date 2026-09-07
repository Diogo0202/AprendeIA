# Imagem enxuta e reproduzível para a API no Railway.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependências vêm antes do código para aproveitar o cache do build.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# O Railway entrega a porta pela variável PORT; não exponha uma porta fixa.
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
