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
import { genaiClientFor, transcribeSpokenInput } from "@/lib/gemini";
import {
  describeHistory,
  isVoiceSurface,
  toolsFor,
  validateVoiceToolCall,
  type VoiceHistoryEntry,
  type VoiceSurface,
  type VoiceToolCall,
} from "@/lib/voice/tools";
import { normaliseTranscription } from "@/lib/voice/turn";

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
 * explanation. Twenty-five seconds was several times what a real answer took
 * — and still what a real answer exceeded once on 1-nov: the first voice call
 * against a cold revision timed out at25 s while the next three answered in
 * 5.1, 5.5 and 5.8 s. A judge who meets that red line once has met the whole
 * product, so the ceiling now sits where congestion fits inside it: forty
 * seconds is still short enough that a failure arrives while the human is
 * looking, and wide enough that a slow first call reads as patience.
 */
const TURN_TIMEOUT_MS = 40_000;

/** What one turn produced. */
type TurnResult = {
  /** Base64 PCM chunks as they arrive — joined once, as bytes, at the end. */
  audioChunks: string[];
  /** Concatenated base64 PCM — everything the model said, if it said it. */
  audio: string;
  /** The transcript of that audio, in chunks. */
  transcript: string;
  /** The *human's* speech, transcribed — what the model heard, in chunks.
   *  Logged so the record shows both sides of the conversation, and kept as
   *  the memory that ties a bare "$150" to the question it answers. */
  inputTranscript: string;
  /** Text modality, which this configuration does not request but the type
   *  allows; kept separate so the two can never interleave into one string. */
  text: string;
  toolCalls: VoiceToolCall[];
  /** Set when the model asked for something the gateway refuses to run. */
  rejected: string;
};

/**
 * Join streamed base64 PCM into one decodable payload.
 *
 * Base64 is not concatenation-safe: a chunk that ends mid-quantum carries
 * padding, and `"xxxx=" + "yyyy"` is invalid at the browser's `atob` — which
 * is exactly the error an operator's console showed on 13-oct while the
 * spoken question that sat in it stayed unplayable. Measured that night:
 * every streamed reply carried a one-byte first chunk (`xxx=`), so *every*
 * multi-chunk turn decoded to garbage, and the replies that had played
 * before did so only by the alignment of their chunks.
 *
 * Decode each chunk to bytes and concatenate those: bytes have no alignment
 * opinions, and the result is one canonical payload with its padding where
 * it belongs — at the end.
 */
