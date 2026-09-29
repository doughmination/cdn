<div align="center">
  <h1>CDN</h1>

  <p>Clove's personal asset host — images, 3D models, fonts, and sound effects — with a small directory browser and an SSO-gated upload page. A Cloudflare Worker in front of an R2 bucket, at <a href="https://m.doughmination.gay">m.doughmination.gay</a>.</p>
</div>

## What this is

A Cloudflare Worker that does three jobs:

1. **Serves assets** out of the `cdn` R2 bucket for every other Doughmination site. A request for `/img/foo.png` returns the object `img/foo.png`, with range and conditional-request support so audio/video seek properly.
2. **Browses itself.** `index.html` fetches `/api/list` (every object in the bucket) and renders folder navigation client-side via the URL hash (e.g. `#/f/Comic-Code`).
3. **Takes uploads.** `/upload` is gated by the Doughmination SSO (`auth-server/`). Anyone the SSO lets sign in to the `cdn` client can drop files into any folder.

## Layout

```
cdn/
├── src/
│   ├── main.ts        Routing: worker routes → static site → R2
│   ├── auth.ts        OIDC sign-in against the SSO (/login, /auth/callback, /logout)
│   ├── files.ts       R2: serve, list, upload
│   ├── cors.ts        CORS allowlist (echoes an allowed Origin back)
│   ├── genshin.ts     GET /genshin/ui/<file>.png → cached enka.network/ui/* proxy
│   └── views.ts       Small server-rendered message pages
├── public/            The site itself (deployed as Workers static assets)
│   ├── index.html     Directory browser
│   ├── upload.html    Upload page (+ upload.js)
│   ├── licence.html   Rendered licence page (LICENCE.md is served by the worker)
│   ├── 404.html       Not-found page
│   ├── style.css      Shared theme (see "Styling" below)
│   ├── script.js      Browser: folder navigation, filter, copy links
│   ├── sfx.js         UI sounds script, hotlinked by the other sites
│   └── .well-known/   security.txt, ssh.txt, etc.
├── assets/            The old in-repo assets, waiting to be copied into R2
├── scripts/           Model conversion helpers (unrelated to the worker)
└── wrangler.jsonc
```

## How the pieces fit

- **Request order:** CORS → worker routes (`/login`, `/auth/*`, `/upload`, `/api/*`, `/genshin/ui/*`, `/LICENCE.md`, `/.well-known/change-password`) → a static file from `public/` → an R2 object → `404.html`. Static files win over R2 objects, so uploads to a path that a site file already uses are refused.
- **Sign-in:** a standard OIDC authorization-code flow with PKCE, run server-side as a confidential client. The id_token is checked against the SSO's JWKS, then the worker sets its own 12-hour session cookie (an HS256 JWT signed with `SESSION_SECRET`). The worker does no group checks of its own: the SSO only issues codes to accounts in the client's allowed groups, so any valid session may upload. There is no server-side session state.
- **Uploads:** `PUT /api/files/<path>` with the file as the raw body. It requires a signed-in session and a same-origin `Origin` header, and it won't replace an existing file unless the page's "Replace" box is ticked (`?overwrite=1`). Workers cap request bodies at 100 MB (Free/Pro plans), which limits single uploads to that size.
- **CORS:** `Access-Control-Allow-Origin` can only be one origin, so `src/cors.ts` keeps an allowlist of the Doughmination domains and echoes back the request's `Origin` when it matches.
- **Genshin UI proxy:** `src/genshin.ts` fetches `enka.network/ui/<file>.png` once, then serves it from Cloudflare's edge cache (30-day immutable). The API hands out icon URLs pointing here so the Discord bot's Genshin character card can pull splash art / weapon / artifact icons without rate-limiting Enka.
- **Caching:** files are served with `Cache-Control: public, max-age=86400`, and `/api/list` is cached for 60 seconds. URLs may change at any time, so nothing is cached longer.

## Setup

1. **R2:** create the bucket: `npx wrangler r2 bucket create cdn`.
2. **SSO:** in the SSO admin (`https://auth.doughmination.gay/admin`):
   - create a group `cdn-upload` and add yourself to it
   - create a **confidential** client with id `cdn`, redirect URI `https://m.doughmination.gay/auth/callback`, and allowed group `cdn-upload`. That allow-list is the only thing deciding who can upload, so don't leave it empty
   - the uploading account needs a verified email, which the SSO requires before it issues codes
3. **Secrets:**
   ```sh
   npx wrangler secret put OIDC_CLIENT_SECRET   # shown once when the client was created
   npx wrangler secret put SESSION_SECRET       # openssl rand -base64 32
   ```
4. **Deploy:** `npm install && npm run deploy`. Then move the `m.doughmination.gay` custom domain from the old Pages project to the worker (or uncomment `routes` in `wrangler.jsonc`), and delete the Pages project.
5. **Copy the old assets:** everything under `assets/` goes into the bucket with the same paths. For example, `assets/img/bg/main.png` becomes the key `img/bg/main.png`. The dashboard upload works, or:
   ```sh
   cd assets && find . -type f -printf '%P\n' | while IFS= read -r f; do
     npx wrangler r2 object put "cdn/$f" --file "$f" --remote
   done
   ```
   Once they're in R2, `assets/` can be deleted from the repo.

**Local dev:** copy `.dev.vars.example` to `.dev.vars`, then run `npm run dev` (port 8788). Point it at a local auth-server on 8787 that has a `cdn` client with redirect URI `http://localhost:8788/auth/callback`. Local R2 starts empty.

## Styling

The CDN uses the **same look as every other Doughmination site** (see the monorepo `AGENTS.md` → "Uniform styling") — the terminal/clunky redesign:

- Dark trans-pink palette tokens (`--accent: #f5a9b8`, `--bg: #0a0b10`, …), unchanged.
- **IBM Plex Mono**, loaded from Google Fonts — replaced the old self-hosted Comic Code face.
- The trans-flag gradient title animation was dropped for a solid `.trans-title` heading with a thin static `.flag-stripe` accent bar above it.
- Square corners everywhere (`border-radius: 0`) — no more rounded panels/buttons.
- No emoji in the UI: the folder/file/upload glyphs in `script.js` are small inline SVG icons instead of 📁/📄/⬇.

The one deliberate exception: **no UI sounds here.** `sfx.js` and the `sfx/` files are hosted for the *other* sites to use; the CDN itself stays silent.

## Please don't hotlink

These URLs can change at any time without warning. Anything pointing here may break — mirror what you need instead.

## Licence

Licensed under the **Doughmination Authorised Source Licence (DASL-1.0)**. See [LICENCE.md](./LICENCE.md).
