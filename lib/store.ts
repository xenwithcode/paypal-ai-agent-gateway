// lib/store.ts
//
// The durable copy of what the browser is holding.
//
// Why this exists: the product's whole claim is that an audit survives — the
// README says a stopped payment "exists nowhere else", and the session notes
// recorded the contradiction that a ledger living in browser storage does not
// survive another browser, another tab after clearing storage, or a machine
// that is not this one. localStorage solves a refresh. It does not solve the
// record itself.
//
// The division of labour is deliberate and it is the other way round from what
// a server-first design would give you:
//
//   localStorage   the working copy — synchronous, instant, and still the truth
//   the server     the durable copy — what you come back to when the working
//                  copy is gone
//
// Every reader in the app keeps reading localStorage synchronously, exactly as
// it did before, so nothing here can regress a screen that already works. What
// changes is that a browser with an empty copy asks the server for one before
// it decides the table is empty, and every write reaches the server behind it.
//
// The rule for merging is therefore not a merge at all: pull when empty, push
// when not. Two browsers editing the same record at the same time is last
// write wins — stated here rather than left to be discovered, because a store
// that pretends to solve concurrency it does not solve is worse than one that
// says which trade-off it took.

/** The two records this store carries. Also read by lib/history.ts. */
export const POLICY_STORAGE_KEY = "paypal-ai-agent.policies.v1";
export const BLOCKED_STORAGE_KEY = "paypal-ai-agent.blocked.v1";

/**
 * Caps, in one place because both sides enforce them.
 *
 * A PUT is a body anyone who can reach the server may send, and "write this to
 * disk" is the least interesting thing that could be done with it. 500 orders
 * is many sessions of drafting; the blocked ledger is already capped at 50 by
 * `recordBlocked`, so a second cap here only stops a *server* copy from
 * growing past what the client would ever have written.
 */
export const MAX_POLICIES = 500;
export const MAX_BLOCKED = 50;

/** What the server holds, in its entirety. */
export type StoreSnapshot = {
  policies: unknown[];
  blocked: unknown[];
};

/**
 * Read a payload as a snapshot, or refuse it.
 *
 * Both arrays are required rather than defaulted. A payload missing `blocked`
 * that arrived as `{ blocked: [] }` would not be a partial update — it would
 * be an empty list overwriting the ledger of everything that was refused,
 * which is the single most valuable record in the product and the one PayPal
 * never sees. Refusing to read it is cheaper than being wrong about it.
 *
 * Exported because the route and the tests should ask the same question of the
 * same shape: one definition of what this store will hold.
 */
export function normaliseSnapshot(value: unknown): StoreSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const policies = raw.policies;
  const blocked = raw.blocked;
  if (!Array.isArray(policies) || !Array.isArray(blocked)) return null;
  if (policies.length > MAX_POLICIES || blocked.length > MAX_BLOCKED) return null;

  // Every entry has to be an object. A list of strings would reach the grid
  // as rows it cannot read — the grid drops what it does not recognise, but
  // the store should not be the thing feeding it that in the first place.
  if (policies.some((row) => !row || typeof row !== "object" || Array.isArray(row))) return null;
  if (blocked.some((row) => !row || typeof row !== "object" || Array.isArray(row))) return null;

  return { policies, blocked };
}

/** The two records as they stand in this browser right now. */
function localSnapshot(): StoreSnapshot | null {
  if (typeof window === "undefined") return null;
  const read = (key: string): unknown[] | null => {
    try {
      const text = window.localStorage.getItem(key);
      if (!text) return null;
      const parsed: unknown = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      // Corrupt or unreadable: treated as absent, which is what a reader
      // already does with it. Not a reason to stop the sync.
      return null;
    }
  };

  const policies = read(POLICY_STORAGE_KEY);
  const blocked = read(BLOCKED_STORAGE_KEY);
  if (!policies && !blocked) return null;
  return { policies: policies ?? [], blocked: blocked ?? [] };
}

