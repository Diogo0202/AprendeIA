import { describe, expect, it, vi } from 'vitest';
import {
  currentLegalDocuments,
  legalDocumentLabel,
  loadLegalDocuments,
  publishLegalDocuments,
} from './legalVersions';

describe('versões legais recebidas do servidor', () => {
  it('carrega nova versão sem fallback fixo e sem transmitir sessão', async () => {
    const documents = {
      privacy: { version: '1.8', effective_at: '2026-11-10T00:00:00Z' },
      terms: { version: '1.0', effective_at: '2026-11-04T00:00:00Z' },
    };
    const fetcher = vi.fn(async () => Response.json(documents));
    expect(await loadLegalDocuments('https://api.example', fetcher)).toEqual(documents);
    expect(currentLegalDocuments()?.privacy.version).toBe('1.8');
    expect(fetcher).toHaveBeenCalledWith(
      'https://api.example/legal/versions',
      expect.objectContaining({ credentials: 'omit', cache: 'no-store', redirect: 'error' }),
    );
    expect(legalDocumentLabel(documents.privacy)).toBe('VERSÃO 1.8 · 10/11/2026');
  });
  it('falha fecha a consulta em vez de voltar para a versão antiga', async () => {
    expect(
      await loadLegalDocuments(
        'https://api.example',
        vi.fn(async () => new Response('', { status: 503 })),
      ),
    ).toBeNull();
    expect(currentLegalDocuments()).toBeNull();
    expect(legalDocumentLabel(undefined)).toBe('VERSÃO INDISPONÍVEL');
  });
  it('recusa versões não canônicas e resposta parcial', () => {
    for (const value of [
      {},
      { privacy: { version: '01.8', effective_at: '2026-11-10T00:00:00Z' } },
    ]) {
      expect(() => publishLegalDocuments(value)).toThrow();
    }
  });
});
