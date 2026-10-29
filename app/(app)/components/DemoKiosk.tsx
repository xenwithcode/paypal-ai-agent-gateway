// app/(app)/components/DemoKiosk.tsx
//
// The floating ▶ control bar and the driver that walks the script in
// `lib/demo/script.ts`.
//
// Mounted once in `app/(app)/layout.tsx`, so it survives every client-side
// navigation the demo performs — the whole point is that the judge watches the
// real app move between screens, and a bar that blinked out on each route
// change would make it look like a slideshow.
//
// How it drives the pages: it does not. The pages drive themselves — Overview
// and Crowdfunding register their own handlers with `lib/demo/bus.ts` on
// mount, and this component asks the registry for "the page I am on" and calls
// one named function per step. That indirection is what keeps the demo honest:
// every action is the same function the button calls, so if the server
// refuses, the judge watches the refusal happen to the demo too.
//
// Cancellation: the driver is an async function started from an effect, and
// every `await` is followed by a `stillMine()` check against a run counter the
// effect cleanup bumps. Pause, skip and exit therefore interrupt cleanly
// mid-step — which matters, because the alternative is a script that keeps
// clicking after the judge pressed ✕.
//
// Narration: every caption is also read aloud through the browser's own
// `speechSynthesis` — no API key, no latency, and the voice says exactly the
// words on screen because both come from the same step. Which voice speaks is
// decided in `lib/demo/narration.ts` (pure, tested): an English voice, the
// least robotic one the machine has, or silence if there is none. The hold
// after each caption is a *minimum* — the beat waits out the sentence, capped
// so a broken engine cannot stall the run. The 🔈 switch in the bar mutes it
// and remembers.

"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Pause, Play, RotateCcw, SkipForward, Volume2, VolumeX, X } from "lucide-react";

import {
  exitDemo,
  finishDemo,
  getDemoSurface,
  pauseDemo,
  resumeDemo,
  skipDemoStep,
  startDemo,
  subscribeDemo,
  getDemoState,
  waitForDemoSurface,
} from "@/lib/demo/bus";
import {
  DEMO_STEPS,
  LAST_STEP_INDEX,
  type DemoRoute,
  demoProgress,
  stepAt,
} from "@/lib/demo/script";
import { SPEECH_GRACE_MS, forSpeech, pickVoice } from "@/lib/demo/narration";

/** Routes the driver knows how to be on; anything else is "not ours". */
const DEMO_ROUTES: readonly string[] = DEMO_STEPS.map((step) => step.route);

/** How long to wait for a page to register after navigating to it. */
const SURFACE_TIMEOUT_MS = 12_000;

