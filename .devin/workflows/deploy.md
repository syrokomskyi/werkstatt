---
description: Deploy a site through the Dev → Axiom → Alt → Main pipeline
---

# Deployment Pipeline

The deployment pipeline is strictly ordered. Never skip steps, reorder, or deploy directly to Main. If a step fails, report the error to the operator and wait for guidance.

**NEVER call `wrangler deploy` directly.** All deployments MUST go through `leitstand.*` commands, which enforce Axiom gates, build-identity verification, and release state transitions.

## Pipeline overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    MISSION LIFECYCLE                             │
│  mission.validate → mission.reconcile → mission.close            │
│  Release state: (none) ────────────────────► ready              │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RELEASE LIFECYCLE                              │
│  release.prepare → release.ready                                  │
│  Release state: ready ────────────────────► ready (confirmed)    │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  leitstand.dev-deploy                                             │
│  Channel: dev    Release state: ready ─────► dev-deployed        │
│  Axiom evidence generated (commitSha + missionId match)          │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  leitstand.propagate                                              │
│  Channel: alt    Release state: dev-deployed ─► alt-deployed     │
│  Axiom evidence gate (commitSha + missionId match)               │
│  Dev build-identity verification (fetch dev build-identity.json) │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  leitstand.promote                                                │
│  Channel: main   Release state: alt-deployed ─► main-deployed    │
│  Live build-identity verification (alt vs main)                   │
└──────────────────────────┬──────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│  mission.archive --status=closed --site <siteId>                  │
└─────────────────────────────────────────────────────────────────┘
```

**Key rules:**

- `leitstand.propagate` ALWAYS deploys to the **alt** channel only (hardcoded, RFC-0628). There is no `--channel` flag.
- `leitstand.promote` ALWAYS deploys to the **main** channel only.
- The `--all` CLI flag MUST NEVER be used on deployment commands (RFC-0842).
- `leitstand.propagate` reads `systemId` from the release manifest — `--site` is not needed.
- `mission.close` does NOT auto-archive (RFC-0801). The workpiece stays in `missions/<id>/workpiece/` with working `node_modules` until `mission.archive` is called explicitly after the deployment pipeline completes.

## Prerequisites

- Mission is open and materialized.
- Code changes are committed (`mission.git.commit` / `ecosystem.commit`).
- `mission.validate` has passed.
- `mission.reconcile` has merged workpiece to cache clone.
- **Playwright Chromium installed** — `mission.validate` and `leitstand.dev-deploy` require it for pre-flight checks. Verify:
  ```sh
  ls ~/.cache/ms-playwright/chromium* 2>/dev/null
  ```
  If absent, run before any validate/deploy:
  ```sh
  pnpm exec playwright install chromium
  ```
- **Root-level config files present** — `.lighthouse-budget-ignore`, `image-delivery.config.yaml` (in `src/`), `dns-records.yaml` must exist in the workpiece if the site requires them. These are persisted to the cache clone by `mission.close` and restored by `mission.materialize` (RFC-0840). `dns-records.yaml` lives in the cache clone and is read from there by DNS commands — it does not need to be in the workpiece.

## Steps

### 1. Dev — local verification

Start a local dev server for manual verification:

```sh
pnpm exec werkstatt run mission.preview --mission <missionId> --port 4321
```

Open the site in the browser and verify the changes visually.

Stop the server when done:

```sh
pkill -f "astro dev"
```

### 2. Mission lifecycle — validate, reconcile, close

```sh
pnpm exec werkstatt run mission.validate --mission <missionId>
pnpm exec werkstatt run mission.reconcile --mission <missionId>
pnpm exec werkstatt run mission.close --mission <missionId>
```

After `mission.close`, the mission is closed and the workpiece is no longer "active". The release must be prepared from the closed mission.

### 3. Release — prepare and ready

```sh
pnpm exec werkstatt run release.prepare --site <siteId> --mission <missionId>
pnpm exec werkstatt run release.ready --release <releaseId>
```

The release is now in `ready` state. Verify with:

```sh
pnpm exec werkstatt run leitstand.pipeline.check --release <releaseId>
```

### 4. Dev-deploy — deploy to dev channel with Axiom gate

`leitstand.dev-deploy` deploys the workpiece to the dev channel and runs Axiom verification automatically. It builds the workpiece, deploys to the dev worker, purges CDN, verifies freshness, and runs `mission.check`.

**After `mission.close`, the mission is no longer active.** The `--release` flag is REQUIRED to specify which release to deploy:

```sh
pnpm exec werkstatt run leitstand.dev-deploy --site <siteId> --release <releaseId>
```

Do NOT use `--all`. The `--all` flag is rejected on deployment commands (RFC-0842).

Review the Axiom findings in the output. If there are blocking findings, fix them before proceeding.

Release state transitions: `ready` → `dev-deployed`.

### 5. Propagate — deploy to alt channel

`leitstand.propagate` deploys a verified release to the **alt** channel only (hardcoded, RFC-0628). It requires:

- Release in `ready` state (confirmed by `release.ready`).
- Axiom evidence from dev-deploy (commitSha + missionId match).
- Dev build-identity verification (fetches dev `build-identity.json`).

```sh
pnpm exec werkstatt run leitstand.propagate --release <releaseId>
```

**Do NOT pass `--site`** — `leitstand.propagate` reads `systemId` from the release manifest. **Do NOT pass `--all`** — the `--all` flag is rejected on deployment commands (RFC-0842). **Do NOT pass `--channel`** — the `--channel` flag was removed (RFC-0628). The channel is always `alt`.

Release state transitions: `ready` → `alt-deployed`.

The site is now live on the alt domain. The operator verifies it before proceeding to Main.

### 6. Promote — promote to main channel

`leitstand.promote` promotes an alt-deployed release to the **main** channel only. It requires:

- Release in `alt-deployed` state.
- Live build-identity verification (alt vs main).

**Only after Alt is verified by the operator.**

```sh
pnpm exec werkstatt run leitstand.promote --release <releaseId>
```

**Do NOT pass `--all`** — the `--all` flag is rejected on deployment commands (RFC-0842).

Release state transitions: `alt-deployed` → `main-deployed`.

### 7. Archive — clean up

After the main deployment is verified, archive the mission:

```sh
pnpm exec werkstatt run mission.archive --status=closed --site <siteId>
```

## Forbidden actions

- **NEVER call `wrangler deploy` directly.** This bypasses the pipeline. All deployments MUST go through `leitstand.*` commands.
- **NEVER use `--all` on deployment commands** (`leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`). Deployment is always per-site, per-release. The `--all` flag is rejected by the command runner (RFC-0842).
- **NEVER use `--channel` on `leitstand.propagate`.** The flag was removed (RFC-0628). The channel is hardcoded to `alt`. Use `leitstand.promote` for main deployment.
- **NEVER deploy to Main without first deploying to Alt and verifying.** `leitstand.promote` enforces this by requiring `alt-deployed` state.
- **NEVER skip Axiom verification.** `leitstand.dev-deploy` runs Axiom automatically. `leitstand.propagate` requires Axiom evidence.
- **NEVER skip Dev verification.**
- **NEVER create workarounds** — no symlinks to node_modules, no manual dist copies, no custom wrangler configs, no `--config` pointing to cache clone, no copying `.env.*` files manually. If the pipeline fails, investigate the root cause and fix it — do not bypass.
- **NEVER use `pnpm --filter <site> run deploy:main`** — this resolves to ALL workpiece directories matching the site name, not the release directory.
- **NEVER run `wrangler deploy` from cache clone, werkstatt root, or workpiece directory.** These all fail for different reasons (no node_modules, pnpm strict isolation, package-specifier main field). Use `leitstand.*` commands instead.
- **NEVER restore build outputs (`image-variants.generated.yaml`, `derived-prices.generated.json`) from the cache clone to the workpiece.** These are build artifacts regenerated by `build.prepare`. Restoring them before a build causes `material.metadata.write` failures (referenced files don't exist yet).

## Common issues

### `.lighthouse-budget-ignore` missing after materialization

`mission.materialize` replaces the workpiece via `atomicMoveDir`. Root-level config files are not in `STERNSYSTEM_DATA_PATHS` but are now automatically persisted/restored by RFC-0840 (`persistOperatorConfigFiles` / `restoreOperatorConfigFiles`). If the file is still missing after materialization, copy it manually from the cache clone:

```sh
cp ../systems-cache/<siteId>/.lighthouse-budget-ignore missions/<missionId>/workpiece/
```

Then commit via `mission.git.commit`.

### `image.delivery.validate` errors despite `image-delivery.config.yaml` existing

The config file must be in `src/`, not the workpiece root. The validator reads from `srcDirectory/image-delivery.config.yaml` (RFC-0830). If the file is in the root, the validator emits `IMG-DELIVERY-CONFIG-02` warning (RFC-0841, implemented). Move it:

```sh
mv missions/<missionId>/workpiece/image-delivery.config.yaml missions/<missionId>/workpiece/src/image-delivery.config.yaml
```

### `material.metadata.write` fails with "derived-prices.generated.json not found"

This occurs when `image-variants.generated.yaml` (a build output) is restored from the cache clone before a build runs. The manifest references image files that don't exist yet. Remove the restored build output:

```sh
rm -f missions/<missionId>/workpiece/src/image-variants.generated.yaml
```

Then re-run `mission.validate` — the build will regenerate it.

### `derived-prices.generated.json` blocks `mission.close`

The file is gitignored but may still be tracked. `mission.close` runs `mission.validate` internally, which triggers a build. The build regenerates `derived-prices.generated.json` with a new `calculatedAt` timestamp on every run, creating uncommitted changes that block `mission.close`.

`isWorkpieceDirty` now filters out gitignored files, so this should no longer block. If it still does, untrack the file:

```sh
git -C missions/<missionId>/workpiece rm --cached src/derived-prices.generated.json
pnpm exec werkstatt run mission.git.commit --mission <missionId> --message "fix: untrack derived-prices.generated.json"
```

Then re-run `mission.close`.

### `mission.close` blocks on other regenerated files

`mission.close` runs `mission.validate` which triggers a full build. Any generated file that changes during the build will block close. Always check `git status` in the workpiece after a failed `mission.close`:

```sh
git -C missions/<missionId>/workpiece status --short
```

Commit all generated artifacts via `mission.git.commit`, then re-run `mission.close`.

### `leitstand.dev-deploy` fails with "no active mission"

After `mission.close`, the mission is closed and no longer active. The `--release` flag is REQUIRED:

```sh
pnpm exec werkstatt run leitstand.dev-deploy --site <siteId> --release <releaseId>
```

### `leitstand.propagate` fails with "Unexpected positional argument" or "Unknown flag '--channel'"

`leitstand.propagate` does NOT accept `--channel` (removed in RFC-0628) or `--site` (read from release manifest). The only required flag is `--release`:

```sh
pnpm exec werkstatt run leitstand.propagate --release <releaseId>
```

### `leitstand.propagate` fails with "must be in state 'ready'"

The release must be in `ready` state. Run `release.prepare` then `release.ready`:

```sh
pnpm exec werkstatt run release.prepare --site <siteId> --mission <missionId>
pnpm exec werkstatt run release.ready --release <releaseId>
```

### `leitstand.propagate` fails with "no Axiom evidence found"

`leitstand.dev-deploy` must run first to generate Axiom evidence. The evidence is checked for commitSha + missionId match. If the workpiece was re-committed after dev-deploy, the commitSha will mismatch — re-run `leitstand.dev-deploy`.

### `leitstand.promote` fails with "must be in state 'alt-deployed'"

`leitstand.propagate` must run first to transition the release to `alt-deployed` state.

### `release.prepare` fails with OWN-XCHECK-02 (phantom command references)

If `ownership.generator.cross-check` reports `OWN-XCHECK-02` for commands like `open-source.generate`, `changelog.generate`, `content.ref-index.generate`, `integrity.keys.generate` during `release.prepare` for a closed mission, this means the cross-check is not loading the workpiece's app runtime.

**Root cause:** After `mission.close`, `currentMission` is `null`, so normal site discovery skips the workpiece. The cross-check must load commands from `context.site` (the workpiece passed by `release.prepare`). This was fixed in platform 5.45.15 — if it recurs, check that `ownership.generator.cross-check` loads `context.site`'s app runtime via `loadAppRuntime`.

### `mission.archive` fails with "Unknown flag --mission"

`mission.archive` takes `--site <siteId>`, not `--mission <missionId>`:

```sh
pnpm exec werkstatt run mission.archive --status=closed --site <siteId>
```

### `release.prepare` fails with broken `node_modules`

If the mission was archived before `release.prepare` ran, `node_modules` symlinks are broken (pnpm relative paths change with directory depth). Move the mission back:

```sh
mv missions/archive/closed/<missionId> missions/<missionId>
pnpm install --no-frozen-lockfile
```

Then re-run `release.prepare`. To prevent this, always run the full deployment pipeline before `mission.archive` (RFC-0801).
