import type { Config } from "tailwindcss";

/**
 * The palette, in one file.
 *
 * Every surface in this product already names its colours with Tailwind's
 * vocabulary (`bg-slate-950`, `bg-blue-600`, `border-slate-200`) — 455 uses of
 * `slate` alone. Rewriting those class names across forty files would be an
 * enormous diff whose only outcome is a different spelling of the same colour,
 * so instead the *values* behind those names become AG Grid Studio's own
 * published tokens (`--color-gray-*`, `--color-brand-*`, `--color-green-*`,
 * `--color-warning-*` from ag-grid.com's site CSS).
 *
 * The scale keys line up exactly: Untitled UI's ramp — which AG Grid uses —
 * is 25 / 50 / 100 … 950, the same steps Tailwind ships. So `slate-900` stops
 * being a blue-grey and becomes `#101828`, `blue-600` becomes `#0042a1`, and
 * the table, the buttons and the page all read from one definition.
 *
 * `extend` merges recursively, so a whole scale given here replaces that scale
 * step by step and anything not listed keeps Tailwind's default. Scales that
 * only appear once or twice (`sky`, `indigo`) are not overridden — those call
 * sites were edited instead, because a gradient `blue → indigo` is not
 * something this design language has.
 *
 * The grid reads the same numbers through `lib/grid/setup.ts`. Two definitions
 * of the palette would eventually disagree, and a dashboard that disagrees
 * with itself about what blue means has no business calling itself a system.
 */
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // AG Grid `--color-gray-*`. Neutral, not blue-grey: the whole theme
        // turns on that the greys are actually grey.
        slate: {
          25: "#fcfcfd",
          50: "#f9fafb",
          100: "#f2f4f7",
          200: "#eaecf0",
          300: "#d0d5dd",
          400: "#98a2b3",
          500: "#667085",
          600: "#475467",
          700: "#344054",
          800: "#182230",
          900: "#101828",
          950: "#0c111d",
        },
        // AG Grid `--color-brand-*`. 500 (`#0e4491`) is their site header;
        // 600 (`#0042a1`) is the strongest blue in the ramp and is what a
        // primary action wears here.
        blue: {
          25: "#fafcff",
          50: "#f4f8ff",
          100: "#e5effd",
          200: "#d4e3f8",
          300: "#a9c5ec",
          400: "#3d7acd",
          500: "#0e4491",
          600: "#0042a1",
          700: "#00388f",
          800: "#002e7e",
          900: "#00246c",
          950: "#001a5a",
        },
        // AG Grid `--color-green-*` — the "met / captured / allowed" family.
        emerald: {
          25: "#f6fef9",
          50: "#edfcf2",
          100: "#d3f8df",
          200: "#aaf0c4",
          300: "#73e2a3",
          400: "#3ccb7f",
          500: "#16b364",
          600: "#099250",
          700: "#087443",
          800: "#095c37",
          900: "#084c2e",
          950: "#052e1c",
        },
        // One green, so the two names that already exist in the codebase land
        // on the same ramp instead of two greens a pixel apart.
        green: {
          25: "#f6fef9",
          50: "#edfcf2",
          100: "#d3f8df",
          200: "#aaf0c4",
          300: "#73e2a3",
          400: "#3ccb7f",
          500: "#16b364",
          600: "#099250",
          700: "#087443",
          800: "#095c37",
          900: "#084c2e",
          950: "#052e1c",
        },
        // AG Grid `--color-warning-*` — "near the ceiling / expiring / unverified".
        amber: {
          25: "#fffcf5",
          50: "#fffaeb",
          100: "#fef0c7",
          200: "#fedf89",
          300: "#fec84b",
          400: "#fdb022",
          500: "#f79009",
          600: "#dc6803",
          700: "#b54708",
          800: "#93370d",
          900: "#7a2e0e",
          950: "#4e1d09",
        },
        // AG Grid publishes a single negative red (`--color-negative:
        // #dc3545`) rather than a ramp; this is the ramp that ramp belongs to
        // — the same Untitled UI family their greys come from. Stopped charges
        // are the loudest thing on the page, so they get a full scale.
        red: {
          25: "#fffcfc",
          50: "#fef3f2",
          100: "#fee4e2",
          200: "#fecdca",
          300: "#fda29b",
          400: "#f97066",
          500: "#f04438",
          600: "#d92d20",
          700: "#b42318",
          800: "#912018",
          900: "#7a271a",
          950: "#55160c",
        },
      },
      // One movement in the whole product, and it earns its place the same
      // way the strip it belongs to does: a first-time reader has to look at
      // the three steps. It is a *breathing* ring of the brand blue, never a
      // flash — WCAG counts flashes per second, and this exhales over three
      // and a half. The classes on the strip turn it off for
      // `prefers-reduced-motion` and on hover, because a reader whose mouse
      // is already on it is a reader who is already reading.
      keyframes: {
        "soft-glow": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(0, 66, 161, 0)" },
          "50%": { boxShadow: "0 0 0 5px rgba(0, 66, 161, 0.13)" },
        },
      },
      animation: {
        "soft-glow": "soft-glow 3.5s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
