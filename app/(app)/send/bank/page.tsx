// app/(app)/send/bank/page.tsx
"use client";

import { ShieldAlert } from "lucide-react";
import EmptyState from "../../components/EmptyState";
import { useFxShield } from "../../hooks/useFxShield";
import ExchangePanel from "../components/ExchangePanel";

/**
 * The local rail is gated on the FX Shield switch, exactly as its two links
 * are: it only makes sense where the currency is losing value, so it stays out
 * of the way for everyone else. Deep-linking here with the switch off explains
 * the gate rather than showing a broken page.
 */
export default function SendToBankPage() {
  const { enabled, ready } = useFxShield();

  // Nothing renders until storage has been read, so the gate cannot flash its
  // wrong state on first paint.
  if (!ready) return null;

  if (!enabled) {
    return (
      <EmptyState
        icon={ShieldAlert}
        title="This rail is part of the FX module"
        description="Exchanging with bolívares only matters where the currency is losing value, so it stays hidden until you switch FX Shield on."
        action={{ label: "Open FX Shield", href: "/fx" }}
        note="You are seeing this only because the address was typed directly. The sidebar keeps the link hidden while FX Shield is off."
      />
    );
  }

  return <ExchangePanel />;
}
