// tests/crowdfunding.test.ts
//
// What a project has to prove before it reaches the showcase.
//
// The refusals are the point. A project whose `raised` exceeds its `goal`
// would draw a full bar and a negative "still missing" figure, and no reader
// could tell which of the two numbers was the lie; coordinates outside
// Venezuela would drop a pin in the sea; two projects sharing an id would
// fight over one row. None of those are clamped into shape — they are refused,
// because a shelf that silently repairs its contents is a shelf that cannot be
// trusted when it is empty.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  campaignAction,
  campaignIdFromCustomId,
  CROWDFUNDING_PREFIX,
  daysLeft,
  dividendOn,
  earnsDividend,
  judgeInvestment,
  MAX_INVESTMENT_USD,
  MAX_PROJECTS,
  MIN_INVESTMENT_USD,
  normaliseProjects,
  progressPct,
  remainingUsd,
  settlementRefusal,
  statusOf,
  type Project,
} from "../lib/crowdfunding.ts";

const seed = JSON.parse(
  readFileSync(new URL("../lib/seeds/crowdfunding.json", import.meta.url), "utf8")
);

/**
 * A stored timestamp for one calendar day, at noon local.
 *
 * Noon rather than midnight because the dividend reads a timestamp as a
 * calendar day on *this* machine: an ISO string written at 00:00 UTC falls on
 * the previous day for anyone west of Greenwich, which would make these
 * assertions depend on the timezone of whoever runs the suite.
 *
 * `month` is the 0-based month `Date` itself takes.
 */
const stamp = (year: number, month: number, day: number): string =>
  new Date(year, month, day, 12).toISOString();

const project = (overrides: Partial<Project> = {}): Project => ({
  id: "demo",
  name: "Demo project",
  city: "Caracas",
  what: "Working capital",
  collateral: "Store inventory",
  runwayDays: 30,
  deadline: "2026-11-07",
  goalUsd: 10000,
  raisedUsd: 2500,
  returnPct: 15,
  risk: "B",
  lat: 10.48,
  lng: -66.9,
  investors: 12,
  payeeEmail: "negocio@example.com",
  seed: true,
  ...overrides,
});

test("the seed itself is a list this product would show", () => {
  const projects = normaliseProjects(seed);
  assert.ok(projects, "the shipped seed must normalise");
  assert.equal(projects.length, 4);
  assert.ok(projects.every((p) => p.seed === true), "every demo record is marked");
  // One is already funded — the showcase needs to show both states, or the
  // progress bar teaches nothing about where it ends.
  assert.ok(projects.some((p) => statusOf(p) === "FUNDED"));
  assert.ok(projects.some((p) => statusOf(p) === "OPEN"));
});

test("over-recruitment is refused, not clamped", () => {
  assert.equal(normaliseProjects([project({ raisedUsd: 10001 })]), null);
  assert.equal(normaliseProjects([project({ raisedUsd: 10000 })])?.length, 1, "exactly at goal is fine");
});

test("a coordinate outside Venezuela refuses the whole list", () => {
  assert.equal(normaliseProjects([project({ lat: 40.4 })]), null, "Madrid is not a pin here");
  assert.equal(normaliseProjects([project({ lng: 2.3 })]), null);
});

test("the fields a row cannot do without", () => {
  assert.equal(normaliseProjects("not a list"), null);
  assert.equal(normaliseProjects([project({ name: "" })]), null);
  // What stands behind the money is not decoration: a project nobody can say
  // what backs is one nobody should be asked to fund.
  assert.equal(normaliseProjects([project({ collateral: "" })]), null, "no backing, no listing");
  assert.equal(normaliseProjects([project({ goalUsd: 0 })]), null);
  assert.equal(normaliseProjects([project({ returnPct: 150 })]), null, "a return of 150% is not a return");
  // A grade the type does not allow is exactly what has to reach the
  // validator as *data* — typing it into `Risk` would be testing the cast.
  assert.equal(normaliseProjects([{ ...project(), risk: "D" }]), null, "grades are A, B, C");
  assert.equal(normaliseProjects([project({ investors: 1.5 })]), null, "people come in whole");
  assert.equal(normaliseProjects([project(), project()]), null, "two rows, one id");
});

