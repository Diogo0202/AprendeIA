/** Raiz de composição da interface: escolhe os adaptadores que atendem às portas. */
import { createHttpGateways } from './adapters/http/gateways';
import { createSupabaseSession } from './adapters/supabase/session';
import type { Gateways } from './application/ports';

export function createGateways(): Gateways {
  return { ...createHttpGateways(), session: createSupabaseSession() };
}
