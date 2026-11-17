import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalStorage = Object.getOwnPropertyDescriptor(window, 'localStorage');

describe('consentimento e limites dos rastreadores', () => {
  beforeEach(() => {
    vi.resetModules();
    const values = new Map<string, string>();
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    });
    document.querySelectorAll('[data-aprendeia-tracking]').forEach((script) => script.remove());
    window.history.replaceState(null, '', '/');
    window.__APP_CONFIG__ = {
      ENABLE_GA4: 'true',
      GA4_MEASUREMENT_ID: 'G-TEST123',
      GA4_PRIVACY_APPROVED: 'true',
      ENABLE_CLARITY: 'true',
      CLARITY_PROJECT_ID: 'test123',
      CLARITY_PRIVACY_APPROVED: 'true',
    };
  });
  afterEach(() => {
    vi.restoreAllMocks();
    if (originalStorage) Object.defineProperty(window, 'localStorage', originalStorage);
  });
  it('não carrega nada sem consentimento, identidade pública confirmada e página permitida', async () => {
    const t = await import('./tracking');
    t.verifyPublicGuest(true);
    t.loadOptionalTracking();
    expect(document.querySelectorAll('[data-aprendeia-tracking]')).toHaveLength(0);
    t.saveCookieConsent({ statistics: true, recording: true });
    expect(document.querySelectorAll('[data-aprendeia-tracking]')).toHaveLength(0);
    window.history.replaceState(null, '', '/sobre?token=privado');
    t.loadOptionalTracking();
    expect(document.querySelectorAll('[data-aprendeia-tracking]')).toHaveLength(0);
  });
  it('carrega categorias separadas e não inclui query ou referrer no payload GA4', async () => {
    const t = await import('./tracking');
    window.history.replaceState(null, '', '/sobre');
    t.verifyPublicGuest(true);
    t.saveCookieConsent({ statistics: true, recording: false });
    expect(document.querySelectorAll('[data-aprendeia-tracking="ga4"]')).toHaveLength(1);
    expect(document.querySelectorAll('[data-aprendeia-tracking="clarity"]')).toHaveLength(0);
    const config = Array.from(
      window.dataLayer!.find(
        (value) => Array.from(value as ArrayLike<unknown>)[0] === 'config',
      ) as ArrayLike<unknown>,
    );
    expect(config[2]).toMatchObject({
      send_page_view: false,
      cookie_expires: 604800,
      cookie_update: false,
      page_referrer: '',
    });
  });
  it('flag de fornecedor sem aprovação de retenção permanece bloqueada', async () => {
    window.__APP_CONFIG__!.GA4_PRIVACY_APPROVED = 'false';
    window.__APP_CONFIG__!.CLARITY_PRIVACY_APPROVED = 'false';
    const t = await import('./tracking');
    window.history.replaceState(null, '', '/sobre');
    t.verifyPublicGuest(true);
    t.saveCookieConsent({ statistics: true, recording: true });
    expect(document.querySelectorAll('[data-aprendeia-tracking]')).toHaveLength(0);
  });
  it('consentimento antigo, futuro, adulterado e vencido não libera medição', async () => {
    const t = await import('./tracking');
    const now = Date.now();
    for (const record of [
      null,
      { version: 'old' },
      { version: '1', statistics: 'true' },
      {
        version: '1',
        statistics: true,
        recording: true,
        saved_at: now + 100,
        expires_at: now + 100 + t.CONSENT_TTL_MS,
      },
      {
        version: '1',
        statistics: true,
        recording: true,
        saved_at: now - t.CONSENT_TTL_MS,
        expires_at: now,
      },
    ]) {
      window.localStorage.setItem(t.COOKIE_CONSENT_KEY, JSON.stringify(record));
      expect(t.readCookieConsent(now)).toBeNull();
    }
  });
  it('falha de armazenamento bloqueia aceitação sem carregar bibliotecas', async () => {
    const t = await import('./tracking');
    window.history.replaceState(null, '', '/sobre');
    t.verifyPublicGuest(true);
    const spy = vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(t.saveCookieConsent({ statistics: true, recording: true })).toBe(false);
    expect(document.querySelectorAll('[data-aprendeia-tracking]')).toHaveLength(0);
    spy.mockRestore();
  });
});
