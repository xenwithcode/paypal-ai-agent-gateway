// lib/shields/InflationShield.ts
import { getPYUSDBalance } from "../paypal";
import { VES_PER_PYUSD, vesToPyusd } from "./fx";
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
 * This is the isolated, high-complexity module the API route delegates to.
 */
export async function processEmergencyDevaluationShield(config: DevaluationShieldConfig) {
  console.log(`🛡️ [Inflation Shield]: Enabling protection protocol for market: ${config.userLocation}`);

  // 1. FX lookup (BCV official / market feed in production).
  const protectedAmountPYUSD = vesToPyusd(config.incomingAmountVES);

  // 2. Control balance read through the PayPal Server SDK.
  const currentBalance = await getPYUSDBalance();
  console.log(
    `💰 [Inflation Shield]: Balance before conversion: ${currentBalance} PYUSD ` +
      `(+${protectedAmountPYUSD} PYUSD incoming at ${VES_PER_PYUSD} VES/PYUSD)`
  );

  // 3. Return the structured policy plus the gateway network directives.
  return {
    success: true,
    gridRow: {
      id: Date.now(),
      commerce: `FX Shield (${config.localCurrency} ──► PYUSD)`,
      limit: protectedAmountPYUSD,
      currency: "PYUSD",
      // Must match MODE exactly, or the AG Grid select editor will not
      // recognise the value and shows an empty cell.
      mode: MODE.autonomous, // Runs fully automatically to beat daily inflation
      expires: "Permanent",
      status: STATUS.protecting,
    },
    openShellConfig: {
      sandboxName: "sb-inflation-barrier",
      networkPolicy: {
        allowEndpoint: "api.bcv.org.ve", // Restricted to the official rate validator
        maxTransactionLimit: protectedAmountPYUSD,
        tokenTarget: "PYUSD_SOLANA_GATEWAY", // Direct conversion to PayPal's stablecoin
      },
    },
  };
}
