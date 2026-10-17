import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

  // Next emits a self-contained server (`.next/standalone`) instead of the
  // full node_modules tree — the shape Cloud Run wants: the image copies the
  // standalone folder plus `public/` and `.next/static/`, and boots with
  // `node server.js`. Local `npm run dev` and `npm start` are unaffected.
  output: "standalone",

  // `@google/genai` reaches the Live API over a WebSocket, and webpack resolves
  // `ws` to Next's own compiled copy — whose `bufferutil` binding does not
  // export `mask` — so every session died on connect with
  // "bufferUtil.mask is not a function". Loading the real package from
  // node_modules fixes it: outside a bundle, `ws` finds no native `bufferutil`
  // and falls back to its pure-JavaScript one, which works. The text model never
  // noticed because `generateContent` is plain HTTP.
  serverExternalPackages: ["@google/genai"],

  // Product thumbnails come from the demo catalog's CDN. Only this hostname
  // is allowed — an allow-list, not a wildcard, so an arbitrary URL cannot be
  // pushed through the image optimizer.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "cdn.dummyjson.com" },
    ],
  },

  // /agent-dashboard was renamed to /overview when the sidebar route group was
  // introduced. Keep the old URL working so bookmarks and shared links do not
  // 404. `permanent: false` serves a 307 — a 308 would be cached aggressively
  // by the browser while the URL scheme is still settling.
  async redirects() {
    return [
      {
        source: "/agent-dashboard",
        destination: "/overview",
        permanent: false,
      },
      // Pago Móvil moved out of the FX section into Send money, where it sits
      // beside the rail it was always paired with.
      {
        source: "/fx/pago-movil",
        destination: "/send/bank",
        permanent: false,
      },
      // The section outgrew its protocol name: ACP and UCP are both live and
      // neither is ours to endorse.
      {
        source: "/ucp",
        destination: "/commerce",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
