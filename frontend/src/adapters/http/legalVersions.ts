import { useSyncExternalStore } from 'react';

export type LegalDocument = { version: string; effective_at: string };
export type LegalDocumentsSnapshot = { privacy: LegalDocument; terms: LegalDocument };
let snapshot: LegalDocumentsSnapshot | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export const currentLegalDocuments = () => snapshot;
export const useCurrentLegalDocuments = () =>
  useSyncExternalStore(subscribe, currentLegalDocuments);

/** Só metadados validados entram na tela. A autorização final continua no banco. */
export function publishLegalDocuments(value: unknown) {
  const data = value as LegalDocumentsSnapshot;
  for (const kind of ['privacy', 'terms'] as const) {
    const doc = data?.[kind];
    if (
      !doc ||
      typeof doc.version !== 'string' ||
      !/^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/.test(doc.version) ||
      typeof doc.effective_at !== 'string' ||
      !Number.isFinite(Date.parse(doc.effective_at))
    ) {
      throw new Error('Versões legais indisponíveis.');
    }
  }
  snapshot = { privacy: { ...data.privacy }, terms: { ...data.terms } };
  listeners.forEach((listener) => listener());
}

export async function loadLegalDocuments(origin: string, fetcher: typeof fetch = fetch) {
  try {
    const response = await fetcher(`${origin}/legal/versions`, {
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error('Versões legais indisponíveis.');
    publishLegalDocuments(await response.json());
    return snapshot;
  } catch {
    snapshot = null;
    listeners.forEach((listener) => listener());
    return null;
  }
}

export function legalDocumentLabel(doc: LegalDocument | undefined) {
  if (!doc) return 'VERSÃO INDISPONÍVEL';
  const date = new Date(doc.effective_at).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  return `VERSÃO ${doc.version} · ${date}`;
}
