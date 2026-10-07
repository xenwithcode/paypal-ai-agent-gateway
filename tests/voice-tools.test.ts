// tests/voice-tools.test.ts
//
// The layer between a person talking and money moving.
//
// These are the checks that cannot be done with a microphone: the model is the
// part that can be wrong, and every wrongness here has a specific cost — an
// empty prompt drafts nothing, a `rowId` of "three" points at a row that does
// not exist, a prompt over the cap loses the ceiling that was the whole point
// of the sentence. The SDK is deliberately not imported, so this suite runs on
// a machine with no credentials anywhere on it.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  VOICE_TOOLS,
  VOICE_MAX_PROMPT,
  VOICE_MAX_ROWS,
  describeRowsForVoice,
  describeVoiceToolCall,
  validateVoiceToolCall,
} from "../lib/voice/tools.ts";

/** A well-formed call for a declared tool, built from its own declaration.
 *  If a declaration and the validator ever disagree, this is what notices. */
function validCallFor(name: string, id = "call_1"): Record<string, unknown> {
  const tool = VOICE_TOOLS.find((candidate) => candidate.name === name);
  assert.ok(tool, `${name} is not declared`);

  const args: Record<string, unknown> = {};
  for (const key of tool.parameters.required) {
    // Annotated deliberately. Without a type here TypeScript reports TS7022 —
    // `property` is narrowed by the assertion on the next line, and inferring
    // its type *through* an assertion function makes the inference circular.
    // The annotation says plainly what the declaration already guarantees.
    const property: { type: string } | undefined = tool.parameters.properties[key];
    if (!property) assert.fail(`${name}.${key} is required but not declared`);
    if (property.type === "STRING") args[key] = "white sneakers, ceiling 60 USD";
    else if (property.type === "NUMBER") args[key] = 7;
    else if (property.type === "BOOLEAN") args[key] = true;
    else assert.fail(`${name}.${key} has an unexpected type ${property.type}`);
  }
  return { id, name, args };
}

test("every declared tool is one the gateway will run", () => {
  const names = VOICE_TOOLS.map((tool) => tool.name).sort();
  assert.deepEqual(names, [
    "approveOrder",
    "captureOrder",
    "draftOrder",
    "getBalance",
    "releaseOrder",
    "setAgent",
  ]);

  // The declaration and the validator are two lists that have to agree, and
  // nothing but a test can see the moment they stop.
  for (const tool of VOICE_TOOLS) {
    const verdict = validateVoiceToolCall(validCallFor(tool.name));
    assert.equal(verdict.ok, true, `${tool.name} is declared but refused: ${verdict.ok ? "" : verdict.reason}`);
  }
});

test("a tool the gateway does not have is refused, not guessed", () => {
  const verdict = validateVoiceToolCall({ id: "call_1", name: "wireMoney", args: {} });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /not a command this gateway has/);
});

test("a prompt is trimmed, and never silently shortened", () => {
  const padded = validateVoiceToolCall({
    id: "call_1",
    name: "draftOrder",
    args: { prompt: "   white sneakers   " },
  });
  assert.equal(padded.ok && padded.call.args.prompt, "white sneakers");

  const tooLong = validateVoiceToolCall({
    id: "call_1",
    name: "draftOrder",
    args: { prompt: "x".repeat(VOICE_MAX_PROMPT + 1) },
  });
  assert.equal(tooLong.ok, false);
  // Not truncated: trimming an intent is how the ceiling disappears from the
  // sentence that was supposed to hold it.
  assert.match(tooLong.ok ? "" : tooLong.reason, new RegExp(String(VOICE_MAX_PROMPT)));
});

test("an intent with nothing in it is refused", () => {
  for (const prompt of ["", " ", "\t\n"]) {
    const verdict = validateVoiceToolCall({ id: "call_1", name: "draftOrder", args: { prompt } });
    assert.equal(verdict.ok, false, `prompt ${JSON.stringify(prompt)} should be refused`);
  }
});

test("setAgent has to say start or stop", () => {
  assert.equal(validateVoiceToolCall({ id: "c", name: "setAgent", args: { on: true } }).ok, true);
  assert.equal(validateVoiceToolCall({ id: "c", name: "setAgent", args: { on: false } }).ok, true);

  for (const on of ["true", 1, undefined]) {
    const verdict = validateVoiceToolCall({ id: "c", name: "setAgent", args: { on } });
    assert.equal(verdict.ok, false, `${JSON.stringify(on)} should not pass as a boolean`);
  }
});

