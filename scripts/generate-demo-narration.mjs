// scripts/generate-demo-narration.mjs
//
// Records the demo's narration once, with the same voice the spoken agent uses.
//
// Run it with the project's ADC credentials (the ones `lib/gemini.ts` already
// uses on Vertex):
//
//   node --experimental-strip-types scripts/generate-demo-narration.mjs
//
// The files are committed to `public/demo/audio`, because a demo that has to
// call a model before it can speak is a demo that can arrive late, fail in
// front of a judge, or cost a request every time someone presses play. This
// script is the recipe, not the runtime.
//
// The voice is **Aoede** (`GEMINI_LIVE_VOICE`), the same prebuilt voice the
// Live agent speaks with. The TTS model reads a style instruction and the
// line; it does not read the instruction aloud.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI } from "@google/genai";
import { DEMO_STEPS } from "../lib/demo/script.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const outDir = join(root, "public", "demo", "audio");

const PROJECT = process.env.GCP_PROJECT?.trim();
if (!PROJECT) {
  console.error("GCP_PROJECT is required — this uses the same Vertex/ADC route the app does.");
  process.exit(1);
}

/** The same voice the agent speaks with, and the film's only narrator. */
const VOICE = process.env.GEMINI_LIVE_VOICE?.trim() || "Aoede";
// 3.8-flash-tts measured ~90 words/minute on this narration — beautiful and
// unusably slow for a two-minute demo. 2.5-pro-tts says the same voice at a
// natural conversational pace, which is what the film needs.
const MODEL = "gemini-2.5-pro-preview-tts";
const LOCATION = "us-central1";

const STYLE =
  "Read the following as a warm, intimate, cinematic product-film narrator. " +
  "Be human, confident and quietly delighted, never an announcer and never robotic. " +
  "Use a natural conversational pace, with small pauses for emphasis. Say: ";

const ai = new GoogleGenAI({ vertexai: true, project: PROJECT, location: LOCATION });

/** WAV duration from its own header, so the measured value is the file's, not a guess. */
function wavDurationMs(buffer) {
  if (buffer.length < 44) return 0;
  const riff = buffer.toString("ascii", 0, 4);
  const wave = buffer.toString("ascii", 8, 12);
  if (riff !== "RIFF" || wave !== "WAVE") return 0;

  let offset = 12;
  let sampleRate = 24_000;
  let channels = 1;
  let bits = 16;
  let dataBytes = 0;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      channels = buffer.readUInt16LE(offset + 10);
      sampleRate = buffer.readUInt32LE(offset + 12);
      bits = buffer.readUInt16LE(offset + 22);
    } else if (id === "data") {
      dataBytes = size;
      break;
    }
    offset += 8 + size + (size % 2);
  }

  const bytesPerSecond = sampleRate * channels * (bits / 8);
  return bytesPerSecond > 0 ? Math.round((dataBytes / bytesPerSecond) * 1000) : 0;
}

await mkdir(outDir, { recursive: true });
const measured = {};

// `ONLY=07-purchase-orders` records one new beat without re-recording the
// whole film (and without changing the timing of files already in the repo).
const only = (process.env.ONLY ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

for (const step of DEMO_STEPS) {
  if (only.length > 0 && !only.includes(step.id)) continue;
  const filename = step.audio.split("/").pop();
  const destination = join(outDir, filename);
  process.stdout.write(`${step.id} … `);

  const response = await ai.models.generateContent({
    model: MODEL,
    contents: `${STYLE}${step.narration}`,
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
      },
    },
  });

  const part = response?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
  if (!part) {
    console.error(`\n${step.id}: the model returned no audio.`);
    process.exitCode = 1;
    continue;
  }

  const mime = part.inlineData.mimeType ?? "";
  const bytes = Buffer.from(part.inlineData.data, "base64");

  // 3.8-flash-tts returns a complete WAV. If a future model returns raw PCM,
  // wrap it rather than shipping a file no browser will play.
  let wav = bytes;
  if (/audio\/wav|audio\/x-wav/i.test(mime) || bytes.toString("ascii", 0, 4) === "RIFF") {
    wav = bytes;
  } else {
    const rate = Number(/rate=(\d+)/i.exec(mime)?.[1] ?? 24_000);
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + bytes.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(rate, 24);
    header.writeUInt32LE(rate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(bytes.length, 40);
    wav = Buffer.concat([header, bytes]);
  }

  await writeFile(destination, wav);
  const durationMs = wavDurationMs(wav);
  measured[step.id] = durationMs;
  console.log(`${(wav.length / 1024).toFixed(0)} KB · ${(durationMs / 1000).toFixed(1)} s`);
}

console.log("\nMeasured durations (paste into lib/demo/script.ts):\n");
console.log(JSON.stringify(measured, null, 2));
