// app/api/catalog/route.ts
// Product lookup proxy. Kept server-side so the demo-catalog origin stays out
// of the client bundle and repeated lookups share one upstream cache.
//
// The response carries `source` on purpose: every price shown in the UI can be
// traced to a named, documented origin rather than appearing from nowhere.
import { NextResponse } from "next/server";
import { searchCatalog, CATALOG_SOURCE } from "@/lib/commerce/catalog";
import { searchLocalCatalog } from "@/lib/commerce/localCatalog";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? "";

  if (!query.trim()) {
    return NextResponse.json({ error: "query_required" }, { status: 400 });
  }
  if (query.length > 80) {
    return NextResponse.json({ error: "query_too_long" }, { status: 400 });
  }

  const products = await searchCatalog(query);
  const local = searchLocalCatalog(query);

  return NextResponse.json(
    { products: [...products, ...local], source: CATALOG_SOURCE },
    {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
      },
    }
  );
}
