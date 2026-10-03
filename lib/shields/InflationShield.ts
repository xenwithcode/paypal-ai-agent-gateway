// lib/shields/InflationShield.ts
import { getPYUSDBalance } from "../paypal";
import { fetchFxSnapshot } from "../fx/providers";
import { convert, formatSmart, type FxSnapshot } from "../fx/rates";
import { STATUS, MODE } from "../policy";

interface DevaluationShieldConfig {
  userLocation: string;
  localCurrency: string;
  incomingAmountVES: number;
}

/**
 * Converts an incoming VES payroll deposit into PYUSD so the balance is not
 * eroded by inflation while it sits idle.
 *
 * Every number here comes from a live BCV publication — there is no hardcoded
 * rate in this module. If the feed is down the call fails loudly rather than
 * converting at a plausible-but-wrong figure.
 */
export async function processEmergencyDevaluationShield(config: DevaluationShieldConfig) {
  console.log(`🛡️ [Inflation Shield]: Enabling protection protocol for market: ${config.userLocation}`);

  // 1. Live FX snapshot (BCV official + intervention + CoinGecko).
  const rates: FxSnapshot = await fetchFxSnapshot();

  // 2. Convert through USD using the published rate.
  const protectedAmountPYUSD = convert(config.incomingAmountVES, "VES", "PYUSD", rates);
  const usdValue = convert(config.incomingAmountVES, "VES", "USD", rates);

  console.log(
    `📊 [Inflation Shield]: ${formatSmart(config.incomingAmountVES, "VES")} VES = ` +
      `${formatSmart(usdValue, "USD")} USD = ${formatSmart(protectedAmountPYUSD, "PYUSD")} PYUSD ` +
      `at ${formatSmart(rates.vesPerUsd, "VES")} VES/USD (BCV ${rates.vesPerUsdAsOf})`
  );

  // 3. Control balance read through the PayPal Server SDK.
  const currentBalance = await getPYUSDBalance();
  console.log(`💰 [Inflation Shield]: Balance before conversion: ${currentBalance} PYUSD`);

  // 4. Return the structured policy plus the rate provenance, so the UI can
  //    show which publication produced the number instead of asserting it.
  return {
    success: true,
    gridRow: {
      id: Date.now(),
      commerce: `FX Shield (${config.localCurrency} ──► PYUSD)`,
      limit: Number(protectedAmountPYUSD.toFixed(2)),
      currency: "PYUSD",
      // Must match MODE exactly, or the AG Grid select editor will not
      // recognise the value and shows an empty cell.
      mode: MODE.autonomous,
      expires: "Permanent",
      status: STATUS.protecting,
    },
    fx: {
      appliedRate: rates.vesPerUsd,
      rateUnit: "VES per USD",
      source: "BCV oficial (dolarvzla)",
      asOf: rates.vesPerUsdAsOf,
      interventionRate: rates.vesPerUsdIntervention ?? null,
      changePct: rates.vesChangePct ?? null,
      usdValue: Number(usdValue.toFixed(2)),
    },
    openShellConfig: {
      sandboxName: "sb-inflation-barrier",
      networkPolicy: {
        allowEndpoint: "api.bcv.org.ve", // Restricted to the official rate validator
        maxTransactionLimit: Number(protectedAmountPYUSD.toFixed(2)),
        tokenTarget: "PYUSD_SOLANA_GATEWAY", // Direct conversion to PayPal's stablecoin
      },
    },
  };
}
