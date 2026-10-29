// Bindings and vars. See wrangler.jsonc for what each one is.

import type { Context } from "hono";

export interface Env {
  ASSETS: Fetcher;
  BUCKET: R2Bucket;
  AUTH_ISSUER: string;
  RAW_URL: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET: string;
  SESSION_SECRET: string;
}

export interface Session {
  sub: string;
  username: string;
}

// `session` is set on API writes, by the guard in main.ts.
export type AppEnv = { Bindings: Env; Variables: { session: Session } };
export type AppContext = Context<AppEnv>;

export function issuer(env: Env): string {
  return env.AUTH_ISSUER.replace(/\/+$/, "");
}

/** Where files are served from, without a trailing slash. */
export function rawBase(env: Env): string {
  return env.RAW_URL.replace(/\/+$/, "");
}
