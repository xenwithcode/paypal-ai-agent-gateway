// lib/crowdfunding.ts
//
// What a project is, and what a payload has to prove before this product will
// show it as one.
//
// Phase 3's rule is the same one the rest of the app already follows: a record
// that cannot be read is refused, never repaired. A project with a goal but no
// coordinates would break the map; one whose `raised` exceeds its `goal` would
// show a bar past 100% and a "still missing" figure that is negative — both
// are failures a reader cannot detect, which is the reason they are refused
// here rather than clamped.
//
// Pure on purpose: no `fs`, no fetch, no side effects. The server entry reads
// the seed and passes validated projects down; the grid imports this module in
// the browser. A file system import in here would follow the grid into the
// client bundle — see the note on `allowImportingTsExtensions` in tsconfig.
//
// The seed lives in `lib/seeds/`, not in `data/`: `data/` is gitignored as
// runtime state, so anything written there is invisible to a clone — a demo
// whose showcase arrives empty on the judge's machine is a demo that never
// shipped. The two directories answer different questions — *what we ship*
// and *what happened while running* — and confusing them is how a repository
// ends up depending on a file it does not contain.

/** How many projects the showcase will hold before it pages. */
export const MAX_PROJECTS = 50;

/** The minimum the model allows anyone to put in. One rule, one name. */
export const MIN_INVESTMENT_USD = 20;

/**
 * The ceiling on a single investment.
 *
 * $20 is the door and $1.000 is the wall: above it this stops being a product
 * for the person putting in twenty and starts being one for a handful of
 * larger tickets, which changes what the showcase has to promise. Enforced
 * here rather than in the input's `max`, because an attribute the user can
 * edit is a suggestion — the panel states it and the server-side judge of
 * F3.4 will refuse anything outside the band.
 */
export const MAX_INVESTMENT_USD = 1000;

/**
 * The commission the platform takes for arranging the funding.
 *
 * Stated as a number in code rather than as a line of copy, so the figure the
 * UI shows, the figure the server charges and the figure in the pitch are the
 * same one. Nothing is collected yet; the design says where it would come from.
 */
export const PLATFORM_FEE_PCT = 2;

export type Risk = "A" | "B" | "C";

/**
 * Whether the goal has been reached — derived, never stored.
 *
 * A stored status is a second source of truth that drifts from `raised` the
 * first time a row is written by hand, and the two disagreeing is exactly the
 * kind of contradiction this project keeps removing.
 */
export type ProjectStatus = "OPEN" | "FUNDED";

export type Project = {
  /** Stable across renders: the row identity and the map pin share it. */
  id: string;
  name: string;
  /** "Chacao, Miranda" — shown, because proximity is the argument. */
  city: string;
  /** What the money is for, in the operator's own words. */
  what: string;
  /** USD needed. Always positive. */
  goalUsd: number;
  /** USD committed so far. Never above `goalUsd` — see `normaliseProjects`. */
  raisedUsd: number;
  /** Annual return offered to the people who fund it, in percent. */
  returnPct: number;
  /** The committee's grade: A lower risk, C higher. */
  risk: Risk;
  /**
   * What stands behind the money — the collateral the design calls
   * "nivel de seguridad".
   *
   * A grade without a reason is a number the reader has to take on faith, and
   * "backed by the inventory in the store" is the sentence that answers the
   * first question anyone asks: *what happens if the business fails?* Required,
   * because a project whose backing is unknown is a project nobody should be
   * asked to fund — the UI never invents one to fill the cell.
   */
  collateral: string;
  /** Latitude in decimal degrees, inside Venezuela. */
  lat: number;
  /** Longitude in decimal degrees, inside Venezuela (west is negative). */
  lng: number;
  /** How many people are already in. Social proof, and the only count shown. */
  investors: number;
  /**
   * True while the project is a demo record rather than an audited one.
   *
   * The showcase must never imply an audit that has not happened: every seed
   * carries this, and the UI renders it as a chip.
   */
  seed?: boolean;
};

/**
 * Venezuela, as a bounding box: the four projects we seed all sit inside it,
 * and a coordinate outside it is a typo in a field the map trusts.
 */
const VENEZUELA = { latMin: 0.5, latMax: 12.3, lngMin: -73.5, lngMax: -59.7 };

const RISKS: Risk[] = ["A", "B", "C"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Read a project list, or refuse it.
 *
 * `null` means "not a list of projects", not "an empty list" — the two are
 * different answers and a caller showing an empty shelf for a malformed file
 * would be telling the operator that nobody applied.
 */
export function normaliseProjects(value: unknown): Project[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > MAX_PROJECTS) return null;

  const projects: Project[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    const raw = asRecord(entry);
    if (!raw) return null;

    const id = text(raw.id);
    const name = text(raw.name);
    const city = text(raw.city);
    const what = text(raw.what);
    const collateral = text(raw.collateral);
    const goalUsd = finite(raw.goalUsd);
    const raisedUsd = finite(raw.raisedUsd);
    const returnPct = finite(raw.returnPct);
    const lat = finite(raw.lat);
    const lng = finite(raw.lng);
    const investors = finite(raw.investors);

    if (!id || !name || !city || !what || !collateral) return null;
    if (seen.has(id)) return null;
    if (goalUsd === null || goalUsd <= 0) return null;
    if (raisedUsd === null || raisedUsd < 0) return null;
    // Over-recruitment cannot exist. A row claiming $52.000 toward a $50.000
    // goal would render a full bar and a negative "still missing" figure, and
    // no reader would know which of the two numbers was the lie.
    if (raisedUsd > goalUsd) return null;
    if (returnPct === null || returnPct < 0 || returnPct >= 100) return null;
    if (lat === null || lng === null) return null;
    if (lat < VENEZUELA.latMin || lat > VENEZUELA.latMax) return null;
    if (lng < VENEZUELA.lngMin || lng > VENEZUELA.lngMax) return null;
    if (investors === null || investors < 0 || !Number.isInteger(investors)) return null;

    const risk = text(raw.risk)?.toUpperCase();
    if (!risk || !RISKS.includes(risk as Risk)) return null;
    if (raw.seed !== undefined && typeof raw.seed !== "boolean") return null;

    seen.add(id);
    projects.push({
      id,
      name,
      city,
      what,
      collateral,
      goalUsd,
      raisedUsd,
      returnPct,
      risk: risk as Risk,
      lat,
      lng,
      investors,
      ...(typeof raw.seed === "boolean" ? { seed: raw.seed } : {}),
    });
  }

  return projects;
}

/** 0…1, clamped at the goal — a full bar is full, never overflowing. */
export function progressPct(project: Project): number {
  if (project.goalUsd <= 0) return 0;
  return Math.min(1, Math.max(0, project.raisedUsd / project.goalUsd));
}

/** What is still missing, never negative: 0 when the goal is met. */
export function remainingUsd(project: Project): number {
  return Math.max(0, project.goalUsd - project.raisedUsd);
}

/** Derived from the money, so the two can never disagree. */
export function statusOf(project: Project): ProjectStatus {
  return project.raisedUsd >= project.goalUsd ? "FUNDED" : "OPEN";
}
