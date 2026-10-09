// lib/voice/live.ts
//
// The bridge to Gemini Live — server-side, always.
//
// The API key (or the ADC credential) must never reach the browser, so the
// microphone's audio comes here, this opens a short-lived session against the
// Live API, and the browser gets back only what it needs: the tool calls to
// run, and the audio to play.
//
// Every finding in this file was made against the real API, not the docs:
//
//  · `gemini-3.8-live` answers from `us-central1` and 404s from `global`,
//    which is exactly backwards from `gemini-3.8-flash`. Region and model are
//    not independent choices, and this is the second time this project has
//    been bitten by it.
//  · `responseModalities: ["AUDIO", "TEXT"]` is rejected outright —
//    "Unsupported modality for Vertex Live API". Audio only; the transcript
//    comes back on `outputTranscription`.
//  · A tool call arrives on `message.toolCall.functionCalls`, NOT inside
//    `serverContent.modelTurn.parts`. Reading only the latter produced turns
//    that completed with nothing in them, which looked exactly like a model
//    that had chosen not to answer.
//
import { GoogleGenAI, Modality, type FunctionDeclaration, type LiveServerMessage } from "@google/genai";
// One definition of "how do I authenticate", reused from the module that
// already owns it — with a different location, because Live is served from a
// different region than the text model is.
import { genaiClientFor } from "@/lib/gemini";
import {
  isVoiceSurface,
  toolsFor,
  validateVoiceToolCall,
  type VoiceSurface,
  type VoiceToolCall,
} from "@/lib/voice/tools";

const MODEL = process.env.GEMINI_LIVE_MODEL?.trim() || "gemini-3.8-live";

/**
 * `us-central1`, not `GCP_LOCATION`. Verified: the live model 404s from
 * `global` and the text model 404s from here. Keeping them apart in the
 * environment rather than in a comment is what stops the next person from
 * "fixing" one by copying the other.
 */
const LOCATION = process.env.GEMINI_LIVE_LOCATION?.trim() || "us-central1";

/** Which of the ~30 prebuilt voices speaks for the agent. */
const VOICE = process.env.GEMINI_LIVE_VOICE?.trim() || "Aoede";

/**
 * Why the agent cannot listen right now, or null when it can.
 *
 * Checked before a session is opened rather than after it fails, so a machine
 * with no credentials answers instantly with a sentence the operator can act
 * on instead of waiting twenty-five seconds for a timeout that explains
 * nothing. This message is safe to show in any environment — it describes
 * configuration, not internals — so the route returns it unguarded.
 */
export function voiceUnavailableReason(): string | null {
  return genaiClientFor(LOCATION)
    ? null
    : "No Gemini credentials are configured on the server, so the agent cannot hear you. Type the intent instead — the form is always there.";
}

/**
 * How long one turn may take before the request gives up.
 *
 * A Live session that never completes would hold an HTTP request open until
 * the platform kills it, and the operator would see a spinner with no
 * explanation. Twenty-five seconds is several times what a real answer takes
 * and still short enough that a failure arrives while the user is looking.
 */
const TURN_TIMEOUT_MS = 25_000;

/** What one turn produced. */
type TurnResult = {
  /** Concatenated base64 PCM — everything the model said, if it said it. */
  audio: string;
  /** The transcript of that audio, in chunks. */
  transcript: string;
  /** Text modality, which this configuration does not request but the type
   *  allows; kept separate so the two can never interleave into one string. */
  text: string;
  toolCalls: VoiceToolCall[];
  /** Set when the model asked for something the gateway refuses to run. */
  rejected: string;
};

/**
 * Open a session, hand it to `send`, and wait for the turn to complete.
 *
 * The promise is created before `connect` resolves so that a callback firing
 * early still has somewhere to land, and the session is closed on *every* exit
 * — success, refusal, error or timeout. A Live connection lives about ten
 * minutes and bills while it does; leaking one per request would be a slow,
 * invisible leak of the credits this project is running on.
 */
