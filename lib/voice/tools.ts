// lib/voice/tools.ts
//
// What the spoken agent is allowed to ask for.
//
// Pure on purpose: no imports, no SDK, no network. The declarations are sent
// to the model, the model's function calls come back in the same shape, and
// the browser validates a call before it moves a cent — three places that have
// to agree about the meaning of `rowId`, so the agreement lives in one file
// all three can load. It is also the only reason the test suite can cover this
// layer at all: a module that pulled in the Gemini client would need
// credentials to be tested, and "it works when the key is there" is not a
// property this project is willing to have.
//
// Speech is not authority. Nothing here *does* anything — these are the verbs
// the model may *request*, and every one of them is executed by the same
// handler the buttons already use, which means every one of them still goes
// through the server's judge on the way to any money.
//

/** Mirrors the cap on `/api/agent`. A spoken intent longer than the typed one
 *  would be a second, wider door into the same call. */
export const VOICE_MAX_PROMPT = 500;

export type VoiceToolName =
  | "draftOrder"
  | "getBalance"
  | "setAgent"
  | "approveOrder"
  | "captureOrder"
  | "releaseOrder"
  | "investInProject";

/**
 * Which screen the model is speaking on.
 *
 * The toolset follows the screen, because a model offered a command it cannot
 * run will use it — and an agent that narrates an action nobody can perform is
 * the failure this whole file exists to prevent. One vocabulary per surface:
 * the dashboard may draft orders, the showcase may prepare investments, and
 * neither is told about the other's verbs.
 */
export type VoiceSurface = "dashboard" | "crowdfunding";

export const VOICE_SURFACES: readonly VoiceSurface[] = ["dashboard", "crowdfunding"];

export function isVoiceSurface(value: unknown): value is VoiceSurface {
  return value === "dashboard" || value === "crowdfunding";
}

/** Which verbs each screen can actually run — the list the model is shown. */
const TOOLS_BY_SURFACE: Record<VoiceSurface, readonly VoiceToolName[]> = {
  dashboard: [
    "draftOrder",
    "getBalance",
    "setAgent",
    "approveOrder",
    "captureOrder",
    "releaseOrder",
  ],
  crowdfunding: ["getBalance", "investInProject"],
};

/**
 * The declarations for one screen.
 *
 * Validation still accepts every tool in `VOICE_TOOLS`: a model that asks for
 * something this surface does not offer is refused *by the handler*, with a
 * line the human hears, which is a better answer than pretending the call was
 * never made.
 */
export function toolsFor(surface: VoiceSurface): readonly VoiceTool[] {
  const wanted = new Set(TOOLS_BY_SURFACE[surface]);
  return VOICE_TOOLS.filter((tool) => wanted.has(tool.name));
}

/** The JSON wire types, spelled the way the API spells them. `lib/voice/live.ts`
 *  converts these to the SDK's enum once, at the boundary where it is loaded. */
export type VoiceWireType = "OBJECT" | "STRING" | "NUMBER" | "BOOLEAN";

export type VoiceArg = string | number | boolean;

export type VoiceToolCall = {
  /** Echoed back to the model in the tool response. */
  id: string;
  name: VoiceToolName;
  args: Record<string, VoiceArg>;
};

export type VoiceTool = {
  name: VoiceToolName;
  description: string;
  parameters: {
    type: "OBJECT";
    properties: Record<string, { type: Exclude<VoiceWireType, "OBJECT">; description: string }>;
    required: readonly string[];
  };
};

/**
 * The declarations, and the prose that decides how well they are used.
 *
 * Descriptions carry more weight than the schema does: the model chooses
 * between calling a tool and answering in prose based on these sentences, so
 * a vague one produces an agent that narrates actions it never performed.
 */
