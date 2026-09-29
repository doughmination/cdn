// Bindings and vars. See wrangler.jsonc for what each one is.

import type { Context } from "hono";

export interface Env {
  ASSETS: Fetcher;
  BUCKET: R2Bucket;
  AUTH_ISSUER: string;
  OIDC_CLIENT_ID: string;
  OIDC_CLIENT_SECRET: string;
  SESSION_SECRET: string;
}

export interface Session {
  sub: string;
  username: string;
}

export type AppEnv = { Bindings: Env };
export type AppContext = Context<AppEnv>;

export function issuer(env: Env): string {
  return env.AUTH_ISSUER.replace(/\/+$/, "");
}
