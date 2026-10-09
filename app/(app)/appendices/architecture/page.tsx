// app/(app)/appendices/architecture/page.tsx
// Server component: a diagram and two paragraphs — no state, no effects.

/**
 * The architecture, for a judge rather than for us.
 *
 * The diagram is a standalone Archify page (inline SVG, its own theme) served
 * from `public/architecture/` rather than re-drawn here: re-implementing it as
 * JSX would be a second diagram to keep in step with the first, and the whole
 * value of this appendix is that what is on screen came out of the repo.
 */
export const metadata = {
  title: "App Architecture · PayPal AI Agent Gateway",
  description: "How the pieces fit, end to end — the diagram the repository generates about itself.",
};

/** Served, not imported: see the note in README about where Archify writes. */
const DIAGRAM = "/architecture/paypal-ai-agent-architecture.html";

/** When the diagram was generated — stated, because a diagram ages silently. */
const GENERATED = "07 October 2026";

export default function ArchitectureAppendix() {
  return (
    <div className="px-6 pt-8 md:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">App Architecture</h1>
          <p className="mt-2 max-w-[70ch] text-sm leading-relaxed text-slate-500">
            One diagram of the whole gateway: the browser, the routes that judge, the policy that
            both sides read, PayPal, Gemini, and where a credential is allowed to live. It was
            generated from this repository with{" "}
            <span className="font-medium text-slate-700">Archify</span> and is served as-is — the
            file you see is the artifact, not a re-drawing of it.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">
          Generated {GENERATED}
        </span>
      </header>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <iframe
          title="PayPal AI Agent Gateway — application architecture"
          src={DIAGRAM}
          className="h-[78vh] w-full border-0 bg-white"
        />
      </div>

      <div className="mt-3 space-y-1.5 text-xs text-slate-400">
        <p className="max-w-[80ch] leading-relaxed">
          🎬 <span className="font-medium text-slate-500">It moves.</span> Hover any box to watch
          what travels along its edges; press <span className="font-medium text-slate-500">Live</span>{" "}
          (top right of the diagram) and the flow runs on its own. A diagram that looks still is
          honouring your system&apos;s <em>reduce motion</em> setting — the toggle is disabled while
          that is on, which is deliberate.
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="max-w-[70ch] leading-relaxed">
            ⚠️ <span className="font-medium text-slate-500">Dated {GENERATED}</span> — several
            features landed after it (the campaign judge, the charts, the voice agent), so read it
            as the shape of the system rather than as its current inventory. A refresh is scheduled
            before the final submission.
          </p>
          <a
            href={DIAGRAM}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 font-medium text-blue-600 underline-offset-2 hover:underline"
          >
            Open full size ↗
          </a>
        </div>
      </div>
    </div>
  );
}
