"""Ponto de entrada da API do AprendeIA.

O backend concentra operações que exigem confiança, como validar sessões,
administrar usuários, chamar a OpenAI e gravar resultados com privilégios de
servidor. O frontend usa apenas a chave publicável do Supabase.

A aplicação é montada em ``aprendeia.bootstrap``; este módulo existe para o
servidor localizar ``main:app``.
"""

from aprendeia.bootstrap import create_app

app = create_app()
