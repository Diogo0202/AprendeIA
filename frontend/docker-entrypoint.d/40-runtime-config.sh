#!/bin/sh
set -eu

# Só valores públicos entram neste arquivo. Chaves secretas nunca devem aparecer
# em um bundle do navegador; o ID do Clarity também não concede acesso ao painel.
escape_js() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' -e ':a;N;$!ba;s/\n/\\n/g'
}

cat > /usr/share/nginx/html/runtime-config.js <<EOF
window.__APP_CONFIG__ = Object.freeze({
  SUPABASE_URL: "$(escape_js "${VITE_SUPABASE_URL:-}")",
  SUPABASE_PUBLISHABLE_KEY: "$(escape_js "${VITE_SUPABASE_PUBLISHABLE_KEY:-}")",
  API_URL: "$(escape_js "${VITE_API_URL:-}")",
  ENABLE_CLARITY: "$(escape_js "${VITE_ENABLE_CLARITY:-false}")",
  CLARITY_PROJECT_ID: "$(escape_js "${VITE_CLARITY_PROJECT_ID:-}")",
  CLARITY_PRIVACY_APPROVED: "$(escape_js "${VITE_CLARITY_PRIVACY_APPROVED:-false}")",
  ENABLE_GA4: "$(escape_js "${VITE_ENABLE_GA4:-false}")",
  GA4_MEASUREMENT_ID: "$(escape_js "${VITE_GA4_MEASUREMENT_ID:-}")",
  GA4_PRIVACY_APPROVED: "$(escape_js "${VITE_GA4_PRIVACY_APPROVED:-false}")",
  TURNSTILE_SITE_KEY: "$(escape_js "${VITE_TURNSTILE_SITE_KEY:-}")"
});
EOF
