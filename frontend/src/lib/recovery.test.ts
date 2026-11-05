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
});