function joinPcmChunks(chunks: readonly string[]): string {
  const buffers: Buffer[] = [];
  for (const chunk of chunks) {
    if (!chunk) continue;
    // `Buffer.from` is lenient about malformed base64 — it decodes what it
    // can and stops — which is the behaviour wanted here: one corrupt chunk
    // must not cost the whole reply its voice.
    buffers.push(Buffer.from(chunk, "base64"));
  }
  return Buffer.concat(buffers).toString("base64");
}

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
    inputAudioTranscription?: object;
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

  const result: TurnResult = {
    audioChunks: [],
    audio: "",
    transcript: "",
    inputTranscript: "",
    text: "",
    toolCalls: [],
    rejected: "",
  };
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
            if (message.serverContent?.turnComplete)
              finish(() => {
                // Joined as bytes, once, here — see `joinPcmChunks`.
                result.audio = joinPcmChunks(result.audioChunks);
                resolve(result);
              });
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
      into.audioChunks.push(part.inlineData.data);
    }
    if (part.text) into.text += part.text;
  }

  // The transcript of what was *spoken*. This is what gets logged, because a
  // console line quoting the audio is the only version of the reply a reader
  // who cannot play it will ever see.
  const spoken = message.serverContent?.outputTranscription?.text;
  if (spoken) into.transcript += spoken;

  // …and the transcript of what the *human* spoke: the other half of the
  // record, and the raw material of the conversation memory. Without it the
  // next turn cannot know that "$150" answered a ceiling question.
  const heard = message.serverContent?.inputTranscription?.text;
  if (heard) into.inputTranscript += heard;
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
function commandInstructions(
  surface: VoiceSurface,
  rows: string,
  historyText: string
): string {
  const shared = [
    "",
    "Rules:",
    "1. When the human asks you to DO something, call exactly one tool. Never claim an action happened — the gateway executes it and tells you what really occurred.",
    "2. When the human asks about money or status, call the tool that reads it. Never state a figure from memory.",
    "3. When you call a tool, also SPEAK one short line — ten words or fewer, in the language the human spoke — naming what you are about to ask the gateway to do, as if thinking out loud while it works: \"Searching for chelsea boots under two hundred dollars.\" The human hears it right away. This is an intention, never a result.",
    "4. Otherwise answer in one short spoken sentence, twenty words or fewer, in the language the human spoke. No lists, no markdown, no greetings.",
    "5. If you cannot tell which record they mean, ask — one short question. Do not guess an id.",
    // The fix for the closed cycle, seen for real on 13-oct: the agent asked
    // for a ceiling, the turn ended, and "$150" arrived with nothing tying it
    // to the question — so the model attached it to the nearest order in the
    // table and drafted the wrong one. Continuity is the browser's memory,
    // handed back as prose; this rule is what makes the model use it.
    "6. A conversation continues across turns. When your newest line asked a question — an amount, which record — and the human's newest words answer it, carry that same task on with what they just gave you; do not restart it and do not replace it with a different order. If they name only an amount and no question of yours is waiting, ask which order it is for — never attach an amount to an order they did not name.",
    "7. Spending needs an amount from the human. If they did not say the most they want to spend — or how much to invest or send — ask for it in one short question BEFORE calling a tool that spends. Never choose an amount for them; the gateway refuses a draft that names no ceiling.",
  ];

  // The memory, newest last: what the human said, as they said it, and what
  // you answered. Absent on a first turn — a fresh conversation opens with
  // the table, not with a phantom history.
  const conversation = historyText
    ? ["", "The conversation so far (newest last):", historyText].join("\n")
    : "";

  if (surface === "crowdfunding") {
    return [
      "You are the voice of PayPal AI Crowdfunding, where a person funds a real business in Venezuela from $20 and earns a share in USD. The human speaks; you decide which project to prepare an investment in, and for how much.",
      ...shared,
      "8. An investment you ask for is only *prepared* — the panel fills with that project and amount, the server judges it against the campaign's band and goal, and the human approves it in PayPal. Say it that way: you prepare it, they approve it.",
      "",
      "Projects in the showcase right now:",
      rows,
      conversation,
    ].join("\n");
  }

  return [
    "You are the voice of PayPal AI Agent Gateway, a spend governor for AI agents. The human speaks; you decide what to ask the gateway for.",
    ...shared,
    "",
    "Orders on the table right now:",
    rows,
    conversation,
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
    "Now say ONE short spoken confirmation of what actually happened — thirty words or fewer.",
    "If a line reports a refusal or an error, say it was refused and why, briefly.",
    "If a line says options or candidates were found, NAME what was searched for, say how many were found, ask which one they like, and say what happens next: they choose one, you draft the order, and nothing is bought until they approve it in PayPal. Example: \"I found three motorcycle jackets — which one do you like? Choose one and I'll draft it; nothing is bought until you approve it.\" Do not describe any product you were not given.",
    "If a line says nothing in the catalog matched, say so plainly: nothing was found for what they asked for, so the order was created without a product and its condition stays unverified until something matches.",
    "If a line asks the human a question — a missing ceiling, an unknown record — say the question back, briefly, as a question.",
    "Do not repeat the lines verbatim, do not add advice, do not mention tools or logs.",
  ].join("\n");
}

export type VoiceCommandOutcome = {
  /** What the model asked for. Empty when it answered in prose instead. */
  toolCalls: VoiceToolCall[];
  /** Base64 PCM at 24 kHz — the model's voice, when it used it. */
  replyAudio: string;
  replyText: string;
  /** The human's own words, as the model heard them. Empty when silence. */
  inputText: string;
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
  /**
   * What was said before this turn, as prose — the browser's memory, newest
   * last. Each turn is its own session by design; this is how a question
   * survives the end of the turn that asked it.
   */
  history?: readonly VoiceHistoryEntry[];
}): Promise<VoiceCommandOutcome> {
  // Normalised here rather than trusted from the route: this module owns the
  // vocabulary, and a surface nobody can run would send the model a tool list
  // the handler has no case for.
  const surface = isVoiceSurface(input.surface) ? input.surface : "dashboard";
  const historyText = describeHistory(input.history ?? []);

  const result = await runTurn(
    {
      responseModalities: [Modality.AUDIO],
      tools: [{ functionDeclarations: declarationsFor(surface) }],
      outputAudioTranscription: {},
      // The human's side of the transcript: logged so the record shows both
      // halves, and kept as the memory that ties a bare "$150" to the
      // ceiling question it answers.
      inputAudioTranscription: {},
      speechConfig: SPEECH,
      systemInstruction: {
        parts: [{ text: commandInstructions(surface, input.rows, historyText) }],
      },
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

  // What the human said, from whichever of the two readers actually read it.
  //
  // Live is asked for its own transcription on every turn, and measured on
  // 1-nov it stopped returning one (`inputText` came back empty while the
  // reply transcribed as always). Without this line the browser never writes
  // the human's half of the memory, so the answer to the agent's own question
  // arrives on the next turn with nothing to answer *for* — the model sees a
  // question and a bare amount and no order to attach them to, which is the
  // "it asked again and did nothing" the operator heard. The second opinion
  // is only asked when the first one said nothing; see `transcribeSpokenInput`.
  const inputTranscript =
    normaliseTranscription(result.inputTranscript) ||
    (await transcribeSpokenInput(input.audio, "audio/pcm;rate=16000"));

  return {
    toolCalls: result.toolCalls,
    replyAudio: result.audio,
    replyText: result.transcript || result.text,
    inputText: inputTranscript,
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
