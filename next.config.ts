import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const url = configured ? new URL(configured) : null;
    const origin =
      url && url.protocol === "https:" && url.hostname.endsWith(".supabase.co")
        ? url.origin
        : "";
    const socket = origin ? origin.replace("https://", "wss://") : "";
    return [
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value:
              "camera=(), microphone=(self), geolocation=(), bluetooth=(self)",
          },
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: " +
              origin +
              "; font-src 'self'; connect-src 'self' " +
              origin +
              " " +
              socket +
              "; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
          },
        ],
      },
    ];
  },
};
export default config;
