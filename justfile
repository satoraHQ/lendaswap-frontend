project := "app-satora-io-mainnet"
branch := "main"

default: start

start:
    #!/usr/bin/env bash
    export VITE_APP_GIT_TAG=$(git tag --sort=-creatordate | head -n 1 || echo "unknown")
    export VITE_APP_GIT_COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    cd apps/lendaswap && pnpm run dev

# Build then deploy to Cloudflare Pages (local convenience)
deploy: build deploy-cf

# Deploy already-built dist to Cloudflare Pages (used by CI after backend deploy)
deploy-cf:
    pnpm exec wrangler pages deploy apps/lendaswap/dist/ \
        --project-name={{ project }} \
        --branch={{ branch }}

# Build the frontend with git tag/commit baked into the bundle
build:
    #!/usr/bin/env bash
    set -euo pipefail
    export VITE_APP_GIT_TAG=$(git tag --sort=-creatordate | head -n 1 || echo "unknown")
    export VITE_APP_GIT_COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    pnpm run build

fmt:
    #!/usr/bin/env bash
    set -euo pipefail
    pnpm exec biome check --write .
    pnpm exec biome format --write
