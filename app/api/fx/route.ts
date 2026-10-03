// app/api/fx/route.ts
// Live FX rates for the browser, proxied so CoinGecko's free-tier quota is
// spent once per cache window instead of once per visitor.
//
// `force-dynamic` keeps this out of the build: the page must never require
// network access to compile. Upstream caching lives on the fetches themselves
// (60s), so the handler runs cheaply on every request.
import { NextResponse } from "next/server";
import { fetchFxSnapshot, FxSourceUnavailable } from "@/lib/fx/providers";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await fetchFxSnapshot();
    return NextResponse.json(snapshot, {
      headers: {
        // Shared caches may serve it; browsers revalidate after 30s.
        "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    if (error instanceof FxSourceUnavailable) {
      // The BCV feed is the backbone of every VES conversion. Returning 503
      // with the reason beats serving a silently wrong rate.
      return NextResponse.json(
        { error: "fx_source_unavailable", detail: error.detail },
        { status: 503 }
      );
    }
    console.error("[/api/fx] Unexpected error:", error);
    return NextResponse.json({ error: "fx_internal_error" }, { status: 500 });
  }
}
