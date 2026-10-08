// app/api/recurring/plans/route.ts
// The billing plans this PayPal account already has, read live.
//
// Proxied for the same reason `/api/fx` is: the credentials are server-side
// only, and one plan list per cache window is enough for a screen nobody
// refreshes in a loop. `force-dynamic` keeps it out of the build — a page
// must never need network access to compile.
//
// The answer keeps its provenance. `source: "live"` with an empty list means
// PayPal was asked and had nothing; `source: "unavailable"` means PayPal was
// not asked or refused. The screen renders those as two different sentences,
// because only one of them says the account has no plans.
import { NextResponse } from "next/server";
import { getPlans } from "@/lib/paypal";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await getPlans();
    return NextResponse.json(result, {
      headers: {
        // Shared caches may serve it; browsers revalidate after 15s.
        "Cache-Control": "public, max-age=15, s-maxage=60, stale-while-revalidate=120",
      },
    });
  } catch (error) {
    // `getPlans()` is written not to throw, so reaching this is a bug in it
    // rather than an answer from PayPal — say so distinctly instead of
    // passing the failure off as an empty account.
    console.error("[/api/recurring/plans] Unexpected error:", error);
    return NextResponse.json(
      {
        plans: [],
        source: "unavailable",
        reason: "The plans service failed. This is a bug, not an empty account.",
        total: null,
      },
      { status: 500 }
    );
  }
}
