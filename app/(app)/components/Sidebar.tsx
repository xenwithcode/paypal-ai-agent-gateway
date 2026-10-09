// app/(app)/components/Sidebar.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type LucideIcon } from "lucide-react";
import {
  ShieldCheck,
  LayoutDashboard,
  CreditCard,
  Activity,
  ScrollText,
  Coins,
  Smartphone,
  Send,
  Sprout,
  Network,
  Target,
  FileText,
} from "lucide-react";
import { useFxShield } from "../hooks/useFxShield";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Hover affordance only — never the sole carrier of meaning. */
  hint?: string;
};

/** Sections every user sees. Global-first: spend governance is the core. */
const PRIMARY_NAV: NavItem[] = [
  { href: "/overview", label: "Overview", icon: LayoutDashboard, hint: "Intents, policies and the live event console" },
  { href: "/send", label: "Send money", icon: Send, hint: "Pay a person by PayPal, or prepare a local Pago Móvil" },
  { href: "/recurring", label: "Recurring payments", icon: CreditCard, hint: "Spotify, Netflix, Prime Video and the rest" },
  { href: "/activity", label: "Activity", icon: Activity, hint: "Income, spending, blocked attempts and refunds" },
  { href: "/commerce", label: "Agentic Commerce", icon: ScrollText, hint: "Structured orders a machine can check before money moves" },
];

/**
 * Reading, not operating.
 *
 * The three sections above exist to be *used*; these three exist to be read by
 * someone deciding whether the thing above them is real — the architecture,
 * who it is for, and what is honestly left. They never light up as work in
 * progress elsewhere, so they get their own group rather than a row at the
 * bottom of the product's own navigation.
 */
const APPENDICES_NAV: NavItem[] = [
  {
    href: "/appendices/architecture",
    label: "App Architecture",
    icon: Network,
    hint: "How the pieces fit, end to end",
  },
  {
    href: "/appendices/target-market",
    label: "Target Market",
    icon: Target,
    hint: "Who this is for, and how big that is",
  },
  {
    href: "/appendices/final-notes",
    label: "Final Notes",
    icon: FileText,
    hint: "What is real, what is simulated, what is left",
  },
];

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={item.hint}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition md:shrink",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
        active
          ? "bg-slate-900 text-white shadow-sm"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="whitespace-nowrap">{item.label}</span>
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  // Shared with the FX page and the Pago Móvil page, so all three agree.
  const { enabled: fxEnabled, toggle: toggleFx } = useFxShield();

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="border-b border-slate-200 bg-white md:fixed md:inset-y-0 md:left-0 md:z-20 md:flex md:w-64 md:flex-col md:border-b-0 md:border-r print:hidden">
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 md:py-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
          <ShieldCheck className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">
            PayPal AI Agent Gateway
          </span>
          <span className="block truncate text-xs text-slate-400">Sandbox · localhost</span>
        </span>
      </div>

      {/* Navigation */}
      <nav
        aria-label="Main"
        className="flex gap-1.5 overflow-x-auto px-3 py-3 md:flex-1 md:flex-col md:gap-0.5 md:overflow-x-visible md:overflow-y-auto md:px-3 md:py-4"
      >
        <span className="hidden px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:block">
          Workspace
        </span>

        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}

        {/* Divider only reads vertically; on mobile the strip stays continuous. */}
        <span aria-hidden="true" className="hidden md:my-3 md:block md:h-px md:bg-slate-200" />

        <span className="hidden px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:block">
          Protection
        </span>

        {/* FX Shield: visible to everyone, off by default. Not every user lives
            in an inflationary economy, so the rail is opt-in rather than always on. */}
        <div className="flex shrink-0 items-center gap-1 md:shrink">
          <Link
            href="/fx"
            title="Shield a devaluing balance and unlock local payment rails"
            aria-current={isActive("/fx") ? "page" : undefined}
            className={cx(
              "flex flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
              isActive("/fx")
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            )}
          >
            <Coins className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="whitespace-nowrap">FX Shield</span>
          </Link>

          <button
            type="button"
            role="switch"
            aria-checked={fxEnabled}
            aria-label="Enable FX Shield"
            onClick={toggleFx}
            className={cx(
              "relative h-5 w-9 shrink-0 rounded-full transition md:mr-1",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2",
              fxEnabled ? "bg-emerald-500" : "bg-slate-300"
            )}
          >
            <span
              aria-hidden="true"
              className={cx(
                "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
                fxEnabled ? "left-[18px]" : "left-0.5"
              )}
            />
          </button>
        </div>

        {/* Revealed only once the user turns FX protection on. Points at the
            same rail the Send money section holds — a shortcut, not a second
            copy of it. */}
        {fxEnabled && (
          <NavLink
            item={{
              href: "/send/bank",
              // Named for what it does, in words a judge outside Venezuela
              // reads first; the local term stays in the page copy, where it
              // gets explained once instead of being the whole label.
              label: "Pay in bolívares",
              icon: Smartphone,
              hint: "Convert PYUSD to bolívares at the official BCV rate",
            }}
            active={isActive("/send/bank")}
          />
        )}

        {/* Phase 3 — the growth rail, directly under FX Shield.
            Gated by the same switch on purpose: Venezuela is an opt-in
            pillar, and one switch revealing both of its rails tells the
            whole story of that pillar — protect the balance, then make it
            grow — instead of two unrelated links turning up together. */}
        {fxEnabled && (
          <NavLink
            item={{
              href: "/crowdfunding",
              label: "PayPal-AI-Crowdfunding",
              icon: Sprout,
              hint: "Fund a real business from $20 and earn in USD",
            }}
            active={isActive("/crowdfunding")}
          />
        )}

        {/* Appendices — for the reader deciding whether everything above is
            real. Always visible, never gated: documentation is not a feature
            behind an opt-in rail, and a judge who has not turned FX Shield on
            still has to be able to reach it. */}
        <span aria-hidden="true" className="hidden md:my-3 md:block md:h-px md:bg-slate-200" />

        <span className="hidden px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 md:block">
          Appendices
        </span>

        {APPENDICES_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(item.href)} />
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400 md:py-4">
        v0.1.0 · Apache-2.0
      </div>
    </aside>
  );
}
