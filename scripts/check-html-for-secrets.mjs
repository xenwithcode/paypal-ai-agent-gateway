// scripts/check-html-for-secrets.mjs
//
// The last gate before the repository goes public: read the pages the way a
// browser would, from a *production* build, and fail if anything that should
// never be in a response is there.
//
// Why this exists rather than a note in the README: the claim "secrets stay
// server-side" is exactly the kind of claim that is true when written and
// quietly false three commits later. A check that runs against the built app
// turns it from a promise into a fact — and it is the check that found the
// answer to the old red item: a PayPal token in the served HTML was a
// *development-only* artefact of Next's RSC instrumentation, and this script
// is what proves it does not reach production.
//
// Two ways of finding a leak, and both are used:
//
//  1. Every real secret is read out of `.env.local` and searched for by
//     value — no pattern guessing, no false confidence from a regex that
//     happens not to match.
//  2. Patterns for what a leak looks like regardless of whose secret it is
//     (`Bearer `, the `A21` token prefix, the sandbox host, Google's `AIza`).
//
// Zero dependencies, because a judge who clones the repo has to be able to
// run it with the toolchain the README already asks for.
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

const ROOT = process.cwd();
const PAGES = ["/", "/overview", "/send", "/fx", "/activity", "/recurring", "/commerce", "/crowdfunding"];
const STARTUP_TIMEOUT_MS = 60_000;

/** Secret values that must never appear in a response, by value. */
function realSecrets() {
  const file = join(ROOT, ".env.local");
  if (!existsSync(file)) return [];

  const secrets = [];
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (!match) continue;
    const [, key, raw] = match;
    // Anything the vendor documents as shipping in the client bundle is not a
    // secret by definition — AG Grid's licence keys are the only ones here.
    if (key.startsWith("NEXT_PUBLIC_")) continue;
    const value = raw.replace(/^["']|["']$/g, "");
    // Placeholders from env.example are not values; a short value would match
    // random text and turn this check into noise.
    if (value.length < 16 || /^your_/i.test(value)) continue;
    secrets.push({ key, value });
  }
  return secrets;
}

/**
 * Values that reach the browser on purpose, and are not secrets for it.
 *
 * `PAYPAL_CLIENT_ID` identifies the application to PayPal's JS SDK — the same
 * way a Stripe publishable key does — and every PayPal checkout button on the
 * web ships it in the page. `GCP_PROJECT` is a name, not a credential.
 *
 * Listed rather than skipped silently: a check that quietly ignores a value is
 * a check the next reader cannot trust, so it reports them as *expected*
 * instead of as clean.
 */
const PUBLIC_BY_DESIGN = new Set(["PAYPAL_CLIENT_ID", "GCP_PROJECT"]);

/** What a leak looks like no matter whose secret it is. */
const PATTERNS = [
  { name: "Authorization header", re: /Bearer\s+[A-Za-z0-9._-]{16,}/ },
  { name: "PayPal access token (A21…)", re: /\bA21[A-Za-z0-9_-]{20,}/ },
  { name: "PayPal internals host", re: /api-m\.sandbox\.paypal\.com/ },
  { name: "Google API key (AIza…)", re: /\bAIza[0-9A-Za-z_-]{20,}/ },
];

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      // Any answer — 200, 307, even 404 — means the server is up.
      if (res.status > 0) return true;
    } catch {
      /* not listening yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

const secrets = realSecrets();
console.log(`Reading ${PAGES.length} pages from a production build…`);
console.log(`Secrets checked by value: ${secrets.map((s) => s.key).join(", ") || "(none in .env.local)"}\n`);

if (!existsSync(join(ROOT, ".next"))) {
  console.error("No .next build found. Run `npm run build` first — this checks what you would publish.");
  process.exit(1);
}

const port = await freePort();
const base = `http://127.0.0.1:${port}`;
const server = spawn("npx", ["next", "start", "-p", String(port)], {
  cwd: ROOT,
  stdio: ["ignore", "ignore", "pipe"],
});
let serverLog = "";
server.stderr.on("data", (c) => (serverLog += c.toString()));

let findings = 0;
try {
  const up = await waitForServer(`${base}/`, STARTUP_TIMEOUT_MS);
  if (!up) {
    console.error(`The build did not start on ${base} in ${STARTUP_TIMEOUT_MS / 1000}s:\n${serverLog.slice(-800)}`);
    process.exit(1);
  }

  for (const page of PAGES) {
    // Status first, and a non-200 is a failure rather than a clean pass: an
    // error page is small and contains no secrets, so a check that only greps
    // would report "clean" for an app that is not serving anything — which is
    // exactly what happened while a `next dev` was sharing `.next` with this
    // `next start`.
    const response = await fetch(base + page, { redirect: "follow" });
    const html = await response.text();
    const hits = [];
    const expected = [];

    if (response.status !== 200) {
      hits.push(`HTTP ${response.status}`);
    }
    for (const { key, value } of secrets) {
      if (!html.includes(value)) continue;
      (PUBLIC_BY_DESIGN.has(key) ? expected : hits).push(key);
    }
    for (const { name, re } of PATTERNS) {
      if (re.test(html)) hits.push(name);
    }

    findings += hits.length;
    const note = expected.length ? ` · expected: ${expected.join(", ")}` : "";
    console.log(
      hits.length === 0
        ? `  ✓ ${page.padEnd(14)} ${String(html.length).padStart(8)} bytes — clean${note}`
        : `  ✗ ${page.padEnd(14)} ${hits.join(" · ")}${note}`
    );
  }
} finally {
  server.kill("SIGTERM");
}

console.log(
  findings === 0
    ? "\nNo credential reached a response. Safe to make the repository public."
    : `\n${findings} finding${findings === 1 ? "" : "s"} — do not publish until each is explained or fixed.` +
      "\nIf a page answered with an HTTP error: stop `next dev` first — dev and start share .next."
);
process.exit(findings === 0 ? 0 : 1);
