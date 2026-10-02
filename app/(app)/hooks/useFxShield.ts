// app/(app)/hooks/useFxShield.ts
"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Shared state for the opt-in FX rail.
 *
 * Persisted in localStorage so the sidebar switch, the FX page and the
 * Pago Móvil page all agree without a server round-trip. Reads happen after
 * mount, so server render and first client render stay byte-identical.
 */
const STORAGE_KEY = "paypal-ai-fx-enabled";

export function useFxShield() {
  const [enabled, setEnabledState] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setEnabledState(window.localStorage.getItem(STORAGE_KEY) === "1");
    } catch {
      /* storage unavailable — default to off */
    }
    setReady(true);
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore write failures */
    }
  }, []);

  const toggle = useCallback(() => {
    setEnabledState((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  return { enabled, setEnabled, toggle, ready };
}
