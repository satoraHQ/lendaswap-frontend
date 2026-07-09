project := "app-satora-io-mainnet"
beta_project := "app-satora-io-mainnet-beta"
branch := "main"

default: start

start:
    #!/usr/bin/env bash
    export VITE_APP_GIT_COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    cd apps/lendaswap && pnpm run dev

# Build then deploy to Cloudflare Pages (local convenience)
deploy: build deploy-cf

# Deploy already-built dist to Cloudflare Pages (used by CI after backend deploy)
deploy-cf:
    pnpm exec wrangler pages deploy apps/lendaswap/dist/ \
        --project-name={{ project }} \
        --branch={{ branch }}

# Pin @lendasat/lendaswap-sdk-pure to a published npm version (e.g. `0.3.0`),
# or `workspace` to restore the local monorepo link.
#
# Pinning a published version also drops client-sdk from pnpm-workspace.yaml, so
# pnpm installs the npm artifact (with its baked-in SDK_COMMIT_HASH) rather than
# linking the local copy — which pnpm does whenever the workspace version matches
# the pin, and which turbo would then rebuild with SDK_COMMIT_HASH=unknown.
# `workspace` re-adds it. Reinstalls + typechecks so a breaking SDK change fails
# here, not in the deployed app.
#
#   just use-sdk 0.3.0
#   just use-sdk workspace
use-sdk version:
    #!/usr/bin/env bash
    set -euo pipefail
    if [ "{{ version }}" = "workspace" ]; then keep=1; spec="workspace:*"; else keep=0; spec="{{ version }}"; fi
    # Toggle the client-sdk workspace member in pnpm-workspace.yaml.
    python3 - "$keep" <<'PY'
    import sys
    keep = sys.argv[1] == "1"
    p = "pnpm-workspace.yaml"
    member = '  - "../client-sdk/ts-pure-sdk"'
    excluded = '  #- "../client-sdk/ts-pure-sdk"  # excluded: pinned to a published SDK'
    out = []
    for ln in open(p).read().splitlines():
        core = ln.lstrip().lstrip("#").strip()
        out.append((member if keep else excluded) if core.startswith('- "../client-sdk/ts-pure-sdk"') else ln)
    open(p, "w").write("\n".join(out) + "\n")
    PY
    ( cd apps/lendaswap && npm pkg set "dependencies.@lendasat/lendaswap-sdk-pure=$spec" )
    echo "→ @lendasat/lendaswap-sdk-pure = $spec"
    # Changing the SDK spec makes the lockfile stale on purpose; allow updating it
    # (CI defaults pnpm to --frozen-lockfile, which would reject this).
    pnpm install --no-frozen-lockfile
    # Sanity: a pinned version must resolve to the npm artifact, not the workspace.
    if [ "$keep" = "0" ]; then
      resolved=$(cd apps/lendaswap && node -e 'console.log(require.resolve("@lendasat/lendaswap-sdk-pure"))')
      case "$resolved" in
        *client-sdk/ts-pure-sdk*)
          echo "error: pinned {{ version }} still resolved to the local workspace SDK ($resolved)." >&2
          echo "       Expected the published npm artifact — check the pnpm-workspace.yaml exclusion." >&2
          exit 1 ;;
      esac
      echo "✓ using published artifact: $resolved"
    fi
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

# Build the frontend with the git commit baked into the bundle. The frontend
# version comes from apps/lendaswap/package.json (via vite.config) — this repo's
# git tags are per-component, so `git tag` would surface a backend tag instead.
build:
    #!/usr/bin/env bash
    set -euo pipefail
    export VITE_APP_GIT_COMMIT_HASH=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    pnpm run build

fmt:
    #!/usr/bin/env bash
    set -euo pipefail
    pnpm exec biome check --write .
    pnpm exec biome format --write