export const VOICE_TOOLS: readonly VoiceTool[] = [
  {
    name: "draftOrder",
    description:
      "Draft a purchase order from what the user asked for. Put the WHOLE request into `prompt` as one natural-language line, keeping every amount, merchant, date and condition they said — for example " +
      '"white sneakers, size 10, only if the price drops to 60 USD or less, by Friday". ' +
      "Drafting creates a row awaiting approval; it does not spend anything.",
    parameters: {
      type: "OBJECT",
      properties: {
        prompt: { type: "STRING", description: "The complete intent, in one line." },
      },
      required: ["prompt"],
    },
  },
  {
    name: "getBalance",
    description:
      "Read the account balance from PayPal. Required for ANY question about money or what is on the table — never state a figure, a status or a total from memory.",
    parameters: { type: "OBJECT", properties: {}, required: [] },
  },
  {
    name: "setAgent",
    description:
      "Start or stop the autonomous agent. While running it re-checks every approved order every few seconds and settles the ones whose condition now holds; the server judges each pass before any money moves.",
    parameters: {
      type: "OBJECT",
      properties: {
        on: { type: "BOOLEAN", description: "true to start it, false to stop it." },
      },
      required: ["on"],
    },
  },
  {
    name: "approveOrder",
    description:
      "Give approval to one drafted order, by its rowId from the list of orders provided. Approval belongs to the human: call this only when they have explicitly said they approve it out loud.",
    parameters: {
      type: "OBJECT",
      properties: {
        rowId: { type: "NUMBER", description: "The order's rowId from the list." },
      },
      required: ["rowId"],
    },
  },
  {
    name: "captureOrder",
    description:
      "Settle a reserved order now, by its rowId. The server re-judges the whole envelope first — ceiling, window, mode, destination — and may refuse.",
    parameters: {
      type: "OBJECT",
      properties: {
        rowId: { type: "NUMBER", description: "The order's rowId from the list." },
      },
      required: ["rowId"],
    },
  },
  {
    name: "releaseOrder",
    description:
      "Return the money a reserved order is holding, without paying it, by its rowId.",
    parameters: {
      type: "OBJECT",
      properties: {
        rowId: { type: "NUMBER", description: "The order's rowId from the list." },
      },
      required: ["rowId"],
    },
  },
  {
    name: "investInProject",
    description:
      "Prepare an investment in one of the crowdfunding projects, for the amount the human asked for. " +
      "It selects that project and fills the panel with the amount; NOTHING IS CHARGED — the human approves it in PayPal, " +
      "and the server judges the amount against the project's band ($20-$1,000) and its goal first, and may refuse it. " +
      "Call it once per request. Use the #id from the list of projects provided.",
    parameters: {
      type: "OBJECT",
      properties: {
        project: { type: "NUMBER", description: "The project's #id from the list." },
        amount: { type: "NUMBER", description: "How much to invest, in USD." },
      },
      required: ["project", "amount"],
    },
  },
];

const KNOWN = new Set<string>(VOICE_TOOLS.map((tool) => tool.name));

export type VoiceToolCallVerdict =
  | { ok: true; call: VoiceToolCall }
  | { ok: false; reason: string };

/**
 * Is this something the gateway will actually run?
 *
 * Checked on the way out of the model rather than on the way in to the
 * handler, because the model is the part that can be wrong: a `rowId` of
 * "three", an empty prompt, a tool name that does not exist. Rejecting here
 * means the console reports *why* nothing happened instead of the browser
 * attempting it and discovering the shape mid-flight.
 *
 * A prompt over the cap is refused rather than truncated — trimming an intent
 * is how a ceiling disappears from the sentence that was supposed to hold it.
 */
export function validateVoiceToolCall(raw: unknown): VoiceToolCallVerdict {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "The agent sent something that is not an object." };
  }

  const candidate = raw as { id?: unknown; name?: unknown; args?: unknown };

  if (typeof candidate.name !== "string" || !KNOWN.has(candidate.name)) {
    return { ok: false, reason: `The agent asked for "${String(candidate.name)}", which is not a command this gateway has.` };
  }
  if (typeof candidate.id !== "string" || !candidate.id) {
    return { ok: false, reason: "The agent's request carried no id to answer." };
  }

  const args: Record<string, VoiceArg> = {};
  if (typeof candidate.args === "object" && candidate.args !== null && !Array.isArray(candidate.args)) {
    for (const [key, value] of Object.entries(candidate.args as Record<string, unknown>)) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        args[key] = value;
      }
    }
  }

  if (candidate.name === "draftOrder") {
    const prompt = args.prompt;
    if (typeof prompt !== "string" || !prompt.trim()) {
      return { ok: false, reason: "The agent asked to draft an order without saying what to buy." };
    }
    if (prompt.length > VOICE_MAX_PROMPT) {
      return { ok: false, reason: `That request is longer than ${VOICE_MAX_PROMPT} characters.` };
    }
    args.prompt = prompt.trim();
  }

  if (candidate.name === "setAgent") {
    if (typeof args.on !== "boolean") {
      return { ok: false, reason: "The agent did not say whether to start or stop the agent." };
    }
  }

  if (
    candidate.name === "approveOrder" ||
    candidate.name === "captureOrder" ||
    candidate.name === "releaseOrder"
  ) {
    const rowId = args.rowId;
    if (typeof rowId !== "number" || !Number.isFinite(rowId)) {
      return { ok: false, reason: "The agent named an order that is not on the table." };
    }
    args.rowId = Math.trunc(rowId);
  }

  if (candidate.name === "investInProject") {
    const project = args.project;
    if (typeof project !== "number" || !Number.isFinite(project)) {
      return { ok: false, reason: "The agent did not say which project to invest in." };
    }
    args.project = Math.trunc(project);

    const amount = args.amount;
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
      return { ok: false, reason: "The agent did not say how much to invest." };
    }
    // Deliberately *not* judged here: the band and the goal are the campaign's
    // own rules, and they belong to `judgeInvestment` — the same function the
    // panel and the server call. A shape check stops a malformed call; only
    // the judge may say no to an amount.
  }

  return { ok: true, call: { id: candidate.id, name: candidate.name as VoiceToolName, args } };
}

