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

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MAX_BLOCKED, MAX_POLICIES, normaliseSnapshot, type StoreSnapshot } from "@/lib/store";

/** Where the two arrays live. Inside the repo so a checkout starts empty. */
const STORE_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(STORE_DIR, "store.json");

/**
 * Largest body this endpoint will read.
 *
 * The array caps already bound what a well-formed payload holds; this bounds
 * what arrives *before* parsing it, which is the only place a size limit can
 * actually save the work it is meant to save.
 */
const MAX_BODY_CHARS = 1_000_000;

const EMPTY: StoreSnapshot = { policies: [], blocked: [] };

/**
 * Writes serialised through one chain.
 *
 * Two PUTs arriving together would otherwise interleave their read-modify-write
 * and the loser's file could be built from a state that has already gone. One
 * promise handed down the line costs nothing at this scale and removes the
 * question entirely.
 */
let writeChain: Promise<void> = Promise.resolve();

async function readStore(): Promise<StoreSnapshot> {
  try {
    const text = await fs.readFile(STORE_FILE, "utf8");
    // The same validation a PUT goes through: a file this process would have
    // refused to write is not one it should serve.
    return normaliseSnapshot(JSON.parse(text)) ?? EMPTY;
  } catch {
    // No file yet, unreadable, or malformed — all three mean "nothing stored",
    // and an absent record must never look like an error to the browser. It
    // would stop trying, and the next visit would look empty forever.
    return EMPTY;
  }
}

async function writeStore(snapshot: StoreSnapshot): Promise<void> {
  await fs.mkdir(STORE_DIR, { recursive: true });

  const temp = `${STORE_FILE}.${process.pid}.tmp`;
  const json = JSON.stringify(snapshot);

  await fs.writeFile(temp, json, "utf8");
  // Rename within the same directory is atomic on every platform this runs on,
  // so a reader sees either the old file or the new one — never a truncated one.
  await fs.rename(temp, STORE_FILE);
}

export async function GET() {
  const store = await readStore();
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

    const previous = writeChain;
    writeChain = previous.then(
      () => writeStore(snapshot),
      () => writeStore(snapshot)
    );
    await writeChain;

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
