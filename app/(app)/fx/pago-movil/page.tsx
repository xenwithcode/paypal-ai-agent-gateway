// app/(app)/fx/pago-movil/page.tsx
"use client";

import { Smartphone, ShieldAlert } from "lucide-react";
import EmptyState from "../../components/EmptyState";
import { useFxShield } from "../../hooks/useFxShield";

/**
 * Pago Móvil gets its own page because it is a Venezuela-specific subsystem
 * with its own rails. It is gated on the FX Shield switch, so the sidebar only
 * reveals it once the user opts in.
 */
export default function PagoMovilPage() {
  const { enabled, ready } = useFxShield();

  return (
    <>
      <header className="px-6 pt-8 md:px-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pago Móvil</h1>
        <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-slate-500">
          Send PYUSD and settle it into a Venezuelan bank account, or scan a merchant QR and pay
          from your digital dollars — in about two seconds.
        </p>
      </header>

      {/* Fixed minimum height so swapping state after mount cannot shift the page. */}
      <div className="min-h-[260px]">
        {!ready ? null : enabled ? (
          <EmptyState
            icon={Smartphone}
            title="No Pago Móvil transfers yet"
            description="Send to a phone number and national ID, or scan a merchant QR. Each transfer debits PYUSD and credits Bolívares at the rate shown on screen."
            action={{ label: "Send a transfer", disabled: true }}
            note="Transfers arrive in the next iteration — the form and the QR scanner both belong here."
          />
        ) : (
          <EmptyState
            icon={ShieldAlert}
            title="Pago Móvil needs FX Shield"
            description="Local payment rails are part of the optional FX module, so they stay hidden until you switch FX Shield on."
            action={{ label: "Open FX Shield", href: "/fx" }}
            note="You are seeing this only because the address was typed directly. The sidebar keeps the link hidden while FX Shield is off."
          />
        )}
      </div>
    </>
  );
}
