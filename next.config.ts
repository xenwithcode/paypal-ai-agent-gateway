import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

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
    ];
  },
};

export default nextConfig;