/** One line for the console — the same shape every other line uses, so the
 *  record of a spoken command reads like the record of a typed one. */
export function describeVoiceToolCall(call: VoiceToolCall): string {
  switch (call.name) {
    case "draftOrder":
      return `draftOrder → "${String(call.args.prompt)}"`;
    case "setAgent":
      return `setAgent → ${call.args.on ? "on" : "off"}`;
    case "getBalance":
      return "getBalance";
    case "investInProject":
      return `investInProject → project #${String(call.args.project)} · ${String(call.args.amount)} USD`;
    default:
      return `${call.name} → order #${String(call.args.rowId)}`;
  }
}

/**
 * What the model is told about the table before it decides.
 *
 * Without it the model can only guess at ids, and an agent that guesses which
 * order to capture is exactly the failure this product exists to prevent. Rows
 * travel as prose rather than JSON because they are read by a model, not
 * parsed by one.
 *
 * Capped: a table with 500 rows would spend the model's attention on a list
 * nobody can act on in one breath, and the tail of it would be ids the model
 * cannot see the names for. What does not fit is *said* to be missing rather
 * than silently dropped — the same rule the column derivations follow.
 */
export const VOICE_MAX_ROWS = 40;

/**
 * The row shape that travels to the model, spelled once.
 *
 * Both describers read it, and so does the route that receives it: three
 * places that have to agree on what `limit` means on *their* screen — a
 * ceiling for an order, the still-missing figure for a campaign.
 */
export type VoiceRow = {
  id: number;
  what: string;
  status: string;
  limit: number;
  currency: string;
};

export function describeRowsForVoice(
  rows: readonly VoiceRow[],
  max: number = VOICE_MAX_ROWS
): string {
  if (rows.length === 0) return "There are no orders on the table right now.";

  const shown = rows.slice(0, max);
  const lines = shown.map(
    (row) => `#${row.id} ${row.what} — ${row.status} — ceiling ${row.limit} ${row.currency}`
  );

  if (rows.length > shown.length) {
    lines.push(`(+${rows.length - shown.length} more orders not listed — ask the human to name it)`);
  }

  return lines.join("\n");
}

/**
 * The *projects*, the way the model needs to read them.
 *
 * The same row shape on a different screen, because `what` here carries the
 * name, the city and the offer — the showcase's own words — and `limit` is
 * **not a ceiling**: it is what the campaign is still missing, which is the
 * number that decides whether there is room for this investment at all.
 *
 * A word that means the wrong thing on this screen is worse than no word: the
 * model repeats what it is told, and "ceiling 7500 USD" would describe a
 * campaign as though it were an allowance.
 */
export function describeProjectsForVoice(
  rows: readonly VoiceRow[],
  max: number = VOICE_MAX_ROWS
): string {
  if (rows.length === 0) return "There are no projects in the showcase right now.";

  const shown = rows.slice(0, max);
  const lines = shown.map((row) => {
    const missing =
      row.limit > 0
        ? `${row.limit.toLocaleString("en-US", { maximumFractionDigits: 2 })}${
            row.currency ? ` ${row.currency}` : ""
          } still missing`
        : "goal reached";
    return `#${row.id} ${row.what} — ${row.status} — ${missing}`;
  });

  if (rows.length > shown.length) {
    lines.push(
      `(+${rows.length - shown.length} more projects not listed — ask the human to name it)`
    );
  }

  return lines.join("\n");
}