const STORE_URL = "/api/store";
/** Long enough for a local file read, short enough not to hold the app. */
const REQUEST_TIMEOUT_MS = 2500;

let hydrating: Promise<boolean> | null = null;

/**
 * Make sure this browser has the server's copy before anything reads it.
 *
 * Returns whether it actually brought one back, because "there was nothing
 * here and nothing there" has to stay distinguishable from "there was
 * something there" — the table must not report restoring rows that were
 * really just the seeds, and the caller's own first write can put seeds into
 * storage while this request is in flight.
 *
 * Called by the views that read the store, and memoised, so it runs once
 * however many of them ask. The order matters: the views read synchronously in
 * their mount effects, so hydration has to finish *before* those reads — a
 * fetch started after them would land on a screen that had already decided the
 * table was empty.
 *
 * Deliberately does nothing when this browser already holds rows. That is the
 * ordinary case — a refresh, a return visit — and skipping the request keeps
 * it exactly as fast as it was before there was a server to ask; the caller is
 * never even put on the async path.
 *
 * Never rejects. Every path inside is caught, so a caller can chain `.then`
 * without the screen disappearing if the server is absent.
 *
 * Failure is not an event: the server being unreachable, or absent, or slow,
 * leaves the browser with whatever it already had, which for a returning user
 * is everything. The app must still open.
 */
export function ensureHydrated(): Promise<boolean> {
  if (hydrating) return hydrating;

  hydrating = (async () => {
    if (typeof window === "undefined") return false;
    const before = localSnapshot();

    // Already holding something: this browser is the authority for itself and
    // every write below will carry it to the server anyway.
    if (before && (before.policies.length > 0 || before.blocked.length > 0)) {
      void pushSnapshot(before);
      return false;
    }

    try {
      const res = await fetch(STORE_URL, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) return false;
      const remote = normaliseSnapshot(await res.json().catch(() => null));
      if (!remote || (remote.policies.length === 0 && remote.blocked.length === 0)) return false;

      // Re-read after the round trip. The check above ran before the request
      // went out, and anything written while it was in flight — an order
      // drafted in the seconds it took — is newer than what is arriving, and
      // overwriting it would discard the only copy.
      const now = localSnapshot();
      if (now && (now.policies.length > 0 || now.blocked.length > 0)) {
        void pushSnapshot(now);
        return false;
      }

      window.localStorage.setItem(POLICY_STORAGE_KEY, JSON.stringify(remote.policies));
      window.localStorage.setItem(BLOCKED_STORAGE_KEY, JSON.stringify(remote.blocked));
      return true;
    } catch {
      // The server did not answer. Nothing is lost — there was nothing here to
      // lose — and the app opens with the same empty state it would have had
      // before this module existed.
      return false;
    }
  })();

  return hydrating;
}

/** Send a snapshot now. Best effort, and never throws at its caller. */
async function pushSnapshot(snapshot: StoreSnapshot): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    await fetch(STORE_URL, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(snapshot),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    // localStorage already holds this — the server copy catching up is the
    // second-best outcome, not a failure the caller needs to hear about. It
    // is still logged, because a silent sync nobody can see is how a stale
    // copy gets believed.
    console.warn("[store] the durable copy did not accept this write:", error);
  }
}

let pushTimer: number | null = null;

/**
 * Send the current state to the server, shortly after the last write.
 *
 * Debounced because `lib/history.ts` writes on every edit, and an unbatched
 * PUT per keystroke of a ceiling would be a request storm aimed at a store
 * that holds two arrays. Coalescing means one PUT covers a whole burst of
 * changes; the cost is that closing the browser inside the delay skips it —
 * which costs nothing, because localStorage is already correct and the next
 * visit pushes it.
 */
export function pushToStore(delayMs = 400): void {
  if (typeof window === "undefined") return;
  if (pushTimer) window.clearTimeout(pushTimer);
  pushTimer = window.setTimeout(() => {
    pushTimer = null;
    const snapshot = localSnapshot();
    if (snapshot) void pushSnapshot(snapshot);
  }, delayMs);
}
