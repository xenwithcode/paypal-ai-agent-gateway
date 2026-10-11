// tests/position.test.ts
//
// The one screen that answers *how much can I spend?*, and the mistake it
// exists to prevent.
//
// The dashboard used to answer that question in three cards that never spoke
// to each other, and the obvious way to unify them — add the balance, the
// commitments and the campaign positions — counts the same dollars twice:
// a reserved pledge is *inside* the balance, an awaiting row has touched
// nothing, and a released one gave the money back. A card that adds them
// looks exactly as convincing as one that does not, which is why every rule
// below is an assert rather than a comment.
import { test } from "node:test";
import assert from "node:assert/strict";
import { accountPosition, hasPositionFigure } from "../lib/position.ts";
import { STATUS } from "../lib/policy.ts";

const usd = (value: number) => ({ currency: "USD", value });

const row = (
  over: Partial<{
    status: string;
    limit: number;
    currency: string;
    what: string;
    project: string;
    sample: boolean;
    createdAt: string | null;
  }> = {}
) => ({
  status: STATUS.reserved,
  limit: 100,
  currency: "USD",
  what: "An order",
  ...over,
});

test("a reserved pledge is in both ledgers, and added to neither", () => {
  // The trap, stated as a number: the same $50 shows up as the balance's
  // commitment and as the campaign's pledge, because it is the same $50.
  const position = accountPosition([usd(500)], [row({ project: "el-saman", limit: 50 })]);

  assert.equal(position.balances[0].committed, 50, "it is committed out of the balance");
  assert.equal(position.balances[0].free, 450);
  assert.equal(position.invested?.reserved, 50, "and it is pledged to the campaign");
  assert.equal(position.invested?.committed, 50, "on the table — not 100");
  assert.equal(position.spendable[0].value, 450, "and spendable already excludes it");
});

test("released is returned, and is nobody's money any more", () => {
  const position = accountPosition(
    [usd(500)],
    [row({ project: "el-saman", limit: 50, status: STATUS.released })]
  );

  assert.equal(position.invested?.returned, 50);
  assert.equal(position.invested?.committed, 0, "a refund is not money on the table");
  assert.equal(position.balances[0].committed, 0, "and it commits nothing");
  assert.equal(position.spendable[0].value, 500, "the money is back, so it is spendable");
});

test("an ordinary purchase is not an investment", () => {
  // Ten rows, none of them naming a campaign: the first ledger, and nothing
  // at all in the second. A card inventing a $0 "invested" would claim the
  // operator has a portfolio of nothing rather than none.
  const rows = Array.from({ length: 10 }, (_, index) =>
    row({ status: STATUS.captured, limit: 10 + index })
  );
  const position = accountPosition([usd(1000)], rows);

  assert.equal(position.invested, null, "no campaign, no portfolio");
  assert.equal(hasPositionFigure(position), true, "the balance is still worth showing");
});

test("spendable is one figure per currency, and never a sum", () => {
  const position = accountPosition(
    [usd(100), { currency: "PYUSD", value: 50 }],
    [row({ limit: 30 })]
  );

  assert.deepEqual(position.spendable, [
    { currency: "PYUSD", value: 50 },
    { currency: "USD", value: 70 },
  ]);
  assert.equal(
    position.spendable.some((entry) => entry.value === 150),
    false,
    "there is no $150 of anything here"
  );
});

test("a free figure never goes negative, and says nothing when it cannot", () => {
  // Orders reserving more than the balance holds: money moved outside this
  // app. The honest spendable answer is zero — not a minus number, and not
  // the balance either.
  const position = accountPosition([usd(500)], [row({ limit: 600 })]);

  assert.equal(position.balances[0].committed, 600);
  assert.equal(position.balances[0].free, 0);
  assert.deepEqual(position.spendable, [], "nothing is spendable, so nothing is led with");
});

test("awaiting is counted, and is never money", () => {
  const position = accountPosition(
    [usd(500)],
    [
      row({ status: STATUS.pending, limit: 40 }),
      row({ status: STATUS.pending, limit: 60 }),
    ]
  );

  assert.deepEqual(position.awaiting, { count: 2, amount: 100 });
  assert.equal(position.balances[0].committed, 0, "nothing is held yet");
  assert.equal(position.spendable[0].value, 500, "so the whole balance is still spendable");
});

test("a dividend accrues only where the campaign can pay it", () => {
  const projects = [
    { id: "el-saman", returnPct: 20 },
    { id: "distribuidora", returnPct: 14 },
  ];
  // Four days, pinned. The day count is recomputed here with the same
  // calendar rule the module uses — a raw timestamp difference would make
  // this test pass or fail depending on the machine's timezone.
  const localDay = (iso: string) => {
    const date = new Date(iso);
    return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
  };
  const today = new Date("2026-10-11T12:00:00Z");
  const since = "2026-10-07T12:00:00Z";
  const days = localDay("2026-10-11") - localDay("2026-10-07");
  assert.equal(days, 4, "the fixture is four calendar days old");

  const position = accountPosition(
    [usd(1000)],
    [
      row({ project: "el-saman", limit: 50, status: STATUS.reserved, createdAt: since }),
      row({ project: "distribuidora", limit: 100, status: STATUS.captured, createdAt: since }),
      // The two that must not accrue: a refund, and a campaign nobody can
      // find in the showcase the caller passed.
      row({ project: "el-saman", limit: 200, status: STATUS.released, createdAt: since }),
      row({ project: "gone", limit: 400, status: STATUS.reserved, createdAt: since }),
    ],
    projects,
    today
  );

  // 50 at 20% and 100 at 14%, over 365 — the operator's own formula.
  const perDay = (50 * 20) / 100 / 365 + (100 * 14) / 100 / 365;
  assert.ok(
    Math.abs((position.invested?.perMonth ?? 0) - (perDay * 365) / 12) < 1e-9,
    "the monthly figure is the annual offer ÷ 12, summed across the positions that earn"
  );
  assert.ok(
    Math.abs((position.invested?.accrued ?? 0) - perDay * days) < 1e-9,
    "accrued over the days actually passed — not over the refund, not over the lost campaign"
  );
  // Weighted by money, not averaged: (50×20 + 100×14) ÷ 150 = 16.
  assert.equal(position.invested?.returnPct, 16);
});

test("the showcase is replaced, never mixed in", () => {
  const samples = [
    row({ project: "a", limit: 50, sample: true }),
    row({ project: "b", limit: 100, sample: true }),
  ];
  assert.equal(accountPosition([], samples).invested?.allSample, true);

  const withOneReal = [...samples, row({ project: "c", limit: 20 })];
  assert.equal(
    accountPosition([], withOneReal).invested?.allSample,
    false,
    "one real pledge makes the whole portfolio the operator's own"
  );
});

test("nothing to show is nothing, not a card of zeroes", () => {
  assert.equal(hasPositionFigure(accountPosition([], [])), false);
  assert.equal(hasPositionFigure(accountPosition([usd(0)], [])), false, "a zero balance is not a position");
  assert.equal(hasPositionFigure(accountPosition([], [row({ status: STATUS.pending, limit: 0 })])), true, "but a pending order is: it is the next thing that leaves");
});