async function runTurn(
  config: {
    responseModalities: Modality[];
    tools?: { functionDeclarations: FunctionDeclaration[] }[];
    outputAudioTranscription?: object;
    speechConfig?: object;
    systemInstruction?: { parts: { text: string }[] };
  },
  send: (session: Awaited<ReturnType<GoogleGenAI["live"]["connect"]>>) => void
): Promise<TurnResult> {
  const ai = genaiClientFor(LOCATION);
  if (!ai) {
    throw new Error(
      "No Gemini credentials are configured on the server, so the agent cannot hear you. Type the intent instead — the form is always there."
    );
  }

  const result: TurnResult = { audio: "", transcript: "", text: "", toolCalls: [], rejected: "" };
  let settled = false;

  const turn = new Promise<TurnResult>((resolve, reject) => {
    let session: Awaited<ReturnType<GoogleGenAI["live"]["connect"]>> | null = null;

    const finish = (end: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        session?.close();
      } catch {
        // Already closed, or never opened. Either way the turn is over.
      }
      end();
    };

    const timer = setTimeout(
      () => finish(() => reject(new Error("The voice agent did not answer in time."))),
      TURN_TIMEOUT_MS
    );

    void ai.live
      .connect({
        model: MODEL,
        config,
        callbacks: {
          onmessage: (message: LiveServerMessage) => {
            ingest(message, result);
            if (message.serverContent?.turnComplete) finish(() => resolve(result));
          },
          onerror: (event: ErrorEvent) =>
            finish(() =>
              reject(new Error(`The live connection failed: ${event.message || "no detail"}.`))
            ),
          onclose: (event: CloseEvent) =>
            finish(() =>
              reject(
                new Error(
                  `The live connection closed before it answered${event.reason ? `: ${event.reason}` : "."}`
                )
              )
            ),
        },
      })
      .then((opened) => {
        session = opened;
        if (settled) {
          // The turn timed out while the socket was still being established.
          try {
            opened.close();
          } catch {
            /* nothing to undo */
          }
          return;
        }
        send(opened);
      })
      .catch((error: unknown) =>
        finish(() => reject(error instanceof Error ? error : new Error(String(error))))
      );
  });

  return turn;
}

/** Pull a message apart into the one result the caller is waiting for. */
function ingest(message: LiveServerMessage, into: TurnResult): void {
  // Top level. Reading only `modelTurn.parts` is what made this look broken.
  for (const raw of message.toolCall?.functionCalls ?? []) {
    accept(raw, into);
  }

  for (const part of message.serverContent?.modelTurn?.parts ?? []) {
    if (part.functionCall) accept(part.functionCall, into);
    if (part.inlineData?.data && (part.inlineData.mimeType ?? "").startsWith("audio/pcm")) {
      into.audio += part.inlineData.data;
    }
    if (part.text) into.text += part.text;
  }

  // The transcript of what was *spoken*. This is what gets logged, because a
  // console line quoting the audio is the only version of the reply a reader
  // who cannot play it will ever see.
  const spoken = message.serverContent?.outputTranscription?.text;
  if (spoken) into.transcript += spoken;
}

function accept(raw: { id?: string; name?: string; args?: Record<string, unknown> }, into: TurnResult): void {
  const verdict = validateVoiceToolCall({ id: raw.id, name: raw.name, args: raw.args ?? {} });
  if (verdict.ok) into.toolCalls.push(verdict.call);
  // One refusal, not one per attempt: a model that sends three bad calls in a
  // row still gets told the first reason, and the console reports one problem.
  else if (!into.rejected) into.rejected = verdict.reason;
}

/**
 * The declarations, converted to the SDK's own types.
 *
 * Per surface, and built on demand: a model offered a command it cannot run
 * will use it, so the showcase never sees `draftOrder` and the dashboard never
 * sees `investInProject`.
 *
 * `lib/voice/tools.ts` spells the schema the way the wire format spells it
 * (`"OBJECT"`, `"STRING"`) so that it stays loadable by a test with no
 * credentials on the machine; the SDK's `Type` is a string enum holding those
 * same values, so this is a change of spelling, not of meaning.
 */
function declarationsFor(surface: VoiceSurface): FunctionDeclaration[] {
  return toolsFor(surface).map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  })) as FunctionDeclaration[];
}

const SPEECH = { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } } };

/**
 * What the model is told before it hears anything.
 *
 * Three rules, and the third is the whole product: it may *request*, the
 * gateway *executes*, and nothing is reported until the gateway reports it.
 * An agent that narrates actions it has not performed is exactly the failure
 * this application exists to prevent — so the instruction that forbids it
 * belongs here, where the model is configured, not in a prompt someone could
 * later "improve" away.
 *
 * Two surfaces, two briefs: the verbs each one is offered are the verbs that
 * screen can run, so the model is never asked to choose between a command
 * nobody will execute and silence.
 */
