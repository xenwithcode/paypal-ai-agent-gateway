// app/(app)/hooks/usePaypalBalance.ts
"use client";

import { useCallback, useRef, useState } from "react";
// Type-only, so it is erased before the bundle is built: this file is
// client-side and `lib/paypal.ts` constructs a network client at module scope.
import type { Balance } from "@/lib/paypal";

/**
 * The account balance, kept honest after something moves it.
 *
 * The figure arrives with the page — read once, on the server, when it was
 * rendered. Correct when it appeared, and stale the moment anything settled,
 * because a capture happens later, in this browser, after the render is long
 * done. A balance that does not move when money does is worse than no balance
 * at all: it looks like the capture did nothing.
 *
 * `refresh` hands back the figure **only when it moved**, and null when it did
 * not. That is the answer rather than a failure: a caller asking "did this
 * change anything?" should get one line when it did and silence when it did
 * not, and putting that comparison in the caller would need the caller to hold
 * the previous value — which is state this hook already holds.
 *
 * Returning null also covers the failure case, deliberately. The figure on
 * screen was read from PayPal and is still true; a refresh that could not run
 * does not make it false, and replacing it with a demo number would trade a
 * stale truth for a fresh lie. So on failure nothing changes, and the caller
 * simply hears nothing.
 */
export function usePaypalBalance(initial: Balance) {
  const [balance, setBalance] = useState(initial);
  const last = useRef({ value: initial.value, currency: initial.currency });

  const refresh = useCallback(async (): Promise<Balance | null> => {
    try {
      const res = await fetch("/api/paypal/balance", { cache: "no-store" });
      if (!res.ok) return null;

      const next = (await res.json()) as Partial<Balance> | null;
      if (!next || next.source !== "live" || typeof next.value !== "string") return null;
      const figure = next as Balance;

      setBalance(figure);

      const moved = figure.value !== last.current.value || figure.currency !== last.current.currency;
      last.current = { value: figure.value, currency: figure.currency };
      return moved ? figure : null;
    } catch {
      // Unreachable, or the network went. What is on screen stays true.
      return null;
    }
  }, []);

  return { balance, refresh };
}
