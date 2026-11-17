/** Consentimento de opcionais. A sessão e os dados acadêmicos não passam por este módulo. */
export const COOKIE_CONSENT_KEY = 'aprendeia:cookie-consent';
export const COOKIE_CONSENT_VERSION = '1';
export const CONSENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export type CookieChoice = { statistics: boolean; recording: boolean };
export type CookieConsent = CookieChoice & {
  version: string;
  saved_at: number;
  expires_at: number;
};
const denied = { statistics: false, recording: false };
let guestVerified = false;
let gaLoaded = false;
let clarityLoaded = false;

function setting(key: string): string {
  const runtime = window.__APP_CONFIG__ as Record<string, string | undefined> | undefined;
  const build: Record<string, string | undefined> = {
    ENABLE_GA4: import.meta.env.VITE_ENABLE_GA4,
    GA4_MEASUREMENT_ID: import.meta.env.VITE_GA4_MEASUREMENT_ID,
    GA4_PRIVACY_APPROVED: import.meta.env.VITE_GA4_PRIVACY_APPROVED,
    ENABLE_CLARITY: import.meta.env.VITE_ENABLE_CLARITY,
    CLARITY_PROJECT_ID: import.meta.env.VITE_CLARITY_PROJECT_ID,
    CLARITY_PRIVACY_APPROVED: import.meta.env.VITE_CLARITY_PRIVACY_APPROVED,
  };
  return (runtime?.[key] ?? build[key] ?? '').trim();
}
export function trackingConfiguration() {
  return {
    gaId: setting('GA4_MEASUREMENT_ID'),
    clarityId: setting('CLARITY_PROJECT_ID'),
    statistics:
      setting('ENABLE_GA4') === 'true' &&
      setting('GA4_PRIVACY_APPROVED') === 'true' &&
      /^G-[A-Z0-9]+$/.test(setting('GA4_MEASUREMENT_ID')),
    recording:
      setting('ENABLE_CLARITY') === 'true' &&
      setting('CLARITY_PRIVACY_APPROVED') === 'true' &&
      /^[a-z0-9]+$/i.test(setting('CLARITY_PROJECT_ID')),
  };
}
export function readCookieConsent(now = Date.now()): CookieConsent | null {
  try {
    window.localStorage.removeItem('aprendeia:analytics-consent');
    const value = JSON.parse(window.localStorage.getItem(COOKIE_CONSENT_KEY) || 'null');
    if (
      !value ||
      value.version !== COOKIE_CONSENT_VERSION ||
      typeof value.statistics !== 'boolean' ||
      typeof value.recording !== 'boolean' ||
      !Number.isFinite(value.saved_at) ||
      !Number.isFinite(value.expires_at) ||
      value.saved_at > now ||
      value.expires_at <= now ||
      value.expires_at - value.saved_at !== CONSENT_TTL_MS
    ) {
      window.localStorage.removeItem(COOKIE_CONSENT_KEY);
      return null;
    }
    return value as CookieConsent;
  } catch {
    return null;
  }
}
export function publicTrackingPage(): boolean {
  return (
    window.location.pathname === '/sobre' &&
    !window.location.search &&
    !window.location.hash &&
    guestVerified
  );
}
export function verifyPublicGuest(isGuest: boolean) {
  guestVerified = isGuest;
  if (publicTrackingPage()) loadOptionalTracking();
  else if (gaLoaded || clarityLoaded) stopOptionalTracking();
}
export function clearOptionalCookies() {
  const config = trackingConfiguration();
  const ownGa = config.gaId.replace(/^G-/, '');
  const names = ['_ga', ...(ownGa ? [`_ga_${ownGa}`] : []), '_clck', '_clsk'];
  // Os provedores podem ter gravado no host ou no domínio pai. Não tocamos na sessão Supabase.
  const parts = window.location.hostname.split('.');
  const domains = [
    '',
    window.location.hostname,
    ...parts.slice(0, -1).map((_, i) => `.${parts.slice(i).join('.')}`),
  ];
  for (const name of names)
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${domain ? `; Domain=${domain}` : ''}`;
    }
}
export function cleanNavigation(path: '/' | '/sobre' = '/') {
  window.location.replace(path);
}
export function stopOptionalTracking(reload = true) {
  const config = trackingConfiguration();
  if (gaLoaded) {
    (window as unknown as Record<string, unknown>)[`ga-disable-${config.gaId}`] = true;
    window.gtag?.('consent', 'update', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  }
  if (clarityLoaded) window.clarity?.('consent', false);
  clearOptionalCookies();
  // Bibliotecas carregadas conservam listeners. Um documento novo encerra esses listeners.
  if (reload && (gaLoaded || clarityLoaded))
    cleanNavigation(window.location.pathname === '/sobre' ? '/sobre' : '/');
}
export function saveCookieConsent(choice: CookieChoice): boolean {
  const now = Date.now();
  const previous = readCookieConsent();
  try {
    window.localStorage.setItem(
      COOKIE_CONSENT_KEY,
      JSON.stringify({
        ...choice,
        version: COOKIE_CONSENT_VERSION,
        saved_at: now,
        expires_at: now + CONSENT_TTL_MS,
      }),
    );
    window.localStorage.removeItem('aprendeia:analytics-consent');
  } catch {
    stopOptionalTracking();
    return false;
  }
  const revoked =
    (previous?.statistics && !choice.statistics) || (previous?.recording && !choice.recording);
  if (revoked) stopOptionalTracking();
  else loadOptionalTracking();
  window.dispatchEvent(new Event('aprendeia:cookie-choice'));
  return true;
}
function script(src: string, vendor: string) {
  const element = document.createElement('script');
  element.async = true;
  element.src = src;
  element.referrerPolicy = 'no-referrer';
  element.dataset.aprendeiaTracking = vendor;
  document.head.appendChild(element);
}
export function loadOptionalTracking() {
  const consent = readCookieConsent();
  if (!publicTrackingPage() || !consent) return;
  const config = trackingConfiguration();
  if (consent.statistics && config.statistics && !gaLoaded) {
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer!.push(arguments);
    };
    window.gtag('consent', 'default', {
      analytics_storage: 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    window.gtag('consent', 'update', { analytics_storage: 'granted' });
    window.gtag('js', new Date());
    window.gtag('config', config.gaId, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      cookie_expires: 604800,
      cookie_update: false,
      cookie_flags: 'SameSite=Lax;Secure',
      page_location: `${window.location.origin}/sobre`,
      page_referrer: '',
      page_title: 'Sobre o AprendeIA',
    });
    window.gtag('event', 'page_view', {
      page_location: `${window.location.origin}/sobre`,
      page_referrer: '',
      page_title: 'Sobre o AprendeIA',
    });
    script(`https://www.googletagmanager.com/gtag/js?id=${config.gaId}`, 'ga4');
  }
  if (consent.recording && config.recording && !clarityLoaded) {
    clarityLoaded = true;
    window.clarity = Object.assign(
      (...args: unknown[]) => {
        window.clarity!.q!.push(args);
      },
      { q: [] as unknown[][] },
    );
    window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
    script(`https://www.clarity.ms/tag/${config.clarityId}`, 'clarity');
  }
}
export function watchCookieConsent(): () => void {
  let expiryTimer: number | undefined;
  function scheduleExpiry() {
    window.clearTimeout(expiryTimer);
    const consent = readCookieConsent();
    if (consent)
      expiryTimer = window.setTimeout(reconcile, Math.max(0, consent.expires_at - Date.now()));
  }
  function reconcile() {
    const consent = readCookieConsent();
    if (
      !publicTrackingPage() ||
      !consent ||
      (gaLoaded && !consent.statistics) ||
      (clarityLoaded && !consent.recording)
    )
      stopOptionalTracking();
    else loadOptionalTracking();
    scheduleExpiry();
    if (!consent) window.dispatchEvent(new Event('aprendeia:cookie-expired'));
  }
  function storage(event: StorageEvent) {
    if (event.key === COOKIE_CONSENT_KEY || event.key === null) reconcile();
  }
  window.addEventListener('storage', storage);
  window.addEventListener('focus', reconcile);
  window.addEventListener('aprendeia:cookie-choice', scheduleExpiry);
  window.addEventListener('hashchange', reconcile);
  window.addEventListener('popstate', reconcile);
  scheduleExpiry();
  const timer = window.setInterval(reconcile, 30000);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener('focus', reconcile);
    window.removeEventListener('aprendeia:cookie-choice', scheduleExpiry);
    window.removeEventListener('hashchange', reconcile);
    window.removeEventListener('popstate', reconcile);
    window.clearInterval(timer);
    window.clearTimeout(expiryTimer);
  };
}

export const deniedCookieChoice = denied;
