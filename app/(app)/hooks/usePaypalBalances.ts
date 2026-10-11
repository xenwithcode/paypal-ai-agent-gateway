// app/(app)/hooks/usePaypalBalances.ts
"use client";

import { useCallback, useRef, useState } from "react";

/** Structural, so no SDK type crosses into client code. */
type Entry = { currency: string; value: number };

/**
 * Every currency, kept honest after something moves it.
 *
 * The sibling of `usePaypalBalance`, and the reason it exists is the same
 * one: the figures are read on the server at render time, which makes them
 * correct when they appear and stale the moment a capture, a release or an
 * authorization happens later, in this browser.
 *
 * `refresh` answers *did anything move?* by comparing against what it last
 * saw, and simply does nothing when the answer is no — and nothing at all
 * when the request fails. The figures on screen were read from PayPal and are
 * still true; a refresh that could not run does not make them false, and
 * replacing them with an empty list would trade a stale truth for a fresh
 * lie.
 */
export function usePaypalBalances(initial: readonly Entry[]) {
  const [entries, setEntries] = useState<readonly Entry[]>(initial);
  const last = useRef(JSON.stringify(initial));

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch("/api/paypal/balances", { cache: "no-store" });
      if (!res.ok) return false;

      const next = (await res.json()) as unknown;
      if (!Array.isArray(next)) return false;

      const key = JSON.stringify(next);
      if (key === last.current) return false;
      last.current = key;
      setEntries(next as Entry[]);
      return true;
    } catch {
      return false;
    }
  }, []);

  return { entries, refresh };
}
