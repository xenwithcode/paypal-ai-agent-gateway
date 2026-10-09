// app/(app)/crowdfunding/VenezuelaMap.tsx
"use client";

import { MAP_HEIGHT, MAP_WIDTH, OUTLINE_PATH, project } from "./venezuela";
import { progressPct, statusOf, type Project } from "@/lib/crowdfunding";

/**
 * Minimum gap between two pins, in viewBox units — about 26 of 1000, which is
 * larger than the pin itself.
 */
const MIN_GAP = 26;

type Pin = {
  project: Project;
  x: number;
  y: number;
  /** Where the business actually is, when the pin had to be moved off it. */
  trueX: number;
  trueY: number;
  spread: boolean;
};

/**
 * Where the money goes, on the country it goes to.
 *
 * Clicking a pin is the same act as clicking the row: both select the project,
 * and the card beside the map explains it. Two ways in, one state — a map that
 * opened a *different* panel from the table's would teach two rules for one
 * decision.
 *
 * Pin colour reuses the bar's vocabulary rather than inventing a second one:
 * emerald while the goal is open, the dark slate of a funded bar once it is
 * met, brand blue while it is the one you are looking at. The legend below
 * spells all three out, because colour is the second cue — a reader who cannot
 * see it still has a table underneath, a card beside it and words in the
 * `aria-label`.
 *
 * Keyboard: every pin is focusable and answers to Enter and Space, so the map
 * is not a mouse-only version of what the table already offers.
 */
/**
 * Spread pins that would land on top of each other, keeping the truth visible.
 *
 * Two projects in the same city are 4 units apart on a 1000-unit map — one pin
 * hides the other, and a showcase that shows three pins for four projects
 * reads as a missing project. Moving the second one, though, puts a business
 * where it is not, which is the same sin as a pin in the sea.
 *
 * So: the first pin sits exactly on its coordinates, and any pin that would
 * collide is pushed out along a ring until it fits, with a dashed line back to
 * the point it came from. The marker is offset; the line says where it really
 * is. The legend states it too, because a reader who does not know to look
 * would otherwise see a pin that is simply wrong.
 */
function placePins(projects: Project[]): Pin[] {
  const placed: Pin[] = [];
  const collides = (x: number, y: number, skip?: Pin) =>
    placed.some((other) => other !== skip && Math.hypot(other.x - x, other.y - y) < MIN_GAP);

  for (const entry of projects) {
    const { x, y } = project(entry.lng, entry.lat);
    let at = { x, y };
    let spread = false;

    if (collides(at.x, at.y)) {
      spread = true;
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        const candidate = { x: x + Math.cos(angle) * MIN_GAP, y: y + Math.sin(angle) * MIN_GAP };
        at = candidate;
        if (!collides(at.x, at.y)) break;
      }
    }

    placed.push({ project: entry, x: at.x, y: at.y, trueX: x, trueY: y, spread });
  }

  return placed;
}

export default function VenezuelaMap({
  projects,
  selectedId,
  onSelect,
}: {
  projects: Project[];
  selectedId: string | null;
  onSelect: (project: Project) => void;
}) {
  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Map of Venezuela showing ${projects.length} project${
          projects.length === 1 ? "" : "s"
        } seeking funding`}
      >
        {/* The country: light surface, darker rule, so pins have somewhere to
            sit that reads as land rather than as a floating dot. */}
        <path
          d={OUTLINE_PATH}
          fill="#f2f4f7"
          stroke="#d0d5dd"
          strokeWidth={3}
          strokeLinejoin="round"
        />

        {placePins(projects).map((pin) => {
          const { x, y } = pin;
          const project_ = pin.project;
          const selected = project_.id === selectedId;
          const funded = statusOf(project_) === "FUNDED";
          const fill = selected ? "#0042a1" : funded ? "#101828" : "#16b364";

          return (
            <g
              key={project_.id}
              role="button"
              tabIndex={0}
              aria-label={`${project_.name}, ${project_.city} — ${Math.round(
                progressPct(project_) * 100
              )}% funded. Open its card.`}
              className="cursor-pointer focus:outline-none"
              onClick={() => onSelect(project_)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(project_);
                }
              }}
            >
              <title>{`${project_.name} — ${project_.city}`}</title>

              {/* The line back to the real coordinate: this marker was moved
                  so the one beneath it could be clicked, and the distance it
                  was moved is the honest part of the drawing. */}
              {pin.spread && (
                <line
                  x1={pin.trueX}
                  y1={pin.trueY}
                  x2={pin.x}
                  y2={pin.y}
                  stroke="#98a2b3"
                  strokeWidth={3}
                  strokeDasharray="6 6"
                  strokeLinecap="round"
                />
              )}

              {/* Halo: without it the pin sits on the coastline rule and both
                  read as one shape at a glance. */}
              <circle
                cx={x}
                cy={y}
                r={selected ? 26 : 19}
                fill={selected ? "#0042a1" : "#ffffff"}
                fillOpacity={selected ? 0.18 : 0.95}
                stroke={selected ? "#0042a1" : "#eaecf0"}
                strokeWidth={3}
              />
              <circle cx={x} cy={y} r={selected ? 11 : 9} fill={fill} />

              {selected && <circle cx={x} cy={y} r={4} fill="#ffffff" />}
            </g>
          );
        })}
      </svg>

      {/* The words for the colours, next to them. */}
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Open
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-900" /> Funded
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-600" /> Selected
        </span>
        <span className="text-slate-400">Tap a pin to open its card</span>
        <span className="w-full text-center text-slate-400">
          Two markers in the same city are spread apart — the dashed line points at where the business
          really is.
        </span>
      </div>
    </div>
  );
}
