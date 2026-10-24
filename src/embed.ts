// Link embeds for file pages. Crawlers (Discord, Bluesky, iMessage, …) don't
// run the app, so the worker swaps the shell's generic OpenGraph tags for ones
// describing the file: the image itself, a playable video or audio, or the
// first few lines of a text file.
//
// Discord's crawler is the exception: it gets the file as a Components V2
// message payload instead of a page.

import { extensionOf, kindOf } from "../shared/kinds";
import { encodeKey, fmtSize } from "./files";
import { rawBase, type AppContext } from "./env";

const EXCERPT = 280;
const DISCORD_EXCERPT = 1500;
const ACCENT = 0xf5a9b8;

export const isDiscord = (c: AppContext) => /Discordbot/i.test(c.req.header("User-Agent") ?? "");

const escape = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export async function fileEmbed(c: AppContext, obj: R2Object, page: Response): Promise<Response> {
  const name = obj.key.slice(obj.key.lastIndexOf("/") + 1);
  const url = `${rawBase(c.env)}/${encodeKey(obj.key)}`;
  const type = obj.httpMetadata?.contentType;
  const kind = kindOf(obj.key);

  let description = `${fmtSize(obj.size)} · ${obj.key}`;
  if (kind === "text") description = (await excerpt(c, obj.key, EXCERPT)) || description;

  const meta: [string, string][] = [
    ["og:site_name", "Clove's CDN"],
    ["og:title", name],
    ["og:description", description],
    ["og:url", new URL(c.req.url).href],
    ["twitter:title", name],
    ["twitter:description", description],
  ];
  if (kind === "image") {
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

  const tags =
    `<meta name="description" content="${escape(description)}">` +
    meta
      .map(([k, v]) => `<meta ${k.startsWith("og:") ? "property" : "name"}="${k}" content="${escape(v)}">`)
      .join("");

  return new HTMLRewriter()
    .on('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]', {
      element: (el) => void el.remove(),
    })
    .on("title", { element: (el) => void el.setInnerContent(`${name} · CDN`) })
    .on("head", { element: (el) => void el.append(tags, { html: true }) })
    .transform(page);
}

/** The file as a Discord Components V2 message: a container with its name, the media, and links. */
export async function discordEmbed(c: AppContext, obj: R2Object): Promise<Response> {
  const name = obj.key.slice(obj.key.lastIndexOf("/") + 1);
  const url = `${rawBase(c.env)}/${encodeKey(obj.key)}`;
  const page = new URL(c.req.url).href;
  const kind = kindOf(obj.key);

  const body: object[] = [{ type: 10, content: `### [${name}](${page})\n-# ${fmtSize(obj.size)} · ${obj.key}` }];
  if (kind === "image" || kind === "video") {
    body.push({ type: 12, items: [{ media: { url }, description: name }] });
  } else if (kind === "text") {
    const text = await excerpt(c, obj.key, DISCORD_EXCERPT, true);
    // A ``` inside the file would close the code block early.
    const fence = "```";
    if (text) body.push({ type: 10, content: `${fence}${extensionOf(obj.key)}\n${text.replaceAll(fence, "`​``")}\n${fence}` });
  }
  body.push(
    { type: 14 },
    {
      type: 1,
      components: [
        { type: 2, style: 5, label: "Open raw", url },
        { type: 2, style: 5, label: "View on CDN", url: page },
      ],
    },
  );

  // 1 << 15 is IS_COMPONENTS_V2.
  return c.json({ flags: 1 << 15, components: [{ type: 17, accent_color: ACCENT, components: body }] });
}

/**
 * The start of a text file, for a description. Whitespace is squashed unless
 * `keepLines` (Discord shows it as a code block, so lines matter there).
 */
async function excerpt(c: AppContext, key: string, max: number, keepLines = false): Promise<string> {
  const obj = await c.env.BUCKET.get(key, { range: { offset: 0, length: max * 4 } });
  if (!obj) return "";
  // A cut can land mid-character; the decoder swaps that for U+FFFD, which the trim drops.
  let text = (await obj.text()).replace(/�+$/, "");
  text = keepLines ? text.replace(/\r\n?/g, "\n").replace(/^\n+|\s+$/g, "") : text.replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