test("the list is bounded", () => {
  const many = Array.from({ length: MAX_PROJECTS + 1 }, (_, i) => project({ id: `p${i}` }));
  assert.equal(normaliseProjects(many), null);
});

test("the bar cannot overflow and the shortfall cannot go negative", () => {
  assert.equal(progressPct(project({ raisedUsd: 0 })), 0);
  assert.equal(progressPct(project({ raisedUsd: 5000 })), 0.5);
  // Clamped even if a caller hands over a project the normaliser never saw.
  assert.equal(progressPct(project({ raisedUsd: 20000 })), 1);
  assert.equal(remainingUsd(project({ raisedUsd: 10000 })), 0);
  assert.equal(remainingUsd(project({ raisedUsd: 12000 })), 0, "never negative");
});

test("status is derived from the money, so the two cannot disagree", () => {
  assert.equal(statusOf(project({ raisedUsd: 9999 })), "OPEN");
  assert.equal(statusOf(project({ raisedUsd: 10000 })), "FUNDED");
});

test("the band is one number at each end", () => {
  // Both ends are cited by the panel, judged by F3.4 and quoted in the pitch;
  // three places saying different numbers is how a minimum becomes a surprise.
  assert.equal(MIN_INVESTMENT_USD, 20);
  assert.equal(MAX_INVESTMENT_USD, 1000);
  assert.ok(MIN_INVESTMENT_USD < MAX_INVESTMENT_USD);
});

test("a campaign's deadline is derived from its runway, never stored", () => {
  // Stored deadlines rot on the shelf: a sample campaign that closed last
  // month makes a working showcase look shut.
  const today = new Date(2026, 9, 8);
  const projects = normaliseProjects([project({ runwayDays: 30 })], today);
  assert.equal(projects?.[0].deadline, "2026-11-07");
  assert.equal(daysLeft(projects![0].deadline, today), 30);
});

test("a campaign with no closing date refuses the list", () => {
  // Money pledged against a campaign that never closes is money held
  // indefinitely — the one outcome this product must not produce.
  assert.equal(normaliseProjects([{ ...project(), runwayDays: undefined }]), null);
  // A payee nobody can pay is the same as no funding at all.
  assert.equal(normaliseProjects([project({ payeeEmail: "not-an-email" })]), null);
});

test("a deadline that has passed counts as passed", () => {
  const today = new Date(2026, 9, 8);
  assert.equal(daysLeft("2026-10-07", today), -1);
  assert.equal(daysLeft("2026-10-08", today), 0, "today is the last day");
  assert.equal(Number.isNaN(daysLeft("not a date", today)), true);
});

test("a pledge is judged against the campaign's own numbers", () => {
  const today = new Date(2026, 9, 8);
  // $7,500 missing of a $10,000 goal, closing in a month: room for anything
  // the band allows, so each rule below fails for its own reason alone.
  const open = project({ goalUsd: 10000, raisedUsd: 2500, deadline: "2026-11-07" });

  assert.equal(judgeInvestment(20, open, today).allowed, true, "the minimum fits");
  assert.equal(judgeInvestment(1000, open, today).allowed, true, "the maximum fits");

  const below = judgeInvestment(19.5, open, today);
  assert.equal(below.allowed, false);
  assert.match(below.reason, /^The minimum is \$20\.$/);

  const above = judgeInvestment(1000.01, open, today);
  assert.equal(above.allowed, false);
  assert.match(above.reason, /^The maximum in one go is \$1,000\.$/);

  const noAmount = judgeInvestment(Number.NaN, open, today);
  assert.equal(noAmount.allowed, false, "an amount that is not money cannot be judged");
  assert.match(noAmount.reason, /between \$20 and \$1,000/);
});

