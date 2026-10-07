// app/api/recurring/parse/route.ts
//
// Spoken words → the four fields the recurring form asks for.
//
// This spends the same budget as /api/agent does — one Gemini call — so it
// sits behind the same limiter. Two routes, one meter, because they draw on
// one wallet: a per-route counter would double the rate against a single pot
// of credits, which is the exact thing the limiter exists to prevent.
//
// What it does not do is submit anything. It returns suggestions for a form
// the operator still sees, edits and confirms, and the row it eventually
// creates still goes through the approval card. Voice shortens the typing;
// it does not shorten the consent — a path that skipped the form because it
// came from a microphone would treat speech as authority, and speech is just
// another way to say something you have not agreed to yet.

import { NextRequest, NextResponse } from "next/server";
import { parseSpokenService } from "@/lib/gemini";
import { agentRateLimit, keyFromHeaders } from "@/lib/rateLimit";

/**
 * Largest body accepted.
 *
 * Ten seconds of speech as webm/opus is well under half a megabyte of
 * base64; this bounds what arrives *before* it is decoded, which is the only
 * place a size limit saves the work it is meant to save.
 */
const MAX_AUDIO_CHARS = 2_000_000;

/** Audio only. A payload of some other kind is not a transcription job. */
const AUDIO_TYPES = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
]);

export async function POST(req: NextRequest) {
  // Before the body, and for the reason /api/agent does it: a request we are
  // about to spend credits on is the one worth counting first.
  const limit = agentRateLimit.check(keyFromHeaders(req.headers));
  if (!limit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: `Too many requests — wait ${limit.retryAfterSeconds} second${
          limit.retryAfterSeconds === 1 ? "" : "s"
        } and try again.`,
      },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A JSON body is required." }, { status: 400 });
    }

    const { audio, mimeType } = body as { audio?: unknown; mimeType?: unknown };

    if (typeof audio !== "string" || !audio.length) {
      return NextResponse.json(
        { success: false, error: "audio must be the recording, as a string." },
        { status: 400 }
      );
    }
    if (audio.length > MAX_AUDIO_CHARS) {
      return NextResponse.json(
        { success: false, error: "That recording is longer than this endpoint accepts." },
        { status: 413 }
      );
    }
    if (typeof mimeType !== "string" || !AUDIO_TYPES.has(mimeType)) {
      return NextResponse.json(
        { success: false, error: "mimeType must be an audio type this endpoint accepts." },
        { status: 400 }
      );
    }

    const result = await parseSpokenService(audio, mimeType);

    if (!result.fields) {
      return NextResponse.json(
        { success: false, error: result.reason ?? "Nothing could be understood." },
        { status: 422 }
      );
    }

    return NextResponse.json({ success: true, source: result.source, fields: result.fields });
  } catch (error) {
    // Never let a detail reach the browser from an unexpected failure — the
    // server log is where it belongs, and the operator's fallback is the form.
    console.error("[/api/recurring/parse] Unhandled error:", error);
    return NextResponse.json(
      { success: false, error: "The recording could not be read. Type it instead — the form is always there." },
      { status: 500 }
    );
  }
}
