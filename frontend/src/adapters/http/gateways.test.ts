import { describe, expect, it } from 'vitest';
import { apiError } from './apiClient';
import { path } from './gateways';

describe('path', () => {
  it('codifica cada segmento interpolado', () => {
    expect(path`/privacy/requests/${'a/../b?x=1'}/cancel`).toBe(
      '/privacy/requests/a%2F..%2Fb%3Fx%3D1/cancel',
    );
    expect(path`/teacher/classes/${'c1'}/students/${'s 2'}`).toBe(
      '/teacher/classes/c1/students/s%202',
    );
  });
});

describe('apiError', () => {
  const respond = (body: unknown) => new Response(JSON.stringify(body), { status: 400 });

  it('usa o detail quando ele é texto', async () => {
    expect(await apiError(respond({ detail: 'Acesso negado.' }), 'padrão')).toBe('Acesso negado.');
  });

  it('cai no texto padrão quando o detail é lista, objeto ou ausente', async () => {
    expect(await apiError(respond({ detail: [{ msg: 'campo' }] }), 'padrão')).toBe('padrão');
    expect(await apiError(respond({ detail: { code: 'expired' } }), 'padrão')).toBe('padrão');
    expect(await apiError(new Response('não é json', { status: 500 }), 'padrão')).toBe('padrão');
  });
});
