// app/api/store/route.ts
//
// The durable copy: two arrays, on disk, behind GET and PUT.
//
// Scope, stated up front because it is the first thing a reader should know:
// this is **not** a database and it is **not** protected by authentication.
// It holds what one browser would otherwise hold alone, at localhost, until
// persistence earns something stronger. Auth is on the roadmap before any
// public deployment, and saying so here means nobody has to discover it.
//
// What it is careful about is the two things a naive version of this endpoint
// would get wrong:
//
//   1. it refuses a payload that is not both arrays — because a missing
//      `blocked` sent as an empty list would overwrite the ledger of every
//      charge that was refused, which is the record PayPal never sees and the
//      one this product exists to keep;
//   2. it writes atomically — a half-written JSON file is a corrupted audit,
//      and the next read would not be able to tell corruption from emptiness.
//
// Both live in `lib/storeFile.ts` now: the manifest endpoint reads the same
// file, and one definition of where it is and how it is replaced is worth more
// than a route that owns its own copy.

import { NextRequest, NextResponse } from "next/server";
import { MAX_BLOCKED, MAX_POLICIES, normaliseSnapshot } from "@/lib/store";
import { readStoreFile, writeStoreFile } from "@/lib/storeFile";

/**
 * Largest body this endpoint will read.
 *
 * The array caps already bound what a well-formed payload holds; this bounds
 * what arrives *before* parsing it, which is the only place a size limit can
 * actually save the work it is meant to save.
 */
const MAX_BODY_CHARS = 1_000_000;

export async function GET() {
  const store = await readStoreFile();
  return NextResponse.json(store, {
    headers: {
      // This is a read of mutable local state, not a document: never cached,
      // or a browser would be handed the copy from before its last edit.
      "Cache-Control": "no-store",
    },
  });
}

export async function PUT(req: NextRequest) {
  try {
    const text = await req.text();

    if (text.length > MAX_BODY_CHARS) {
      return NextResponse.json(
        { success: false, error: "That is more than this store accepts." },
        { status: 413 }
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json({ success: false, error: "A JSON body is required." }, { status: 400 });
    }

    const snapshot = normaliseSnapshot(parsed);
    if (!snapshot) {
      return NextResponse.json(
        {
          success: false,
          error: `Both arrays are required: at most ${MAX_POLICIES} orders and ${MAX_BLOCKED} refused charges.`,
        },
        { status: 400 }
      );
    }

    await writeStoreFile(snapshot);

    return NextResponse.json({
      success: true,
      stored: { policies: snapshot.policies.length, blocked: snapshot.blocked.length },
    });
  } catch (error) {
    // Disk full or read-only: reported, not swallowed. The browser keeps its
    // own copy either way, so this is a durable copy that did not happen —
    // worth saying, never worth crashing a page over.
    console.error("[/api/store] could not write:", error);
    return NextResponse.json(
      { success: false, error: "The store could not be written on this machine." },
      { status: 500 }
    );
  }
}
