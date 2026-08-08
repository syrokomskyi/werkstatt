---
description: Deploy a site through the Dev → Axiom → Alt → Main pipeline
---

# Deployment Pipeline

The deployment pipeline is strictly ordered. Never skip steps, reorder, or deploy directly to Main. If a step fails, report the error to the operator and wait for guidance.

**NEVER call `wrangler deploy` directly.** All deployments MUST go through `leitstand.*` commands, which enforce Axiom gates, build-identity verification, and release state transitions.

## Prerequisites

- Mission is open and materialized.
- Code changes are committed (`mission.git.commit` / `ecosystem.commit`).
- `mission.validate` has passed.
- `mission.reconcile` has merged workpiece to cache clone.
- `mission.close` has closed the mission.
- `release.prepare` has prepared the release (`releases/<site>-r<NNNNN>/`).

## Steps

### 1. Dev — local verification

Start a local dev server for manual verification:

```sh
pnpm exec site-kernel run mission.preview --mission <missionId> --port 4321
```

Open the site in the browser and verify the changes visually.

Stop the server when done:

```sh
pkill -f "astro dev"
```

### 2. Dev-deploy — deploy to dev channel with Axiom gate

`leitstand.dev-deploy` deploys the workpiece to the dev channel and runs Axiom verification automatically. It builds the workpiece, deploys to the dev worker, purges CDN, verifies freshness, and runs `mission.check`.

For a workpiece (active mission):

```sh
pnpm exec site-kernel run leitstand.dev-deploy --site <siteId>
```

For an existing release (no active mission required):

```sh
pnpm exec site-kernel run leitstand.dev-deploy --site <siteId> --release <releaseId>
```

Review the Axiom findings in the output. If there are blocking findings, fix them before proceeding.

### 3. Propagate — deploy to alt channel

`leitstand.propagate` deploys a verified release to the alt channel. It requires Axiom evidence from dev-deploy (commitSha + missionId match).

```sh
pnpm exec site-kernel run leitstand.propagate --release <releaseId>
```

The site is now live on the alt domain. The operator verifies it before proceeding to Main.

### 4. Promote — promote to main channel

`leitstand.promote` promotes an alt-deployed release to the main channel. It requires the release to be in `alt-deployed` state and verifies build-identity.

**Only after Alt is verified by the operator.**

```sh
pnpm exec site-kernel run leitstand.promote --release <releaseId>
```

## Forbidden actions

- **NEVER call `wrangler deploy` directly.** This bypasses the pipeline. All deployments MUST go through `leitstand.*` commands.
- **NEVER deploy to Main without first deploying to Alt and verifying.** `leitstand.promote` enforces this by requiring `alt-deployed` state.
- **NEVER skip Axiom verification.** `leitstand.dev-deploy` runs Axiom automatically. `leitstand.propagate` requires Axiom evidence.
- **NEVER skip Dev verification.**
- **NEVER create workarounds** — no symlinks to node_modules, no manual dist copies, no custom wrangler configs, no `--config` pointing to cache clone, no copying `.env.*` files manually. If the pipeline fails, investigate the root cause and fix it — do not bypass.
- **NEVER use `pnpm --filter <site> run deploy:main`** — this resolves to ALL workpiece directories matching the site name, not the release directory.
- **NEVER run `wrangler deploy` from cache clone, werkstatt root, or workpiece directory.** These all fail for different reasons (no node_modules, pnpm strict isolation, package-specifier main field). Use `leitstand.*` commands instead.

## Common issues

### `derived-prices.generated.json` blocks `mission.close`

The file is gitignored but may still be tracked. `mission.close` runs `mission.validate` internally, which triggers a build. The build regenerates `derived-prices.generated.json` with a new `calculatedAt` timestamp on every run, creating uncommitted changes that block `mission.close`.

`isWorkpieceDirty` now filters out gitignored files, so this should no longer block. If it still does, untrack the file:

```sh
git -C missions/<missionId>/workpiece rm --cached src/derived-prices.generated.json
pnpm exec site-kernel run mission.git.commit --mission <missionId> --message "fix: untrack derived-prices.generated.json"
```

Then re-run `mission.close`.

### `mission.close` blocks on other regenerated files

`mission.close` runs `mission.validate` which triggers a full build. Any generated file that changes during the build will block close. Always check `git status` in the workpiece after a failed `mission.close`:

```sh
git -C missions/<missionId>/workpiece status --short
```

Commit all generated artifacts via `mission.git.commit`, then re-run `mission.close`.

### `leitstand.dev-deploy` fails with "no active mission"

If the mission is already closed, use `--release` to deploy an existing release:

```sh
pnpm exec site-kernel run leitstand.dev-deploy --site <siteId> --release <releaseId>
```

### `leitstand.propagate` fails with "must be in state 'ready'"

The release must be in `ready` state. Run `release.prepare` first:

```sh
pnpm exec site-kernel run release.prepare --site <siteId> --mission <missionId>
```

### `leitstand.propagate` fails with "no Axiom evidence found"

`leitstand.dev-deploy` must run first to generate Axiom evidence. The evidence is checked for commitSha + missionId match. If the workpiece was re-committed after dev-deploy, the commitSha will mismatch — re-run `leitstand.dev-deploy`.

### `leitstand.promote` fails with "must be in state 'alt-deployed'"

`leitstand.propagate` must run first to transition the release to `alt-deployed` state.
