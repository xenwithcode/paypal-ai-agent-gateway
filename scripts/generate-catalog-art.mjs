// scripts/generate-catalog-art.mjs
//
// The local demo catalog ships its own illustrations. They are deliberately
// drawings, not photographs of products nobody has audited — the same rule the
// crowdfunding showcase follows. Run this once after changing the list:
//
//   node scripts/generate-catalog-art.mjs
//
// The output lives in `public/catalog/` and is committed, so the app never
// fetches an image from a third party at runtime.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "catalog");

const ACCENT = "#0042a1";
const LINE = "#0f172a";

function svg(slug, tint, icon) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img" aria-label="${slug}">
  <defs>
    <linearGradient id="bg-${slug}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8fafc"/>
      <stop offset="1" stop-color="${tint}"/>
    </linearGradient>
  </defs>
  <rect width="400" height="300" fill="url(#bg-${slug})"/>
  <circle cx="342" cy="52" r="52" fill="${ACCENT}" opacity=".07"/>
  <circle cx="48" cy="252" r="68" fill="#16b364" opacity=".06"/>
  <g fill="none" stroke="${LINE}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    ${icon}
  </g>
</svg>
`;
}

const icons = {
  "motorcycle-jacket": `<path d="M154 66 112 92 88 150l38 15 10-42v120h128V123l10 42 38-15-24-58-42-26-20 29-24 10-24-10z" fill="#dbeafe"/><path d="M200 108v135M162 150h18m40 0h18"/><path d="M170 110h60" stroke="#0042a1"/>`,
  "winter-jacket": `<path d="M154 62 104 90 84 154l42 16 10-42v118h128V128l10 42 42-16-20-64-50-28-22 32-22-32z" fill="#e0f2fe"/><path d="M200 96v150M160 142h20m40 0h20M160 172h20m40 0h20M160 202h20m40 0h20"/><path d="M200 96v150" stroke="#0042a1"/>`,
  "chelsea-boots": `<path d="M138 78h70l8 96 54 26v42H130V158l8-12z" fill="#fef3c7"/><path d="M130 224h100M138 158h70M208 174l54 26" stroke="#0042a1"/><path d="M160 104h34M160 126h34"/>`,
  headphones: `<path d="M116 176a84 84 0 0 1 168 0" stroke="#0042a1"/><rect x="90" y="170" width="42" height="66" rx="18" fill="#dbeafe"/><rect x="268" y="170" width="42" height="66" rx="18" fill="#dbeafe"/><path d="M116 176h-6a10 10 0 0 0-10 10v46a10 10 0 0 0 10 10h22M284 176h6a10 10 0 0 1 10 10v46a10 10 0 0 1-10 10h-22"/>`,
  "coffee-machine": `<rect x="112" y="70" width="176" height="104" rx="18" fill="#dbeafe"/><path d="M112 104h176M160 70V54h80v16"/><rect x="148" y="132" width="104" height="24" rx="8"/><path d="M156 174v46h88v-46M156 196h88"/><path d="M178 96h44" stroke="#0042a1"/><path d="M168 54c-8-12 8-18 0-30M200 54c-8-12 8-18 0-30M232 54c-8-12 8-18 0-30" stroke="#0042a1" stroke-width="6"/>`,
  backpack: `<rect x="124" y="82" width="152" height="168" rx="30" fill="#dbeafe"/><path d="M156 82V66a44 44 0 0 1 88 0v16"/><path d="M124 144h152M162 168h76v48h-76z" stroke="#0042a1"/><path d="M156 198h-20v40m108-40h20v40"/>`,
  "fitness-smartwatch": `<rect x="146" y="84" width="108" height="132" rx="28" fill="#dbeafe"/><path d="M172 84V52h56v32M172 216v32h56v-32"/><path d="M176 124h48M176 150h30M176 176h40" stroke="#0042a1"/><circle cx="200" cy="150" r="42" stroke="#0042a1" stroke-width="6" opacity=".35"/>`,
  "polarized-sunglasses": `<rect x="82" y="112" width="104" height="76" rx="30" fill="#dbeafe"/><rect x="214" y="112" width="104" height="76" rx="30" fill="#dbeafe"/><path d="M186 132c8-8 20-8 28 0M82 126l-30-24M318 126l30-24"/><path d="M100 150h68M232 150h68" stroke="#0042a1"/>`,
  "office-chair": `<path d="M142 60h116v104H142z" fill="#dbeafe"/><path d="M126 184h148v28H126z"/><path d="M200 212v34M160 268h80"/><path d="M142 96h116M142 126h116" stroke="#0042a1"/><circle cx="200" cy="164" r="16" stroke="#0042a1"/>`,
  "desk-lamp": `<ellipse cx="200" cy="246" rx="68" ry="14" fill="#dbeafe"/><path d="M200 246V122M200 122l-58-34 58-34 58 34z" fill="#e0f2fe"/><path d="M200 122v-64" stroke="#0042a1"/><path d="M150 84h100" stroke="#0042a1"/><path d="M168 246h64"/>`,
  "mirrorless-camera": `<rect x="78" y="106" width="244" height="136" rx="22" fill="#dbeafe"/><path d="M138 106l20-28h84l20 28"/><circle cx="200" cy="174" r="54" fill="#f8fafc"/><circle cx="200" cy="174" r="32" stroke="#0042a1"/><circle cx="200" cy="174" r="12" fill="#0042a1" stroke="none"/><rect x="272" y="126" width="22" height="12" rx="4" fill="#0042a1" stroke="none"/>`,
  "mechanical-keyboard": `<rect x="66" y="96" width="268" height="128" rx="18" fill="#dbeafe"/><g stroke="#0042a1" stroke-width="6"><path d="M92 124h28v22H92zM132 124h28v22h-28zM172 124h28v22h-28zM212 124h28v22h-28zM252 124h28v22h-28zM292 124h18v22h-18z"/><path d="M92 158h28v22H92zM132 158h28v22h-28zM172 158h28v22h-28zM212 158h28v22h-28zM252 158h58v22h-58zM92 192h218v16H92z"/></g>`,
  "bluetooth-speaker": `<rect x="112" y="64" width="176" height="176" rx="34" fill="#dbeafe"/><circle cx="200" cy="116" r="24" stroke="#0042a1"/><circle cx="200" cy="184" r="38" stroke="#0042a1"/><circle cx="200" cy="184" r="14" fill="#0042a1" stroke="none"/><path d="M148 232h104" stroke="#0042a1"/>`,
  perfume: `<path d="M156 104h88v124a24 24 0 0 1-24 24h-40a24 24 0 0 1-24-24z" fill="#dbeafe"/><path d="M176 104V72h48v32"/><path d="M164 72h72" stroke="#0042a1"/><path d="M200 148c-18 18-18 36 0 52 18-16 18-34 0-52z" fill="#e0f2fe" stroke="#0042a1"/><path d="M268 76l28-18M276 92l30 2" stroke="#0042a1" stroke-width="6"/>`,
  "phone-case": `<rect x="132" y="50" width="136" height="200" rx="28" fill="#dbeafe"/><rect x="150" y="70" width="100" height="160" rx="18" stroke="#0042a1"/><rect x="164" y="84" width="42" height="42" rx="10" fill="#f8fafc"/><circle cx="180" cy="100" r="8" fill="#0042a1" stroke="none"/><circle cx="208" cy="100" r="8" fill="#0042a1" stroke="none"/>`,
  "hydration-vest": `<path d="M146 70l-24 44 18 16-10 112h140l-10-112 18-16-24-44-22 22h-48z" fill="#dcfce7"/><path d="M200 92v150M160 132h20m40 0h20M160 164h20m40 0h20"/><path d="M150 226h100" stroke="#16b364"/>`,
  "yoga-mat": `<rect x="98" y="104" width="204" height="92" rx="46" fill="#dcfce7"/><ellipse cx="112" cy="150" rx="22" ry="46" fill="#f8fafc"/><ellipse cx="112" cy="150" rx="10" ry="24" stroke="#16b364"/><path d="M154 106v88M286 106v88" stroke="#16b364"/><path d="M208 150h54" stroke="#16b364"/>`,
  "water-bottle": `<path d="M164 92h72v22l14 22v112a20 20 0 0 1-20 20h-60a20 20 0 0 1-20-20V136l14-22z" fill="#e0f2fe"/><path d="M178 92V64h44v28M164 136h72M174 170h52M174 196h52" stroke="#0042a1"/><path d="M200 136v112" stroke="#0042a1" opacity=".4"/>`,
  "bluetooth-earbuds": `<rect x="112" y="146" width="176" height="102" rx="40" fill="#dbeafe"/><path d="M150 146v-18a50 50 0 0 1 100 0v18"/><circle cx="168" cy="204" r="18" stroke="#0042a1"/><circle cx="232" cy="204" r="18" stroke="#0042a1"/><path d="M160 176c-10-18 10-32 18-16M240 176c10-18-10-32-18-16" stroke="#0042a1"/>`,
};

const tints = {
  "motorcycle-jacket": "#e0f2fe",
  "winter-jacket": "#e0f2fe",
  "chelsea-boots": "#fef3c7",
  headphones: "#ede9fe",
  "coffee-machine": "#ffedd5",
  backpack: "#dbeafe",
  "fitness-smartwatch": "#dcfce7",
  "polarized-sunglasses": "#fef9c3",
  "office-chair": "#e2e8f0",
  "desk-lamp": "#fef9c3",
  "mirrorless-camera": "#e2e8f0",
  "mechanical-keyboard": "#e2e8f0",
  "bluetooth-speaker": "#ede9fe",
  perfume: "#fce7f3",
  "phone-case": "#e0f2fe",
  "hydration-vest": "#dcfce7",
  "yoga-mat": "#dcfce7",
  "water-bottle": "#e0f2fe",
  "bluetooth-earbuds": "#ede9fe",
};

await mkdir(out, { recursive: true });
for (const [slug, icon] of Object.entries(icons)) {
  await writeFile(join(out, `${slug}.svg`), svg(slug, tints[slug] ?? "#e0f2fe", icon));
}
console.log(`wrote ${Object.keys(icons).length} catalog illustrations to public/catalog`);
