// app/api/paypal/balances/route.ts
//
// Every currency the account holds, re-read on demand.
//
// The sibling of `/api/paypal/balance`, and for the same reason: the figures
// arrive with the page — read once, on the server — and are correct the
// moment they appear and stale the moment anything settles. The position card
// on Overview leads with what is free, and a capture moves that figure; a
// card that does not move when money does is worse than no card at all.
//
// No rate limit of our own, like its sibling: this spends PayPal's quota
// rather than this project's credits, and it is called after an action rather
// than on a timer, so a runaway loop is not a shape this route has.

import { NextResponse } from "next/server";
import { getAllBalances } from "@/lib/paypal";

export async function GET() {
  const balances = await getAllBalances();
  return NextResponse.json(balances, {
    headers: {
      // Read on demand beside something that just moved money: a cached
      // answer would show the balance from before it moved.
      "Cache-Control": "no-store",
    },
  });
}
