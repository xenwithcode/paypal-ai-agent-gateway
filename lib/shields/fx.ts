// lib/shields/fx.ts
// Single source of truth for the demo FX rate.
//
// ⚠️ DEMO VALUE. In production this must come from a live feed — the BCV
// official rate and/or a parallel-market feed — and be cached with a short
// TTL. Both the inflation shield and the Pago Móvil panel read it from here so
// the numbers shown across the app can never drift apart.
export const VES_PER_PYUSD = 40;

/** Convert VES to PYUSD using the shared demo rate. */
export function vesToPyusd(amountVES: number): number {
  return Number((amountVES / VES_PER_PYUSD).toFixed(2));
}

/** Convert PYUSD to VES using the shared demo rate. */
export function pyusdToVes(amountPYUSD: number): number {
  return Number((amountPYUSD * VES_PER_PYUSD).toFixed(2));
}
