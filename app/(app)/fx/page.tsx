// app/(app)/fx/page.tsx
// Server entry for the FX Shield section. It reads the PayPal balance here so
// the credential-bearing module is never imported by client code; only the
// formatted string, where it came from, and why — never a credential — cross
// the boundary.
import { getBalance } from "@/lib/paypal";
import FxShieldView from "./FxShieldView";

export const metadata = {
  title: "FX Shield · PayPal AI Agent Gateway",
};

export default async function FxShieldPage() {
  const balance = await getBalance();

  return (
    <FxShieldView
      initialBalance={balance.value}
      balanceCurrency={balance.currency}
      // Not "are credentials configured" — "did this figure actually come
      // from PayPal". Credentials present with a refused request still show
      // the demo number, and labelling that as live would assert the opposite.
      balanceIsLive={balance.source === "live"}
      balanceReason={balance.reason}
    />
  );
}
