// app/(app)/overview/types.ts
//
// The row as the grid, the approval panel and the hold endpoints all see it.
// Shared rather than redeclared because a field spelled one way in the table
// and another in the panel is the bug this project keeps finding.
import type { CandidateRecord } from "@/lib/commerce/catalog";

/** Catalog price at draft time, null when nothing matched. */
export interface PolicyRow {
  id: number;
  /** The purchase itself, with the attributes that identify it. */
  what: string;
  /** Named merchant when one was given. Drives endpoint derivation, not shown. */
  merchant: string;
  limit: number;
  currency: string;
  /** Must hold before money moves. Empty = execute immediately. */
  condition: string;
  expires: string;
  mode: string;
  status: string;
  marketPrice: number | null;
  /** Catalog thumbnail, so the approver sees what they are approving. */
  marketImage: string | null;
  /** true = condition satisfied, false = violated, null = cannot be judged. */
  conditionMet: boolean | null;
  /** How the verdict was reached, including the catalog it came from. */
  conditionDetail: string;
  /** ISO instant the order was drafted. Absent on rows stored before it existed. */
  createdAt?: string;
  /** ISO instant the money moved, set when a hold is captured. */
  capturedAt?: string;
  /** PayPal's order id, set when the payer is asked to approve a hold. */
  paypalOrderId?: string;
  /**
   * The authorization PayPal issued once the payer approved. Capture and void
   * both refer to it by name, so a hold without one can only be released as a
   * demo decision — which the card says rather than implies.
   */
  authorizationId?: string;
  /**
   * The only host this order may reach, or empty when no merchant was named.
   * Shown so the approver can see the scope they are signing off on — a
   * ceiling with no endpoint is only half a permission.
   */
  allowEndpoint: string;
  /**
   * The account this order may pay, or empty when no recipient was named.
   *
   * The other half of the same idea: `allowEndpoint` bounds where the agent
   * may spend, this bounds who it may pay. Optional because rows stored
   * before it existed carry none, and an absent field must not read as an
   * empty restriction.
   */
  payee?: string;
  /**
   * What the search returned for this order, kept after the choice was made.
   *
   * Absent on rows drafted before it existed — which reads as *no record of a
   * strip*, not as *a strip that was empty*. The two are different claims and
   * only one of them is one this product can make.
   */
  /**
   * The crowdfunding project this order funds, if it funds one — the marker
   * that turns an ordinary row into a position the portfolio can count.
   */
  project?: string;
  candidates?: CandidateRecord[];
  /** Which candidate the agent would have taken, so a later reader can compare. */
  matchedId?: number | null;
  /**
   * Which candidate the human took. Equal to `matchedId` when they agreed, and
   * different from it exactly when somebody overrode the agent.
   */
  chosenId?: number | null;
}
