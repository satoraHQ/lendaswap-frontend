project := "app-satora-io-mainnet"
beta_project := "app-satora-io-mainnet-beta"
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

# Pin @lendasat/lendaswap-sdk-pure to a published npm version (e.g. `0.3.0-rc.0`),
# or `workspace` to restore the monorepo link. Reinstalls and typechecks, so a
# breaking SDK change fails here instead of in the deployed app.
#
#   just use-sdk 0.3.0-rc.0
#   just use-sdk workspace
use-sdk version:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "{{ version }}" = "workspace" ]; then spec="workspace:*"; else spec="{{ version }}"; fi
    ( cd apps/lendaswap && npm pkg set "dependencies.@lendasat/lendaswap-sdk-pure=$spec" )
    echo "→ @lendasat/lendaswap-sdk-pure = $spec"
    pnpm install
    pnpm run check-types

# Build + deploy to an environment, optionally pinning a published SDK version.
#   env: `production` (→ {{ project }}) or `beta` (→ {{ beta_project }})
#   sdk_version (optional): a published version to pin first; empty = current dep
#
#   just release beta 0.3.0-rc.0     # deploy an RC build to the beta app
#   just release production          # ship prod against the workspace SDK
release env sdk_version="":
    #!/usr/bin/env bash
    set -euo pipefail
    case "{{ env }}" in
      production) proj="{{ project }}" ;;
      beta)       proj="{{ beta_project }}" ;;
      *) echo "error: env must be 'production' or 'beta' (got '{{ env }}')" >&2; exit 1 ;;
    esac
    if [ -n "{{ sdk_version }}" ]; then just use-sdk "{{ sdk_version }}"; fi
    just build
    pnpm exec wrangler pages deploy apps/lendaswap/dist/ --project-name="$proj" --branch={{ branch }}

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
