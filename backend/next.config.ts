import type { NextConfig } from "next";

// The backend serves JSON to the frontend origin; nothing here is meant to be framed, sniffed or cached.
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]
    : []),
];

const apiHeaders = [
  // Responses carry account data and depend on the session cookie.
  { key: "Cache-Control", value: "no-store" },
  // An API response is never a document: it may not load or run anything if opened directly.
  { key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      { source: "/api/:path*", headers: apiHeaders },
    ];
  },
};

export default nextConfig;