test("a pledge may fill the goal exactly and never past it", () => {
  const today = new Date(2026, 9, 8);
  // $250 still missing. The card prints "still missing"; this is the same
  // figure deciding whether the order may exist.
  const nearlyFunded = project({ goalUsd: 10000, raisedUsd: 9750, deadline: "2026-11-07" });

  assert.equal(judgeInvestment(250, nearlyFunded, today).allowed, true, "exactly what is missing");
  assert.equal(judgeInvestment(250.01, nearlyFunded, today).allowed, false, "a cent past it");

  const over = judgeInvestment(1000, nearlyFunded, today);
  assert.match(over.reason, /Only \$250 is missing/);
  assert.match(over.reason, /\$10,750/, "and where the total would land");

  const full = judgeInvestment(20, project({ goalUsd: 10000, raisedUsd: 10000 }), today);
  assert.equal(full.allowed, false);
  assert.match(full.reason, /has already reached its \$10,000 goal/);
});

test("a closed campaign refuses, and the last day still counts", () => {
  const today = new Date(2026, 9, 8);
  const closed = project({ deadline: "2026-10-07" });
  const refusal = judgeInvestment(20, closed, today);
  assert.equal(refusal.allowed, false);
  assert.match(refusal.reason, /closed on 2026-10-07/);

  const lastDay = project({ deadline: "2026-10-08" });
  assert.equal(judgeInvestment(20, lastDay, today).allowed, true, "today is still a day");
});

test("every reason is reported, not the first", () => {
  const today = new Date(2026, 9, 8);
  // $15 on a campaign that is $10 from its goal and closed yesterday: the
  // amount, the goal and the window all fail at once, and a caller who only
  // hears about the amount fixes the amount and re-runs into the other two.
  const bad = project({ goalUsd: 10000, raisedUsd: 9990, deadline: "2026-10-07" });
  const verdict = judgeInvestment(15, bad, today);

  assert.equal(verdict.allowed, false);
  assert.equal(verdict.violations.length, 3);
  assert.match(verdict.reason, /The minimum is \$20\./);
  assert.match(verdict.reason, /Only \$10 is missing/);
  assert.match(verdict.reason, /closed on 2026-10-07/);
});

test("an order says which campaign it funds, once", () => {
  // One field, one meaning: the panel writes this and the server reads it
  // back, so the order cannot claim two different pledges.
  assert.equal(CROWDFUNDING_PREFIX, "cf-");
  assert.equal(campaignIdFromCustomId("cf-el-saman"), "el-saman");
  assert.equal(campaignIdFromCustomId("cf-  el-saman  "), "el-saman", "ids do not carry padding");
  assert.equal(
    campaignIdFromCustomId("cf-"),
    "",
    "named a campaign and gave no id — not the same as naming none"
  );
  assert.equal(campaignIdFromCustomId("some-paypal-id"), null, "an ordinary order");
  assert.equal(campaignIdFromCustomId(undefined), null);
  assert.equal(campaignIdFromCustomId(null), null);
  assert.equal(campaignIdFromCustomId(42), null);
});

test("a pledge settles only against a campaign that can carry it", () => {
  const today = new Date(2026, 9, 8);
  const what = "Stake in Demo project";

  // Goal met: the condition the reservation waited for is true.
  assert.equal(settlementRefusal(what, project({ raisedUsd: 10000 }), today), null);

  // Open: set aside, not taken — the sentence the card printed, in the
  // response the button gets.
  const waiting = settlementRefusal(what, project({ raisedUsd: 9999 }), today);
  assert.match(waiting ?? "", /stays reserved/);
  assert.match(waiting ?? "", /closes 2026-11-07 — 30 days left/);
  assert.match(waiting ?? "", /captured when the goal is met, and released if it is not/);

  // One day left reads as one day: a refusal that says "1 days" is a refusal
  // nobody trusts.
  const tomorrow = settlementRefusal(what, project({ deadline: "2026-10-09" }), today);
  assert.match(tomorrow ?? "", /1 day left/);

  // Closed without its goal: released, never captured. This is the rule the
  // Protection column's Capture button would otherwise break.
  const lost = settlementRefusal(what, project({ raisedUsd: 0, deadline: "2026-10-07" }), today);
  assert.match(lost ?? "", /cannot be captured/);
  assert.match(lost ?? "", /closed on 2026-10-07/);
  assert.match(lost ?? "", /released, not taken/);

  // Campaign gone: nothing left to settle against, said rather than falling
  // through to a generic path that reads an empty condition as *spend now*.
  assert.match(settlementRefusal(what, null, today) ?? "", /not in the showcase any more/);
});

