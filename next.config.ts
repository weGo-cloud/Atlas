import type { NextConfig } from "next";

// Production domain(s), comma-separated, e.g. "atlas.example.com".
// Server Actions reject requests whose Origin isn't allow-listed, so the
// deployed domain MUST be here or every form/action fails behind the proxy.
const extraOrigins = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Mission 037 — Content-Security-Policy. 'unsafe-inline' for scripts/styles is the compatible baseline
// for Next.js without per-request nonces; the policy's value is everything else it pins down:
// no third-party scripts/connections, no <object>, no foreign <base>/forms, and framing only by
// the app itself. CSP_MODE=report-only lets you roll it out without enforcing (default: enforce).
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-ancestors 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");
const cspHeader = process.env.CSP_MODE === "report-only" ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy";

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker.
  output: "standalone",
  // Native modules used by the social-post renderer must not be bundled.
  serverExternalPackages: ["@resvg/resvg-js", "satori"],
  async headers() {
    return [
      {
        // The public JSON API is called cross-origin by design and returns no HTML.
        source: "/((?!api/public/).*)",
        headers: [
          { key: cspHeader, value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      allowedOrigins: ["localhost:3000", "*.app.github.dev", ...extraOrigins],
    },
  },
};

export default nextConfig;
