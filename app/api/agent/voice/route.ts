// app/api/agent/voice/route.ts
//
// Two steps, one route, because they are two halves of one conversation and
// draw on one wallet.
//
//   command → the human spoke. Model decides *what* should happen.
//   report  → the browser ran it. Model says *what did* happen, out loud.
//
// The split is deliberate and is the reason there is no WebSocket server
// here. The handlers that perform an action live in the browser, because
// that is where the table lives — and every one of them already posts to a
// server route that judges it. So the browser executes through exactly the
// code path the buttons use, and the spoken reply is written from the lines
// those handlers actually logged rather than from what the model hoped would
// happen. Speech gets no separate authority; it gets a microphone in front of
// the same doors.
//
// Both steps sit behind the shared meter. They are one feature drawing on one
// budget, so a per-route counter would double the rate against a single pot of
// credits — the exact thing the limiter exists to prevent.
//
import { NextRequest, NextResponse } from "next/server";
import { agentRateLimit, keyFromHeaders } from "@/lib/rateLimit";
import { askVoiceAgent, speakAbout, voiceUnavailableReason } from "@/lib/voice/live";
import { describeRowsForVoice } from "@/lib/voice/tools";

/**
 * Largest recording accepted, as base64 characters.
 *
 * Fifteen seconds of PCM16 at 16 kHz is 480 KB, or 640 KB once encoded. This
 * bounds what arrives *before* it is decoded, which is the only place a size
 * limit saves the work it is meant to save.
 */
const MAX_AUDIO_CHARS = 900_000;

/** Longest a single recording may be, in seconds — the same cap the browser
 *  enforces, re-stated here because a client's cap is a request, not a rule. */
const MAX_RECORDING_SECONDS = 15;

/** The console is capped at 100 lines; asking the model to narrate more than
 *  the log can hold would produce a reply about events nobody can see. */
const MAX_REPORT_LINES = 40;
const MAX_REPORT_LINE_CHARS = 400;

/** Rows are only used to build prose for the model, so a malformed one is
 *  dropped rather than rejected — an odd entry must not cost the whole turn. */
const MAX_ROWS_IN = 200;

type RowSummary = { id: number; what: string; status: string; limit: number; currency: string };

function readRows(raw: unknown): RowSummary[] {
  if (!Array.isArray(raw)) return [];
  const out: RowSummary[] = [];
  for (const item of raw.slice(0, MAX_ROWS_IN)) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const row = item as Record<string, unknown>;
    if (typeof row.id !== "number" || !Number.isFinite(row.id)) continue;
    out.push({
      id: Math.trunc(row.id),
      what: typeof row.what === "string" && row.what ? row.what : "(unnamed order)",
      status: typeof row.status === "string" && row.status ? row.status : "unknown",
      limit: typeof row.limit === "number" && Number.isFinite(row.limit) ? row.limit : 0,
      currency: typeof row.currency === "string" ? row.currency : "",
    });
  }
  return out;
}

export async function POST(req: NextRequest) {
  // Before the body, for the reason /api/agent does it: a request we are
  // about to spend a model call on is the one worth counting first.
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

  // Configuration before connection: a machine without credentials answers
  // instantly with a sentence, instead of spending the timeout to learn it.
  const unavailable = voiceUnavailableReason();
  if (unavailable) {
    return NextResponse.json({ success: false, error: unavailable }, { status: 503 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "A JSON body is required." }, { status: 400 });
    }

    const { step, audio, rows, lines } = body as {
      step?: unknown;
      audio?: unknown;
      rows?: unknown;
      lines?: unknown;
    };

    if (step === "command") {
      if (typeof audio !== "string" || !audio.length) {
        return NextResponse.json(
          { success: false, error: "audio must be the recording, as a string." },
          { status: 400 }
        );
      }
      if (audio.length > MAX_AUDIO_CHARS) {
        return NextResponse.json(
          {
            success: false,
            error: `That recording is longer than ${MAX_RECORDING_SECONDS} seconds of speech.`,
          },
          { status: 413 }
        );
      }

      const outcome = await askVoiceAgent({
        audio,
        rows: describeRowsForVoice(readRows(rows)),
      });

      return NextResponse.json({
        success: true,
        toolCalls: outcome.toolCalls,
        replyAudio: outcome.replyAudio,
        replyText: outcome.replyText,
        rejected: outcome.rejected,
      });
    }

    if (step === "report") {
      if (!Array.isArray(lines) || lines.length === 0) {
        return NextResponse.json(
          { success: false, error: "lines must carry at least what happened." },
          { status: 400 }
        );
      }
      if (lines.length > MAX_REPORT_LINES) {
        return NextResponse.json(
          { success: false, error: `At most ${MAX_REPORT_LINES} lines can be narrated at once.` },
          { status: 400 }
        );
      }

      // Only real strings, trimmed, each one bounded. These become the model's
      // entire view of what happened, so a `null` in the middle of the array
      // would turn into the word "null" in a sentence spoken to a human.
      const spoken = lines
        .filter((line): line is string => typeof line === "string")
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, MAX_REPORT_LINES)
        .map((line) => line.slice(0, MAX_REPORT_LINE_CHARS));

      if (spoken.length === 0) {
        return NextResponse.json(
          { success: false, error: "lines must carry at least what happened." },
          { status: 400 }
        );
      }

      const reply = await speakAbout(spoken);
      return NextResponse.json({ success: true, audio: reply.audio, text: reply.text });
    }

    return NextResponse.json(
      { success: false, error: 'step must be "command" or "report".' },
      { status: 400 }
    );
  } catch (error) {
    // Never let a detail reach the browser from an unexpected failure — the
    // server log is where it belongs, and the operator's fallback is the form.
    // Every message raised by lib/voice/live.ts is one this project wrote, but
    // they travel with an upstream error string attached, and that string is
    // not ours to show.
    console.error("[/api/agent/voice] Unhandled error:", error);
    const message =
      process.env.NODE_ENV === "production"
        ? "The voice agent could not answer. Type the intent instead — the form is always there."
        : error instanceof Error
          ? error.message
          : "Unknown error.";
    return NextResponse.json({ success: false, error: message }, { status: 502 });
  }
}
