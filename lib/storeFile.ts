// lib/storeFile.ts
//
// Reading and writing `data/store.json` — the durable copy, from the server.
//
// Split out of the store route because two routes now need the same file: the
// store itself, and the manifest endpoint a counterparty reads. One definition
// of where the file lives and how it is replaced, or the two drift and a
// manifest gets served from a path the writer is no longer using.
//
// Server only: this imports `node:fs`. Nothing a client component loads may
// reach it, and the only importers are route handlers.

import { promises as fs } from "node:fs";
import path from "node:path";
import { normaliseSnapshot, type StoreSnapshot } from "./store";

/** Where the two arrays live. Inside the repo so a checkout starts empty. */
const STORE_DIR = path.join(process.cwd(), "data");
const STORE_FILE = path.join(STORE_DIR, "store.json");

const EMPTY: StoreSnapshot = { policies: [], blocked: [] };

export async function readStoreFile(): Promise<StoreSnapshot> {
  try {
    const text = await fs.readFile(STORE_FILE, "utf8");
    // The same validation a PUT goes through: a file this process would have
    // refused to write is not one it should serve.
    return normaliseSnapshot(JSON.parse(text)) ?? EMPTY;
  } catch {
    // No file yet, unreadable, or malformed — all three mean "nothing stored",
    // and an absent record must never look like an error to whoever asked. It
    // would stop trying, and the next visit would look empty forever.
    return EMPTY;
  }
}

/**
 * Writes serialised through one chain.
 *
 * Two PUTs arriving together would otherwise interleave their read-modify-write
 * and the loser's file could be built from a state that has already gone. One
 * promise handed down the line costs nothing at this scale and removes the
 * question entirely.
 */
let writeChain: Promise<void> = Promise.resolve();

export async function writeStoreFile(snapshot: StoreSnapshot): Promise<void> {
  await fs.mkdir(STORE_DIR, { recursive: true });

  const temp = `${STORE_FILE}.${process.pid}.tmp`;
  const json = JSON.stringify(snapshot);

  const write = async (): Promise<void> => {
    await fs.writeFile(temp, json, "utf8");
    // Rename within the same directory is atomic on every platform this runs
    // on, so a reader sees either the old file or the new one — never a
    // truncated one.
    await fs.rename(temp, STORE_FILE);
  };

  const previous = writeChain;
  writeChain = previous.then(write, write);
  await writeChain;
}
