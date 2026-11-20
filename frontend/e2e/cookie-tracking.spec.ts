import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  const requests: string[] = [];
  await page.addInitScript(() => {
    window.__APP_CONFIG__ = Object.freeze({
      ENABLE_GA4: 'true',
      GA4_MEASUREMENT_ID: 'G-TEST123',
      GA4_PRIVACY_APPROVED: 'true',
      ENABLE_CLARITY: 'true',
      CLARITY_PROJECT_ID: 'test123',
      CLARITY_PRIVACY_APPROVED: 'true',
    });
  });
  await page.route('**/runtime-config.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  );
  await page.route('https://www.googletagmanager.com/**', (route) => {
    requests.push('ga4');
    return route.fulfill({
      contentType: 'application/javascript',
      body: '/* fornecedor simulado */',
    });
  });
  await page.route('https://www.clarity.ms/**', (route) => {
    requests.push('clarity');
    return route.fulfill({
      contentType: 'application/javascript',
      body: '/* fornecedor simulado */',
    });
  });
  return requests;
}

test('sem escolha ou após recusa não carrega fornecedores', async ({ page }) => {
  const requests = await prepare(page);
  await page.goto('/sobre');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'AprendeIA: seu espaço de aprendizagem',
  );
  await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole('button', { name: 'Recusar opcionais', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Preferências de cookies' })).toBeVisible();
  expect(requests).toEqual([]);
});

test('escolhas independentes e documento de login sem rastreadores', async ({ page }) => {
  const requests = await prepare(page);
  await page.goto('/sobre');
  await page.getByRole('button', { name: 'Personalizar', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Preferências de cookies' });
  await dialog.getByLabel('Permitir estatísticas', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Salvar escolhas' }).click();
  await expect.poll(() => requests).toEqual(['ga4']);
  await page.getByRole('button', { name: 'Preferências de cookies' }).click();
  await dialog.getByLabel('Permitir gravação de sessão', { exact: true }).check();
  await dialog.getByRole('button', { name: 'Salvar escolhas' }).click();
  await expect.poll(() => requests).toEqual(['ga4', 'clarity']);
  await page.getByRole('link', { name: 'Entrar na plataforma' }).click();
  await expect(page.getByRole('heading', { name: 'Bem-vindo de volta' })).toBeVisible();
  expect(requests).toEqual(['ga4', 'clarity']);
  expect(await page.locator('[data-aprendeia-tracking]').count()).toBe(0);
  await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
  await expect(page.getByRole('heading', { name: 'Recuperar senha' })).toBeVisible();
  expect(requests).toHaveLength(2);
});

test('revogação recarrega documento limpo e preserva cookies necessários', async ({ page }) => {
  const requests = await prepare(page);
  await page.goto('/sobre');
  await page.getByRole('button', { name: 'Aceitar opcionais', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  // O salto de teclado não deve mudar o hash nem reiniciar os fornecedores.
  await page.getByRole('link', { name: 'Pular para o conteúdo principal' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  expect(new URL(page.url()).hash).toBe('');
  await page.evaluate(() => {
    document.cookie = '_ga=vendor; path=/';
    document.cookie = '_clck=vendor; path=/';
    document.cookie = 'necessary_test=keep; path=/';
  });
  await page.getByRole('button', { name: 'Preferências de cookies' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Recusar opcionais' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(() => page.locator('[data-aprendeia-tracking]').count()).toBe(0);
  const cookies = await page.evaluate(() => document.cookie);
  expect(cookies).toContain('necessary_test=keep');
  expect(cookies).not.toMatch(/_ga=|_clck=/);
  expect(requests).toHaveLength(2);
});

test('query sensível e consentimento vencido não liberam rastreamento', async ({ page }) => {
  const requests = await prepare(page);
  await page.addInitScript(() =>
    window.localStorage.setItem(
      'aprendeia:cookie-consent',
      JSON.stringify({
        version: '1',
        statistics: true,
        recording: true,
        saved_at: Date.now() - 8 * 86400000,
        expires_at: Date.now() - 86400000,
      }),
    ),
  );
  await page.goto('/sobre?code=valor-de-teste');
  await expect(page.getByRole('button', { name: 'Personalizar', exact: true })).toBeVisible();
  expect(requests).toEqual([]);
});

test('revogação em outra aba encerra bibliotecas já carregadas', async ({ page, context }) => {
  const requests = await prepare(page);
  await page.goto('/sobre');
  await page.getByRole('button', { name: 'Aceitar opcionais', exact: true }).click();
  await expect.poll(() => requests.length).toBe(2);
  const second = await context.newPage();
  await prepare(second);
  await second.goto('/sobre');
  await expect(second.locator('[data-aprendeia-tracking]')).toHaveCount(2);
  await page.getByRole('button', { name: 'Preferências de cookies' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Recusar opcionais' }).click();
  await expect.poll(() => second.locator('[data-aprendeia-tracking]').count()).toBe(0);
});
