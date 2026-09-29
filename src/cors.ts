// CORS allowlist for the CDN.
//
// `Access-Control-Allow-Origin` can only be ONE origin (or "*"), so to allow a
// set of domains we inspect the request's Origin and echo it back if it's on
// the list. Apex domains and any subdomain (e.g. assets.example.com) match.

import type { MiddlewareHandler } from "hono";
import type { AppEnv } from "./env";

const ALLOWED: string[] = [
  // Mine
  "clovelib.win",
  "clove-portfolio.win",
  "cuddle-blahaj.win",
  "doughmination.co.uk",
  "doughmination.gay",
  "doughmination.info",
  "doughmination.me",
  "doughmination.net",
  "doughmination.online",
  "doughmination.org",
  "doughmination.site",
  "doughmination.systems",
  "doughmination.tech",
  "doughmination.uk",
  "doughmination.win",
  "doughmination.xyz",
  "imlesbian.fyi",
  "transgamers.org",
  "yuri-lover.win",

  // gf
  "ariare.es",
  "ari.rip",
  "gaybot.site",
  "girlsnetwork.dev",
  "kib.lol",
  "stupid.cat",
  "thesafespawn.net",

  // Friends — add domains here
];

// Exact origins for local development (scheme + host + port must match)
const DEV_ORIGINS: string[] = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
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
