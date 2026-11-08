// app/(app)/overview/components/WhatCellRenderer.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import type { CustomCellRendererProps } from "ag-grid-react";
import { ENTERPRISE_GRID } from "@/lib/grid/setup";

type RowData = {
  marketImage?: string | null;
  /** Host this order may reach; empty when no merchant was named. */
  allowEndpoint?: string;
  /** Account this order may pay; empty when no recipient was named. */
  payee?: string;
  /** True while the row is a demonstration rather than money that moved. */
  sample?: boolean;
};

/**
 * The "What" cell: the product the agent found, its name, and where the money
 * is allowed to go.
 *
 * The image belongs here rather than behind a click because approving a
 * purchase you cannot see is not approval. The destination belongs here for
 * the same reason — a ceiling without a destination is only half a
 * permission, and it is the half the operator is least likely to ask about
 * unaided. That destination is two things now: the host the agent may reach
 * and the account it may pay, and the account is printed first because
 * "who gets the money" is the question nobody thinks to ask on their own.
 *
 * A broken or missing image degrades to a labelled placeholder, never a
 * browser's broken image glyph.
 */
export default function WhatCellRenderer(params: CustomCellRendererProps) {
  const text = String(params.value ?? "");
  const data = (params.data ?? {}) as RowData;
  const image = data.marketImage ?? null;
  const endpoint = (data.allowEndpoint ?? "").trim();
  const payee = (data.payee ?? "").trim();

  const [failed, setFailed] = useState(false);
  const showImage = Boolean(image) && !failed;

  /**
   * The expander for the row's audit trail.
   *
   * Drawn here rather than left to AG Grid because v36 does not paint its own
   * toggle for this grid — measured, twice, including a bare two-row page with
   * no theme and no custom renderer: the rows come back marked expandable
   * (`aria-expanded="false"`) and no button appears. Expanding by hand works,
   * so all that was missing was the affordance, and this one is ours: it can
   * say what it opens, and it hides itself when there is no licence to open it
   * with — which is the state most people who clone this repo will be in.
   */
  const node = params.node;
  const [expanded, setExpanded] = useState(node?.expanded === true);

  const toggleTrail = (event: React.MouseEvent) => {
    // The cell click also opens the order panel; expanding is not "look closer
    // at the order", it is "open the record underneath it", and doing both
    // from one click would be a surprise.
    event.stopPropagation();
    if (!node) return;
    const next = !node.expanded;
    node.setExpanded(next);
    setExpanded(next);
  };

  const destination = [payee, endpoint].filter(Boolean).join(" · ");
  const title = destination
    ? [payee && `This order may only pay ${payee}.`, endpoint && `This order may only reach ${endpoint}.`]
        .filter(Boolean)
        .join(" ")
    : "No recipient and no merchant were named, so neither is restricted for this order.";

  return (
    <span className="flex h-full items-center gap-2.5">
      {ENTERPRISE_GRID && (
        <button
          type="button"
          onClick={toggleTrail}
          aria-expanded={expanded}
          aria-label={expanded ? "Hide this order's trail" : "Read this order's trail"}
          title={
            expanded
              ? "Hide the trail"
              : "Read the trail: what was promised, what the search proposed, and what PayPal did"
          }
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <span
            aria-hidden="true"
            className={`text-[9px] leading-none transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            ▶
          </span>
        </button>
      )}
      {showImage ? (
        <Image
          src={image as string}
          alt={text}
          // Next only serves widths from its configured list; 36 is not one
          // of them. 96 is the nearest that stays crisp on a retina display,
          // and the CSS below is what controls the visible size.
          width={96}
          height={96}
          unoptimized
          onError={() => setFailed(true)}
          className="h-9 w-9 shrink-0 rounded-lg border border-slate-200 bg-white object-cover"
        />
      ) : (
        <span
          title="No catalog image for this order"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-300"
        >
          <ImageOff className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] text-slate-800">{text}</span>
          {/* The label that keeps a demonstration from reading as a history:
              a row nobody bought, wearing the same clothes as a row somebody
              did, is the first thing this screen would lie about. */}
          {data.sample && (
            <span
              title="A demonstration row: nothing was bought and nothing is held."
              className="shrink-0 rounded-full border border-slate-300 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400"
            >
              sample
            </span>
          )}
        </span>
        <span className="block truncate text-[10px] leading-tight text-slate-400" title={title}>
          {destination ? `only → ${destination}` : "no destination set"}
        </span>
      </span>
    </span>
  );
}
