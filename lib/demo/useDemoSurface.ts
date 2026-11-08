// lib/demo/useDemoSurface.ts
//
// One line a page adds to become drivable by the kiosk.
//
// The handler map is kept in a ref and updated on every render, so an action
// always runs against the current state (a candidate chosen a frame ago) while
// the registration itself stays stable — registering and unregistering on
// every keystroke would leave the kiosk guessing whether the page is there.

"use client";

import { useEffect, useRef } from "react";
import {
  registerDemoSurface,
  type DemoAction,
  type DemoActionName,
  type DemoSurface,
} from "./bus";

type Handlers = Partial<Record<DemoActionName, (arg?: string | number) => unknown | Promise<unknown>>>;

export function useDemoSurface(surface: DemoSurface, handlers: Handlers): void {
  const current = useRef<Handlers>(handlers);
  current.current = handlers;

  useEffect(
    () =>
      registerDemoSurface(surface, (action: DemoAction) => {
        const handler = current.current[action.name];
        if (!handler) throw new Error(`${surface} does not expose "${action.name}".`);
        return handler(action.arg);
      }),
    [surface]
  );
}
