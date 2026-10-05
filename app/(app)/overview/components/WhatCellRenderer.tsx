// app/(app)/overview/components/WhatCellRenderer.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import type { CustomCellRendererProps } from "ag-grid-react";

type RowData = {
  marketImage?: string | null;
  /** Host this order may reach; empty when no merchant was named. */
  allowEndpoint?: string;
  /** Account this order may pay; empty when no recipient was named. */
  payee?: string;
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

  const destination = [payee, endpoint].filter(Boolean).join(" · ");
  const title = destination
    ? [payee && `This order may only pay ${payee}.`, endpoint && `This order may only reach ${endpoint}.`]
        .filter(Boolean)
        .join(" ")
    : "No recipient and no merchant were named, so neither is restricted for this order.";

  return (
    <span className="flex h-full items-center gap-2.5">
      {showImage ? (
        <Image
          src={image as string}
          alt={text}
          // Next only serves widths from its configured list; 36 is not one
          // of them. 96 is the nearest that stays crisp on a retina display,
          // and the CSS below is what controls the visible size.
          width={96}
          height={96}
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
        <span className="block truncate text-[13px] text-slate-800">{text}</span>
        <span className="block truncate text-[10px] leading-tight text-slate-400" title={title}>
          {destination ? `only → ${destination}` : "no destination set"}
        </span>
      </span>
    </span>
  );
}
