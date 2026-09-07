#!/bin/sh
set -eu

# Só valores públicos entram neste arquivo: URL da API, URL do Supabase e chave
# publishable. Chaves secretas nunca devem aparecer em um bundle do navegador.
escape_js() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a;N;$!ba;s/\n/\\n/g'
}

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__APP_CONFIG__ = Object.freeze({
  SUPABASE_URL: "$(escape_js "${VITE_SUPABASE_URL:-}")",
  SUPABASE_PUBLISHABLE_KEY: "$(escape_js "${VITE_SUPABASE_PUBLISHABLE_KEY:-}")",
  API_URL: "$(escape_js "${VITE_API_URL:-}")"
});
EOF
