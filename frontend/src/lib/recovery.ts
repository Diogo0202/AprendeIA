/** Remove credenciais da barra de endereço após a biblioteca ler o retorno do Auth. */
export function clearAuthCallbackUrl() {
  const url = new URL(window.location.href);
  for (const key of [
    'code',
    'token',
    'token_hash',
    'access_token',
    'refresh_token',
    'type',
    'error',
    'error_code',
    'error_description',
  ]) {
    url.searchParams.delete(key);
  }
  url.hash = '';
  window.history.replaceState(null, '', `${url.pathname}${url.search}`);
}
