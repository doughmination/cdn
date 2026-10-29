// CDN worker for the viewer on m.<domain>. The files themselves are on
// raw.<domain>, which is the R2 bucket's own custom domain (RAW_URL), so
// nothing here serves them except /api/files/* for the app's text previews.
//
// Order of business for a request:
//
//   1. CORS (allowlisted origins get Access-Control-Allow-Origin)
//   2. Worker routes: sign-in, the upload API, the Genshin proxy
//   3. Static site files (the Svelte app from ./dist, styles, .well-known, …)
//   4. Otherwise the app shell, if the path is a folder or a file in R2:
//      /img browses "img/", /img/foo.png previews that file (with link-embed
//      tags for that file, Discord's component embed included; see embed.ts)

import { Hono } from "hono";
import licence from "../LICENCE.md";
import { auth, getSession } from "./auth";
import { cors } from "./cors";
import { fileEmbed } from "./embed";
import { issuer, type AppContext, type AppEnv } from "./env";
import { isFolder, listFiles, serveFile, uploadFile } from "./files";
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

// Uploads happen in the folder itself now; old /upload?folder= links land there.
app.get("/upload", (c) => {
  const folder = (c.req.query("folder") ?? "").replace(/^\/+|\/+$/g, "");
  return c.redirect(`/${folder.split("/").map(encodeURIComponent).join("/")}`);
});

app.get("/api/me", async (c) => {
  const session = await getSession(c);
  c.header("Cache-Control", "no-store");
  return c.json(session ? { username: session.username } : null);
});

app.get("/api/list", listFiles);

app.get("/api/files/*", async (c) => {
  const key = keyFromPath(c, "/api/files/");
  return (key && (await serveFile(c, key))) || c.json({ error: "Not found" }, 404);
});

app.put("/api/files/*", async (c) => {
  // CSRF: the cookie is SameSite=Lax already, and uploads must come from this site.
  if (c.req.header("Origin") !== new URL(c.req.url).origin) return c.json({ error: "Cross-site upload refused." }, 403);
  const session = await getSession(c);
  if (!session) return c.json({ error: "Signed out. Reload the page to sign in again." }, 401);
  const key = keyFromPath(c, "/api/files/");
  if (key === null) return c.json({ error: "That path doesn't decode." }, 400);
  return uploadFile(c, key, session.username);
});

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// --- misc ---------------------------------------------------------------------------

app.get("/genshin/ui/:name", genshinUi);

app.get("/licence", (c) => shell(c));
app.get("/licence.html", (c) => c.redirect("/licence", 301));

app.get("/LICENCE.md", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(licence);
});

// Points password managers at the SSO account page.
app.get("/.well-known/change-password", (c) => c.redirect(`${issuer(c.env)}/account`, 302));

// --- static site, then folders ------------------------------------------------------

app.get("*", async (c) => {
  const asset = await c.env.ASSETS.fetch(c.req.raw);
  if (asset.status !== 404) return asset;

  const key = keyFromPath(c);
  if (key === null) return notFound(c);
  const obj = key.endsWith("/") ? null : await c.env.BUCKET.head(key);
  if (obj) return fileEmbed(c, obj, await shell(c));
  return (await isFolder(c, key.replace(/\/+$/, ""))) ? shell(c) : notFound(c);
});

/** The R2 key a path names (after `prefix`), or null if it doesn't decode. */
function keyFromPath(c: AppContext, prefix = "/"): string | null {
  try {
    return decodeURIComponent(new URL(c.req.url).pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

/** The Svelte app's index.html. It routes on the path itself, 404s included. */
async function shell(c: AppContext, status = 200): Promise<Response> {
  const page = await c.env.ASSETS.fetch(new Request(new URL("/", c.req.url)));
  return new Response(page.body, { status, headers: page.headers });
}

const notFound = (c: AppContext) => shell(c, 404);

app.notFound((c) => notFound(c));

app.onError((err, c) => {
  console.error("[error]", c.req.method, new URL(c.req.url).pathname, err);
  return c.text("Something went wrong on our side. Please try again.", 500);
});

export default app;
