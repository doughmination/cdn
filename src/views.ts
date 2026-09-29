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
      `<link rel="stylesheet" href="/style.css"></head>` +
      `<body><main><div class="flag-stripe"></div><h1 class="trans-title">${escape(title)}</h1>` +
      `${body}</main></body></html>`,
    status,
  );
}
