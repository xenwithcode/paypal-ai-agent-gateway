// app/(app)/components/EmptyState.tsx
import type { LucideIcon } from "lucide-react";
import Link from "next/link";

type Props = {
  icon: LucideIcon;
  /** What the user can do here — the heading carries its own weight, no eyebrow above it. */
  title: string;
  /** Why it is empty and what fills it. Plain language, no internal machinery. */
  description: string;
  /** Single primary action, when there is a real one to offer. */
  action?: { label: string; href?: string; onClick?: () => void; disabled?: boolean };
  /** Non-blocking note about work still in progress — stated, never implied. */
  note?: string;
};

const buttonBase =
  "mt-6 inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2";

const enabledLook = "bg-blue-600 text-white shadow-sm hover:bg-blue-700";
const disabledLook = "cursor-not-allowed bg-slate-200 text-slate-400";

/**
 * Empty state for a section that exists but has no data yet.
 *
 * Deliberately NOT a card: a bordered box of icon-plus-heading-plus-text is the
 * lazy container for a page. This is a plain, centred block so the surrounding
 * section keeps the page structure.
 */
export default function EmptyState({ icon: Icon, title, description, action, note }: Props) {
  return (
    <div className="flex flex-col items-center justify-center text-center px-6 py-16 sm:py-20">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-400 shadow-sm">
        <Icon className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
      </div>

      <h2 className="mt-6 text-lg font-semibold text-slate-900">{title}</h2>

      <p className="mt-2 max-w-[62ch] text-sm leading-relaxed text-slate-500">{description}</p>

      {action && action.disabled ? (
        <button
          type="button"
          disabled
          aria-disabled="true"
          title="Not available yet"
          className={`${buttonBase} ${disabledLook}`}
        >
          {action.label}
        </button>
      ) : action?.href ? (
        <Link href={action.href} className={`${buttonBase} ${enabledLook}`}>
          {action.label}
        </Link>
      ) : (
        <button
          type="button"
          onClick={action?.onClick}
          className={`${buttonBase} ${enabledLook}`}
        >
          {action?.label}
        </button>
      )}

      {note && (
        <p className="mt-5 max-w-[62ch] text-xs leading-relaxed text-slate-400">{note}</p>
      )}
    </div>
  );
}
