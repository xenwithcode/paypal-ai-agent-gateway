// app/(app)/overview/components/PayPalAuthorizeButton.tsx
"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The approval step, done in PayPal's own UI.
 *
 * Wired to the JS SDK v6 exactly as PayPal documents it: the SDK renders a
 * `<paypal-button>` web component, and on click the order is created by our
 * server — never by the browser, which is both PayPal's stated rule and the
 * architecture of this app. When the payer approves, the order is authorized
 * server-side and the hold becomes real.
 *
 * Everything here can fail: the script may not load, the buyer may be
 * ineligible, PayPal may refuse. Each of those reports upward so the card
 * falls back to its plain button rather than leaving a dead control.
 */

/** Sandbox. Production serves the same SDK from www.paypal.com. */
const SCRIPT_SRC = "https://www.sandbox.paypal.com/web-sdk/v6/core";

type AuthorizeResult = { orderId: string; authorizationId: string };

/** The part of `window.paypal` this integration uses, declared once. */
type PayPalSdk = {
  findEligibleMethods: () => Promise<{ isEligible: (method: string) => boolean }>;
  createPayPalOneTimePaymentSession: (callbacks: {
    onApprove: (data: { orderId?: string }) => void | Promise<void>;
    onCancel: (data?: unknown) => void;
    onError: (error: unknown) => void;
  }) => Promise<{
    start: (
      options: { presentationMode: string },
      order: Promise<{ orderId: string }>
    ) => Promise<void>;
  }>;
};

type PayPalGlobal = {
  paypal?: {
    createInstance: (args: {
      clientId: string;
      components: string[];
    }) => Promise<PayPalSdk>;
  };
};

type Props = {
  clientId: string;
  amount: string;
  currency: string;
  description: string;
  customId?: string;
  /**
   * The account the funds are directed to, written into the order as its
   * payee. Passed to the server on create — the browser never decides it,
   * and by the time PayPal sees it, it is already part of the order.
   */
  payeeEmail?: string;
  /** Runs after PayPal approved and we hold the authorization. */
  onAuthorized: (result: AuthorizeResult) => void | Promise<void>;
  /** The flow could not run — the caller switches back to its own button. */
  onUnavailable: (reason: string) => void;
  disabled?: boolean;
};

let scriptPromise: Promise<void> | null = null;

/** Loads the SDK once, however many buttons ask for it. */
function loadSdk(): Promise<void> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_SRC}"]`);
    if (existing) {
      if (existing.dataset.loaded === "true") {
        resolve();
        return;
      }
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("The PayPal SDK failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolve();
    };
    script.onerror = () => reject(new Error("The PayPal SDK failed to load."));
    document.body.appendChild(script);
  });

  return scriptPromise;
}

export default function PayPalAuthorizeButton({
  clientId,
  amount,
  currency,
  description,
  customId,
  payeeEmail,
  onAuthorized,
  onUnavailable,
  disabled = false,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");
  const [error, setError] = useState<string | null>(null);

  // Read by the SDK's callbacks, which are created once and would otherwise
  // keep the props of whichever render created them.
  const handlers = useRef({ onAuthorized, onUnavailable });
  useEffect(() => {
    handlers.current = { onAuthorized, onUnavailable };
  });

  useEffect(() => {
    if (!clientId) {
      setState("failed");
      handlers.current.onUnavailable("No PayPal client id is configured.");
      return;
    }

    // Captured now: the cleanup below must clear the node this effect was
    // given, not whatever `hostRef.current` happens to point at by then.
    const host = hostRef.current;
    let cancelled = false;

    const run = async () => {
      try {
        await loadSdk();
        if (cancelled) return;

        const paypal = (window as unknown as PayPalGlobal).paypal;
        if (!paypal?.createInstance) {
          throw new Error("The SDK did not expose window.paypal.createInstance.");
        }

        const sdk = await paypal.createInstance({ clientId, components: ["paypal-payments"] });
        if (cancelled) return;

        const eligibility = await sdk.findEligibleMethods();
        if (!eligibility.isEligible("paypal")) {
          throw new Error("PayPal is not available to this buyer.");
        }

        const createOrder = async (): Promise<{ orderId: string }> => {
          const res = await fetch("/api/paypal/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "create", amount, currency, description, customId, payeeEmail }),
          });
          const data = (await res.json()) as { success?: boolean; orderId?: string; error?: string };
          if (!data.success || !data.orderId) {
            throw new Error(data.error ?? "The order could not be created.");
          }
          return { orderId: data.orderId };
        };

        const onApprove = async (data: { orderId?: string }) => {
          if (!data.orderId) throw new Error("PayPal returned no order id.");
          const res = await fetch("/api/paypal/orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "authorize", orderId: data.orderId }),
          });
          const result = (await res.json()) as {
            success?: boolean;
            authorizationId?: string;
            error?: string;
          };
          if (!result.success || !result.authorizationId) {
            throw new Error(result.error ?? "The approval could not be authorized.");
          }
          await handlers.current.onAuthorized({
            orderId: data.orderId,
            authorizationId: result.authorizationId,
          });
        };

        const session = await sdk.createPayPalOneTimePaymentSession({
          onApprove,
          onCancel: () => handlers.current.onUnavailable("You declined the approval in PayPal."),
          onError: (err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
            handlers.current.onUnavailable(message);
          },
        });
        if (cancelled) return;

        const button = document.createElement("paypal-button");
        button.addEventListener("click", async () => {
          try {
            // Deliberately not awaited: PayPal's own sample notes that
            // awaiting it can cause transient activation issues.
            const orderPromise = createOrder();
            await session.start({ presentationMode: "auto" }, orderPromise);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            setError(message);
            handlers.current.onUnavailable(message);
          }
        });

        host?.appendChild(button);
        setState("ready");
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setState("failed");
        handlers.current.onUnavailable(message);
      }
    };

    void run();
    return () => {
      cancelled = true;
      host?.replaceChildren();
    };
    // Rebuilt when the order it will create changes, not on every render —
    // which is why the payee belongs here too: it is part of that order, and
    // a button holding a stale recipient would create one pointed elsewhere.
  }, [clientId, amount, currency, description, customId, payeeEmail]);

  if (state === "failed") return null;

  return (
    <div className="space-y-2">
      <div
        ref={hostRef}
        className={disabled ? "pointer-events-none opacity-50" : undefined}
        aria-live="polite"
      />
      {state === "loading" && (
        <p className="text-center text-[11px] text-slate-400">Loading PayPal…</p>
      )}
      {error && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[11px] text-amber-800">
          {error}
        </p>
      )}
    </div>
  );
}
