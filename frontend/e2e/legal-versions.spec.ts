import { expect, test } from '@playwright/test';

async function isolate(page: import('@playwright/test').Page, status = 200) {
  await page.route('**/src/lib/supabase.ts', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export const supabase=null; export const isSupabaseConfigured=false; export const apiUrl="/isolated-api"; export const turnstileSiteKey=""; export async function accessToken(){return null}',
    }),
  );
  await page.route('**/legal/versions', (route) => {
    expect(route.request().headers().authorization).toBeUndefined();
    return route.fulfill({
      status,
      json: {
        privacy: { version: '1.8', effective_at: '2026-11-10T00:00:00Z' },
        terms: { version: '1.1', effective_at: '2026-11-10T00:00:00Z' },
      },
    });
  });
}

test('documentos mostram versões da API sem novo build', async ({ page }) => {
  await isolate(page);
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Consultar a Política de Privacidade', exact: true })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toContainText('VERSÃO 1.8 · 10/11/2026');
  await expect(page.getByRole('dialog')).toContainText('Termos de Uso permanece na versão 1.1');
});

test('falha da fonte não apresenta versão local como vigente', async ({ page }) => {
  await isolate(page, 503);
  await page.goto('/');
  await page
    .getByRole('button', { name: 'Consultar a Política de Privacidade', exact: true })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toContainText('VERSÃO INDISPONÍVEL');
});
