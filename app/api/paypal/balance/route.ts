// app/api/paypal/balance/route.ts
//
// The account's own figure, re-read on demand.
//
// The pages read it during their server render, which makes it correct the
// moment it appears and stale the moment anything settles. This is how the
// screen catches up after a capture, a release or an authorization — without
// reloading the page, and without the browser ever importing the module that
// holds the credentials.
//
// No rate limit of our own: this spends PayPal's quota rather than this
// project's credits, and it is called after an action rather than on a timer,
// so a runaway loop is not a shape this route has.

import { NextResponse } from "next/server";
import { getBalance } from "@/lib/paypal";

export async function GET() {
  const balance = await getBalance();
  return NextResponse.json(balance, {
    headers: {
      // Read on demand beside something that just moved money: a cached
      // answer would show the balance from before it moved.
      "Cache-Control": "no-store",
    },
  });
}
