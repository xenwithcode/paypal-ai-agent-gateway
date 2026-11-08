// app/(app)/overview/components/CandidatePicker.tsx
"use client";

import { useState } from "react";
import Image from "next/image";
import { Check, ImageOff, Undo2, X } from "lucide-react";
import type { CatalogProduct } from "@/lib/commerce/catalog";

/**
 * What the search found, laid out so the operator can choose.
 *
 * `matchProduct()` has always ranked every candidate and kept the winner to
 * itself — a sort by how many terms each one mentions, ending in a single
 * product the human was never shown the alternatives to. That is the exact
 * inversion this product exists to correct: the agent makes a choice, the
 * gateway makes it visible, and the human gets to override it.
 *
 * Three rules the strip holds to:
 *
 * 1. It shows what was found, not what was expected. Two candidates means two
 *    cards and the heading says so; a third is never padded in to reach a
 *    number. The catalog is asked for three and returns what it has.
 * 2. Image, price, stock and SKU come from the same record, because a card
 *    showing one product's photograph beside another product's price is the
 *    kind of thing this project exists to refuse.
 * 3. A candidate over the ceiling is marked, not hidden — hiding it would
 *    decide on the operator's behalf, and choosing it still leaves the order
 *    awaiting approval with the envelope intact.
 */

type Props = {
  candidates: CatalogProduct[];
  /** The candidate the agent would have taken, so it can be marked as such. */
  matchedId: number | null;
  ceiling: number;
  currency: string;
  /** Take this candidate: the row is rewritten and the approval card opens. */
  onChoose: (product: CatalogProduct) => void;
};

/** The picture that can actually be judged — never the 200px thumbnail. */
function cover(product: CatalogProduct): string | null {
  return product.images[0] ?? product.thumbnail ?? null;
}

function Card({
  product,
  isAgentPick,
  ceiling,
  onChoose,
  onReject,
}: {
  product: CatalogProduct;
  isAgentPick: boolean;
  ceiling: number;
  onChoose: (product: CatalogProduct) => void;
  onReject: (id: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  const src = cover(product);
  const overCeiling = product.price > ceiling;

  return (
    <article className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition hover:border-slate-300 hover:shadow">
      {/* The picture is the point of the strip: approving a product you
          cannot see is not approving anything. Fixed aspect so a portrait
          shot and a landscape one do not resize the row around them. */}
      <div className="relative aspect-[4/3] w-full border-b border-slate-100 bg-slate-50">
        {src && !failed ? (
          <Image
            src={src}
            alt={product.title}
            fill
            unoptimized
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 45vw, 90vw"
            onError={() => setFailed(true)}
            className="object-contain p-3"
          />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-slate-300">
            <ImageOff className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
            <span className="text-[10px]">No image published</span>
          </span>
        )}

        {isAgentPick && (
          <span className="absolute left-2 top-2 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-blue-700 shadow-sm">
            Agent&apos;s pick
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-semibold text-slate-900">{product.title}</h4>
          <p className="truncate text-xs text-slate-400">
            {[product.brand, product.category].filter(Boolean).join(" · ") || "unbranded"}
          </p>
          {/* Why this candidate survived the relevance judge — the answer to
              the question a card only seems to answer by existing: *why is
              this here?* Absent when no judge ran, which is the card this
              strip used to show unconditionally. */}
          {product.reason && (
            <p className="mt-1 text-[11px] leading-snug text-blue-700">{product.reason}</p>
          )}
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <span
            className={`font-mono text-base font-bold tabular-nums ${
              overCeiling ? "text-red-700" : "text-slate-900"
            }`}
          >
            {product.price.toFixed(2)} {product.currency}
          </span>
          <span className="text-[11px] text-slate-400">★ {product.rating.toFixed(1)}</span>
        </div>

        {/* Over the ceiling is stated in words as well as colour, and it does
            not remove the option: the operator may still choose it, and the
            order then waits for approval with the same envelope it always had. */}
        <p className="text-[11px] leading-tight text-slate-400">
          {overCeiling ? (
            <span className="font-semibold text-red-600">· over your ceiling</span>
          ) : (
            <>
              {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
              {product.availabilityStatus ? ` · ${product.availabilityStatus}` : ""}
            </>
          )}
        </p>

        <div className="mt-auto flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => onChoose(product)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-bold text-white shadow-sm transition hover:bg-slate-800 active:scale-[0.98]"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
            Choose
          </button>
          <button
            type="button"
            onClick={() => onReject(product.id)}
            aria-label={`Reject ${product.title}`}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-xs font-semibold text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600 active:scale-[0.98]"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden="true" />
            Reject
          </button>
        </div>
      </div>
    </article>
  );
}

export default function CandidatePicker({
  candidates,
  matchedId,
  ceiling,
  currency,
  onChoose,
}: Props) {
  const [rejected, setRejected] = useState<number[]>([]);
  const [showRejected, setShowRejected] = useState(false);

  const reject = (id: number) => setRejected((prev) => [...prev, id]);
  const isRejected = (id: number) => rejected.includes(id);

  const visible = candidates.filter((p) => showRejected || !isRejected(p.id));
  const hiddenCount = candidates.length - visible.length;

  // Nothing found: the approval card already says so, and a second empty
  // message about the same fact would be noise rather than honesty.
  if (candidates.length === 0) return null;

  const allGone = visible.length === 0;

  return (
    <section
      aria-label="Search results"
      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">
            {candidates.length === 1 ? "1 candidate found" : `${candidates.length} candidates found`}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Your ceiling is{" "}
            <span className="font-mono font-semibold text-slate-700">
              {ceiling.toFixed(2)} {currency}
            </span>
            . Choose one to draft the order for — or reject it and pick another.
          </p>
        </div>

        {rejected.length > 0 && (
          <button
            type="button"
            onClick={() => setShowRejected((prev) => !prev)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {showRejected
              ? "Hide rejected"
              : `Show again${hiddenCount > 0 ? ` (${hiddenCount})` : ""}`}
          </button>
        )}
      </div>

      {allGone ? (
        // Every candidate turned down. Say so plainly rather than showing an
        // empty box, and offer the only action that can produce more.
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-slate-500">
            {rejected.length === 1
              ? "That candidate was rejected."
              : `All ${candidates.length} candidates were rejected.`}{" "}
            Nothing was drafted.
          </p>
          <button
            type="button"
            onClick={() => {
              setRejected([]);
              setShowRejected(false);
            }}
            className="flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <Undo2 className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            Show them again
          </button>
        </div>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((product) => (
            <Card
              key={product.id}
              product={product}
              isAgentPick={product.id === matchedId}
              ceiling={ceiling}
              onChoose={onChoose}
              onReject={reject}
            />
          ))}
        </div>
      )}
    </section>
  );
}
