// tests/voice-wav.test.ts
//
// The header that lets a text model hear what Live would not transcribe.
//
// Measured on 1-nov: `gemini-2.5-flash` refuses raw `audio/pcm` with a 400
// that names no argument, and accepts the same bytes wrapped as WAV. A
// header written wrong fails the same way — an opaque invalid argument —
// which is exactly the kind of error no test could have located for anyone.
// So the bytes are pinned here, byte for byte.
import { test } from "node:test";
import assert from "node:assert/strict";
import { wavFromPcm16k, WAV_HEADER_BYTES } from "../lib/voice/wav.ts";

/** Four samples with every byte value that matters: sign, alignment, tail. */
const SAMPLES = Buffer.from([0x00, 0x80, 0xff, 0x7f, 0x34, 0x12, 0x00, 0x00]);
const B64 = SAMPLES.toString("base64");

test("the header is a canonical16 kHz mono PCM WAV", () => {
  const wav = Buffer.from(wavFromPcm16k(B64), "base64");

  assert.equal(wav.length, WAV_HEADER_BYTES + SAMPLES.length);
  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE");
  assert.equal(wav.subarray(12, 16).toString("ascii"), "fmt ");
  assert.equal(wav.subarray(36, 40).toString("ascii"), "data");

  // Sizes: the RIFF chunk counts everything after its own size field; the
  // data chunk counts the samples. Either off by one and the API reads a
  // truncated clip as silence — a transcription of nothing, with no error.
  assert.equal(wav.readUInt32LE(4), 36 + SAMPLES.length);
  assert.equal(wav.readUInt32LE(40), SAMPLES.length);

  assert.equal(wav.readUInt16LE(20), 1); // PCM
  assert.equal(wav.readUInt16LE(22), 1); // mono
  assert.equal(wav.readUInt32LE(24), 16_000); // sample rate
  assert.equal(wav.readUInt32LE(28), 32_000); // byte rate
  assert.equal(wav.readUInt16LE(32), 2); // block align
  assert.equal(wav.readUInt16LE(34), 16); // bits per sample
});

test("the samples come through untouched, byte for byte", () => {
  const wav = Buffer.from(wavFromPcm16k(B64), "base64");
  assert.deepEqual(wav.subarray(WAV_HEADER_BYTES), SAMPLES);
});

test("a Buffer is accepted as well as base64, and both agree", () => {
  const fromBuffer = wavFromPcm16k(SAMPLES);
  assert.equal(fromBuffer, wavFromPcm16k(B64));
  // Which also means base64 round-trips: what arrives is what was sent.
  const wav = Buffer.from(fromBuffer, "base64");
  assert.deepEqual(wav.subarray(WAV_HEADER_BYTES), SAMPLES);
});

test("the rate is an argument, not a guess — a rate is the pitch", () => {
  const wav = Buffer.from(wavFromPcm16k(B64, 48_000), "base64");
  assert.equal(wav.readUInt32LE(24), 48_000);
  assert.equal(wav.readUInt32LE(28), 96_000);
});

test("empty audio still produces a structurally valid file", () => {
  // Silence from a microphone nobody spoke into is a real case: the header
  // must describe zero samples correctly rather than disagree with itself.
  const wav = Buffer.from(wavFromPcm16k(""), "base64");
  assert.equal(wav.length, WAV_HEADER_BYTES);
  assert.equal(wav.readUInt32LE(4), 36);
  assert.equal(wav.readUInt32LE(40), 0);
});
