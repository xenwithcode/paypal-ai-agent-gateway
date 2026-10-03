// app/(app)/overview/types.ts
//
// The row as the grid, the approval panel and the hold endpoints all see it.
// Shared rather than redeclared because a field spelled one way in the table
// and another in the panel is the bug this project keeps finding.

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
  /**
   * The only host this order may reach, or empty when no merchant was named.
   * Shown so the approver can see the scope they are signing off on — a
   * ceiling with no endpoint is only half a permission.
   */
  allowEndpoint: string;
}
