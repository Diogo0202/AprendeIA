import { describe, expect, it } from 'vitest';
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
