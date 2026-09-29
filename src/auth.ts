// Sign-in through the Doughmination SSO (auth-server/, an OpenID Connect
// provider). Standard authorization-code flow with PKCE, run server-side as a
// confidential client:
//
//   /login          → sets a short-lived signed cookie (state, nonce, PKCE
//                     verifier) and redirects to <issuer>/authorize
//   /auth/callback  → checks state, redeems the code at <issuer>/token,
//                     verifies the id_token against the issuer's JWKS, and
//                     sets the session cookie
//   /logout         → drops the session cookie (the SSO session stays)
//
// Both cookies are HS256 JWTs signed with SESSION_SECRET, so nothing is stored
// server-side. Who may sign in at all is the SSO's call (the client's allowed
// groups), so any valid session here may upload.

import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { issuer, type AppContext, type AppEnv, type Env, type Session } from "./env";
import { messagePage } from "./views";

const SESSION_COOKIE = "cdn_session";
const LOGIN_COOKIE = "cdn_login";
const SESSION_TTL = 60 * 60 * 12;
const LOGIN_TTL = 60 * 10;
const SCOPES = "openid profile";

const enc = new TextEncoder();
const key = (env: Env) => enc.encode(env.SESSION_SECRET);

// One JWKS fetcher per issuer, kept for the life of the isolate (jose caches
// the keys and refetches on an unknown kid).
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function jwks(iss: string) {
  let set = jwksCache.get(iss);
  if (!set) {
    set = createRemoteJWKSet(new URL(`${iss}/.well-known/jwks.json`));
    jwksCache.set(iss, set);
  }
  return set;
}

function randomToken(bytes = 32): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...buf)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function pkceChallenge(verifier: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(verifier)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(env: Env, claims: Record<string, unknown>, ttl: number): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(key(env));
}

const cookieOpts = (maxAge: number) =>
  ({ path: "/", secure: true, httpOnly: true, sameSite: "Lax", maxAge, prefix: "host" }) as const;

/** Only same-site paths, so /login can't be used as an open redirect. */
function safeNext(raw: string | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/upload";
}

function redirectUri(c: AppContext): string {
  return `${new URL(c.req.url).origin}/auth/callback`;
}

export async function getSession(c: AppContext): Promise<Session | null> {
  const token = getCookie(c, SESSION_COOKIE, "host");
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(c.env), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return {
      sub: payload.sub,
      username: typeof payload.username === "string" ? payload.username : payload.sub,
    };
  } catch {
    return null;
  }
}

function failPage(c: AppContext, message: string, status: 400 | 403 | 502 = 400) {
  return messagePage(
    c,
    "Sign-in failed",
    `<p>${message}</p><p><a href="/login">Try again</a> &middot; <a href="/">Back home</a></p>`,
    status,
  );
}

export const auth = new Hono<AppEnv>();

auth.get("/login", async (c) => {
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(48);
  const next = safeNext(c.req.query("next"));

  setCookie(c, LOGIN_COOKIE, await sign(c.env, { state, nonce, verifier, next }, LOGIN_TTL), cookieOpts(LOGIN_TTL));

  const url = new URL(`${issuer(c.env)}/authorize`);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: c.env.OIDC_CLIENT_ID,
    redirect_uri: redirectUri(c),
    scope: SCOPES,
    state,
    nonce,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();
  return c.redirect(url.toString());
});

auth.get("/auth/callback", async (c) => {
  const iss = issuer(c.env);
  const loginToken = getCookie(c, LOGIN_COOKIE, "host");
  deleteCookie(c, LOGIN_COOKIE, { path: "/", secure: true, prefix: "host" });

  let login: { state: string; nonce: string; verifier: string; next: string };
  try {
    if (!loginToken) throw new Error("missing");
    const { payload } = await jwtVerify(loginToken, key(c.env), { algorithms: ["HS256"] });
    login = payload as unknown as typeof login;
  } catch {
    return failPage(c, "Your sign-in attempt expired. Start again.");
  }

  const q = c.req.query();
  if (!q.state || q.state !== login.state) return failPage(c, "The sign-in response didn't match this browser.");
  // RFC 9207: the SSO server names itself, which rules out mix-up attacks.
  if (q.iss !== undefined && q.iss !== iss) return failPage(c, "The sign-in response came from the wrong server.");
  if (q.error) {
    const denied = q.error === "access_denied";
    return failPage(c, denied ? "Your account isn't allowed to upload here." : "The sign-in server refused the request.", 403);
  }
  if (!q.code) return failPage(c, "The sign-in response had no code.");

  const tokenRes = await fetch(`${iss}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + btoa(`${encodeURIComponent(c.env.OIDC_CLIENT_ID)}:${encodeURIComponent(c.env.OIDC_CLIENT_SECRET)}`),
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: q.code,
      redirect_uri: redirectUri(c),
      code_verifier: login.verifier,
    }),
  });
  if (!tokenRes.ok) {
    console.error("[auth] token exchange failed", tokenRes.status, await tokenRes.text());
    return failPage(c, "Couldn't finish signing in with the SSO server.", 502);
  }
  const tokens = (await tokenRes.json()) as { id_token?: string };
  if (!tokens.id_token) return failPage(c, "The SSO server didn't return an ID token.", 502);

  let claims;
  try {
    ({ payload: claims } = await jwtVerify(tokens.id_token, jwks(iss), {
      issuer: iss,
      audience: c.env.OIDC_CLIENT_ID,
      algorithms: ["RS256"],
    }));
  } catch (err) {
    console.error("[auth] id_token rejected", err);
    return failPage(c, "The SSO server's ID token didn't verify.", 502);
  }
  if (claims.nonce !== login.nonce || typeof claims.sub !== "string") {
    return failPage(c, "The ID token wasn't issued for this sign-in.");
  }

  const session = {
    sub: claims.sub,
    username: typeof claims.preferred_username === "string" ? claims.preferred_username : claims.sub,
  };
  setCookie(c, SESSION_COOKIE, await sign(c.env, session, SESSION_TTL), cookieOpts(SESSION_TTL));
  return c.redirect(safeNext(login.next));
});

auth.get("/logout", (c) => {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: true, prefix: "host" });
  return c.redirect("/");
});
