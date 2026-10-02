import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,

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
    ];
  },
};

export default nextConfig;
