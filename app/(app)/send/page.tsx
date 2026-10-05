// app/(app)/send/page.tsx
import { getBalance } from "@/lib/paypal";
import TransferPanel from "./components/TransferPanel";

// Forces Next.js to read the balance from the PayPal SDK on every request —
// a cached figure would outlive the transfer it is being shown beside.
export const dynamic = "force-dynamic";

/**
 * The first rail: dollars, the currency PayPal actually settles in.
 *
 * It used to be an empty state promising a PYUSD transfer that was not built,
 * which put the one working rail — the Venezuelan one, behind an opt-in switch
 * — in the position of being the section's only real surface. This is the
 * general case, and Venezuela is the reason it matters rather than the
 * product itself.
 */
export default async function SendUsdPage() {
  const balance = await getBalance();
  const paypalClientId = process.env.PAYPAL_CLIENT_ID ?? "";

  return (
    <TransferPanel currency="USD" balance={balance} paypalClientId={paypalClientId} />
  );
}
