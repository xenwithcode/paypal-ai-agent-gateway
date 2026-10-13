// app/(app)/components/VoiceCommand.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
// Types only, so nothing credential-bearing is in this bundle: the SDK lives
// behind the route, never here.
import {
  describeVoiceToolCall,
  type VoiceHistoryEntry,
  type VoiceSurface,
  type VoiceToolCall,
} from "@/lib/voice/tools";

type Phase = "idle" | "listening" | "thinking" | "speaking";

/** Longest a single recording runs before it stops itself. A recorder nobody
 *  can end is a recorder that holds the microphone open by mistake — and a
 *  cap sized for an essay, in a product where the requests are one sentence.
 *  Ten seconds is several breaths; the operator can also stop it by hand. */
const MAX_SECONDS = 10;

/** What Live takes natively. The browser's own rate is resampled to this, so
 *  the server never has to guess what it was handed. */
const TARGET_RATE = 16_000;

// The reply decoder is shared: the typed path speaks through the same bytes
// at the same rate, and one fix lands for both.
import { playPcmReply } from "./voicePlayback";

/**
 * What the model actually *said*, with Live's own silence markers removed.
 *
 * A turn that carries no speech comes back transcribed as `<no speech>{pause}`
 * — observed for real against this configuration on 13-oct, along with a
 * twenty-eight-byte audio payload. Left in, that string is logged as a reply
 * the agent gave, which it did not: a marker is not a word, and a console
 * line is a record.
 */
