// app/(app)/send/pyusd/page.tsx
import { getBalance } from "@/lib/paypal";
import TransferPanel from "../components/TransferPanel";

// Same reason as the USD page: the figure shown beside a transfer is read
// when the page is opened, not when the build ran.
export const dynamic = "force-dynamic";

/**
 * The second rail: stablecoin, one to one with the dollar.
 *
 * Same shape as the dollar rail because the operation is the same — name a
 * recipient, set an amount, approve. What differs is the balance it draws
 * from and what arrives: PYUSD leaves as PYUSD and lands as PYUSD, with no
 * conversion anywhere in between, which is why it needs no rate and shows
 * none.
 *
 * Placed after USD on purpose. The stablecoin is the interesting variant;
 * the dollar is what a reader expects to find first.
 */
export default async function SendPyusdPage() {
  const balance = await getBalance();
  const paypalClientId = process.env.PAYPAL_CLIENT_ID ?? "";

  return (
    <TransferPanel currency="PYUSD" balance={balance} paypalClientId={paypalClientId} />
  );
}