/** Whether narration is on, remembered across sessions. Absent = on. */
const VOICE_STORAGE_KEY = "paypal-ai-agent.demo.voice";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function DemoKiosk() {
  // `getDemoState` doubles as the server snapshot: the demo's state is a
  // module singleton, it is idle on the server for every request, and the
  // first render must agree between the two.
  const state = useSyncExternalStore(subscribeDemo, getDemoState, getDemoState);
  const pathname = usePathname();
  const router = useRouter();

  /** Bumped by every effect cleanup: in-flight steps notice and stop. */
  const runRef = useRef(0);
  /** Steps whose action already ran, so resuming never repeats a click. */
  const completedRef = useRef<Set<number>>(new Set());
  /** Where the driver was last, to tell a restart from a pause. */
  const lastIndexRef = useRef(0);

  // Narration. `voiceOn` is the judge's switch ( remembered, default on );
  // the speaking itself lives in refs because it must not re-render the bar
  // on every utterance — the caption is the UI, the audio is a side effect.
  const [voiceOn, setVoiceOn] = useState(true);
  const voiceOnRef = useRef(voiceOn);
  voiceOnRef.current = voiceOn;
  /** Resolves when the utterance in flight ends — the driver waits on it. */
  const speechRef = useRef<Promise<void> | null>(null);
  /** Bumped by every `stopSpeech`, so a queued utterance knows it is stale. */
  const speechRunRef = useRef(0);
  /** Chrome hands out voices asynchronously; cached on mount, see below. */
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);

  // `getVoices()` answers `[]` until `voiceschanged` fires, which would make
  // the *first* caption of every visit silently unspoken. The kiosk is mounted
  // by the layout long before anyone presses ▶, so caching here means the
  // list is warm by the time it is read.
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const load = () => {
      voicesRef.current = synth.getVoices();
    };
    load();
    synth.addEventListener("voiceschanged", load);
    return () => synth.removeEventListener("voiceschanged", load);
  }, []);

  // Silence everything spoken: called by pause, skip, exit, unmount, and the
  // mute switch. Cancelling rather than letting the old caption finish is the
  // point — two voices on top of each other is worse than a cut sentence.
  const stopSpeech = useCallback(() => {
    speechRunRef.current += 1;
    speechRef.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  // Read a caption aloud. Guarded three ways: no speech synthesis in this
  // browser (SSR, or an old engine) → silently skip; no English voice on the
  // machine → the judge reads the caption instead of an accent mangling it;
  // voice switched off mid-flight → the run token makes it a no-op.
  const speakCaption = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    if (!synth) return;

    const myRun = ++speechRunRef.current;
    synth.cancel(); // never overlap with the previous beat

    const deliver = (voice: SpeechSynthesisVoice) => {
      // Voices can arrive between the check and here (`voiceschanged`), or
      // the judge can mute while this callback waits: both make it a no-op.
      if (speechRunRef.current !== myRun || !voiceOnRef.current) return;
      const done = new Promise<void>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(forSpeech(text));
        utterance.voice = voice;
        utterance.lang = voice.lang;
        // Neutral rate and pitch: the captions are written to be *read*, and
        // the default of every engine is already conversational. A judge who
        // wants them faster has the same switch as everybody else: mute.
        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        synth.speak(utterance);
      }).then(() => {
        if (speechRunRef.current === myRun) speechRef.current = null;
      });
      speechRef.current = done;
    };

    const cached = voicesRef.current.length ? voicesRef.current : synth.getVoices();
    const ready = pickVoice(cached);
    if (ready) {
      deliver(ready);
      return;
    }

    // No voice yet — on a cold `?demo=1` load Chrome may not have answered
    // `voiceschanged` when the script starts. Wait for it (once) instead of
    // losing the opening line; if nothing arrives, the caption stands alone.
    const onVoices = () => {
      synth.removeEventListener("voiceschanged", onVoices);
      if (speechRunRef.current !== myRun) return;
      voicesRef.current = synth.getVoices();
      const voice = pickVoice(voicesRef.current);
      if (voice) deliver(voice);
    };
    synth.addEventListener("voiceschanged", onVoices, { once: true });
  }, []);

  // Remember the judge's choice; absent or unreadable storage = default on.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(VOICE_STORAGE_KEY);
      if (stored === "off") setVoiceOn(false);
    } catch {
      // Storage can throw in private modes; the default already stands.
    }
  }, []);

  // Narrate the current caption whenever the demo starts a step (or resumes
  // into one). The effect keys on (status, index): a skip moves the index and
  // therefore reads the *next* caption, and a pause leaves `playing`, which
  // lands in the stop branch below.
  useEffect(() => {
    if (state.status !== "playing" || !voiceOn) {
      stopSpeech();
      return;
    }
    const step = stepAt(state.index);
    if (!step) return;
    speakCaption(step.caption);
    return stopSpeech;
  }, [state.status, state.index, voiceOn, speakCaption, stopSpeech]);

  // The driver: one effect per (status, index, pathname). Each run of the
  // effect executes at most one step, then asks the bus to advance — which
  // re-runs the effect for the next one. Pause stops re-runs (the step is
  // simply not due), and skip changes the index under the in-flight step.
  useEffect(() => {
    if (state.status !== "playing") {
      // Leaving the demo forgets what ran, so the next ▶ is a clean run.
      if (state.status === "idle") completedRef.current.clear();
      return;
    }

    const step = stepAt(state.index);
    if (!step) return;

    // A backwards jump is a restart (▶ again from the Sidebar, or the bar's
    // "Again"), not a pause: forget what already ran, and hand the page back
    // as it was found so the second run does not open on the previous run's
    // card.
    if (state.index < lastIndexRef.current) {
      completedRef.current.clear();
      const surface = DEMO_ROUTES.includes(pathname)
        ? getDemoSurface(pathname as DemoRoute)
        : null;
      void surface?.actions.close?.();
    }
    lastIndexRef.current = state.index;

    const myRun = ++runRef.current;
    const stillMine = () => runRef.current === myRun;

    void (async () => {
      // Navigate first; the effect re-runs on the new pathname and only then
      // acts, so the driver never clicks in a page that is not there yet.
      if (pathname !== step.route) {
        // Hand the page being left back as it was found first. Otherwise an
        // overlay left open on the old screen (the approval card) rides into
        // the transition, and the judge watches the previous beat's card
        // hover over the screen that is loading behind it.
        if (DEMO_ROUTES.includes(pathname)) {
          void getDemoSurface(pathname as DemoRoute)?.actions.close?.();
        }
        router.push(step.route);
        return;
      }

      // Resolves immediately when the page is already mounted, and waits for
      // it to register after a navigation.
      const surface = await waitForDemoSurface(step.route, SURFACE_TIMEOUT_MS);
      if (!stillMine()) return;

      // No page registered itself: stop here, visible, rather than play the
      // rest of the script into an empty room.
      if (!surface) {
        pauseDemo();
        return;
      }

      const action = step.action;
      if (action && !completedRef.current.has(state.index)) {
        const fn = surface.actions[action.name];
        if (fn) await fn(action.arg);
        if (!stillMine()) return;
        // Mark done *before* the hold: a pause during the reading beat must
        // not re-run the action (a second draft would create a second order).
        completedRef.current.add(state.index);
      }

      await sleep(step.holdMs);
      if (!stillMine()) return;

      // The hold is a reading minimum, not a schedule: if the narration is
      // still saying the caption out loud, the beat waits for the sentence —
      // but only for the grace period, so an engine that never fires `end`
      // slows the demo down instead of stopping it.
      const speaking = speechRef.current;
      if (speaking) {
        await Promise.race([speaking, sleep(SPEECH_GRACE_MS)]);
        if (!stillMine()) return;
      }

      if (state.index >= LAST_STEP_INDEX) finishDemo();
      else skipDemoStep();
    })();

    return () => {
      runRef.current += 1;
    };
  }, [state.status, state.index, pathname, router]);

  // ✕ — hand the page back the way it was found before forgetting the run.
  const handleExit = useCallback(() => {
    runRef.current += 1;
    stopSpeech();
    const surface = DEMO_ROUTES.includes(pathname)
      ? getDemoSurface(pathname as DemoRoute)
      : null;
    void surface?.actions.close?.();
    exitDemo();
  }, [pathname, stopSpeech]);

  // `?demo=1` starts the run from a URL — the recording-friendly entry point,
  // and the same flag the old sketch in the notes called `?demo=1`.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("demo")) return;
    params.delete("demo");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`,
    );
    startDemo();
  }, []);

  if (state.status === "idle") return null;

  const step = stepAt(state.index);
  const finished = state.status === "finished";
  const paused = state.status === "paused";
  const total = DEMO_STEPS.length;
  const position = Math.min(state.index + 1, total);
  const progress = demoProgress(state.index);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[60] flex max-w-[min(24rem,calc(100vw-2rem))] flex-col items-end gap-3 print:hidden"
      aria-label="Demo player"
    >
      {/* Narration. The judge reads this instead of listening to anyone —
          which is why every step in the script carries a caption. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-auto rounded-2xl border border-slate-700 bg-slate-900/95 px-4 py-3 text-sm leading-relaxed text-slate-100 shadow-2xl backdrop-blur motion-reduce:animate-none"
      >
        <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-[0.18em] text-amber-300/90">
          {finished ? "Demo — it stops here" : paused ? "Demo — paused" : `Demo — step ${position}/${total}`}
        </p>
        <p>{step?.caption ?? "Watch it work."}</p>
      </div>

      {/* The bar. Same buttons a kiosk would have: play/pause, skip, exit —
          and "run again" once the script has stopped at the hand-off. */}
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-slate-200 bg-white/95 px-2 py-1.5 shadow-xl backdrop-blur">
        {finished ? (
          <button
            type="button"
            onClick={() => startDemo()}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            title="Run the demo again"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden />
            Again
          </button>
        ) : (
          <button
            type="button"
            onClick={() => (paused ? resumeDemo() : pauseDemo())}
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-100"
            title={paused ? "Resume the demo" : "Pause the demo"}
            aria-label={paused ? "Resume the demo" : "Pause the demo"}
          >
            {paused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
            {paused ? "Resume" : "Pause"}
          </button>
        )}

        {/* Progress: a glance tells the judge how much is left. */}
        <div
          className="mx-1 h-1 w-20 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={position}
          aria-label={`Demo step ${position} of ${total}`}
        >
          <div
            className="h-full rounded-full bg-amber-400 transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>

        {!finished && (
          <button
            type="button"
            onClick={() => skipDemoStep()}
            className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            title="Skip this step"
            aria-label="Skip this step"
          >
            <SkipForward className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}

        {/* Narration on/off. Default on, remembered across runs: the demo
            speaks its captions unless the judge says otherwise. */}
        <button
          type="button"
          onClick={() => {
            const next = !voiceOn;
            setVoiceOn(next);
            if (!next) stopSpeech();
            try {
              window.localStorage.setItem(VOICE_STORAGE_KEY, next ? "on" : "off");
            } catch {
              // Private mode: the choice holds for this session only.
            }
          }}
          className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
          title={voiceOn ? "Mute the narration" : "Read the captions aloud"}
          aria-label={voiceOn ? "Mute the narration" : "Read the captions aloud"}
          aria-pressed={voiceOn}
        >
          {voiceOn ? (
            <Volume2 className="h-3.5 w-3.5" aria-hidden />
          ) : (
            <VolumeX className="h-3.5 w-3.5 text-slate-400" aria-hidden />
          )}
        </button>

        <button
          type="button"
          onClick={handleExit}
          className="rounded-full p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
          title="Exit the demo and look around"
          aria-label="Exit the demo"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}
