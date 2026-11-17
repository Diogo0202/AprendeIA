import type { Gateways } from './ports';

let provided: Gateways | null = null;

/** Chamado uma vez na inicialização (e na preparação dos testes) para ligar os adaptadores. */
export function provideGateways(gateways: Gateways) {
  provided = gateways;
}

/** Entrega as portas às telas; falhar cedo evita uma tela sem servidor passar despercebida. */
export function gateways(): Gateways {
  if (!provided) throw new Error('Gateways não configurados.');
  return provided;
}

/** Atalho para a pergunta mais comum das telas: há servidor ou é demonstração? */
export function isConnected(): boolean {
  return gateways().session.connected();
}
