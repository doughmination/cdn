// Tiny server-rendered pages, in the site's own style.

import type { AppContext } from "./env";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

/** `body` is trusted HTML; `title` is escaped. */
export function messagePage(c: AppContext, title: string, body: string, status: 400 | 403 | 502 = 400) {
  return c.html(
    `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">` +
      `<meta name="viewport" content="width=device-width, initial-scale=1.0">` +
      `<title>${escape(title)}</title><meta name="robots" content="noindex">` +
      `<link rel="icon" href="/favicon.svg" type="image/svg+xml">` +
      `<link rel="stylesheet" href="/style.css"></head>` +
      `<body><div class="backdrop" aria-hidden="true"></div>` +
      `<main class="wrap"><section class="hero"><p class="eyebrow">CDN</p><h1>${escape(title)}</h1>` +
      `<div class="lede">${body}</div></section></main></body></html>`,
    status,
  );
}