test("a dividend is the formula, in three figures and never one", () => {
  const today = new Date(2026, 9, 8);

  // $3.650 at 10% is exactly $1 a day — and a year of them is $365, so the
  // arithmetic can be checked by eye rather than trusted.
  const year = dividendOn({ amountUsd: 3650, returnPct: 10, since: stamp(2025, 9, 8) }, today);
  assert.equal(year.perDay, 1);
  assert.equal(year.days, 365);
  assert.equal(year.total, 365);

  const yesterday = dividendOn({ amountUsd: 3650, returnPct: 10, since: stamp(2026, 9, 7) }, today);
  assert.equal(yesterday.days, 1, "pledged yesterday, counted once today");
  assert.equal(yesterday.total, 1);

  const today0 = dividendOn({ amountUsd: 3650, returnPct: 10, since: stamp(2026, 9, 8) }, today);
  assert.equal(today0.days, 0, "today has not produced a day yet");
  assert.equal(today0.total, 0);
});

test("an unknown start or an unknown rate earns nothing, never a guess", () => {
  const today = new Date(2026, 9, 8);
  const start = stamp(2026, 9, 4);

  assert.equal(dividendOn({ amountUsd: 100, returnPct: 20 }, today).days, 0, "no start, no count");
  assert.equal(dividendOn({ amountUsd: 100, returnPct: 20, since: "not a date" }, today).days, 0);
  assert.equal(dividendOn({ amountUsd: 100, returnPct: 20, since: null }, today).total, 0);

  assert.equal(dividendOn({ amountUsd: 100, returnPct: 0, since: start }, today).perDay, 0);
  assert.equal(dividendOn({ amountUsd: 100, returnPct: Number.NaN, since: start }, today).perDay, 0);
  assert.equal(dividendOn({ amountUsd: -5, returnPct: 20, since: start }, today).perDay, 0);
  assert.equal(dividendOn({ amountUsd: 0, returnPct: 20, since: start }, today).perDay, 0);

  // A start in the future is a mistake to be shown as nothing, not as debt:
  // negative accrual is a number no reader can reconcile with anything.
  assert.equal(dividendOn({ amountUsd: 100, returnPct: 20, since: stamp(2026, 9, 10) }, today).total, 0);
});

test("only money PayPal is holding earns", () => {
  // The count and the total both ask this, so it is one function rather than
  // a filter in the card that the suite could never see.
  assert.equal(earnsDividend({ status: "Reserved" }), true, "set aside, held for the campaign");
  assert.equal(earnsDividend({ status: "Captured" }), true, "moved, and invested");
  assert.equal(earnsDividend({ status: "Released" }), false, "the money came back");
  assert.equal(earnsDividend({ status: "Awaiting approval" }), false, "nothing set aside yet");
  assert.equal(earnsDividend({ status: "Active" }), false, "a standing allowance reserves nothing");
  assert.equal(earnsDividend({ status: "Protecting" }), false, "the FX shield, not a position");
});

test("the promise on the card is one rule, and it has three answers", () => {
  const today = new Date(2026, 9, 8);

  // The helper takes a deadline straight, so the deadline is what these cases
  // set: `runwayDays` only matters when a project comes through
  // `normaliseProjects`, which is what derives one from the other.
  // Goal met: the money may settle — the condition the reservation waits for.
  assert.equal(campaignAction(project({ raisedUsd: 10000 }), today), "capture");
  // Deadline passed with the goal unmet: the money goes back.
  assert.equal(campaignAction(project({ raisedUsd: 0, deadline: "2026-10-07" }), today), "release");
  // Open campaign: set aside, not taken — which is what Reserved means.
  assert.equal(campaignAction(project({ raisedUsd: 9999 }), today), "wait");
  // The last day is still a day: a deadline is not passed until it is over.
  assert.equal(campaignAction(project({ raisedUsd: 0, deadline: "2026-10-08" }), today), "wait");
});
