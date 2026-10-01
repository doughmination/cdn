// CORS allowlist for the CDN.
//
// `Access-Control-Allow-Origin` can only be ONE origin (or "*"), so to allow a
// set of domains we inspect the request's Origin and echo it back if it's on
// the list. Apex domains and any subdomain (e.g. assets.example.com) match.

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./env";

const ALLOWED: string[] = [
  // Mine
  "doughmination.co.uk",
  "doughmination.gay",
  "imlesbian.fyi",
  "pkviewer.xyz",

  // Other Sites
  "gaybot.site",
  "bwah.dev",
  "is-a.dev"
];

// Exact origins for local development (scheme + host + port must match)
const DEV_ORIGINS: string[] = [
  "http://localhost",
  "http://127.0.0.1",
];

function isAllowed(origin: string): boolean {
  if (DEV_ORIGINS.includes(origin)) return true;

  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  return ALLOWED.some(
    (domain) => host === domain || host.endsWith("." + domain),
  );
}

/** Hono middleware: answers preflights and echoes allowed Origins back. */
export const cors: MiddlewareHandler<AppEnv> = async (c, next) => {
  const origin = c.req.header("Origin") ?? null;
  const allow = origin !== null && isAllowed(origin);

  // Preflight: answer directly, don't hit the asset.
  if (c.req.method === "OPTIONS") {
    const headers = new Headers({
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    });
    if (allow) headers.set("Access-Control-Allow-Origin", origin);
    return new Response(null, { status: 204, headers });
  }

  await next();

  // Normal request: attach CORS if the origin is allowed. Responses built
  // from fetch() (static assets) have immutable headers, so copy first.
  // Vary goes on every response so caches never reuse one origin's reply for another.
  c.res = new Response(c.res.body, c.res);
  c.res.headers.append("Vary", "Origin");
  if (allow) {
    c.res.headers.set("Access-Control-Allow-Origin", origin);
  }
};
