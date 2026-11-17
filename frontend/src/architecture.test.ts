import { describe, expect, it } from 'vitest';

// O Vite entrega o texto de cada arquivo; assim o teste não depende de APIs do Node.
const sources = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const production = Object.entries(sources).filter(([path]) => !/\.test\.tsx?$/.test(path));

function offenders(inLayer: RegExp, forbidden: RegExp): string[] {
  return production
    .filter(([path, text]) => inLayer.test(path) && forbidden.test(text))
    .map(([path]) => path);
}

describe('camadas da interface', () => {
  it('o domínio não depende de aplicação, adaptadores nem telas', () => {
    expect(
      offenders(/^\.\/domain\//, /from\s+['"][^'"]*(application|adapters|components)\//),
    ).toEqual([]);
  });

  it('a aplicação conhece só o domínio', () => {
    expect(offenders(/^\.\/application\//, /from\s+['"][^'"]*(adapters|components)\//)).toEqual([]);
  });

  it('as telas falam com o servidor pelas portas, nunca pelo cliente HTTP', () => {
    const screens = /^\.\/(components\/|App\.tsx)/;
    expect(offenders(screens, /adapters\/http\/(apiClient|gateways)|\bfetch\(/)).toEqual([]);
  });
});
