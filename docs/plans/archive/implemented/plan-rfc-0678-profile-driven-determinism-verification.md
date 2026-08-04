---
planId: PLAN-RFC-0678-01
date: 2026-08-04
targetRfc: RFC-0678
status: active
---

# Implementation Plan: RFC-0678 — Profile-driven determinism verification

## Objective

Implement `forge.determinism.check` — a profile-driven command that verifies artifact determinism by building twice and comparing output hashes. Update the `determinism.inputs` semantics from human-readable labels to glob patterns.

## Affected artifacts

- `packages/forge/src/profiles/profile-schema.ts` — update `determinism.inputs` documentation (schema already accepts `string[]`)
- `packages/forge/profiles/editframe-html.yaml` — update `determinism.inputs` from labels to glob patterns
- `packages/forge/os/core/handlers/determinism-check.ts` — new handler
- `packages/forge/os/core/core.module.ts` — register `forge.determinism.check` command
- `packages/forge/os/core/handlers/lifecycle-handlers.test.ts` — unit tests
- `docs/command-manifest.generated.yaml` — regenerated
- `docs/COMMANDS.md` — regenerated
- `packages/forge/AGENTS.md` — command table update

## Step-by-step sequence

### Step 1: Update `editframe-html.yaml` profile

Update `determinism.inputs` from human-readable labels to glob patterns:
- `"composition files"` → `"compositions/**/*.html"`
- `"assets"` → `"assets/**"`
- Remove `"editframe version"` (not a file glob; tool-version invalidation is handled by cache key)

Validation: `pnpm --filter @warpgogol/forge run build:check`

### Step 2: Create `determinism-check.ts` handler

Create `packages/forge/os/core/handlers/determinism-check.ts` with:
- `DeterminismCheckResult` and `ForgeDeterminismCheckResult` interfaces
- `runDeterminismCheck` function that:
  - Resolves active profile via `resolveActiveProfile`
  - Filters artifacts with `determinism.hashable: true`
  - Supports `--artifact` filtering, `--dry-run`, `--profile`
  - Computes input hash from glob patterns using `collectFiles` from `@warpgogol/share/fs` and `byteHashFile` from `@warpgogol/fingerprint`
  - Checks `dist/.determinism-cache.json` for cache hits
  - Executes `produce.command` twice via `execAsync`
  - Hashes output at `produce.output` path
  - Compares hashes, reports `deterministic: true/false`
  - Creates `dist/` directory if missing before writing cache
  - Cache key: `{ inputHash, produceCommand }`

**Import constraint:** `os/core/` is NOT autonomous (only `os/compass/` and `os/werkstatt/` are). So it CAN import from `@warpgogol/*`. Use `@warpgogol/fingerprint` for `byteHashFile` and `@warpgogol/share/fs` for `collectFiles`.

Validation: `pnpm --filter @warpgogol/forge run build:check`

### Step 3: Register command in `core.module.ts`

Add `forge.determinism.check` command registration with flags: `--dry-run`, `--profile`, `--artifact`.

Validation: `pnpm --filter @warpgogol/forge run build:check`

### Step 4: Write unit tests

Add tests to `lifecycle-handlers.test.ts`:
- `runDeterminismCheck --dry-run` prints resolved inputs without executing
- `runDeterminismCheck --artifact composition` filters to single artifact
- `runDeterminismCheck --artifact unknown` returns exit 1
- `runDeterminismCheck` skips artifacts without `determinism.hashable: true`
- `runDeterminismCheck` with no hashable artifacts returns exit 0
- Cache hit skips double-build (mock cache file)
- Double-build detects non-deterministic output (mock produce command with varying output)

Validation: `pnpm --filter @warpgogol/forge run test -- --run lifecycle-handlers`

### Step 5: Regenerate manifests and documentation

- Run `command.manifest.generate`
- Run `docs.commands.generate`
- Update `packages/forge/AGENTS.md` command table if needed

Validation: `git diff docs/command-manifest.generated.yaml` shows `forge.determinism.check` entry

### Final step: Heavy checks and stamp

- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec site-kernel run rfc.validate --id RFC-0678`
- Run `fo-review` and `fo-fix` if needed
- Stamp with `rfc.implement.stamp --id RFC-0678 --implementation-commit <sha>`

## Risks and mitigations

- **Glob pattern resolution**: `collectFiles` from `@warpgogol/share/fs` handles glob patterns. Ensure patterns are resolved relative to `workspaceRoot`.
- **Cache file race conditions**: the cache is read and written sequentially within the handler — no concurrent access risk.
- **Missing `produce.output`**: if the build fails, `produce.output` may not exist. Handle `ENOENT` gracefully.
- **`@warpgogol/fingerprint` import**: `os/core/` is not autonomous, so importing `@warpgogol/fingerprint` is allowed. Use `byteHashFile` for streaming file hashing.

## Escalation triggers

- If `collectFiles` from `@warpgogol/share/fs` cannot be imported into `os/core/`, fall back to a simple `glob` + `readFile` + `createHash` implementation.
- If `byteHashFile` from `@warpgogol/fingerprint` cannot be imported, use `node:crypto` `createHash("sha256")` directly.
