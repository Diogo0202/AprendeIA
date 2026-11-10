import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { publishLegalDocuments } from '../lib/legalVersions';

// Fixture isolada: produção recebe estas versões exclusivamente da API.
beforeEach(() =>
  publishLegalDocuments({
    privacy: { version: '1.7', effective_at: '2026-11-09T00:00:00Z' },
    terms: { version: '1.0', effective_at: '2026-11-04T00:00:00Z' },
  }),
);