function commandInstructions(surface: VoiceSurface, rows: string): string {
  const shared = [
    "",
    "Rules:",
    "1. When the human asks you to DO something, call exactly one tool. Never claim an action happened — the gateway executes it and tells you what really occurred.",
    "2. When the human asks about money or status, call the tool that reads it. Never state a figure from memory.",
    "3. Otherwise answer in one short spoken sentence, twenty words or fewer. No lists, no markdown, no greetings.",
    "4. If you cannot tell which record they mean, ask — one short question. Do not guess an id.",
  ];

  if (surface === "crowdfunding") {
    return [
      "You are the voice of PayPal AI Crowdfunding, where a person funds a real business in Venezuela from $20 and earns a share in USD. The human speaks; you decide which project to prepare an investment in, and for how much.",
      ...shared,
      "5. An investment you ask for is only *prepared* — the panel fills with that project and amount, the server judges it against the campaign's band and goal, and the human approves it in PayPal. Say it that way: you prepare it, they approve it.",
      "",
      "Projects in the showcase right now:",
      rows,
    ].join("\n");
  }

  return [
    "You are the voice of PayPal AI Agent Gateway, a spend governor for AI agents. The human speaks; you decide what to ask the gateway for.",
    ...shared,
    "",
    "Orders on the table right now:",
    rows,
  ].join("\n");
}

/**
 * What the model is told once the gateway has answered.
 *
 * The lines it receives are the console's own lines, which means the reply is
 * grounded in what the handlers actually logged — a refusal reads as a
 * refusal, and a capture reads as a capture, whether or not it succeeded.
 */
function reportInstructions(lines: readonly string[]): string {
  return [
    "The gateway executed your request and logged exactly this, oldest first:",
    "",
    ...lines.map((line) => `- ${line}`),
    "",
    "Now say ONE short spoken sentence — twenty words or fewer — confirming what actually happened.",
    "If a line reports a refusal or an error, say it was refused and why, briefly.",
    "Do not repeat the lines verbatim, do not add advice, do not mention tools or logs.",
  ].join("\n");
}

export type VoiceCommandOutcome = {
  /** What the model asked for. Empty when it answered in prose instead. */
  toolCalls: VoiceToolCall[];
  /** Base64 PCM at 24 kHz — the model's voice, when it used it. */
  replyAudio: string;
  replyText: string;
  /** Why a requested command will not run. Empty when nothing was refused. */
  rejected: string;
};

/**
 * Spoken command in, what-to-do out.
 *
 * The audio is sent as one message rather than streamed, which is what makes
 * this an HTTP request instead of a WebSocket server: one utterance, one
 * answer, no connection to keep alive and no custom Next.js server to fight
 * the dev HMR websocket over. Full-duplex would change how the audio travels;
 * it would not change this function's contract.
 */
export async function askVoiceAgent(input: {
  /** Base64 PCM16 mono at 16 kHz — the rate Live takes natively. */
  audio: string;
  /** `describeRowsForVoice` / `describeProjectsForVoice` output: the model cannot act on a record it cannot see. */
  rows: string;
  /** Which screen this turn belongs to. Unknown values fall back to the dashboard. */
  surface?: VoiceSurface;
}): Promise<VoiceCommandOutcome> {
  // Normalised here rather than trusted from the route: this module owns the
  // vocabulary, and a surface nobody can run would send the model a tool list
  // the handler has no case for.
  const surface = isVoiceSurface(input.surface) ? input.surface : "dashboard";

  const result = await runTurn(
    {
      responseModalities: [Modality.AUDIO],
      tools: [{ functionDeclarations: declarationsFor(surface) }],
      outputAudioTranscription: {},
      speechConfig: SPEECH,
      systemInstruction: { parts: [{ text: commandInstructions(surface, input.rows) }] },
    },
    (session) =>
      session.sendClientContent({
        turns: [
          {
            role: "user",
            parts: [{ inlineData: { mimeType: "audio/pcm;rate=16000", data: input.audio } }],
          },
        ],
        turnComplete: true,
      })
  );

  return {
    toolCalls: result.toolCalls,
    replyAudio: result.audio,
    replyText: result.transcript || result.text,
    rejected: result.rejected,
  };
}

/**
 * What happened, in the agent's voice.
 *
 * A second session rather than a second turn on the first one: the console
 * lines only exist after the browser has run the handlers, and keeping a
 * session open across two HTTP requests would mean server-side session state
 * for a product that has deliberately kept its state in the browser.
 */
export async function speakAbout(lines: readonly string[]): Promise<{ audio: string; text: string }> {
  const result = await runTurn(
    {
      responseModalities: [Modality.AUDIO],
      outputAudioTranscription: {},
      speechConfig: SPEECH,
      systemInstruction: {
        parts: [
          {
            text: "You are the voice of PayPal AI Agent Gateway. You speak in one short plain sentence at a time, never more than twenty words, and you never invent an outcome you were not given.",
          },
        ],
      },
    },
    (session) =>
      session.sendClientContent({
        turns: [{ role: "user", parts: [{ text: reportInstructions(lines) }] }],
        turnComplete: true,
      })
  );

  return { audio: result.audio, text: result.transcript || result.text };
}
