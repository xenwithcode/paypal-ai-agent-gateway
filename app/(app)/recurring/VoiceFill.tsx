// app/(app)/recurring/VoiceFill.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
// Type-only, so it is erased before the bundle is built: `lib/gemini.ts`
// holds the credential-reading module, and this file is client-side.
import type { SpokenService } from "@/lib/gemini";

type Phase = "idle" | "recording" | "thinking";

/** Longest a single recording is allowed to run before it stops itself. */
const MAX_SECONDS = 15;

/**
 * Fill the recurring form by speaking.
 *
 * Optional by construction: the form this feeds is on the page whether this
 * button works or not, so a denied microphone, an unsupported browser or a
 * refused request each end with a message and a cursor still waiting in the
 * first field. A path that only works sometimes has to be one you can decline,
 * and this is a payments form — the fallback is not a nicety.
 *
 * It fills and stops there. Nothing is submitted, no order is created, and the
 * approval card still decides: speech is another way to *say* something, not a
 * way to have already agreed to it. A form that skipped its own review because
 * it arrived by voice would treat having spoken as having authorised.
 */
export default function VoiceFill({
  onStart,
  onFilled,
  onError,
}: {
  /** Called first, so the form is on screen before anything lands in it. */
  onStart: () => void;
  onFilled: (fields: SpokenService) => void;
  onError: (message: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Cleared on unmount: a recording that outlives its component would keep a
  // timer running against state nobody can see.
  useEffect(
    () => () => {
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      recorderRef.current = null;
    },
    []
  );

  /** The first format this browser both supports and the endpoint accepts. */
  function pickMimeType(): string | undefined {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return candidates.find((type) => MediaRecorder.isTypeSupported(type));
  }

  function toBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    // In slices: `String.fromCharCode(...bytes)` on a large recording blows the
    // call stack, and the failure would look like a network error.
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
  }

  const stopRecording = () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setPhase("thinking");
    recorder.stop();
  };

  const start = async () => {
    onError("");
    // The form opens first, so the fields are on screen before anything is
    // put into them — the result has somewhere to land.
    onStart();

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      onError("This browser cannot record audio — type the form instead. It is always there.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onError("The microphone is not available — allow it, or type the form instead.");
      return;
    }

    try {
      const mimeType = pickMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        recorderRef.current = null;
        stream.getTracks().forEach((track) => track.stop());
        void finish(chunksRef.current, (recorder.mimeType || mimeType || "audio/webm").split(";")[0]);
      };

      recorderRef.current = recorder;
      setElapsed(0);
      setPhase("recording");
      recorder.start();
    } catch (error) {
      stream.getTracks().forEach((track) => track.stop());
      onError(error instanceof Error ? error.message : "The recording could not start.");
      setPhase("idle");
    }
  };

  /** Send it, and put whatever came back into the form. */
  const finish = async (chunks: Blob[], mimeType: string) => {
    try {
      const bytes = await new Blob(chunks, { type: mimeType }).arrayBuffer();
      const res = await fetch("/api/recurring/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ audio: toBase64(bytes), mimeType }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        error?: string;
        fields?: Partial<SpokenService>;
      };

      if (!res.ok || !data.success || !data.fields?.service) {
        onError(
          data.error ??
            "Nothing recognizable came back — say the service, the amount and the date, or type it."
        );
        return;
      }

      onFilled({
        service: data.fields.service ?? "",
        url: data.fields.url ?? "",
        amount: data.fields.amount ?? "",
        currency: data.fields.currency === "PYUSD" ? "PYUSD" : "USD",
        date: data.fields.date ?? "",
      });
    } catch (error) {
      onError(
        `The recording could not be sent${error instanceof Error ? ` (${error.message})` : ""} — type the form instead.`
      );
    } finally {
      setPhase("idle");
      setElapsed(0);
    }
  };

  // Self-stopping: a recording nobody can end is a recording that holds the
  // microphone open by mistake.
  useEffect(() => {
    if (phase !== "recording") return;
    const tick = window.setInterval(() => {
      setElapsed((seconds) => {
        if (seconds + 1 >= MAX_SECONDS) window.setTimeout(() => stopRecording(), 0);
        return seconds + 1;
      });
    }, 1000);
    return () => window.clearInterval(tick);
  }, [phase]);

  if (phase === "thinking") {
    return (
      <button
        type="button"
        disabled
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-400"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} aria-hidden="true" />
        Understanding…
      </button>
    );
  }

  if (phase === "recording") {
    return (
      <button
        type="button"
        onClick={stopRecording}
        title={`Stop after ${elapsed}s. The longest recording is ${MAX_SECONDS}s.`}
        className="inline-flex items-center gap-1.5 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2 text-xs font-bold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
      >
        <Square className="h-3 w-3 fill-current" strokeWidth={2.5} aria-hidden="true" />
        Stop · {elapsed}s
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void start()}
      title="Fill the form by speaking. Nothing is sent until you press Add service."
      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <Mic className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
      Fill by voice
    </button>
  );
}
