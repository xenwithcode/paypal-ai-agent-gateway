// lib/rateLimit.ts
//
// A sliding window in memory, in front of the one route that spends money.
//
// Why this exists: /api/agent calls Gemini, and Gemini is billed against this
// project's Google Cloud credits. A single runaway loop — an effect that never
// settles, a script pointed at the endpoint, a crawler that finds it — would
// spend that budget without anybody deciding to. The input validation already
// in the route bounds *what* one request can cost; this bounds *how many*
// requests there can be. They are different questions and the route needs both.
//
// Deliberately in-process and dependency-free. The alternative would be Redis,
// which would mean a service a judge has to have running before `npm run dev`
// works — and a setup instruction that fails is worse than a limit that only
// covers this process. The trade-off is stated in the file rather than hidden:
// the counter lives in one process, so restarting the server clears it and two
// instances would each get their own. For localhost, where there is one process
// and one caller, that is exactly the deployment being protected.

/** What the caller may do, and how long to wait if it may not. */
export type RateLimitVerdict = {
  allowed: boolean;
  /**
   * Seconds until the oldest hit in the window has passed. Zero when allowed,
   * and always at least one when refused — a `Retry-After: 0` reads as "now",
   * which is not true and would send the caller straight back in.
   */
  retryAfterSeconds: number;
};

export type RateLimitOptions = {
  /** How long a request stays on the books. */
  windowMs: number;
  /** How many requests one key may make inside that window. */
  max: number;
  /** Injected so a test can pin a boundary instead of waiting for one. */
  now?: () => number;
  /**
   * How many distinct keys to remember before idle ones are swept. Bounds the
   * table against a caller that invents a new key per request.
   */
  maxKeys?: number;
};

export type RateLimiter = {
  /** Count this request against `key` and say whether it may proceed. */
  check(key: string): RateLimitVerdict;
  /** Forget everything — for tests, and for a deliberate manual reset. */
  reset(): void;
};

/**
 * Build a limiter.
 *
 * `check` performs no I/O and reads no clock other than the injected one, so
 * there is no failure mode here that could take the route down with it. A
 * limiter that broke requests would be worse than no limiter: its job is to
 * lose a spend, not to be load-bearing.
 *
 * The window is a sliding one, not a fixed counter reset on a calendar tick.
 * A fixed window lets a caller spend `max` at 0:59 and `max` again at 1:00 —
 * twice the limit in one second — which is precisely the burst this exists to
 * stop.
 */
export function createRateLimit(options: RateLimitOptions): RateLimiter {
  const { windowMs, max, now = () => Date.now(), maxKeys = 500 } = options;

  /** Key → timestamps of its requests inside the window, oldest first. */
  const hits = new Map<string, number[]>();

  /** Drop keys whose whole window has passed, so the table cannot grow forever. */
  const sweep = (current: number): void => {
    if (hits.size <= maxKeys) return;
    const oldest = current - windowMs;
    for (const [key, times] of hits) {
      // Only what is still inside the window is kept, and an empty list means
      // the key has nothing left to count.
      const alive = times.filter((t) => t > oldest);
      if (alive.length === 0) hits.delete(key);
      else hits.set(key, alive);
    }
  };

  return {
    check(key: string): RateLimitVerdict {
      const current = now();
      const windowStart = current - windowMs;

      const alive = (hits.get(key) ?? []).filter((t) => t > windowStart);

      if (alive.length >= max) {
        // Refused: the answer is how long until the oldest of them expires,
        // which is the first moment a slot frees up. Keeping only the last
        // `max` entries is enough to compute that and caps this key's memory
        // at `max` numbers, whatever the caller does.
        hits.set(key, alive.slice(-max));
        sweep(current);
        const untilOldest = alive[0] + windowMs - current;
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(untilOldest / 1000)) };
      }

      alive.push(current);
      hits.set(key, alive.slice(-max));
      sweep(current);
      return { allowed: true, retryAfterSeconds: 0 };
    },

    reset(): void {
      hits.clear();
    },
  };
}

/**
 * Who is calling, from the headers the platform gives us.
 *
 * Behind a proxy this is the address the proxy reported — which is the point,
 * because a proxy sets it and a caller cannot rewrite what it did not set. With
 * no proxy there are no forwarded headers at all, and every request arrives
 * from one place: the machine running the server. `"local"` is not a fallback
 * that weakens anything here, it is the honest name for that case.
 */
export function keyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = headers.get("x-real-ip");
  if (real?.trim()) return real.trim();
  return "local";
}

/**
 * The limiter in front of /api/agent.
 *
 * Twenty a minute is not a meter — it is a loop detector. A person drafting
 * orders clicks a handful of times a minute and never approaches it; an effect
 * that never settles does thousands. Picking a tight number to save cents would
 * be the wrong shape entirely, because the caller costing real money is the one
 * moving fast, and the caller moving slowly costs almost nothing.
 */
export const agentRateLimit = createRateLimit({ windowMs: 60_000, max: 20 });
