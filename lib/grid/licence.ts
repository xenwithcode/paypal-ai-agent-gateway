// lib/grid/licence.ts
//
// What a licence key actually says, before anyone hands it to a manager.
//
// Pure and import-free so it can be tested with no packages and no browser —
// which matters, because this module exists to stop a *silent* mistake that
// cost an hour: AG Grid and AG Studio keep **two separate licence stores**, and
// `LicenseManager` from `ag-grid-enterprise` has no idea what `03C` means.
//
// Handing a Studio key to the grid prints "Invalid License Key / Your license
// key is not valid", which reads like a broken key when the key is perfectly
// fine — its MD5 matches and it does not expire until 21-nov-2026. The grid's
// own type table is simply shorter than Studio's:
//
//   ag-grid-enterprise : {"01":"GRID", "02":"CHARTS", "0102":"BOTH"}
//   ag-studio          : those three, plus
//                        {"03A":"STUDIO-CORE", "03B":"STUDIO-PRO", "03C":"STUDIO-PRO-AI"}
//
// The bracket parsing below mirrors AG Grid's own `extractBracketedInformation`
// exactly, because a classifier that disagrees with the validator is worse than
// no classifier: it would confidently wire a key the manager is about to
// reject.
//

/** The type codes the two managers between them understand. */
export type LicenceType =
  | "GRID"
  | "CHARTS"
  | "BOTH"
  | "STUDIO-CORE"
  | "STUDIO-PRO"
  | "STUDIO-PRO-AI";

const GRID_TYPES: Record<string, LicenceType> = {
  "01": "GRID",
  "02": "CHARTS",
  "0102": "BOTH",
};

const STUDIO_TYPES: Record<string, LicenceType> = {
  "03A": "STUDIO-CORE",
  "03B": "STUDIO-PRO",
  "03C": "STUDIO-PRO-AI",
};

export type LicenceInfo = {
  /** Nothing was configured. Kept distinct from "configured but unusable". */
  present: boolean;
  /** `3` is the current format, the one where the type bracket became mandatory. */
  version: string;
  type: LicenceType | null;
  /** Which store this key belongs to. */
  owner: "grid" | "studio";
  /** When a trial stops being usable, or null when the key carries no date. */
  expiry: Date | null;
  /** The date has passed. */
  expired: boolean;
  /** The key carries a date AG Grid can parse. False means it would refuse it. */
  readable: boolean;
  /** May `ag-grid-enterprise`'s `LicenseManager` be given this key? */
  coversGrid: boolean;
};

const EMPTY: LicenceInfo = {
  present: false,
  version: "none",
  type: null,
  owner: "grid",
  expiry: null,
  expired: false,
  readable: false,
  coversGrid: false,
};

/**
 * When the key stops working: base64 epoch milliseconds after the last `_`.
 *
 * The same trick AG Grid uses, because it is the same key. Checked here so the
 * app can *fall back* on the day a trial runs out instead of printing AG Grid's
 * eight-line banner on every page — a dated licence going quiet on its own
 * expiry is the behaviour a scheduled hackathon deadline needs.
 */
function readExpiry(
  licence: string,
  now: Date
): { expiry: Date | null; expired: boolean; readable: boolean } {
  const tail = licence.slice(licence.lastIndexOf("_") + 1);
  if (!tail) return { expiry: null, expired: false, readable: false };
  try {
    const milliseconds = Number.parseInt(atob(tail), 10);
    if (!Number.isFinite(milliseconds)) return { expiry: null, expired: false, readable: false };
    const expiry = new Date(milliseconds);
    if (Number.isNaN(expiry.getTime())) return { expiry: null, expired: false, readable: false };
    return { expiry, expired: expiry.getTime() < now.getTime(), readable: true };
  } catch {
    // AG Grid treats a date it cannot parse as an invalid licence
    // (`valid = !isNaN(expiry.getTime())`). Matching it means an unreadable
    // date falls back to Community rather than reaching the manager and being
    // refused there.
    return { expiry: null, expired: false, readable: false };
  }
}

/**
 * Read a key the way AG Grid reads it.
 *
 * `coversGrid` is the whole point, and the rule is AG Grid's rather than ours:
 * from format v3 the type bracket is required and only `GRID` or `BOTH` are
 * accepted for a grid; earlier formats carried no type at all and are judged on
 * the signature and the expiry alone.
 */
export function readLicence(raw: string | undefined, now: Date = new Date()): LicenceInfo {
  const key = (raw ?? "").trim();
  if (!key) return EMPTY;

  // Zero-width characters and BOMs are what a copy through a web page or an
  // email client tends to add. AG Grid strips them before hashing, so stripping
  // them here means our reading and its reading start from the same string.
  const cleaned = key.replace(/[\u200B-\u200D\uFEFF]/g, "").replace(/\r?\n|\r/g, "");

  const brackets = (cleaned.match(/\[(.*?)\]/g) ?? []).map((match) => match.slice(1, -1));
  const rawVersion = brackets.find((bracket) => bracket.startsWith("v"));
  const version = rawVersion ? rawVersion.slice(1) : "legacy";

  const code = brackets.find((bracket) => GRID_TYPES[bracket] || STUDIO_TYPES[bracket]);
  const isStudio = code !== undefined && STUDIO_TYPES[code] !== undefined;
  const type = code ? GRID_TYPES[code] ?? STUDIO_TYPES[code] : null;

  // The date sits in the licence body, immediately before the 32-character
  // signature AG Grid appends.
  const { expiry, expired, readable } = readExpiry(cleaned.slice(0, cleaned.length - 32), now);

  const typeOk = !type ? version !== "3" : !isStudio && type !== "CHARTS";
  const coversGrid = typeOk && readable && !expired;

  return {
    present: true,
    version,
    type,
    owner: isStudio ? "studio" : "grid",
    expiry,
    expired,
    readable,
    coversGrid,
  };
}

/** Why the grid is not running Enterprise, in one sentence. Null when nothing is wrong. */
export function explainLicence(info: LicenceInfo): string | null {
  if (!info.present || info.coversGrid) return null;

  if (info.expired) {
    return (
      `The licence expired on ${info.expiry ? info.expiry.toDateString() : "an unreadable date"}, ` +
      "so the grid is running on Community modules rather than printing AG Grid's expiry banner " +
      "on every page."
    );
  }
  if (!info.readable) {
    return (
      "The licence carries no expiry date AG Grid can read, which is how it judges a key — so the " +
      "grid is running on Community modules instead of being refused by the manager."
    );
  }
  if (info.owner === "studio") {
    return (
      `An AG Studio licence (${info.type}) was supplied for the grid. It is valid — it is simply ` +
      "a different product with its own licence store, so ag-grid-enterprise refuses it. The grid " +
      "is running on Community modules; set NEXT_PUBLIC_AG_GRID_LICENSE_KEY to a Grid/Charts key " +
      "to enable Enterprise."
    );
  }
  if (info.version === "3" && info.type === null) {
    return (
      "A v3 licence without a type bracket the grid recognises. The grid is running on Community " +
      "modules; set NEXT_PUBLIC_AG_GRID_LICENSE_KEY to a Grid/Charts key to enable Enterprise."
    );
  }
  return `This key covers ${info.type ?? "nothing"} only, not the grid. The grid is running on Community modules.`;
}
