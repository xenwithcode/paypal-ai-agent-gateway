// app/api/paypal/transactions/route.ts
//
// The account's own record, read live, for the Activity page.
//
// GET rather than POST because nothing is being decided here — this is a
// read, and a read that can be repeated safely should be shaped like one.
// No rate limit of our own: the call spends PayPal's quota rather than this
// project's credits, and the page asks once per mount instead of polling.
//
// The answer keeps its provenance rather than being reduced to rows: an
// unconfigured account and a refused request both come back with a reason, so
// the page can say which one it hit instead of rendering an empty table that
// reads like "you have no transactions".

import { NextResponse } from "next/server";
import { getRecentTransactions } from "@/lib/paypal";

export async function GET() {
  const result = await getRecentTransactions();
  return NextResponse.json(result, {
    headers: {
      // Mutable state read on demand: a cached answer would show a balance
      // from before the last thing that moved it.
      "Cache-Control": "no-store",
    },
  });
}
