// Link embeds for file pages. Crawlers (Discord, Bluesky, iMessage, …) don't
// run the app, so the worker swaps the shell's generic tags for ones
// describing the file: the image itself, a playable video or audio, or the
// first few lines of a text file.
//
// Discord also reads a Components V2 container from a
// <script id="discord:component-embed"> in the page (same as Meta.svelte in
// ~/projects/web), and falls back to the OpenGraph tags without it.

import { extensionOf, kindOf } from "../shared/kinds";
import { encodeKey, fmtSize } from "./files";
import { rawBase, type AppContext } from "./env";

const EXCERPT = 280;
const DISCORD_EXCERPT = 1200;
/** Discord's cap on the component embed's JSON. */
const DISCORD_MAX_BYTES = 3000;
/** Matches --accent in public/style.css. */
const ACCENT = 0xeb459e;
/** Formats Discord (and most other crawlers) can render as embed media. SVG, ICO and BMP aren't. */
const EMBEDDABLE = new Set("png jpg jpeg gif webp avif mp4 webm mov".split(" "));

/** Image or video that crawlers can actually show; anything else gets the plain card. */
const embeddable = (key: string) => EMBEDDABLE.has(extensionOf(key));

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

// Escape '<' so the JSON can't close the script tag early.
const toJson = (data: unknown) => JSON.stringify(data).replace(/</g, "\\u003c");

export async function fileEmbed(c: AppContext, obj: R2Object, page: Response): Promise<Response> {
  const name = obj.key.slice(obj.key.lastIndexOf("/") + 1);
  const url = `${rawBase(c.env)}/${encodeKey(obj.key)}`;
  const pageUrl = new URL(c.req.url).href;
  const type = obj.httpMetadata?.contentType;
  const kind = kindOf(obj.key);

  let description = `${fmtSize(obj.size)} · ${obj.key}`;
  const text = kind === "text" ? await excerpt(c, obj.key, DISCORD_EXCERPT) : "";
  if (text) description = squash(text, EXCERPT);

  const meta: [string, string][] = [
    ["og:site_name", "Clove's CDN"],
    ["og:title", name],
    ["og:description", description],
    ["og:url", pageUrl],
    ["twitter:title", name],
    ["twitter:description", description],
  ];
  if (kind === "image" && embeddable(obj.key)) {
    meta.push(["og:type", "website"], ["og:image", url], ["twitter:card", "summary_large_image"], ["twitter:image", url]);
    if (type) meta.push(["og:image:type", type]);
  } else if (kind === "video") {
    meta.push(["og:type", "video.other"], ["og:video", url], ["og:video:secure_url", url], ["twitter:card", "player"]);
    if (type) meta.push(["og:video:type", type]);
  } else if (kind === "audio") {
    meta.push(["og:type", "music.song"], ["og:audio", url], ["og:audio:secure_url", url], ["twitter:card", "summary"]);
    if (type) meta.push(["og:audio:type", type]);
  } else {
    meta.push(["og:type", "website"], ["twitter:card", "summary"]);
  }

  const component = discordComponent(c, obj, name, url, pageUrl, text);
  const tags =
    `<meta name="description" content="${escape(description)}">` +
    meta
      .map(([k, v]) => `<meta ${k.startsWith("og:") ? "property" : "name"}="${k}" content="${escape(v)}">`)
      .join("") +
    `<link rel="canonical" href="${escape(pageUrl)}">` +
    `<script id="discord:component-embed" type="application/json">${toJson({ component })}</script>`;

  return new HTMLRewriter()
    .on('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]', {
      element: (el) => void el.remove(),
    })
    .on("title", { element: (el) => void el.setInnerContent(`${name} · CDN`) })
    .on("head", { element: (el) => void el.append(tags, { html: true }) })
    .transform(page);
}

/** One Container: name and size, the media or a code excerpt, then link buttons. */
function discordComponent(c: AppContext, obj: R2Object, name: string, url: string, pageUrl: string, text: string) {
  const kind = kindOf(obj.key);
  const heading = { type: 10, content: `## ${name}\n-# ${fmtSize(obj.size)} · ${obj.key}` };
  const footer = [
    { type: 14 },
    {
      type: 1,
      components: [
        { type: 2, style: 5, label: "Open raw", url },
        { type: 2, style: 5, label: "View on CDN", url: pageUrl },
      ],
    },
    { type: 10, content: `-# ${new URL(c.req.url).host}` },
  ];
  const build = (body: object[]) => ({ type: 17, accent_color: ACCENT, components: [...body, ...footer] });

  if ((kind === "image" || kind === "video") && embeddable(obj.key)) {
    return build([heading, { type: 12, items: [{ media: { url }, description: name }] }]);
  }

  // Everything else: the heading beside the site icon, plus a code block for text.
  const section = {
    type: 9,
    components: [heading],
    accessory: { type: 11, media: { url: new URL("/favicon.png", c.req.url).href } },
  };
  if (!text) return build([section]);

  // A ``` inside the file would close the code block early, so break it with a zero-width space.
  const fence = "```";
  const code = text.replaceAll(fence, "`\u200b``");
  const bytes = (data: unknown) => new TextEncoder().encode(toJson({ component: data })).length;
  // Shrink the excerpt until the whole embed fits Discord's limit.
  for (let len = code.length; len > 0; len = Math.floor(len * 0.8)) {
    const cut = len < code.length ? `${code.slice(0, len)}…` : code;
    const component = build([section, { type: 10, content: `${fence}${extensionOf(obj.key)}\n${cut}\n${fence}` }]);
    if (bytes(component) <= DISCORD_MAX_BYTES) return component;
  }
  return build([section]);
}

/** The start of a text file, line breaks kept, trimmed to `max` characters. */
async function excerpt(c: AppContext, key: string, max: number): Promise<string> {
  const obj = await c.env.BUCKET.get(key, { range: { offset: 0, length: max * 4 } });
  if (!obj) return "";
  // A cut can land mid-character; the decoder swaps that for U+FFFD, which this drops.
  const text = (await obj.text())
    .replace(/\uFFFD+$/, "")
    .replace(/\r\n?/g, "\n")
    .replace(/^\n+|\s+$/g, "");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** One line of at most `max` characters, for descriptions. */
function squash(text: string, max: number): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
