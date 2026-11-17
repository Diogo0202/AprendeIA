import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { publishLegalDocuments } from '../adapters/http/legalVersions';
import { provideGateways } from '../application/gateways';

// Os testes usam o adaptador real e simulam só o cliente HTTP abaixo dele. O
// import tardio deixa cada arquivo registrar seus vi.mock antes de o adaptador carregar.
beforeEach(async () => {
  const { createHttpGateways } = await import('../adapters/http/gateways');
  provideGateways(createHttpGateways());
});

// Fixture isolada: produção recebe estas versões exclusivamente da API.
beforeEach(() =>
  publishLegalDocuments({
    privacy: { version: '1.7', effective_at: '2026-11-09T00:00:00Z' },
    terms: { version: '1.0', effective_at: '2026-11-04T00:00:00Z' },
  }),
);
