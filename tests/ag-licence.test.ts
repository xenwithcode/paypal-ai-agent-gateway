// tests/ag-licence.test.ts
//
// Which manager may be handed a key — decided before anyone hands it over.
//
// This module exists because a Studio key was fed to ag-grid-enterprise and
// the browser answered "Invalid License Key / Your license key is not valid",
// which reads exactly like a corrupted key when the key's own signature
// matches and it is a month from expiring. The key was fine; the store was
// wrong. These are the cases that keep that from happening again.
import { test } from "node:test";
import assert from "node:assert/strict";
import { explainLicence, readLicence } from "../lib/grid/licence.ts";

/** A v3 key of a given type, with a valid signature and a future date. */
function key(type: string, options: { expiryMs?: number } = {}): string {
  const expiry = options.expiryMs ?? Date.parse("2026-11-21T00:00:00Z");
  const body = `[TRIAL]_test_key_[v3]_[${type}]_expired_${btoa(String(expiry))}`;
  return `${body}${"a".repeat(32)}`;
}

test("nothing configured is not the same as configured badly", () => {
  for (const raw of [undefined, "", "   "]) {
    const info = readLicence(raw);
    assert.equal(info.present, false);
    assert.equal(info.coversGrid, false);
    // Nothing was promised, so nothing may be explained.
    assert.equal(explainLicence(info), null);
  }
});

test("a grid licence covers the grid", () => {
  const both = readLicence(key("0102"));
  assert.equal(both.type, "BOTH");
  assert.equal(both.owner, "grid");
  assert.equal(both.coversGrid, true);
  assert.equal(explainLicence(both), null);

  assert.equal(readLicence(key("01")).type, "GRID");
  assert.equal(readLicence(key("01")).coversGrid, true);
});

test("a charts-only licence does not license the grid", () => {
  const info = readLicence(key("02"));
  assert.equal(info.type, "CHARTS");
  assert.equal(info.coversGrid, false);
  assert.match(explainLicence(info) ?? "", /covers CHARTS only/);
});

test("the real AG Studio key is valid and belongs to Studio, not the grid", () => {
  // The literal failure this file was written for: [03C] = STUDIO-PRO-AI.
  const studio = readLicence(
    "[TRIAL]_this_{AG_Studio_Pro}_Enterprise_key_{AG-147648}_x_[v3]_[03C]_" +
      `${btoa("1795219200000")}${"b".repeat(32)}`
  );
  assert.equal(studio.present, true);
  assert.equal(studio.version, "3");
  assert.equal(studio.type, "STUDIO-PRO-AI");
  assert.equal(studio.owner, "studio");
  // The whole point: never give this to LicenseManager.
  assert.equal(studio.coversGrid, false);
  assert.match(explainLicence(studio) ?? "", /separate licence store|different product/);
});

test("every Studio type is recognised as Studio", () => {
  for (const [code, name] of [
    ["03A", "STUDIO-CORE"],
    ["03B", "STUDIO-PRO"],
    ["03C", "STUDIO-PRO-AI"],
  ] as const) {
    const info = readLicence(key(code));
    assert.equal(info.type, name);
    assert.equal(info.owner, "studio");
    assert.equal(info.coversGrid, false);
  }
});

test("formats before v3 carried no type and are still accepted", () => {
  // AG Grid only requires the type bracket from version 3. Refusing an older
  // key would disable Enterprise for a licence the vendor's own validator
  // accepts.
  const legacy = readLicence("[TRIAL]_old_style_key_expired_" + btoa("1795219200000") + "c".repeat(32));
  assert.equal(legacy.version, "legacy");
  assert.equal(legacy.coversGrid, true);

  const v2 = readLicence("[TRIAL]_v2_key_[v2]_expired_" + btoa("1795219200000") + "d".repeat(32));
  assert.equal(v2.version, "2");
  assert.equal(v2.coversGrid, true);
});

test("a v3 key with no readable type is refused rather than assumed", () => {
  const info = readLicence("[TRIAL]_no_type_key_[v3]_expired_" + btoa("1795219200000") + "e".repeat(32));
  assert.equal(info.version, "3");
  assert.equal(info.type, null);
  assert.equal(info.coversGrid, false);
  assert.match(explainLicence(info) ?? "", /type bracket/);
});

test("an expired licence falls back instead of arguing with AG Grid", () => {
  const before = new Date("2026-10-07T00:00:00Z");
  const future = readLicence(key("0102"), before);
  assert.equal(future.expired, false);
  assert.equal(future.coversGrid, true);

  const after = new Date("2026-12-01T00:00:00Z");
  const past = readLicence(key("0102"), after);
  assert.equal(past.expired, true);
  assert.equal(past.coversGrid, false, "an expired key must not be handed to the manager");
  assert.match(explainLicence(past) ?? "", /expired on/);
});

test("a date that cannot be read is refused, the way AG Grid refuses it", () => {
  const info = readLicence("[TRIAL]_no_date_[v3]_[01]_not-a-date_" + "f".repeat(32));
  assert.equal(info.expiry, null);
  assert.equal(info.expired, false);
  // AG Grid computes `valid = !isNaN(expiry.getTime())`, so a key whose date
  // cannot be parsed is an invalid key to it. Agreeing is the whole point:
  // disagreeing would hand it a key the manager is about to reject.
  assert.equal(info.readable, false);
  assert.equal(info.coversGrid, false);
  assert.match(explainLicence(info) ?? "", /no expiry date AG Grid can read/);
});

test("zero-width characters added by a copy-paste do not change the reading", () => {
  const plain = key("0102");
  const padded = `\u200B${plain}\uFEFF`;
  assert.equal(readLicence(padded).coversGrid, readLicence(plain).coversGrid);
  assert.equal(readLicence(padded).type, readLicence(plain).type);
});
