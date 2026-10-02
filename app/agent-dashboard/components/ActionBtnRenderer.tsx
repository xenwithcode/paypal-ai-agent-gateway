// app/agent-dashboard/components/ActionBtnRenderer.tsx
"use client";

import { CustomCellRendererProps } from "ag-grid-react";
import { STATUS } from "@/lib/policy";

/**
 * Renders the Protection column: a plain-language state chip when the policy
 * is already live, or the single action that turns it on when it is not.
 *
 * Copy rule: the user should never have to decode internal machinery. The
 * label names the state ("Active") or the action ("Activate") — nothing about
 * kernels, enforcement or gateways.
 */
export default function ActionBtnRenderer(params: CustomCellRendererProps) {
  const rowData = params.data;
  const status = rowData?.status;

  // Already live — show a read-only state chip, never an action.
  if (status === STATUS.enforced) {
    return (
      <div className="flex items-center justify-center h-full">
        <span
          className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold px-3 py-1 rounded-full border border-emerald-300 animate-fade-in"
          title="This rule is live. The agent cannot spend beyond it."
        >
          <span aria-hidden="true">●</span> Active
        </span>
      </div>
    );
  }

  // FX shield already guarding — also read-only, but a different state so it
  // is not mistaken for an ordinary approved rule.
  if (status === STATUS.protecting) {
    return (
      <div className="flex items-center justify-center h-full">
        <span
          className="inline-flex items-center gap-1.5 bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full border border-blue-300 animate-fade-in"
          title="Converting and holding this balance so it cannot lose value."
        >
          <span aria-hidden="true">●</span> Protecting
        </span>
      </div>
    );
  }

  // Not live yet — this is the one action the row offers.
  const onClickHandler = () => {
    if (params.context && params.context.onApprovePolicy) {
      params.context.onApprovePolicy(rowData);
    }
  };

  return (
    <div className="flex items-center justify-center h-full">
      <button
        onClick={onClickHandler}
        title="Turn this rule on. Until you do, the agent cannot use it."
        className="inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-bold text-xs px-4 py-1.5 rounded-full shadow-sm hover:shadow transition-all duration-200 active:scale-95 border border-amber-400"
      >
        Activate
      </button>
    </div>
  );
}
