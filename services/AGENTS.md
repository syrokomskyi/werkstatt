# Services Agent Guide

`services/*` contains deployable backend and service runtime compositions. Treat this layer as the service analogue of site workspaces: wiring, runtime entrypoints, environment, queue/store selection, deployment config, and health checks live here.

Shared behavior, schemas, validators, adapters, business logic, report shapes, and check rules belong in `packages/*`.

Rules:

- Do not import from site workspaces (`missions/*/workpiece` or `systems/*`).
- Do not allow site workspaces to import from `services/*`.
- Do not copy logic from packages into a service workspace.
- Keep service workspaces thin and deployment-oriented.
- Files with the generated marker are generator-owned outputs.
- Add reusable runtime contracts to packages before using them from a service.
- **Test temp directories:** Unit tests that create temp directories (via `mkdtemp`/`mkdtempSync`) MUST use the `tmp-*` naming pattern (e.g. `tmp-runner-XXXX-`). These directories are gitignored via `tmp-*/` in `.gitignore`. Agents MUST clean up `tmp-*` directories they create during a session — the session-end workflow automates this, but agents should also clean up manually if a session is not formally closed.

## Env-and-deploy contract (RFC-0761 / DNA-40 / RFC-0806)

Every `services/*` project that reads environment variables from `process.env`, a `getEnv()` helper, or a Cloudflare Worker `Env` interface MUST ship a `.env.example` file in its project root.

- Every variable in `.env.example` MUST be documented by a preceding `#` comment.
- Every variable MUST include a `# How to obtain:` instruction line with concrete steps for acquiring its value.
- Values in `.env.example` MUST stay empty — never commit real secrets.
- `README.md` files MUST NOT duplicate env-variable tables — they reference `.env.example` instead.
- `services/*` projects with `.env.example` MUST have `.env` on disk (local development + deploy).
- `services/*/package.json` deploy scripts MUST use `--secrets-file .env` and be prefixed with `deploy.preflight`.
- Services that do not consume environment variables are exempt.
- Enforced by `env.contract.validate`, `env.local.check`, `deploy.scripts.validate`, and `deploy.preflight`.

### Dev channel (RFC-0806)

Cloudflare Worker services ship a `wrangler.dev.jsonc` config for dev-channel deploys. The dev config uses a `-dev` worker name suffix and `*.workers.dev` URL (no custom routes).

- Services with env vars MUST also ship `.env.dev.example` — same documentation rules as `.env.example`.
- `deploy.preflight --dev` validates `.env.dev` against `.env.dev.example`.
- `services/*/package.json` includes three deploy scripts:
  - `deploy:dev` — proxies to `leitstand.service.dev-deploy --service <id>`
  - `deploy:prod` — proxies to `leitstand.service.promote --service <id>`
  - `rollback` — proxies to `leitstand.service.rollback --service <id>`
- All Cloudflare Worker services MUST implement a `/health` endpoint returning `{"status":"ok","service":"<id>"}` with HTTP 200.
- The services registry (`services/registry.yaml`) tracks `lastDeployed`, `lastDevDeployed`, and `healthCheckPath` per service.

Current services:

- `services/check-runner` is the Node/Playwright runner for the Check Warpgogol site.
- It consumes `.check-warpgogol/queue/*.request.json` and writes `.check-warpgogol/runs/<runId>/` artifacts.
- The site/service boundary is `@warpgogol/werkstatt-site/check-core`; do not bypass it with direct site-to-service imports.
- `findWorkspaceRoot` in `@warpgogol/werkstatt-site/check-core` is Node-only (uses `node:fs`). Cloudflare Workers API routes in the Check Warpgogol site must read `CHECK_WEBGOGOL_WORKSPACE_ROOT` from the environment directly.
- `services/rate-fetcher` is the Cloudflare Worker for RFC-0744 Rate Fetcher Service. Daily cron fetches exchange rates from external sources (ECB) via `@warpgogol/werkstatt-site/pbp-rate-adapters` and stores observations in Supabase. The site/service boundary is `@warpgogol/werkstatt-site/pbp-rate-adapters`; do not bypass it with direct adapter calls from sites.
- `services/maturity-score` is the Cloudflare Worker for ADR-0042 Maturity Score Service. Request-triggered Worker that accepts `POST /score` with `{ url }` and returns `{ score }`. The stub implementation returns a deterministic hash-based score (0–100). No env vars consumed by the stub.

Validation:

- Run `pnpm exec werkstatt run check-warpgogol.runner.validate` after changing the runner or the app API boundary.
- Run `pnpm exec werkstatt run services.check.run` after changing `services/*`, `pnpm-workspace.yaml`, or service import rules.
