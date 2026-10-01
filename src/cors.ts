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


function isAllowed(origin: string): boolean {
  let url: URL;

  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  const host = url.hostname.toLowerCase();

  // Local development: allow any port on localhost / 127.0.0.1
  if (
    url.protocol === "http:" &&
    (host === "localhost" || host === "127.0.0.1")
  ) {
    return true;
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
