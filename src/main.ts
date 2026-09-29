// CDN worker. Order of business for a request:
//
//   1. CORS (allowlisted origins get Access-Control-Allow-Origin)
//   2. Worker routes: sign-in, the upload page + API, the Genshin proxy
//   3. Static site files from ./public (browser, styles, .well-known, …)
//   4. Otherwise the path is an R2 key: /img/foo.png → object "img/foo.png"

import { Hono } from "hono";
import licence from "../LICENCE.md";
import { auth, getSession } from "./auth";
import { cors } from "./cors";
import { issuer, type AppContext, type AppEnv } from "./env";
import { listFiles, serveFile, uploadFile } from "./files";
import { genshinUi } from "./genshin";

const app = new Hono<AppEnv>();

app.use("*", cors);
app.use("*", async (c, next) => {
  await next();
  c.res = new Response(c.res.body, c.res);
  c.res.headers.set("X-Content-Type-Options", "nosniff");
});

app.route("/", auth);

// --- upload -------------------------------------------------------------------------

app.get("/upload", async (c) => {
  const session = await getSession(c);
  if (!session) return c.redirect("/login?next=/upload");
  const page = await c.env.ASSETS.fetch(new Request(new URL("/upload", c.req.url)));
  const res = new Response(page.body, page);
  res.headers.set("Cache-Control", "no-store");
  return res;
});

app.get("/api/me", async (c) => {
  const session = await getSession(c);
  c.header("Cache-Control", "no-store");
  return c.json(session ? { username: session.username } : null);
});

app.get("/api/list", listFiles);

app.put("/api/files/*", async (c) => {
  // CSRF: the cookie is SameSite=Lax already, and uploads must come from this page.
  if (c.req.header("Origin") !== new URL(c.req.url).origin) return c.json({ error: "Cross-site upload refused." }, 403);
  const session = await getSession(c);
  if (!session) return c.json({ error: "Signed out. Reload the page to sign in again." }, 401);
  const key = decodeURIComponent(new URL(c.req.url).pathname.slice("/api/files/".length));
  return uploadFile(c, key, session.username);
});

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// --- misc ---------------------------------------------------------------------------

app.get("/genshin/ui/:name", genshinUi);

app.get("/LICENCE.md", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(licence);
});

// Points password managers at the SSO account page.
app.get("/.well-known/change-password", (c) => c.redirect(`${issuer(c.env)}/account`, 302));

// --- static site, then R2 -----------------------------------------------------------

app.get("*", async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (asset.status !== 404) return asset;

  const path = new URL(c.req.url).pathname;
  let key: string;
  try {
    key = decodeURIComponent(path.slice(1));
  } catch {
    return notFound(c);
  }
  if (!key || key.endsWith("/")) return notFound(c);
  return (await serveFile(c, key)) ?? notFound(c);
});

async function notFound(c: AppContext): Promise<Response> {
  const page = await c.env.ASSETS.fetch(new Request(new URL("/404", c.req.url)));
  return new Response(page.body, { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

app.notFound((c) => notFound(c));

app.onError((err, c) => {
  console.error("[error]", c.req.method, new URL(c.req.url).pathname, err);
  return c.text("Something went wrong on our side. Please try again.", 500);
});

export default app;
