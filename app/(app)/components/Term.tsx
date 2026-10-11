// app/(app)/components/Term.tsx
import type { ReactNode } from "react";

/**
 * A word this product invented, explained where it is met.
 *
 * *Ceiling*, *condition*, *hold*, *reserved*: the vocabulary that makes this
 * product precise is the same vocabulary that stops a first-time reader —
 * including the judge, who has thirty seconds and has never seen the screen
 * before. A footnote nobody reads is not an explanation, so the sentence
 * stays whole and the word carries its own meaning on hover.
 *
 * Dotted underline rather than a different colour: colour is already spoken
 * for across this app (emerald means money arriving, red means refused), and
 * a term painted in either would read as a verdict. Never the sole carrier
 * of anything — the sentence still says what it says without the tooltip.
 */
export default function Term({
  children,
  explain,
}: {
  children: ReactNode;
  /** One sentence, in the words a person would use out loud. */
  explain: string;
}) {
  return (
    <span
      title={explain}
      className="cursor-help border-b border-dotted border-current align-baseline"
    >
      {children}
    </span>
  );
}
