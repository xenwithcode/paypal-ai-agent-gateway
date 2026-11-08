"use client";

// app/(app)/components/DemoKiosk.tsx
//
// The guided demo a judge can start from the sidebar and finish in under three
// minutes without touching the keyboard.
//
// It is a *driver*, not a recording. Each step calls the page's own handler —
// the same `/api/agent`, the same candidate commit, the same project
// selection the buttons and pins call. The narration is the only thing that
// is pre-recorded, and it is pre-recorded deliberately: browser speech
// synthesis was the last demo's fatal flaw, and a judge should hear Aoede (the
// voice the agent already speaks with), not whatever voice their laptop
// happens to list first.
//
// What the overlay owns:
//  · the script (`lib/demo/script.ts`), one step at a time;
//  · the audio element (one, reused, so a gesture's permission survives);
//  · a spotlight that follows the real element on the real page;
//  · the caption, callout, pause, mute, skip and exit controls.
//
// What it does *not* own: any state the product uses. The bus in
// `lib/demo/bus.ts` is the whole contract.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  DEMO_STEPS,
  DEMO_STEP_COUNT,
  demoProgress,
  type DemoStep,
} from "@/lib/demo/script";
import {
  DEMO_START_EVENT,
  demoSurfaceReady,
  dispatchDemoAction,
  waitForDemoSurface,
  type DemoSurface,
} from "@/lib/demo/bus";

const AUDIO_GRACE_MS = 5_000;
const SPOTLIGHT_CLASS = "ppa-demo-spotlight";

