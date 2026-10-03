// app/(app)/fx/page.tsx
// Server entry for the FX Shield section. It reads the PayPal balance here so
// the credential-bearing module is never imported by client code; only the
// formatted string and a boolean cross the boundary.
import { getPYUSDBalance, hasRealPaypalCredentials } from "@/lib/paypal";
import FxShieldView from "./FxShieldView";

export const metadata = {
  title: "FX Shield · PayPal AI Agent Gateway",
};

export default async function FxShieldPage() {
  const balance = await getPYUSDBalance();

  return <FxShieldView initialBalance={balance} balanceIsLive={hasRealPaypalCredentials()} />;
}
