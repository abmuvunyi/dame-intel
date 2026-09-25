import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";

// Phase 14: host-agnostic production config.
// - output: "standalone" produces a self-contained Node server (.next/standalone)
//   that runs in any container / VM / PaaS — no Vercel-specific features required.
// - Security headers live here (previously only in vercel.json, which other hosts
//   ignore).
// - A production build refuses to proceed without NEXT_PUBLIC_API_URL, because
//   Next.js inlines it into the client bundle at BUILD time; building without it
//   would ship a bundle that silently calls http://localhost:3001.

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

export default function config(phase: string): NextConfig {
  if (phase === PHASE_PRODUCTION_BUILD && !process.env.NEXT_PUBLIC_API_URL) {
    throw new Error(
      "NEXT_PUBLIC_API_URL must be set for a production build (e.g. https://api.example.com). " +
        "It is baked into the client bundle at build time.",
    );
  }
  return {
    output: "standalone",
    poweredByHeader: false,
    async headers() {
      return [{ source: "/(.*)", headers: securityHeaders }];
    },
  };
}
