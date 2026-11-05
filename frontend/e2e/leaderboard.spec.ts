import { expect, test, type Page } from '@playwright/test';

const classId = '10000000-0000-0000-0000-000000000001';
const entry = {
  alias: 'Cometa',
  avatar_key: 'spark',
  weekly_xp: 80,
  level: 2,
  rank: 1,
  is_me: true,
};
const ranking = {
  entries: [entry, { ...entry, alias: 'Prisma', avatar_key: 'prism', is_me: false }],
  my_position: entry,
  total: 21,
  page: 1,
  page_size: 20,
  week_start: '2026-11-02',
  week_end: '2026-11-08',
  classes: [{ id: classId, name: 'Turma A' }],
  school_opt_in: false,
  alias: 'Cometa',
};

// An intercepted document mounts real Vite modules; no fixture enters the production bundle.
async function mount(page: Page, teacher = false) {
  await page.route('**/src/lib/supabase.ts*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'export const apiUrl = "/api"; export async function accessToken() { return null; }',
    }),
  );
  await page.route('**/__leaderboard_component_test__', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html lang="pt-BR"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ranking componente</title><body><main id="fixture"></main></body></html>',
    }),
  );
  await page.goto('/__leaderboard_component_test__');
  await page.evaluate(
    async ({ classId, teacher }) => {
      // String-based imports are resolved by Vite in the browser, independently of Node's resolver.
      const load = new Function('path', 'return import(path)') as (path: string) => Promise<any>;
      const refresh = await load('/@react-refresh');
      refresh.default.injectIntoGlobalHook(window);
      (window as any).$RefreshReg$ = () => {};
      (window as any).$RefreshSig$ = () => (type: unknown) => type;
      (window as any).__vite_plugin_react_preamble_installed__ = true;
      const reactModule = await load('/node_modules/.vite/deps/react.js');
      const React = reactModule.default ?? reactModule;
      const domModule = await load('/node_modules/.vite/deps/react-dom_client.js');
      const { createRoot } = domModule.default ?? domModule;
      const { Leaderboard } = await load('/src/components/student/Leaderboard.tsx');
      const { GamificationAchievements } = await load(
        '/src/components/student/GamificationAchievements.tsx',
      );
      createRoot(document.getElementById('fixture')).render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(
            Leaderboard,
            teacher ? { teacherClassId: classId } : { initialClassId: classId },
          ),
          React.createElement(GamificationAchievements),
        ),
      );
    },
    { classId, teacher },
  );
}

test.beforeEach(async ({ page }) => {
  await page.route('**/api/student/gamification', (route) =>
    route.fulfill({
      json: {
        points: 120,
        weekly_xp: 80,
        bonus_xp: 10,
        achievements: [
          {
            id: 'diagnostic_completed',
            title: 'Diagnóstico concluído',
            description: 'Conclua o diagnóstico.',
            icon: 'medal',
            unlocked: true,
            bonus_xp: 10,
            progress: 1,
            target: 1,
          },
        ],
        catalog: [
          {
            id: 'subject_explorer',
            title: 'Explorador',
            description: 'Estude disciplinas diferentes.',
            icon: 'book',
            unlocked: false,
            bonus_xp: 20,
            progress: 1,
            target: 5,
          },
        ],
      },
    }),
  );
});

test('real connected component: keyboard, school opt-in, alias, pagination and mobile layout', async ({
  page,
}, testInfo) => {
  let optedIn = false;
  let alias = 'Cometa';
  await page.route('**/api/student/leaderboard-preferences', async (route) => {
    const body = route.request().postDataJSON();
    expect(route.request().method()).toBe('PUT');
    optedIn = body.school_opt_in;
    alias = body.alias;
    await route.fulfill({ status: 204 });
  });
  await page.route('**/api/student/leaderboard?**', (route) => {
    const query = new URL(route.request().url()).searchParams;
    const second = query.get('page') === '2';
    return route.fulfill({
      json: {
        ...ranking,
        alias,
        school_opt_in: optedIn,
        page: second ? 2 : 1,
        entries: second ? [{ ...entry, alias: 'Livros', rank: 21, is_me: false }] : ranking.entries,
        email: 'private@example.test',
        student_id: 'private-id',
      },
    });
  });
  await mount(page);
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByLabel('Pódio semanal').getByText('1º lugar')).toHaveCount(2);
  await expect(page.getByText('Desbloqueada', { exact: true })).toBeVisible();
  await expect(page.getByRole('progressbar', { name: 'Progresso de Explorador' })).toHaveAttribute(
    'value',
    '1',
  );
  await page.getByRole('button', { name: 'Próxima' }).click();
  await expect(page.getByText('Página 2 de 2')).toBeVisible();
  await expect(page.getByLabel('Sua posição')).toContainText('Cometa');
  await page.getByRole('tab', { name: 'Turma', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Escola', exact: true })).toBeFocused();
  await expect(page.getByText(/Ative a participação/)).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByLabel('Apelido público').fill('Astro');
  await page.getByRole('checkbox').check();
  await expect(page.getByRole('table')).toHaveCount(0);
  await page.getByRole('button', { name: 'Salvar preferências' }).click();
  await expect(page.getByRole('table')).toBeVisible();
  expect(await page.locator('body').innerHTML()).not.toMatch(/private@example|private-id/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({ path: testInfo.outputPath('ranking-conquistas.png'), fullPage: true });
});

test('denied access exposes no entries or preference controls', async ({ page }) => {
  await page.route('**/api/student/leaderboard?**', (route) =>
    route.fulfill({ status: 403, json: { detail: 'private@example.test' } }),
  );
  await mount(page);
  await expect(page.getByRole('alert')).toContainText('Não foi possível carregar o ranking.');
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Salvar preferências' })).toHaveCount(0);
  expect(await page.locator('body').innerHTML()).not.toContain('private@example.test');
});

test('teacher sees only class ranking without student preferences', async ({ page }) => {
  await page.route(`**/api/teacher/classes/${classId}/leaderboard?**`, (route) =>
    route.fulfill({ json: ranking }),
  );
  await mount(page, true);
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('form')).toHaveCount(0);
  await expect(page.getByLabel('Sua posição')).toHaveCount(0);
});
