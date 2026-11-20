import { describe, expect, it } from 'vitest';
import { clearAuthCallbackUrl } from './recovery';

describe('retorno do Auth', () => {
  it('remove tokens do fragmento e parâmetros de recuperação', () => {
    window.history.replaceState(
      null,
      '',
      '/?code=private-code&token_hash=private-token&demo=teacher#access_token=private-access',
    );
    clearAuthCallbackUrl();
    expect(window.location.search).toBe('?demo=teacher');
    expect(window.location.hash).toBe('');
  });

  it.each([
    '/?code=expired-code&error=access_denied&error_code=otp_expired&error_description=expired',
    '/?token_hash=reused-token&type=recovery&state=keep#access_token=old',
  ])('limpa o retorno de link expirado ou reutilizado: %s', (callbackUrl) => {
    window.history.replaceState(null, '', callbackUrl);
    clearAuthCallbackUrl();
    expect(window.location.search).toBe(callbackUrl.includes('state=keep') ? '?state=keep' : '');
    expect(window.location.hash).toBe('');
  });
});
