// Everything backed by the R2 bucket: serving files, listing them for the
// browser, and uploads.

import type { AppContext } from "./env";

/** Browser cache for served files. URLs can change any time, so nothing longer. */
const FILE_CACHE = "public, max-age=86400";
const MAX_KEY_BYTES = 1024;

// Paths the worker itself answers, so an object stored there could never be served.
const RESERVED = ["api/", "auth/", "login", "logout", "upload", "genshin/", "LICENCE.md", ".well-known/"];

// Known extensions always get these, since browsers often send nothing useful
// (.glb, fonts, .mov and friends). Anything else keeps what the uploader sent.
const TYPES: Record<string, string> = {
  avif: "image/avif",
  gif: "image/gif",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  ico: "image/x-icon",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  js: "text/javascript; charset=utf-8",
  json: "application/json",
  md: "text/plain; charset=utf-8",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  ogg: "audio/ogg",
  otf: "font/otf",
  pdf: "application/pdf",
  png: "image/png",
  ps1: "text/plain; charset=utf-8",
  sh: "text/plain; charset=utf-8",
  svg: "image/svg+xml",
  ttf: "font/ttf",
  txt: "text/plain; charset=utf-8",
  wav: "audio/wav",
  webm: "video/webm",
  webp: "image/webp",
  woff: "font/woff",
  woff2: "font/woff2",
};

function knownType(key: string): string | undefined {
  const dot = key.lastIndexOf(".");
  return dot > key.lastIndexOf("/") ? TYPES[key.slice(dot + 1).toLowerCase()] : undefined;
}

/** Returns an error message, or null if the key is fine to store. */
export function checkKey(key: string): string | null {
  if (!key) return "No file path given.";
  if (new TextEncoder().encode(key).length > MAX_KEY_BYTES) return "That path is too long.";
  if (/[\u0000-\u001f\u007f\\]/.test(key)) return "That path has characters that aren't allowed.";
  const segs = key.split("/");
  if (segs.some((s) => s === "" || s === "." || s === ".." || s.startsWith("."))) {
    return "Path segments can't be empty or start with a dot.";
  }
  if (RESERVED.some((r) => (r.endsWith("/") ? key.startsWith(r) : key === r))) {
    return "That path is used by the site itself.";
  }
  return null;
}

/** GET/HEAD /<key> straight out of R2, with conditional and range support. */
export async function serveFile(c: AppContext, key: string): Promise<Response | null> {
  const bucket = c.env.BUCKET;
  const req = c.req.raw;

  if (req.method === "HEAD") {
    const head = await bucket.head(key);
    if (!head) return null;
    const headers = fileHeaders(head);
    headers.set("Content-Length", String(head.size));
    return new Response(null, { headers });
  }

  const obj = await bucket.get(key, { onlyIf: req.headers, range: req.headers });
  if (!obj) return null;
  const headers = fileHeaders(obj);

  // A failed precondition comes back as an object without a body.
  if (!("body" in obj)) {
    const conditionalGet = req.headers.has("If-None-Match") || req.headers.has("If-Modified-Since");
    return new Response(null, { status: conditionalGet ? 304 : 412, headers });
  }

  if (req.headers.has("Range") && obj.range) {
    const r = obj.range as { offset?: number; length?: number; suffix?: number };
    const offset = r.suffix !== undefined ? obj.size - r.suffix : (r.offset ?? 0);
    const length = r.suffix !== undefined ? r.suffix : (r.length ?? obj.size - offset);
    headers.set("Content-Range", `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set("Content-Length", String(length));
    return new Response(obj.body, { status: 206, headers });
  }

  headers.set("Content-Length", String(obj.size));
  return new Response(obj.body, { headers });
}

function fileHeaders(obj: R2Object): Headers {
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.has("Content-Type")) headers.set("Content-Type", knownType(obj.key) ?? "application/octet-stream");
  headers.set("ETag", obj.httpEtag);
  headers.set("Last-Modified", obj.uploaded.toUTCString());
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", FILE_CACHE);
  return headers;
}

/** GET /api/list — flat list of every object, for the browser. */
export async function listFiles(c: AppContext): Promise<Response> {
  const files: { path: string; size: number }[] = [];
  let cursor: string | undefined;
  do {
    const page = await c.env.BUCKET.list({ cursor, limit: 1000 });
    for (const o of page.objects) files.push({ path: o.key, size: o.size });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);

  c.header("Cache-Control", "public, max-age=60");
  return c.json({ count: files.length, files });
}

/** PUT /api/files/<key> — raw request body becomes the object. */
export async function uploadFile(c: AppContext, key: string, uploader: string): Promise<Response> {
  const bad = checkKey(key);
  if (bad) return c.json({ error: bad }, 400);

  const length = Number(c.req.header("Content-Length"));
  const body = c.req.raw.body;
  if (!body || !Number.isFinite(length)) return c.json({ error: "Send the file as the request body." }, 411);

  // A static site file at the same path would always win, hiding the upload.
  const shadow = await c.env.ASSETS.fetch(new Request(new URL(`/${key}`, c.req.url), { method: "HEAD" }));
  if (shadow.ok) return c.json({ error: "That path is used by the site itself." }, 409);

  if (c.req.query("overwrite") !== "1" && (await c.env.BUCKET.head(key))) {
    return c.json({ error: "A file already exists at that path." }, 409);
  }

  const sent = c.req.header("Content-Type")?.trim();
  const contentType = knownType(key) ?? (sent && !sent.startsWith("application/x-www-form-urlencoded") ? sent : "application/octet-stream");

  const obj = await c.env.BUCKET.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: { uploadedBy: uploader },
  });
  return c.json({ path: obj.key, size: obj.size, url: new URL(`/${encodeKey(obj.key)}`, c.req.url).toString() }, 201);
}

export function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}
