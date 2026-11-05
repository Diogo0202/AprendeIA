import AxeBuilder from '@axe-core/playwright';
import { writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
const screens = [
  'Login',
  'Signup',
  'ForgotPassword',
  'ResetPassword',
  'StudentProfile',
  'TeacherProfile',
  'AdminProfile',
];
test.setTimeout(120_000);
async function mount(page: Page, screen: string) {
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1', 'localhost'].includes(url.hostname)) return route.abort();
    if (url.pathname === '/src/lib/supabase.ts')
      return route.fulfill({
        contentType: 'text/javascript',
        body: 'export const supabase=null;export const isSupabaseConfigured=false;export const apiUrl="/isolated-api";export const turnstileSiteKey="";export async function accessToken(){return null}',
      });
    if (url.pathname.startsWith('/isolated-api'))
      return route.fulfill({ status: 503, json: { detail: 'Isolated accessibility harness' } });
    if (url.pathname === '/src/App.tsx') {
      const response = await route.fetch();
      return route.fulfill({
        response,
        body:
          (await response.text()) +
          '\nexport {Login,Signup,ForgotPassword,ResetPassword,StudentProfile,TeacherProfile,AdminProfile,initialProfile};',
      });
    }
    if (url.pathname === '/__accessibility__')
      return route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Auditoria isolada AprendeIA</title></head><body><div id="fixture"></div></body></html>',
      });
    return route.continue();
  });
  await page.goto('/__accessibility__');
  await page.evaluate(async (screen) => {
    const load = new Function('path', 'return import(path)') as (p: string) => Promise<any>;
    const refresh = await load('/@react-refresh');
    refresh.default.injectIntoGlobalHook(window);
    Object.assign(window, {
      $RefreshReg$: () => {},
      $RefreshSig$: () => (type: unknown) => type,
      __vite_plugin_react_preamble_installed__: true,
    });
    const React = (await load('/node_modules/.vite/deps/react.js')).default;
    const dom = await load('/node_modules/.vite/deps/react-dom_client.js');
    const { createRoot } = dom.default ?? dom;
    await load('/src/index.css');
    const app = await load('/src/App.tsx');
    const noop = () => {};
    const props = {
      onSubmit: (e: Event) => e.preventDefault(),
      onSignup: noop,
      onForgot: noop,
      onLogin: noop,
      message: '',
      loading: false,
      onLogout: noop,
      onProfileChange: noop,
      onChangePassword: noop,
      onPractice: noop,
      profile: { ...app.initialProfile, profileSetupComplete: true },
    };
    const component = React.createElement(app[screen], props);
    createRoot(document.getElementById('fixture')).render(
      screen.endsWith('Profile')
        ? component
        : React.createElement(
            'main',
            { className: 'page-shell' },
            React.createElement('section', { className: 'auth-card' }, component),
          ),
    );
  }, screen);
  await expect(page.locator('h1').first()).toBeVisible();
}
async function audit(page: Page, info: TestInfo, name: string) {
  // Theme changes animate backgrounds. Audit the settled state, not an intermediate frame.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
        .map((a) => a.finished.catch(() => {})),
    ),
  );
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  await info.attach(name, {
    body: JSON.stringify({ violations: result.violations, incomplete: result.incomplete }, null, 2),
    contentType: 'application/json',
  });
  return result.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
}
for (const screen of screens)
  test(`axe real component ${screen}`, async ({ page }, info) => {
    await mount(page, screen);
    const findings = [];
    for (const theme of ['light', 'dark'])
      for (const accent of ['wine', 'ocean', 'forest', 'amber']) {
        await page.evaluate(
          ({ theme, accent }) => {
            document.documentElement.dataset.theme = theme;
            document.documentElement.dataset.accent = accent;
          },
          { theme, accent },
        );
        findings.push(
          ...(await audit(page, info, `${screen}-${theme}-${accent}`)).map((v) => ({
            theme,
            accent,
            id: v.id,
            nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
          })),
        );
      }
    expect(findings).toEqual([]);
  });
