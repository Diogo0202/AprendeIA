// Auditoria somente leitura. Não aceita cookies, não entra em contas nem envia formulários.
import { chromium } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const base = 'https://aprendeia-perfil-estudante.dig-mendes-baptista.chatgpt.site';
const browser = await chromium.launch({ headless: true });
try {
  for (const path of ['/', '/sobre']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    const hosts = new Set();
    page.on('request', request => { const url = new URL(request.url()); if (url.protocol === 'https:') hosts.add(url.hostname); });
    const response = await page.goto(base+path, { waitUntil: 'networkidle', timeout: 30000 });
    const scan = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
    console.log(JSON.stringify({ path, status: response?.status(), title: await page.title(),
      main_heading: await page.locator('h1').allTextContents(),
      cookie_preferences: await page.getByRole('button', { name: 'Preferências de cookies', exact: true }).count(),
      optional_scripts: await page.locator('script[src*="googletagmanager"],script[src*="clarity.ms"]').count(),
      request_hosts: [...hosts].sort(),
      cookies: (await context.cookies()).map(cookie => ({name:cookie.name,secure:cookie.secure,httpOnly:cookie.httpOnly})),
      violations: scan.violations.map(item => ({ id:item.id,impact:item.impact,count:item.nodes.length,reference:item.helpUrl })),
      incomplete_checks: scan.incomplete.map(item => ({id:item.id,count:item.nodes.length})),
    }));
    await context.close();
  }
} finally { await browser.close(); }
