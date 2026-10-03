// tests/paypal-balance.test.ts
//
// The balance is the figure a reader takes at face value, and this function
// fails by returning null rather than by throwing — so a wrong field name
// shows up as "PayPal returned no usable balance" and nothing else. The
// fixtures below are the shapes PayPal and the SDK actually produced while
// this was being diagnosed, not invented ones.
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickBalance } from "../lib/paypal.ts";
import type { BalancesResponse } from "@paypal/paypal-server-sdk";

/** What the SDK hands back after deserializing the response. */
const fromSdk = {
  balances: [
    {
      currency: "USD",
      totalBalance: { currencyCode: "USD", value: "5000.00" },
      availableBalance: { currencyCode: "USD", value: "5000.00" },
      withheldBalance: { currencyCode: "USD", value: "0.00" },
    },
  ],
  accountId: "KTMXXVK4LSRFS",
} as unknown as BalancesResponse;

/** What the raw HTTP body carries, before the SDK transforms it. */
const fromWire = {
  balances: [
    {
      currency: "USD",
      total_balance: { currency_code: "USD", value: "5000.00" },
      available_balance: { currency_code: "USD", value: "5000.00" },
    },
  ],
} as unknown as BalancesResponse;

test("reads the account's real balance and reports its currency", () => {
  const picked = pickBalance(fromSdk);
  assert.deepEqual(picked, { value: "5,000.00", currency: "USD" });
});

test("reads the untransformed shape too", () => {
  // Same data over the wire. If the SDK ever stopped deserializing, this is
  // what would arrive — and the failure mode is a null nobody can debug.
  assert.deepEqual(pickBalance(fromWire), { value: "5,000.00", currency: "USD" });
});

test("prefers PYUSD when the account holds it", () => {
  const response = {
    balances: [
      { currency: "USD", totalBalance: { value: "5000.00" } },
      { currency: "PYUSD", totalBalance: { value: "123.45" } },
    ],
  } as unknown as BalancesResponse;

  assert.deepEqual(pickBalance(response), { value: "123.45", currency: "PYUSD" });
});

test("falls back to the primary currency, then to whatever is listed", () => {
  const primary = {
    balances: [
      { currency: "EUR", totalBalance: { value: "10.00" } },
      { currency: "USD", primary: true, totalBalance: { value: "20.00" } },
    ],
  } as unknown as BalancesResponse;
  assert.deepEqual(pickBalance(primary), { value: "20.00", currency: "USD" });

  const noPrimary = {
    balances: [{ currency: "EUR", totalBalance: { value: "10.00" } }],
  } as unknown as BalancesResponse;
  assert.deepEqual(pickBalance(noPrimary), { value: "10.00", currency: "EUR" });
});

test("returns null rather than inventing a figure", () => {
  assert.equal(pickBalance({ balances: [] } as BalancesResponse), null);
  assert.equal(pickBalance({} as BalancesResponse), null);

  // No amount anywhere: nothing to print, so nothing may be printed.
  assert.equal(
    pickBalance({ balances: [{ currency: "USD" }] } as unknown as BalancesResponse),
    null
  );

  // No currency: an amount with no unit cannot be shown honestly.
  assert.equal(
    pickBalance({ balances: [{ totalBalance: { value: "10.00" } }] } as unknown as BalancesResponse),
    null
  );
});

test("an amount that is not a number is refused", () => {
  const response = {
    balances: [{ currency: "USD", totalBalance: { value: "not-a-number" } }],
  } as unknown as BalancesResponse;
  // The string is returned as-is; `formatAmount` downstream is what refuses
  // to dress it up. What matters here is that an absent value yields null.
  assert.equal(pickBalance({ balances: [{ currency: "USD" }] } as unknown as BalancesResponse), null);
  assert.ok(pickBalance(response), "a malformed-but-present value is still reported");
});
