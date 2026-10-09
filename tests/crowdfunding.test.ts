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
  daysLeft,
  MAX_INVESTMENT_USD,
  MAX_PROJECTS,
  MIN_INVESTMENT_USD,
  normaliseProjects,
  progressPct,
  remainingUsd,
  statusOf,
  type Project,
} from "../lib/crowdfunding.ts";

const seed = JSON.parse(
  readFileSync(new URL("../lib/seeds/crowdfunding.json", import.meta.url), "utf8")
);

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
