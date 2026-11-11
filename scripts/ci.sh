#!/bin/sh
# scripts/ci.sh

# Cloudflare's build image has no Deno: fetch a pinned copy, then install, build and deploy
set -eu

DENO_VERSION="v2.9.8"
export DENO_INSTALL="$PWD/.deno"
export PATH="$DENO_INSTALL/bin:$PATH"

if ! command -v deno >/dev/null 2>&1; then
  curl -fsSL https://deno.land/install.sh | sh -s -- -y --no-modify-path "$DENO_VERSION"
fi

deno --version
deno install --frozen

# wrangler runs `deno task build` itself, from wrangler.jsonc
deno task deploy "$@"
