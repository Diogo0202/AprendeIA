import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const frontendRoot = resolve(import.meta.dirname, '..');

async function readJson(relativePath: string) {
  return JSON.parse(await readFile(resolve(frontendRoot, relativePath), 'utf8')) as {
    rewrites?: { source: string; destination: string }[];
    headers?: { source: string; headers: { key: string; value: string }[] }[];
  };
}

test('Vercel serves the SPA routes and does not proxy API requests', async () => {
  const config = await readJson('vercel.json');
  const spaRewrite = config.rewrites?.find(({ destination }) => destination === '/index.html');

  expect(spaRewrite).toBeTruthy();
  expect(spaRewrite?.source).toMatch(/\(\.\*\)/);
  expect(config.rewrites?.some(({ destination }) => destination.includes('railway.app'))).toBe(
    false,
  );
});

test('Vercel headers keep Turnstile available and optional tracking blocked', async () => {
  const config = await readJson('vercel.json');
  const policy = config.headers
    ?.flatMap(({ headers }) => headers)
    .find(({ key }) => key.toLowerCase() === 'content-security-policy')?.value;

  expect(policy).toBeTruthy();
  expect(policy).toContain("script-src 'self'");
  expect(policy).toContain('https://challenges.cloudflare.com');
  expect(policy).toContain('connect-src');
  expect(policy).toContain('https:');
  expect(policy).toContain('wss:');
  expect(policy).not.toMatch(/googletagmanager|clarity\.ms/i);
  expect(policy).toContain("frame-ancestors 'none'");
});

test('environment example contains only public frontend settings', async () => {
  const sample = await readFile(resolve(frontendRoot, '.env.example'), 'utf8');
  const keys = sample
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z0-9_]+)=/)?.[1])
    .filter((key): key is string => Boolean(key));

  expect(keys).toEqual(
    expect.arrayContaining([
      'VITE_API_URL',
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_PUBLISHABLE_KEY',
      'VITE_TURNSTILE_SITE_KEY',
    ]),
  );
  expect(keys.every((key) => key.startsWith('VITE_'))).toBe(true);
  expect(keys).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  expect(keys).not.toContain('SUPABASE_SECRET_KEY');
  expect(sample).toMatch(/VITE_API_URL=https:\/\/[^\s/]+/);
});
