---
description: Deploy a site through the Dev → Axiom → Alt → Main pipeline
---

# Deployment Pipeline

The deployment pipeline is strictly ordered. Never skip steps, reorder, or
deploy directly to Main. If a step fails, report the error to the operator
and wait for guidance.

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

### 2. Axiom — automated QA

Run Axiom checks on the dev or alt preview URL:

```sh
pnpm exec site-kernel run mission.check \
  --mission <missionId> \
  --external-preview <url> \
  --base-url <url> \
  --channel dev
```

Review the findings. If there are blocking findings, fix them before
proceeding. Do NOT proceed to deployment with unresolved blocking findings.

### 3. Alt — staging deployment

Deploy to the alt channel for operator verification:

```sh
wrangler deploy \
  --config releases/<site>-r<NNNNN>/dist/server/wrangler.json \
  --name alt-<site> \
  --secrets-file releases/<site>-r<NNNNN>/.env.alt
```

The site is now live on the alt domain. The operator verifies it before
proceeding to Main.

### 4. Main — production deployment

**Only after Alt is verified by the operator.**

```sh
wrangler deploy \
  --config releases/<site>-r<NNNNN>/dist/server/wrangler.json \
  --name <site> \
  --secrets-file releases/<site>-r<NNNNN>/.env.main
```

## Forbidden actions

- **NEVER deploy to Main without first deploying to Alt and verifying.**
- **NEVER skip Axiom verification.**
- **NEVER create workarounds** — no symlinks to node_modules, no manual dist
  copies, no custom wrangler configs, no `--config` pointing to cache clone.
  If the pipeline fails, investigate the root cause and fix it.
- **NEVER use `pnpm --filter <site> run deploy:main`** — this resolves to
  workpiece directories, not the release directory, and `deploy.preflight`
  fails because it cannot find the site in the workspace.
- **NEVER run `wrangler deploy` from cache clone** — it has no `node_modules`
  and `pnpm install` fails due to `workspace:*` dependencies without a
  workspace.

## Common issues

### `derived-prices.generated.json` blocks `mission.close`

The file is gitignored but may still be tracked. If `mission.close` fails
with "workpiece has uncommitted file(s)" and the only changed file is
`src/derived-prices.generated.json`, untrack it:

```sh
git -C missions/<missionId>/workpiece rm --cached src/derived-prices.generated.json
pnpm exec site-kernel run mission.git.commit --mission <missionId> --message "fix: untrack derived-prices.generated.json"
```

### `deploy.preflight: site not found`

`deploy.preflight` uses `discoverSiteWorkspaces(context.workspaceRoot)` which
scans the werkstatt root for site workspaces. It does not find sites in the
cache clone or release directory. The correct deploy path is using the built
`wrangler.json` from `dist/server/` in the release directory (see steps
above).
