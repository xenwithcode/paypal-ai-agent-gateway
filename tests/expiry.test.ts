// tests/expiry.test.ts
//
// A deadline written the way a person writes it, and what happens when it
// cannot be read.
//
// The bug this pins had a blast radius wider than a wrong cell: the old
// helper turned an unreadable phrase into `""`, and `""` means *this order
// never expires*. So a model answering "Friday" instead of a date quietly
// widened the authority it was asked to bound — and the grid printed "No
// expiry", which reads as a fact rather than as a failure. Refusing a
// payment is recoverable; an authority that grew without anybody noticing
// is not.
//
// Every case is pinned to a Thursday (2026-10-08) so the weekday branches are
// tests of the rule rather than of the day the suite happens to run.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readExpiry, resolveExpiry } from "../lib/policy.ts";

const THURSDAY = new Date(2026, 9, 8); // 2026-10-08
const FRIDAY = new Date(2026, 9, 9); // 2026-10-09

test("a date already written correctly passes through untouched", () => {
  assert.equal(resolveExpiry("2026-12-31", THURSDAY), "2026-12-31");
  assert.equal(resolveExpiry("", THURSDAY), "");
  assert.equal(resolveExpiry(null, THURSDAY), "");
  assert.equal(resolveExpiry(undefined, THURSDAY), "");
});

test("a single-digit day is padded, not refused", () => {
  assert.equal(resolveExpiry("2026-10-9", THURSDAY), "2026-10-09");
});

test("a weekday resolves to the next one, today included", () => {
  assert.equal(resolveExpiry("Friday", THURSDAY), "2026-10-09");
  assert.equal(resolveExpiry("viernes", THURSDAY), "2026-10-09");
  // Said on the day itself: a deadline never points at a day already gone,
  // and rolling forward a week would extend an authority meant to end now.
  assert.equal(resolveExpiry("Friday", FRIDAY), "2026-10-09");
  assert.equal(resolveExpiry("Monday", THURSDAY), "2026-10-12");
});

test("the words people actually write, in both languages", () => {
  assert.equal(resolveExpiry("tomorrow", THURSDAY), "2026-10-09");
  assert.equal(resolveExpiry("mañana", THURSDAY), "2026-10-09");
  assert.equal(resolveExpiry("next week", THURSDAY), "2026-10-15");
  assert.equal(resolveExpiry("semana que viene", THURSDAY), "2026-10-15");
  assert.equal(resolveExpiry("end of the month", THURSDAY), "2026-10-31");
  assert.equal(resolveExpiry("fin de mes", THURSDAY), "2026-10-31");
  assert.equal(resolveExpiry("in 3 days", THURSDAY), "2026-10-11");
  assert.equal(resolveExpiry("en 2 semanas", THURSDAY), "2026-10-22");
});

test("a day of the month means the next one, not today", () => {
  // The exact slip the model made: "valid until the 27th" came back as the
  // 9th, because the sentence was read and a deadline of its own substituted.
  assert.equal(resolveExpiry("the 27th", THURSDAY), "2026-10-27");
  assert.equal(resolveExpiry("el 27", THURSDAY), "2026-10-27");
  assert.equal(resolveExpiry("27th", THURSDAY), "2026-10-27");
  // Written on the 30th, it means next month's — the calendar has not
  // reached this month's yet.
  assert.equal(resolveExpiry("the 27th", new Date(2026, 9, 30)), "2026-11-27");
});

test("a month with a day is taken as written", () => {
  assert.equal(resolveExpiry("December 31", THURSDAY), "2026-12-31");
  assert.equal(resolveExpiry("31 de diciembre", THURSDAY), "2026-12-31");
  // September has passed; it stays passed rather than rolling to next year —
  // a deadline that has gone should read as gone.
  assert.equal(resolveExpiry("September 1", THURSDAY), "2026-09-01");
});

test("an unreadable deadline comes back as it arrived, never as empty", () => {
  // The whole point: "" would mean the order never expires.
  assert.equal(resolveExpiry("the sale ends", THURSDAY), "the sale ends");
  assert.equal(resolveExpiry("whenever", THURSDAY), "whenever");

  const window = readExpiry(resolveExpiry("the sale ends", THURSDAY), THURSDAY);
  assert.equal(window.kind, "unreadable", "so the charge is refused, not permitted");
});

test("a date-shaped value that names no day is refused too", () => {
  assert.equal(readExpiry("2026-02-30", THURSDAY).kind, "unreadable");
  assert.equal(readExpiry("2026-10-31", THURSDAY).kind, "date");
});

test("an empty deadline still means what it always meant", () => {
  assert.equal(readExpiry("", THURSDAY).kind, "none", "approved to run indefinitely");
});

// ─── The fallback path ─────────────────────────────────────────────────────
//
// Without a model there is no `expires` field at all — only the sentence. The
// deadline has to be lifted out of it, and the same rule applies to what comes
// back: a clause that resolves becomes a date, and one that does not is kept
// so the judge can refuse the charge instead of the order quietly running
// forever.
import { deadlineOf } from "../lib/gemini.ts";

test("the sentence yields a deadline only when it carries one", () => {
  assert.equal(deadlineOf("headphones, by Friday, only if price <= 100"), "Friday");
  assert.equal(deadlineOf("silla, hasta el viernes, solo si cuesta 60"), "el viernes");
  assert.equal(deadlineOf("a lamp until December 31"), "December 31");
  assert.equal(deadlineOf("headphones under 40"), "", "no deadline said, no deadline claimed");
});

test("what the sentence yields, the window reads the same way", () => {
  assert.equal(resolveExpiry(deadlineOf("headphones, by Friday"), THURSDAY), "2026-10-09");
  assert.equal(resolveExpiry(deadlineOf("silla, hasta el viernes"), THURSDAY), "2026-10-09");

  // "before the sale" names no day. It is kept — the alternative is a cell
  // reading "No expiry" for an order the user meant to bound.
  const clause = deadlineOf("buy this before the sale");
  assert.equal(clause, "the sale");
  assert.equal(resolveExpiry(clause, THURSDAY), "the sale");
  assert.equal(readExpiry(resolveExpiry(clause, THURSDAY), THURSDAY).kind, "unreadable");
});