test('computed contrast eight palettes', async ({ page }, info) => {
  await mount(page, 'Login');
  const rows = [];
  for (const theme of ['light', 'dark'])
    for (const accent of ['wine', 'ocean', 'forest', 'amber'])
      rows.push(
        await page.evaluate(
          ({ theme, accent }) => {
            document.documentElement.dataset.theme = theme;
            document.documentElement.dataset.accent = accent;
            const probe = document.createElement('span');
            document.body.append(probe);
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const context = canvas.getContext('2d')!;
            const rgb = (value: string) => {
              probe.style.color = value;
              context.fillStyle = getComputedStyle(probe).color;
              context.fillRect(0, 0, 1, 1);
              return Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3);
            };
            const lum = (c: number[]) =>
              c
                .map((v) => {
                  v /= 255;
                  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
                })
                .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
            const ratio = (a: string, b: string) => {
              const x = lum(rgb(a)),
                y = lum(rgb(b));
              return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
            };
            const samples = [];
            for (const fg of [
              '--ink',
              '--ink-soft',
              '--ink-muted',
              '--accent',
              '--accent-deep',
              '--accent-focus',
            ])
              for (const bg of ['--paper', '--canvas', '--control', '--accent-soft'])
                samples.push({
                  fg,
                  bg,
                  ratio: ratio(`var(${fg})`, `var(${bg})`),
                  minimum: fg === '--accent-focus' ? 3 : 4.5,
                });
            samples.push({
              fg: 'white',
              bg: '--accent-fill',
              ratio: ratio('white', 'var(--accent-fill)'),
              minimum: 4.5,
            });
            probe.remove();
            return { theme, accent, samples };
          },
          { theme, accent },
        ),
      );
  await info.attach('computed-contrast.json', {
    body: JSON.stringify(rows, null, 2),
    contentType: 'application/json',
  });
  await writeFile(info.outputPath('computed-contrast.json'), JSON.stringify(rows, null, 2));
  expect(
    rows.flatMap((r) =>
      r.samples
        .filter((s) => s.ratio < s.minimum)
        .map((s) => ({ ...s, theme: r.theme, accent: r.accent })),
    ),
  ).toEqual([]);
});
test('keyboard dialog Escape and restored focus', async ({ page }, info) => {
  await mount(page, 'Signup');
  const trigger = page.getByRole('button', { name: /Política de Privacidade/i }).first();
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Tab');
    expect(
      await dialog.evaluate(
        (el) => document.activeElement === document.body || el.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  expect(await audit(page, info, 'dialog-open')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
});
for (const screen of ['Login', 'Signup', 'StudentProfile', 'TeacherProfile', 'AdminProfile'])
  test(`reflow keyboard motion ${screen}`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 320, height: 800 });
    await mount(page, screen);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    for (let i = 0; i < 18; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement;
        const r = el.getBoundingClientRect();
        const hit = document.elementFromPoint(
          Math.min(innerWidth - 1, Math.max(0, r.x + r.width / 2)),
          Math.min(innerHeight - 1, Math.max(0, r.y + r.height / 2)),
        );
        return {
          tag: el.tagName,
          visible:
            r.width > 0 &&
            r.height > 0 &&
            r.right > 0 &&
            r.left < innerWidth &&
            r.bottom > 0 &&
            r.top < innerHeight,
          hit:
            !!hit && (el.contains(hit) || hit.contains(el) || !!el.closest('label')?.contains(hit)),
        };
      });
      if (focused.tag !== 'BODY') expect(focused).toMatchObject({ visible: true, hit: true });
    }
    // 1280x900 at 200% has a 640x450 CSS viewport. This verifies reflow,
    // without claiming native browser toolbar zoom or text rasterization coverage.
    await page.setViewportSize({ width: 640, height: 450 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`${screen}-200-percent.png`), fullPage: true });
  });

