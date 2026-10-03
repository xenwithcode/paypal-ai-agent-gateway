// app/(app)/overview/components/ActionBtnRenderer.tsx
"use client";

import { CustomCellRendererProps } from "ag-grid-react";
import { STATUS, type HoldAction } from "@/lib/policy";

/**
 * Renders the Protection column.
 *
 * The column offers exactly one thing that is actually legal for this row —
 * never a control that will come back with an error. A policy with a
 * condition reserves money when it is activated and then has to be settled
 * either way; a policy without one is a standing allowance and becomes Active
 * directly, because it does not need to hold anything before it may spend.
 *
 * Copy rule: the label names the state ("Reserved") or the action
 * ("Capture") — never internal machinery such as kernels or gateways.
 */

type Row = {
  status?: string;
  condition?: string;
  conditionMet?: boolean | null;
  limit?: number;
  currency?: string;
  what?: string;
};

const CHIP_STYLES: Record<string, { className: string; dot: string; title: string }> = {
  [STATUS.enforced]: {
    className: "bg-emerald-100 text-emerald-800 border-emerald-300",
    dot: "●",
    title: "This rule is live. The agent cannot spend beyond it.",
  },
  [STATUS.protecting]: {
    className: "bg-blue-100 text-blue-800 border-blue-300",
    dot: "●",
    title: "Converting and holding this balance so it cannot lose value.",
  },
  [STATUS.captured]: {
    className: "bg-emerald-100 text-emerald-800 border-emerald-300",
    dot: "✓",
    title: "The money moved. This order is settled.",
  },
  [STATUS.released]: {
    className: "bg-slate-100 text-slate-600 border-slate-300",
    dot: "↩",
    title: "The hold was cancelled before the money moved. The ceiling is available again.",
  },
};

function Chip({ status, label }: { status: string; label: string }) {
  const style = CHIP_STYLES[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full border animate-fade-in ${style?.className ?? "bg-slate-100 text-slate-600 border-slate-300"}`}
      title={style?.title}
    >
      <span aria-hidden="true">{style?.dot ?? "●"}</span> {label}
    </span>
  );
}

function ActionButton({
  label,
  title,
  onClick,
  variant,
  disabled = false,
}: {
  label: string;
  title: string;
  onClick?: () => void;
  variant: "primary" | "ghost";
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center gap-1.5 font-bold text-[11px] px-3 py-1.5 rounded-full border transition-all duration-200 active:scale-95 whitespace-nowrap";
  const look =
    variant === "primary"
      ? "bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white border-emerald-400 shadow-sm hover:shadow"
      : "bg-white hover:bg-slate-50 text-slate-600 border-slate-300";
  const off = disabled ? "opacity-45 cursor-not-allowed active:scale-100" : "cursor-pointer";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${look} ${off}`}
    >
      {label}
    </button>
  );
}

export default function ActionBtnRenderer(params: CustomCellRendererProps) {
  const row = (params.data ?? {}) as Row;
  const status = row.status;
  const context = params.context as
    | { onHoldAction?: (action: HoldAction, row: Row) => void }
    | undefined;

  const fire = (action: HoldAction) => context?.onHoldAction?.(action, row);

  const amount = `${(row.limit ?? 0).toFixed(2)} ${row.currency ?? ""}`.trim();

  // Approved and settled states are read-only: the money is done moving.
  if (status === STATUS.captured || status === STATUS.released || status === STATUS.protecting) {
    return (
      <div className="flex items-center justify-center h-full">
        <Chip status={status} label={status} />
      </div>
    );
  }

  // A standing allowance with no condition — nothing to hold, nothing to settle.
  if (status === STATUS.enforced) {
    return (
      <div className="flex items-center justify-center h-full">
        <Chip status={status} label="Active" />
      </div>
    );
  }

  // Drafted: the one action that gives this row any power at all.
  if (status === STATUS.pending) {
    return (
      <div className="flex items-center justify-center h-full">
        <ActionButton
          label="Activate"
          variant="primary"
          onClick={() => fire("activate")}
          title={
            row.condition?.trim()
              ? `Reserve ${amount} so it can only be spent when the condition holds.`
              : `Turn this rule on. Until you do, the agent cannot use it.`
          }
        />
      </div>
    );
  }

  // Reserved: money is held and now has to be settled either way.
  if (status === STATUS.reserved) {
    const met = row.conditionMet;

    // The condition holds right now — both settlement paths are open, so both
    // are offered: capture is the happy path, release is the escape hatch.
    if (met === true) {
      return (
        <div className="flex items-center justify-center h-full gap-1.5">
          <ActionButton
            label="Capture"
            variant="primary"
            onClick={() => fire("capture")}
            title={`The condition is met. Take the ${amount}.`}
          />
          <ActionButton
            label="Release"
            variant="ghost"
            onClick={() => fire("release")}
            title={`Cancel the hold and return ${amount} to the balance.`}
          />
        </div>
      );
    }

    // Not met, or not verifiable: capturing is illegal, so it is not offered.
    // The Condition column already says which of the two it is; this column
    // just offers the only action that is actually available, and says why.
    const why =
      met === false
        ? `The condition is not met, so there is nothing to capture yet. The hold waits until you release it.`
        : `The condition cannot be verified, so this hold cannot be captured. Release it to get ${amount} back.`;

    return (
      <div className="flex items-center justify-center h-full">
        <ActionButton label="Release" variant="ghost" onClick={() => fire("release")} title={why} />
      </div>
    );
  }

  // Unknown status — show it rather than guess an action for it.
  return (
    <div className="flex items-center justify-center h-full">
      <span className="text-xs font-mono text-slate-400" title="Unrecognised policy state.">
        {status ?? "—"}
      </span>
    </div>
  );
}
