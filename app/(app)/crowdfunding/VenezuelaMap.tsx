// app/(app)/crowdfunding/VenezuelaMap.tsx
"use client";

import { MAP_HEIGHT, MAP_WIDTH, OUTLINE_PATH, project } from "./venezuela";
import { progressPct, statusOf, type Project } from "@/lib/crowdfunding";

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

        {projects.map((project_) => {
          const { x, y } = project(project_.lng, project_.lat);
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
      </div>
    </div>
  );
}
