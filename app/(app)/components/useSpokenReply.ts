// app/(app)/components/useSpokenReply.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { playPcmReply } from "./voicePlayback";

/**
 * Where the "speak after a typed draft" preference lives.
 *
 * A voice that answers every keystroke would be a nuisance with no way out,
 * so it is a preference — remembered, and default-on because a draft is the
 * one moment the agent has something worth saying: it just searched, judged
 * and created (or refused), and until now it only said so in the console.
 */
const STORAGE_KEY = "paypal-ai-agent.voice.replies.v1";

/**
 * The agent's voice for the *typed* path.
 *
 * The microphone turn already speaks twice — once when the model names what
 * it is about to ask for, once when the gateway reports what really happened.
 * A typed draft used to end in silence, which put two entry points to the
 * same agent at two different levels of courtesy. This closes that gap with
 * the same server step (`report`), the same audio format and the same console
 * line (`🔊 [AGENT]`), so the spoken record reads identically no matter how
 * the request arrived.
 *
 * Two rules it does not bend:
 *
 *  · **The context is created inside the click.** Autoplay policy lets a
 *    context that began inside a gesture keep talking; one created after the
 *    fetch resolves starts muted, with no error anyone can see. `prime()` is
 *    called from the button's own handler for exactly this reason.
 *  · **It narrates the console, never a hope.** The lines handed to
 *    `speakLines` are the lines the handlers logged — refusals included. A
 *    voice that softens a 409 would be telling a second story about an event
 *    the product records as one.
 */
export function useSpokenReply(onLog: (message: string) => void) {
  const [enabled, setEnabled] = useState(true);
  const contextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const logRef = useRef(onLog);
  logRef.current = onLog;

  // Read after mount: `localStorage` does not exist on the server, and the
  // two renders would disagree about the button's own label.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setEnabled(stored === "1");
    } catch {
      // Private mode or disabled storage: the default stands.
    }
  }, []);

  // A speaker that outlives the page would keep the audio device busy.
  useEffect(
    () => () => {
      const source = sourceRef.current;
      if (source) {
        try {
          source.stop();
        } catch {
          /* already ended */
        }
      }
      void contextRef.current?.close();
    },
    []
  );

  const toggle = useCallback(() => {
    setEnabled((previous) => {
      const next = !previous;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // The toggle still applies to this session either way.
      }
      return next;
    });
  }, []);

  /**
   * Create the speaker, inside a gesture. Idempotent, and cheap to call on
   * every draft — the first click pays for it, the rest find it there.
   */
  const prime = useCallback(() => {
    if (contextRef.current) return;
    const AudioCtor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return;
    contextRef.current = new AudioCtor();
  }, []);

  /**
   * Narrate what the console just recorded, if the operator wants a voice.
   *
   * Returns whether it spoke, so a caller can log or time around it. Failures
   * are reported to the console rather than thrown: the action already
   * happened and is already on screen — the missing piece is only the voice.
   */
  const speakLines = useCallback(
    async (lines: readonly string[]): Promise<boolean> => {
      if (!enabled || lines.length === 0) return false;
      const context = contextRef.current;
      if (!context) return false;

      try {
        // The reply is fetched and logged *before* the speaker is touched.
        // Autoplay policy can refuse to resume a context created outside a
        // trusted gesture — and when it does, the record must still be
        // complete: the console line is the narration of record, the audio
        // is the same line read aloud. A mute browser hears a lie of
        // silence; it must not lose the sentence.
        const res = await fetch("/api/agent/voice", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ step: "report", lines: [...lines] }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          success?: boolean;
          text?: string;
          audio?: string;
          error?: string;
        };
        if (res.status === 429) {
          // Not a refusal — it arrived too often, not too much. And nothing
          // is said aloud, because saying so would itself spend a turn.
          logRef.current(`⏳ [VOICE] ${data.error ?? "Too many spoken replies — wait a moment."}`);
          return false;
        }
        if (!res.ok || data.success !== true) {
          logRef.current(`⚠️ [VOICE] ${data.error ?? "No spoken reply came back."}`);
          return false;
        }
        if (data.text) logRef.current(`🔊 [AGENT] ${data.text}`);
        if (!data.audio) {
          // Text without audio is the one failure that looks exactly like
          // success in the console — a 🔊 line and silence. Say it.
          if (data.text) {
            logRef.current("⚠️ [VOICE] The reply came back as text only — nothing to play.");
          }
          return false;
        }

        // Only now the speaker: a refusal here costs sound, never record.
        if (context.state === "suspended") await context.resume();
        await playPcmReply(context, String(data.audio), (source) => {
          sourceRef.current = source;
        });
        return true;
      } catch (error) {
        logRef.current(
          `⚠️ [VOICE] The reply could not be played${error instanceof Error ? ` (${error.message})` : ""}.`
        );
        return false;
      }
    },
    [enabled]
  );

  return { enabled, toggle, prime, speakLines };
}