test("an order is named by a number, or not at all", () => {
  assert.equal(
    validateVoiceToolCall({ id: "c", name: "captureOrder", args: { rowId: 7 } }).ok,
    true
  );

  // A fractional id points between two rows; the nearest row is the wrong
  // answer, so it is rounded to the row that exists.
  const fractional = validateVoiceToolCall({ id: "c", name: "approveOrder", args: { rowId: 7.9 } });
  assert.equal(fractional.ok && fractional.call.args.rowId, 7);

  for (const rowId of ["7", null, undefined, Number.NaN, {}]) {
    const verdict = validateVoiceToolCall({ id: "c", name: "captureOrder", args: { rowId } });
    assert.equal(verdict.ok, false, `${JSON.stringify(rowId)} should not name a row`);
  }
});

test("a call without an id cannot be answered", () => {
  const verdict = validateVoiceToolCall({ name: "getBalance", args: {} });
  assert.equal(verdict.ok, false);
  assert.match(verdict.ok ? "" : verdict.reason, /no id/);
});

test("payloads that are not a call at all are refused", () => {
  for (const raw of [null, undefined, "draftOrder", 42, [], { name: 7, id: "c" }]) {
    assert.equal(validateVoiceToolCall(raw).ok, false, `${JSON.stringify(raw)} should be refused`);
  }
});

test("an argument of the wrong type is dropped rather than believed", () => {
  const verdict = validateVoiceToolCall({
    id: "c",
    name: "draftOrder",
    args: { prompt: "sneakers", nested: { limit: 100 }, list: [1, 2] },
  });
  assert.equal(verdict.ok, true);
  assert.deepEqual(verdict.ok && Object.keys(verdict.call.args), ["prompt"]);
});

test("each tool reads as one line in the console", () => {
  const draft = validateVoiceToolCall({
    id: "c",
    name: "draftOrder",
    args: { prompt: "white sneakers" },
  });
  assert.ok(draft.ok);
  assert.equal(describeVoiceToolCall(draft.call), 'draftOrder → "white sneakers"');

  assert.equal(
    describeVoiceToolCall({ id: "c", name: "setAgent", args: { on: true } }),
    "setAgent → on"
  );
  assert.equal(describeVoiceToolCall({ id: "c", name: "setAgent", args: { on: false } }), "setAgent → off");
  assert.equal(describeVoiceToolCall({ id: "c", name: "getBalance", args: {} }), "getBalance");
  assert.equal(
    describeVoiceToolCall({ id: "c", name: "releaseOrder", args: { rowId: 3 } }),
    "releaseOrder → order #3"
  );
});

test("an empty table says so instead of describing nothing", () => {
  assert.equal(
    describeRowsForVoice([]),
    "There are no orders on the table right now."
  );
});

test("the model is told what fits, and told what did not", () => {
  const rows = Array.from({ length: VOICE_MAX_ROWS + 5 }, (_, index) => ({
    id: index + 1,
    what: `Order ${index + 1}`,
    status: "Reserved",
    limit: 60,
    currency: "USD",
  }));

  const prose = describeRowsForVoice(rows);
  const lines = prose.split("\n");

  assert.equal(lines.length, VOICE_MAX_ROWS + 1);
  assert.equal(lines[0], "#1 Order 1 — Reserved — ceiling 60 USD");
  assert.equal(lines[VOICE_MAX_ROWS - 1], `#${VOICE_MAX_ROWS} Order ${VOICE_MAX_ROWS} — Reserved — ceiling 60 USD`);
  // The tail is said to be missing, never silently dropped: a model that does
  // not know rows exist cannot ask the human about them.
  assert.match(lines[VOICE_MAX_ROWS], /\(\+5 more orders not listed/);
});

test("the whole table fits when it is small", () => {
  const prose = describeRowsForVoice([
    { id: 2, what: "Sports Sneakers", status: "Awaiting approval", limit: 100, currency: "USD" },
  ]);
  assert.equal(prose, "#2 Sports Sneakers — Awaiting approval — ceiling 100 USD");
  assert.doesNotMatch(prose, /more orders/);
});