// Public documents use the real main.tsx, App and CookieConsent composition.
for (const path of ['/', '/sobre'])
  test(`public document cookies ${path}`, async ({ page }, info) => {
    const external: string[] = [];
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (!['127.0.0.1', 'localhost'].includes(url.hostname)) {
        external.push(url.origin);
        return route.abort();
      }
      if (url.pathname === '/src/lib/supabase.ts')
        return route.fulfill({
          contentType: 'text/javascript',
          body: 'export const supabase=null;export const isSupabaseConfigured=false;export const apiUrl="/isolated-api";export const turnstileSiteKey="";export async function accessToken(){return null}',
        });
      return route.continue();
    });
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo principal' });
    await expect(skip).toBeFocused();
    await expect(skip).toBeInViewport();
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    const findings = [];
    for (const theme of ['light', 'dark'])
      for (const accent of ['wine', 'ocean', 'forest', 'amber']) {
        await page.evaluate(
          ({ theme, accent }) => {
            document.documentElement.dataset.theme = theme;
            document.documentElement.dataset.accent = accent;
          },
          { theme, accent },
        );
        for (const state of ['banner', 'dialog']) {
          if (state === 'dialog') {
            await page.getByRole('button', { name: 'Personalizar', exact: true }).focus();
            await page.keyboard.press('Enter');
            await expect(page.getByRole('dialog')).toBeVisible();
          }
          findings.push(
            ...(
              await audit(
                page,
                info,
                `${path === '/' ? 'root' : 'sobre'}-${theme}-${accent}-${state}`,
              )
            ).map((v) => ({
              theme,
              accent,
              state,
              id: v.id,
              nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
            })),
          );
          if (state === 'dialog') {
            for (let i = 0; i < 9; i++) {
              await page.keyboard.press('Tab');
              expect(
                await page
                  .getByRole('dialog')
                  .evaluate(
                    (el) =>
                      document.activeElement === document.body ||
                      el.contains(document.activeElement),
                  ),
              ).toBe(true);
            }
            await page.keyboard.press('Escape');
            await expect(page.getByRole('dialog')).not.toBeVisible();
            await expect(
              page.getByRole('button', { name: 'Personalizar', exact: true }),
            ).toBeFocused();
          }
        }
      }
    await page.setViewportSize({ width: 320, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.getByRole('button', { name: 'Personalizar', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Salvar escolhas' })).toBeVisible();
    await page.getByRole('button', { name: 'Salvar escolhas' }).click();
    await expect(page.getByRole('region', { name: 'Aviso de cookies' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Preferências de cookies', exact: true }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('button', { name: 'Preferências de cookies', exact: true }),
    ).toBeFocused();
    expect(external).toEqual([]);
    expect(findings).toEqual([]);
  });

test('dock keyboard focus contrast and reduced motion', async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await mount(page, 'TeacherProfile');
  const button = page.locator('.app-dock-item').first();
  await button.focus();
  const style = await button.evaluate((el) => {
    const s = getComputedStyle(el);
    const glyph = getComputedStyle(el.querySelector('.app-dock-glyph')!);
    return {
      outline: s.outlineStyle,
      width: s.outlineWidth,
      color: s.outlineColor,
      transform: glyph.transform,
      transition: glyph.transitionDuration,
    };
  });
  expect(style.outline).toBe('solid');
  expect(parseFloat(style.width)).toBeGreaterThanOrEqual(3);
  expect(style.transform).toBe('none');
  expect(parseFloat(style.transition)).toBeLessThanOrEqual(0.00001);
  await page.keyboard.press('Tab');
  await expect(page.locator('.app-dock-item').nth(1)).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.app-dock-item').nth(1)).toHaveAttribute('aria-current', 'page');
  await info.attach('dock-computed-focus.json', {
    body: JSON.stringify(style, null, 2),
    contentType: 'application/json',
  });
});

for (const [screen, tabs] of [
  [
    'TeacherProfile',
    [
      'Turmas',
      'Relatórios',
      'Conteúdos',
      'Questões',
      'Mensagens',
      'Recomendação IA',
      'Termos e privacidade',
    ],
  ],
  [
    'AdminProfile',
    [
      'Desempenho',
      'Professores e turmas',
      'Usuários',
      'Atividades',
      'Mensagens',
      'Conteúdo',
      'Privacidade',
      'Termos e privacidade',
    ],
  ],
] as const) {
  test(`keyboard and axe secondary areas ${screen}`, async ({ page }, info) => {
    await mount(page, screen);
    const findings = [];
    for (const tab of tabs) {
      const control = page.locator('.app-dock').getByRole('button', { name: tab, exact: true });
      await control.focus();
      await page.keyboard.press('Enter');
      for (const theme of ['light', 'dark']) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value;
        }, theme);
        findings.push(
          ...(await audit(page, info, `${screen}-${tab}-${theme}`)).map((v) => ({
            tab,
            theme,
            id: v.id,
            nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
          })),
        );
      }
    }
    expect(findings).toEqual([]);
  });
}