type Phase = "intro" | "running" | "ended";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function surfaceFor(route: DemoStep["route"]): DemoSurface {
  return route === "/overview" ? "overview" : "crowdfunding";
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Wait for an element the page has not rendered yet.
 *
 * A search result, an approval card and a project panel all mount after an
 * async action; polling with a `MutationObserver` is the difference between
 * "the spotlight found the card" and "the spotlight found the old screen".
 */
function waitForSelector(selector: string, timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLElement>(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    let settled = false;
    const finish = (element: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(element);
    };

    const observer = new MutationObserver(() => {
      const element = document.querySelector<HTMLElement>(selector);
      if (element) finish(element);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const timer = window.setTimeout(
      () => finish(document.querySelector<HTMLElement>(selector)),
      timeoutMs
    );
  });
}

export default function DemoKiosk() {
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const [active, setActive] = useState(false);
  const activeRef = useRef(false);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("running");
  const [caption, setCaption] = useState("");
  const [callout, setCallout] = useState<DemoStep["callout"] | null>(null);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  const [needsGesture, setNeedsGesture] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [ended, setEnded] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finishAudioRef = useRef<(() => void) | null>(null);
  const resumeAudioRef = useRef<(() => void) | null>(null);
  const tokenRef = useRef(0);
  const focusElRef = useRef<HTMLElement | null>(null);

  /** Keep the ring on the element as the page scrolls under it. */
  const spotlight = useCallback((element: HTMLElement | null) => {
    const previous = focusElRef.current;
    if (previous && previous !== element) previous.classList.remove(SPOTLIGHT_CLASS);
    focusElRef.current = element;
    if (element) {
      element.classList.add(SPOTLIGHT_CLASS);
      setRect(element.getBoundingClientRect());
    } else {
      setRect(null);
    }
  }, []);

  const focusOn = useCallback(
    async (focus: NonNullable<DemoStep["focus"]>, token: number) => {
      const element = await waitForSelector(`[data-demo-target="${focus}"]`, 9_000);
      if (token !== tokenRef.current) return;
      if (!element) return;
      // A card taller than half the screen has no "centre" that leaves its
      // heading visible. Start it under the top edge instead, where the name
      // of the section is; short targets still get centred.
      const tall = element.getBoundingClientRect().height > window.innerHeight * 0.55;
      // The approval card is a fixed dialog: scrolling the page behind it
      // would move the table the judge just left, and the dialog does not
      // move with it.
      if (!element.closest('[role="dialog"]')) {
        element.scrollIntoView({
          behavior: prefersReducedMotion() ? "auto" : "smooth",
          block: tall ? "start" : "center",
          inline: "nearest",
        });
      }
      spotlight(element);
    },
    [spotlight]
  );

  /**
   * Read one step's narration and resolve when it is over.
   *
   * One audio element, reused: a context unlocked by the sidebar click stays
   * unlocked. The interval is the safety net — a missing file, a muted tab or
   * a browser that never fires `ended` must not freeze the film. If the
   * browser refuses to start (autoplay after a direct `?demo=1` visit), the
   * clock does not start and the intro offers one button that does.
   */
  const playNarration = useCallback((step: DemoStep, token: number): Promise<void> => {
    return new Promise((resolve) => {
      const audio = audioRef.current;
      if (!audio) {
        void sleep(step.durationMs).then(resolve);
        return;
      }

      audio.pause();
      audio.src = step.audio;
      audio.currentTime = 0;
      audio.muted = mutedRef.current;
      audio.volume = 1;

      let started = false;
      let startedAt = 0;
      let done = false;

      const finish = () => {
        if (done) return;
        done = true;
        window.clearInterval(timer);
        if (finishAudioRef.current === finish) finishAudioRef.current = null;
        if (resumeAudioRef.current === attempt) resumeAudioRef.current = null;
        resolve();
      };

      const beginClock = () => {
        if (started || done) return;
        started = true;
        startedAt = Date.now();
        setNeedsGesture(false);
      };

      const attempt = () => {
        const played = audio.play();
        if (!played) {
          beginClock();
          return;
        }
        played.then(beginClock).catch((reason: unknown) => {
          const name = reason instanceof Error ? reason.name : "";
          if (name === "NotAllowedError") {
            setNeedsGesture(true);
          } else {
            // A missing or unplayable file is not a permission problem: let
            // the caption run on its measured duration instead of hanging.
            beginClock();
          }
        });
      };

      finishAudioRef.current = finish;
      resumeAudioRef.current = attempt;
      attempt();

      const timer = window.setInterval(() => {
        if (token !== tokenRef.current) {
          finish();
          return;
        }
        if (!started || pausedRef.current) return;
        if (audio.ended) {
          finish();
          return;
        }
        const durationMs =
          Number.isFinite(audio.duration) && audio.duration > 0
            ? audio.duration * 1000
            : step.durationMs;
        if (audio.currentTime * 1000 >= durationMs - 100) {
          finish();
          return;
        }
        if (Date.now() - startedAt > durationMs + AUDIO_GRACE_MS) finish();
      }, 180);
    });
  }, []);

  const finishDemo = useCallback(() => {
    setPhase("ended");
    setEnded(true);
    setCallout(null);
    setPaused(false);
    pausedRef.current = false;
    spotlight(null);
  }, [spotlight]);

  const run = useCallback(
    async (token: number) => {
      for (let i = 0; i < DEMO_STEPS.length; i++) {
        if (token !== tokenRef.current) return;
        const step = DEMO_STEPS[i];

        setIndex(i);
        setCaption(step.caption);
        setCallout(step.callout ?? null);
        setPhase(step.intro ? "intro" : "running");
        setError(null);
        setNeedsGesture(false);
        // The previous step's ring must not linger while this step's target
        // is still mounting (a search result, a card). Clearing it also hides
        // the new callout until there is a real element to point at.
        spotlight(null);

        // The audio starts before the navigation, so a cross-page step is
        // carried by the voice rather than by a silent cut.
        const audioPromise = playNarration(step, token);

        const visualPromise = (async () => {
          try {
            await waitForDemoSurface(surfaceFor(step.route), 25_000);
            if (token !== tokenRef.current) return;

            if (step.action) await dispatchDemoAction(step.action, 25_000);
            if (token !== tokenRef.current) return;

            if (step.focus) await focusOn(step.focus, token);
          } catch (reason) {
            const message = reason instanceof Error ? reason.message : String(reason);
            setError(message);
          }
        })();

        if (pathnameRef.current !== step.route) router.push(step.route);

        await Promise.all([audioPromise, visualPromise]);
        if (token !== tokenRef.current) return;

        await sleep(step.holdMs);
        if (token !== tokenRef.current) return;
      }

      finishDemo();
    },
    [finishDemo, focusOn, playNarration, router, spotlight]
  );

  const begin = useCallback(() => {
    tokenRef.current += 1;
    activeRef.current = true;
    setActive(true);
    setEnded(false);
    setError(null);
    setNeedsGesture(false);
    setPaused(false);
    pausedRef.current = false;
    setIndex(0);
    setCaption(DEMO_STEPS[0].caption);
    setCallout(null);
    setPhase("intro");
    void run(tokenRef.current);
  }, [run]);

  const stop = useCallback(
    (resetState: boolean) => {
      tokenRef.current += 1;
      activeRef.current = false;
      finishAudioRef.current?.();
      audioRef.current?.pause();
      spotlight(null);
      setActive(false);
      setEnded(false);
      setPaused(false);
      pausedRef.current = false;
      setError(null);
      setNeedsGesture(false);
      setCallout(null);

      if (typeof window !== "undefined") {
        const url = new URL(window.location.href);
        if (url.searchParams.has("demo")) {
          url.searchParams.delete("demo");
          window.history.replaceState({}, "", url.toString());
        }
      }

      if (resetState) {
        for (const surface of ["overview", "crowdfunding"] as const) {
          if (!demoSurfaceReady(surface)) continue;
          void dispatchDemoAction({ surface, name: "reset" }, 5_000).catch(() => {
            // A page that has already gone away has nothing to reset.
          });
        }
      }
    },
    [spotlight]
  );

  const restart = useCallback(() => {
    tokenRef.current += 1;
    audioRef.current?.pause();
    spotlight(null);
    void (async () => {
      for (const surface of ["overview", "crowdfunding"] as const) {
        if (!demoSurfaceReady(surface)) continue;
        await dispatchDemoAction({ surface, name: "reset" }, 5_000).catch(() => {});
      }
      begin();
    })();
  }, [begin, spotlight]);

  const togglePause = useCallback(() => {
    const next = !pausedRef.current;
    pausedRef.current = next;
    setPaused(next);
    const audio = audioRef.current;
    if (!audio) return;
    if (next) audio.pause();
    else void audio.play().catch(() => setNeedsGesture(true));
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMuted(next);
    if (audioRef.current) audioRef.current.muted = next;
  }, []);

  const skip = useCallback(() => {
    pausedRef.current = false;
    setPaused(false);
    finishAudioRef.current?.();
  }, []);

  // The sidebar's CTA. A custom event rather than a URL because the kiosk
  // lives in the shell and must survive the navigation it starts.
  useEffect(() => {
    const handler = () => begin();
    window.addEventListener(DEMO_START_EVENT, handler);
    return () => window.removeEventListener(DEMO_START_EVENT, handler);
  }, [begin]);

  // A shared link may still say `?demo=1`.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("demo") !== "1") return;
    const timer = window.setTimeout(begin, 120);
    return () => window.clearTimeout(timer);
  }, [begin]);

  // Warm the cache while the intro speaks: a later step must not wait on a
  // 500 KB file the browser has never seen.
  useEffect(() => {
    if (!active) return;
    const preloaded = DEMO_STEPS.map((step) => {
      const audio = new Audio();
      audio.preload = "auto";
      audio.src = step.audio;
      audio.load();
      return audio;
    });
    return () => {
      for (const audio of preloaded) {
        audio.src = "";
      }
    };
  }, [active]);

  // Follow the spotlighted element as the page moves. The rect is the only
  // thing that changes; the element itself is the page's own DOM.
  useEffect(() => {
    if (!active) return;
    let frame = 0;
    let last = "";
    const tick = () => {
      const element = focusElRef.current;
      if (element) {
        const box = element.getBoundingClientRect();
        const key = `${Math.round(box.top)}:${Math.round(box.left)}:${Math.round(box.width)}:${Math.round(box.height)}`;
        if (key !== last) {
          last = key;
          setRect(box);
        }
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  // Leaving the shell must not leave a ring on an element the page will
  // unmount, nor audio playing behind a route the judge has moved on from.
  useEffect(
    () => () => {
      focusElRef.current?.classList.remove(SPOTLIGHT_CLASS);
      audioRef.current?.pause();
    },
    []
  );

  const calloutPosition = useMemo(() => {
    if (!rect || !callout || typeof window === "undefined") return null;
    const margin = 12;
    const width = Math.min(320, window.innerWidth - margin * 2);
    const center = rect.left + rect.width / 2;

    // A tall target fills the screen, so above and below are both *inside*
    // it. Prefer the empty margin beside it — usually the dimmed sidebar —
    // and say nothing at all when there is no margin wide enough. The caption
    // in the control bar still carries the step.
    const tall = rect.height > window.innerHeight * 0.55;
    if (tall) {
      if (rect.left > width + 24) {
        return {
          left: Math.max(margin, rect.left - width - 18),
          top: Math.max(84, Math.min(rect.top + 20, window.innerHeight - 150)),
          width,
          side: "left" as const,
        };
      }
      return null;
    }

    const left = Math.min(
      Math.max(center - width / 2, margin),
      window.innerWidth - width - margin
    );
    const above = rect.top > 170;
    const top = above
      ? Math.max(margin, rect.top - 104)
      : Math.min(window.innerHeight - 200, rect.bottom + 16);
    return { left, top, width, side: above ? ("above" as const) : ("below" as const) };
  }, [rect, callout]);

  const step = DEMO_STEPS[index] ?? DEMO_STEPS[0];
  const progress = demoProgress(index);

  return (
    <>
      <audio ref={audioRef} preload="auto" className="hidden" aria-hidden="true" />

      {/* The opening curtain. It covers the navigation, introduces the voice,
          and gives a browser that blocked autoplay one obvious way in. */}
      {active && phase === "intro" && !ended && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center overflow-hidden bg-slate-950 px-5 py-10 text-white">
          <div className="ppa-demo-aurora pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="ppa-demo-grid pointer-events-none absolute inset-0 opacity-30" aria-hidden="true" />

          <div className="relative w-full max-w-3xl text-center">
            <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.24em] text-blue-200">
              <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              PayPal AI Agent · guided demo
            </div>

            <div className="ppa-demo-rise mt-8">
              <h1 className="text-balance text-4xl font-black leading-[1.05] tracking-tight sm:text-6xl">
                It prepares your money.
                <span className="mt-2 block bg-gradient-to-r from-blue-400 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
                  It cannot move it.
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-xl text-pretty text-sm leading-relaxed text-slate-300 sm:text-base">
                A purchase order an AI agent cannot break. A business you can fund from $20.
                Every payment ends with you, inside PayPal.
              </p>
            </div>

            <div className="ppa-demo-rise mt-10 flex flex-wrap items-center justify-center gap-3 [animation-delay:180ms]">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-300">
                <span className="ppa-demo-pulse h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
                Narrated by Aoede, the agent&apos;s own voice
              </span>
              <button
                type="button"
                onClick={skip}
                className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              >
                Skip intro
                <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />
              </button>
            </div>

            {needsGesture && (
              <button
                type="button"
                onClick={() => resumeAudioRef.current?.()}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-amber-300/40 bg-amber-400/20 px-4 py-2.5 text-xs font-semibold text-amber-100 transition hover:bg-amber-400/25"
              >
                <Volume2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
                Tap to start with sound
              </button>
            )}

            <div className="mt-10 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              The demo never moves money
            </div>
          </div>
        </div>
      )}

      {/* The callout that names what the spotlight is showing. */}
      {active && !ended && callout && calloutPosition && (
        <div
          className="pointer-events-none fixed z-[58]"
          style={{
            left: calloutPosition.left,
            top: calloutPosition.top,
            width: calloutPosition.width,
          }}
          aria-hidden="true"
        >
          <div className="ppa-demo-callout relative rounded-2xl border border-blue-400/25 bg-slate-950/95 px-4 py-3 text-white shadow-2xl shadow-blue-950/40 backdrop-blur-md">
            <p className="text-[9px] font-bold uppercase tracking-[0.22em] text-blue-300">
              {callout.eyebrow}
            </p>
            <p className="mt-1 text-sm font-semibold leading-snug">{callout.title}</p>
            <span
              className={`absolute h-3 w-3 rotate-45 border-blue-400/25 bg-slate-950 ${
                calloutPosition.side === "above"
                  ? "-bottom-1.5 left-1/2 -translate-x-1/2 border-b border-r"
                  : calloutPosition.side === "below"
                    ? "-top-1.5 left-1/2 -translate-x-1/2 border-l border-t"
                    : "-right-1.5 top-1/2 -translate-y-1/2 border-r border-t"
              }`}
            />
          </div>
        </div>
      )}

      {/* The control bar. It is the caption, the chapter, the progress and the
          only controls the judge needs. */}
      {active && !ended && phase !== "intro" && (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[60] flex justify-center px-3 sm:bottom-5 sm:px-5">
          <div className="pointer-events-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 text-white shadow-2xl shadow-slate-950/50 backdrop-blur-xl">
            <div className="h-1 w-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-[width] duration-500"
                style={{ width: `${Math.max(progress, 0.02) * 100}%` }}
              />
            </div>

            <div className="flex items-start gap-3 px-4 py-3 sm:px-5 sm:py-4">
              <div className="hidden shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 px-2.5 py-2 sm:flex">
                <span className="font-mono text-sm font-bold tabular-nums text-blue-200">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="ml-1 font-mono text-[10px] text-slate-500">
                  /{String(DEMO_STEP_COUNT).padStart(2, "0")}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[9px] font-bold uppercase tracking-[0.2em] text-blue-300">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="ppa-demo-pulse h-1.5 w-1.5 rounded-full bg-blue-400" aria-hidden="true" />
                    {step.chapter}
                  </span>
                  <span className="text-slate-500">Step {index + 1} of {DEMO_STEP_COUNT}</span>
                </div>
                <p
                  aria-live="polite"
                  className="mt-1.5 text-pretty text-[13px] leading-relaxed text-slate-100 sm:text-[15px]"
                >
                  {caption}
                </p>
                {error && (
                  <p className="mt-1 text-[11px] leading-relaxed text-amber-300">
                    {error} — the demo kept the caption on screen rather than stopping.
                  </p>
                )}
                {needsGesture && (
                  <button
                    type="button"
                    onClick={() => resumeAudioRef.current?.()}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-amber-300/40 bg-amber-400/20 px-2.5 py-1 text-[10px] font-semibold text-amber-100"
                  >
                    <Volume2 className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                    Tap to enable sound
                  </button>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-1">
                <ControlButton label={paused ? "Resume demo" : "Pause demo"} onClick={togglePause}>
                  {paused ? (
                    <Play className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                  ) : (
                    <Pause className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                  )}
                </ControlButton>
                <ControlButton label={muted ? "Turn narration on" : "Mute narration"} onClick={toggleMute}>
                  {muted ? (
                    <VolumeX className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                  ) : (
                    <Volume2 className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                  )}
                </ControlButton>
                <ControlButton label="Skip this step" onClick={skip}>
                  <SkipForward className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
                </ControlButton>
                <ControlButton label="Close the demo" onClick={() => stop(true)}>
                  <X className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                </ControlButton>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* The result stays on screen: this bar has no scrim, no blurred page. */}
      {active && ended && (
        <div className="fixed inset-x-0 bottom-3 z-[60] flex justify-center px-3 sm:bottom-5 sm:px-5">
          <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-emerald-400/20 bg-slate-950/95 text-white shadow-2xl backdrop-blur-xl">
            <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400" />
            <div className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5 sm:py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300">
                <CheckCircle2 className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Demo complete — nothing moved.</p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300">
                  The agent prepared. You approved. PayPal would be the only place money could move.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => stop(false)}
                  className="rounded-xl bg-white px-3.5 py-2 text-[11px] font-bold text-slate-950 transition hover:bg-blue-50"
                >
                  Explore this screen
                </button>
                <button
                  type="button"
                  onClick={restart}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-white/5 px-3.5 py-2 text-[11px] font-semibold text-slate-200 transition hover:bg-white/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
                  Watch again
                </button>
                <button
                  type="button"
                  onClick={() => stop(true)}
                  aria-label="Close the demo"
                  className="rounded-xl border border-white/20 bg-white/5 p-2 text-slate-300 transition hover:bg-white/10 hover:text-white"
                >
                  <X className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-lg p-2 text-slate-300 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
    >
      {children}
    </button>
  );
}
