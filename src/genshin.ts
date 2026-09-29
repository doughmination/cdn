// Proxy + edge-cache for enka.network/ui/* Genshin game assets.
//
//   GET /genshin/ui/UI_Gacha_AvatarImg_Neuvillette.png
//     -> https://enka.network/ui/UI_Gacha_AvatarImg_Neuvillette.png
//
// The Discord bot's Genshin character card pulls a lot of icons per render
// (splash art, weapon, five artifacts, stat glyphs). Routing them through
// here means Enka is hit at most once per asset per Cloudflare PoP and then
// it's served from cache, so card rendering can't get us rate-limited
// upstream. Enka's asset filenames are content-stable, so the cache is long
// and immutable.

import type { Handler } from "hono";
import type { AppEnv } from "./env";

const UPSTREAM = "https://enka.network/ui/";
const ALLOWED = /^[A-Za-z0-9][A-Za-z0-9_-]*\.(png|webp|jpg|jpeg)$/;
const CACHE_TTL = 60 * 60 * 24 * 30; // 30 days

export const genshinUi: Handler<AppEnv> = async (c) => {
  const request = c.req.raw;
  const name = c.req.param("name") ?? "";

  if (!name || name.includes("..") || !ALLOWED.test(name)) {
    return new Response("Not found", { status: 404 });
  }

  const cache = caches.default;
  const cacheKey = new Request(new URL(request.url).toString());
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM + name, {
      headers: {
        "User-Agent": "doughmination-cdn/1.0 (+https://m.doughmination.gay)",
        Accept: "image/avif,image/webp,image/png,*/*",
      },
      cf: { cacheEverything: true, cacheTtl: CACHE_TTL },
    });
  } catch {
    return new Response("Upstream fetch failed", { status: 502 });
  }

  if (!upstream.ok) {
    return new Response("Upstream error", {
      status: upstream.status === 404 ? 404 : 502,
    });
  }

  const headers = new Headers();
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "image/png");
  headers.set("Cache-Control", `public, max-age=${CACHE_TTL}, immutable`);
  headers.set("X-Proxied-From", "enka.network");

  const response = new Response(upstream.body, { status: 200, headers });
  c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
};