function spokenWords(raw: string): string {
  return raw
    .replace(/<no speech>/gi, " ")
    .replace(/\{pause\}/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Convert one block of captured audio to 16 kHz PCM16.
 *
 * `new AudioContext({ sampleRate: 16000 })` is honoured by Chrome, Firefox and
 * recent Safari, but it is a request, not a guarantee — so the effective rate
 * is read back off the context and the numbers are resampled here when it
 * differs. Sending 44.1 kHz samples labelled as 16 kHz would arrive sounding
 * like a slowed-down recording and would read as "the model did not understand
 * me", which is a diagnosis pointing at entirely the wrong thing.
 */
function toPcm16(input: Float32Array, fromRate: number): Int16Array {
  const ratio = fromRate / TARGET_RATE;
  const outLength = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLength);

  if (ratio === 1) {
    for (let i = 0; i < input.length && i < outLength; i++) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return out;
  }

  for (let i = 0; i < outLength; i++) {
    const position = i * ratio;
    const head = Math.floor(position);
    const tail = Math.min(head + 1, input.length - 1);
    const blend = position - head;
    const sample = Math.max(-1, Math.min(1, input[head] * (1 - blend) + input[tail] * blend));
    out[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return out;
}

/** Concatenate the blocks and base64 them. In slices: spreading a few hundred
 *  thousand bytes into `fromCharCode` blows the call stack, and the failure
 *  would look like a network error. */
function toBase64(chunks: readonly Int16Array[]): string {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength), offset);
    offset += chunk.byteLength;
  }
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/**
 * Talk to the agent.
 *
 * Optional by construction, exactly like `VoiceFill`: the intent field it sits
 * above works whether or not this button does, so a denied microphone, an
 * unsupported browser or a refused request each end with a message and a
 * cursor still waiting in the box. Voice is an addition to the keyboard, never
 * a replacement for it — on a payments product the path that always works has
 * to be the one everybody already knows.
 *
 * What it does *not* do is invent authority. It sends audio to a server, the
 * server comes back with the tools the model asked for, and those are executed
 * by `onExecute` — which the dashboard wires to the same handlers its buttons
 * call. The judge, the envelope and the approval card are unchanged; only the
 * microphone is new.
 */
export default function VoiceCommand({
  rows,
  surface = "dashboard",
  onExecute,
  onLog,
}: {
  /** The table as it stands, so the model can name a row by its id. */
  rows: readonly { id: number; what: string; status: string; limit: number; currency: string }[];
  /**
   * Which screen this is.
   *
   * Sent with the recording, because it decides both halves of the turn on
   * the server: the prose the model reads and the tools it is offered. Two
   * surfaces, two briefs — a model offered a command nobody will execute
   * tends to execute it anyway.
   */
  surface?: VoiceSurface;
  /** Run what the model asked for and return the lines those handlers logged. */
  onExecute: (calls: VoiceToolCall[]) => Promise<string[]>;
  /** The console's own entry point. */
  onLog: (message: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");

  const recorderRef = useRef<{
    stream: MediaStream;
    context: AudioContext;
    processor: ScriptProcessorNode;
    chunks: Int16Array[];
  } | null>(null);
  const speakerRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);

  /**
   * What has been said, newest last — the conversation memory.
   *
   * A ref and not state: it is never rendered, only read when the next turn
   * begins. Each voice turn is its own HTTP request and its own Live session
   * — the deliberate shape of this gateway — so a question would die with the
   * turn that asked it without this, which is exactly what happened on
   * 13-oct: *"¿cuál es el importe máximo?"* → silence in the conversation →
   * the human's "$150" got attached to the wrong order. The browser owns it,
   * the same place this product keeps everything else; the server only reads
   * it, entry by entry, and never trusts it beyond its shape.
   */
  const historyRef = useRef<VoiceHistoryEntry[]>([]);
  const remember = (entries: readonly VoiceHistoryEntry[]) => {
    if (entries.length === 0) return;
    historyRef.current = [...historyRef.current, ...entries].slice(-16);
  };

  // A recording or a speaker that outlives the component would keep the
  // microphone or the audio device busy after the page is gone.
  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder) {
        recorder.processor.onaudioprocess = null;
        recorder.stream.getTracks().forEach((track) => track.stop());
        void recorder.context.close();
        recorderRef.current = null;
      }
      const source = sourceRef.current;
      if (source) {
        try {
          source.stop();
        } catch {
          /* already ended */
        }
      }
      void speakerRef.current?.close();
    },
    []
  );

  // Self-stopping while listening.
  useEffect(() => {
    if (phase !== "listening") return;
    const tick = window.setInterval(() => {
      setElapsed((seconds) => {
        if (seconds + 1 >= MAX_SECONDS) window.setTimeout(() => stopListening(), 0);
        return seconds + 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function stopSpeaking() {
    const source = sourceRef.current;
    if (!source) return;
    try {
      source.stop();
    } catch {
      /* already ended */
    }
    sourceRef.current = null;
  }

  function stopListening() {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorder.processor.onaudioprocess = null;
    recorder.stream.getTracks().forEach((track) => track.stop());
    void recorder.context.close();
    recorderRef.current = null;
    setPhase("thinking");
    void send(recorder.chunks);
  }

  /** The whole conversation: listen → ask → do → say. */
  async function send(chunks: readonly Int16Array[]) {
    setError("");
    try {
      const audio = toBase64(chunks);
      if (!audio) {
        setError("Nothing was captured — speak closer to the mic, or type it.");
        setPhase("idle");
        return;
      }

      // Rows are sent whole: the server decides how many fit in what the
      // model can act on and says out loud how many did not, rather than the
      // browser quietly dropping the tail of the table. The conversation
      // rides along for the same reason a question needs its answer: see
      // `historyRef`.
      const asked = await post({ step: "command", audio, rows, surface, history: historyRef.current });
      if (!asked.success) {
        fail(String(asked.error ?? "The agent could not hear that."));
        return;
      }

      const toolCalls: VoiceToolCall[] = Array.isArray(asked.toolCalls) ? asked.toolCalls : [];
      // The words, if any: `<no speech>{pause}` is a marker, not a reply —
      // see `spokenWords`.
      const said = spokenWords(String(asked.replyText ?? ""));
      // …and the human's own words, transcribed: the other half of the
      // record. Logged so the console shows both sides — which also ends the
      // old doubt "did I pronounce that right" — and remembered, because it
      // is what a bare "$150" is an answer *to*.
      const heard = spokenWords(String(asked.inputText ?? ""));
      if (heard) {
        onLog(`🧑 [HUMAN] ${heard}`);
        remember([{ role: "human", text: heard }]);
      }
      let lines: string[] = [];

      if (toolCalls.length > 0) {
        for (const call of toolCalls) onLog(`🎙️ [VOICE] ${describeVoiceToolCall(call)}`);
        // The model often speaks *while* it asks — "searching for chelsea
        // boots under two hundred" — and that line used to be discarded
        // because the branch below only played prose replies. It is the
        // "Buscando…" moment: the human hears what is about to be asked for
        // while the gateway works, not only the verdict afterwards. Playing
        // it does not weaken rule 1 — it is an *intent*, and what happened is
        // still narrated from the console lines below, after the handlers.
        if (said || asked.replyAudio) {
          await speak(said, String(asked.replyAudio ?? ""));
        }
        setPhase("thinking");
        lines = await onExecute(toolCalls);
        // A command the gateway refuses still deserves an answer out loud —
        // and it is the *gateway's* line that gets narrated, not the model's
        // guess, so what the human hears matches what the console shows.
        if (asked.rejected) lines = [`⚠️ [VOICE] ${String(asked.rejected)}`, ...lines];
      } else if (asked.rejected) {
        lines = [`⚠️ [VOICE] ${String(asked.rejected)}`];
      } else if (said || asked.replyAudio) {
        // It answered in prose — a question back at the human, and there is
        // nothing to report, because nothing was executed.
        if (asked.replyAudio) {
          await speak(said, String(asked.replyAudio));
          remember([{ role: "agent", text: said }]);
          return;
        }
        // The turn came back **text-only**: a real question with no PCM to
        // play — seen for real on 13-oct, where the operator read "¿cuál es
        // el presupuesto máximo?" in the console and heard silence. A
        // question nobody hears is a question nobody can answer, so the
        // report step speaks the same sentence — and that call is known to
        // come back with audio.
        const respoken = await post({ step: "report", lines: [said] }).catch(() => null);
        if (respoken && respoken.success === true && typeof respoken.audio === "string" && respoken.audio) {
          await speak(String(respoken.text || said), String(respoken.audio));
          remember([{ role: "agent", text: spokenWords(String(respoken.text || "")) || said }]);
        } else {
          onLog(`🔊 [AGENT] ${said}`);
          onLog("⚠️ [VOICE] The reply arrived as text only and could not be re-spoken — it is in the console.");
          setPhase("idle");
        }
        return;
      } else {
        setError("Nothing came back from that. Say it again, or type it.");
        setPhase("idle");
        return;
      }

      if (lines.length === 0) {
        // The model asked for something and no handler produced a line. Say
        // so rather than narrating silence.
        lines = ["⚠️ [VOICE] The gateway ran that command and logged nothing about it."];
      }

      const reported = await post({ step: "report", lines });
      if (!reported.success) {
        // The action already happened and is already in the console. The
        // missing piece is only the voice, so this is a shrug, not a failure —
        // and pretending otherwise would make the log disagree with reality.
        onLog(`⚠️ [VOICE] ${String(reported.error ?? "No spoken reply came back.")}`);
        setPhase("idle");
        return;
      }

      await speak(String(reported.text ?? ""), String(reported.audio ?? ""));
      // What the agent finally said — the narration of what really happened.
      // Remembered so the next turn can continue *this*: the ceiling question
      // the gateway just asked, or the candidates it just offered.
      remember([{ role: "agent", text: spokenWords(String(reported.text ?? "")) || said }]);
    } catch (err) {
      fail(err instanceof Error ? err.message : String(err));
    }
  }

  async function speak(text: string, audio: string) {
    if (!text && !audio) {
      setPhase("idle");
      return;
    }
    if (text) onLog(`🔊 [AGENT] ${text}`);
    if (!audio) {
      // Text without audio used to look exactly like a spoken reply in the
      // console — a 🔊 line and silence, which is how 13-oct's "¿cuál es el
      // presupuesto máximo?" was read and never heard. The prose branch
      // re-speaks through `report` when it can; this is the path where even
      // that failed, and silence must never again arrive unexplained.
      onLog("⚠️ [VOICE] The reply came back as text only — nothing to play.");
      setPhase("idle");
      return;
    }

    try {
      const context = speakerRef.current ?? new AudioContext();
      speakerRef.current = context;
      if (context.state === "suspended") await context.resume();
      setPhase("speaking");
      await playPcmReply(context, audio, (source) => {
        sourceRef.current = source;
      });
    } catch (err) {
      setError(
        `The reply could not be played${err instanceof Error ? ` (${err.message})` : ""} — it is in the console.`
      );
    } finally {
      setPhase("idle");
    }
  }

  function fail(message: string) {
    setError(message);
    onLog(`❌ [VOICE] ${message}`);
    setPhase("idle");
  }

  async function post(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await fetch("/api/agent/voice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `Could not reach the server${err instanceof Error ? ` (${err.message})` : ""}. Type it instead.`
      );
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (res.status === 429) {
      // Not a rejection: nothing was judged, so it must not read as the agent
      // turning the human down. The same distinction /api/agent makes.
      throw new Error(String(data.error ?? "Too many requests — wait a moment."));
    }
    if (!res.ok || data.success !== true) {
      throw new Error(String(data.error ?? "The voice agent could not answer."));
    }
    return data;
  }

  async function startListening() {
    setError("");

    // Created here, inside the click, so playback later has a context the
    // browser already considers allowed to make sound.
    speakerRef.current ??= new AudioContext();

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof ScriptProcessorNode === "undefined"
    ) {
      setError("This browser cannot capture audio — type the intent instead. It is always there.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      setError("The microphone is not available — allow it, or type the intent instead.");
      return;
    }

    try {
      const AudioCtor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const context = new AudioCtor({ sampleRate: TARGET_RATE });
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const chunks: Int16Array[] = [];
      const fromRate = context.sampleRate;

      processor.onaudioprocess = (event) => {
        // A copy: the buffer the event hands over is reused on the next block,
        // and holding it would play the whole recording back as the last
        // four thousand samples repeated.
        chunks.push(toPcm16(new Float32Array(event.inputBuffer.getChannelData(0)), fromRate));
      };

      source.connect(processor);
      // Connected so it fires, and deliberately silent: nothing is ever
      // written to the output side, so the microphone does not come back
      // through the speakers as feedback.
      processor.connect(context.destination);

      recorderRef.current = { stream, context, processor, chunks };
      setElapsed(0);
      setPhase("listening");
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop());
      setError(err instanceof Error ? err.message : "The recording could not start.");
      setPhase("idle");
    }
  }

  if (phase === "thinking") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3.5 py-2 text-xs font-bold text-blue-600"
        >
          <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden="true" />
          Asking the agent…
        </button>
        {error && <p className="max-w-[22rem] text-right text-[11px] leading-snug text-red-600">{error}</p>}
      </div>
    );
  }

  if (phase === "speaking") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={stopSpeaking}
          title="Stop the reply. Everything it was about to say is already in the console."
          className="inline-flex items-center gap-1.5 rounded-xl border border-blue-600 bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-blue-700"
        >
          <span aria-hidden="true">🔊</span> Speaking — click to stop
        </button>
        {error && <p className="max-w-[22rem] text-right text-[11px] leading-snug text-red-600">{error}</p>}
      </div>
    );
  }

  if (phase === "listening") {
    return (
      <div className="flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={stopListening}
          title={`Stop after ${elapsed}s. The longest recording is ${MAX_SECONDS}s.`}
          className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
        >
          <Square className="h-3 w-3 fill-current" strokeWidth={2.5} aria-hidden="true" />
          Listening · {elapsed}s
        </button>
        {error && <p className="max-w-[22rem] text-right text-[11px] leading-snug text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={() => void startListening()}
        title="Talk to the agent. It will act through exactly the handlers the buttons use, and the console will show what it did. Nothing is approved for you."
        className="inline-flex items-center gap-1.5 rounded-xl border border-blue-600 bg-blue-600 px-3.5 py-2 text-xs font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <Mic className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        Talk to paypal-ai-agent
      </button>
      {error && <p className="max-w-[22rem] text-right text-[11px] leading-snug text-red-600">{error}</p>}
    </div>
  );
}
