// app/(app)/overview/components/WhatCellRenderer.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { ImageOff } from "lucide-react";
import type { CustomCellRendererProps } from "ag-grid-react";

/**
 * The "What" cell: the product the agent actually found, next to its name.
 *
 * Approving a purchase you cannot see is not approval, so the image belongs in
 * the row the human signs off on rather than behind a click. A broken or
 * missing image degrades to a labelled placeholder — never a browser's broken
 * image glyph.
 */
export default function WhatCellRenderer(params: CustomCellRendererProps) {
  const text = String(params.value ?? "");
  const data = params.data as { marketImage?: string | null } | undefined;
  const image = data?.marketImage ?? null;

  const [failed, setFailed] = useState(false);
  const showImage = Boolean(image) && !failed;

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
      <span className="min-w-0 truncate">{text}</span>
    </span>
  );
}
