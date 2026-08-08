---
id: RFC-0761
title: "Simplify env-file architecture: remove channel-specific env files and consolidate shared secrets"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-08
updatedAt: 2026-08-08
enhancedAt: 2026-08-08
implementedAt: 2026-08-08
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0388
amendedBy: []
related:
  - DNA-40
  - RFC-0388
  - RFC-0346
  - RFC-0149
  - RFC-0168
  - RFC-0186
  - RFC-0379
  - RFC-0624
  - RFC-0666
  - ADR-0027
satisfies:
  - DNA-40
versionBump: minor
commands:
  proposed: []
  added: []
  changed:
    - deploy.preflight
    - deploy.scripts.validate
    - env.contract.validate
    - env.example.generate
    - leitstand.dev-deploy
    - leitstand.propagate
    - leitstand.promote
    - leitstand.rollback
  removed:
    - env.main.check
    - env.alt.check
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-handoff"
  - "@warpgogol/site-kernel-onboarding"
successSignals:
  - "Sites deploy from local using a single .env file via wrangler deploy --secrets-file .env; no .env.main or .env.alt files exist."
  - "Root .env contains all shared secrets (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, R2 keys, OPENAI_API_KEY, WARPGOGOL_OTLP_ENDPOINT, WARPGOGOL_OTLP_TOKEN); site .env.example does not list shared secrets."
  - "Service .env.example files do not list WARPGOGOL_OTLP_ENDPOINT or WARPGOGOL_OTLP_TOKEN; services read them from process.env (root .env via dotenv/config)."
  - "No .env.secrets-main or .env.secrets-alt files exist anywhere in the repository."
  - "mission.materialize creates only .env from .env.example; .env.main and .env.alt are not created."
  - "release.prepare copies .env (not .env.main or .env.alt) to the release directory."
  - "resolveConventionSecretsPath returns .env for all channels; no channel-specific env file lookup."
nonGoals:
  - "Does not introduce per-environment override files for channel-specific secrets. If channel-specific overrides are needed in the future, a new RFC will define the mechanism."
  - "Does not change the Integration Port secret catalog or api.routes.generate pipeline."
  - "Does not change how Astro/Vite loads .env for local development (astro dev reads site .env natively)."
  - "Does not add CI/CD pipeline integration for deploy.preflight — it remains a local pre-deploy gate."
  - "Does not change the root .env.example hand-authored convention (RFC-0388 Rule 2)."
---

# RFC-0761: Simplify env-file architecture: remove channel-specific env files and consolidate shared secrets

## Context

RFC-0388 established a three-tier env-file standard: `.env` (local), `.env.alt` (alt deploy), `.env.main` (main deploy) for sites; `.env` for services; `.env` for root. Since implementation, the following problems emerged:

1. **`.env.main` / `.env.alt` are always empty.** `mission.materialize` creates them as identical copies of `.env.example` (all values empty). Operators never fill them — the real secrets come from root `.env` via `process.env` (loaded by `dotenv/config` in the kernel CLI). The merge pattern `{ ...filterEnv(process.env), ...secretsEnv }` with ADR-0027 (skip empty values) means empty `.env.main`/`.env.alt` contribute nothing. They are dead weight in every workpiece and release.

2. **`.env.secrets-main` / `.env.secrets-alt` are dead files.** Root `.env.secrets-main` and `.env.secrets-alt` each contain a single variable (`CLOUDFLARE_ACCOUNT_ID`) that is already in root `.env`. Zero references in code — no `.ts`, `.yaml`, `.json`, or `.md` file reads them.

3. **`CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` duplicated between root and site.** Root `.env` has them (filled). Site `.env.example` lists them (empty template). Site `.env` may or may not have them. The `env.example.generate` command includes them in the site template, but they are shared secrets that belong in root `.env`, not per-site.

4. **`WARPGOGOL_OTLP_ENDPOINT` / `WARPGOGOL_OTLP_TOKEN` duplicated between services.** `cf-analytics-poller/.env.example` and `fleet-probe-runner/.env.example` both list them. They are the same values (shared observability endpoint). `@warpgogol/observability` reads them from `process.env`, which is populated by root `.env` via `dotenv/config`. Service `.env.example` entries are redundant.

5. **~70 empty env files across workpieces and releases.** Each mission workpiece has `.env`, `.env.main`, `.env.alt` (3 files). Each release has `.env.main`, `.env.alt` (2 files). With 20+ archived missions and 15 releases, that is ~90 files that are identical copies of `.env.example` with no values.

## Problem

1. **Cognitive load.** An operator or agent encountering `.env.main` / `.env.alt` / `.env.secrets-main` / `.env.secrets-alt` must investigate whether they matter. They do not — but there is no signal that they are dead.

2. **Maintenance burden.** `env.main.check` and `env.alt.check` commands exist solely to create empty files. `mission.materialize` creates three env files instead of one. `release.prepare` copies two env files instead of one. `deploy.scripts.validate` checks for `--secrets-file .env.main` / `--secrets-file .env.alt` instead of a single `--secrets-file .env`.

3. **Misleading templates.** Site `.env.example` lists `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, implying the operator should fill them per-site. In reality, they are shared secrets from root `.env`. New site onboarding creates confusion.

4. **Duplicated shared secrets in service templates.** `WARPGOGOL_OTLP_*` appears in two service `.env.example` files. When the endpoint changes, both must be updated. There is no validation that they stay in sync.

5. **DNA-40 is overly prescriptive.** DNA-40 mandates `.env.main` and `.env.alt` on disk for every `systems/*` project. This forces the creation of empty files that serve no purpose.

## Decision

The env-file architecture is simplified to a two-tier model with a single env file per project:

### Rule 1 — Single env file per project

| Project type | File | Purpose |
| --- | --- | --- |
| `systems/*` | `.env` | Local development AND deploy (`wrangler deploy --secrets-file .env`) |
| `services/*` | `.env` | Local development AND deploy (`wrangler deploy --secrets-file .env`) |
| root | `.env` | Tooling (shared secrets, AI API keys, passport signing key) |
| all | `.env.example` | Mandatory template — empty values, comments, `# How to obtain:` instructions |

`.env.main`, `.env.alt`, `.env.secrets-main`, and `.env.secrets-alt` are eliminated. No backward compatibility.

### Rule 2 — Root .env holds shared secrets

Root `.env` contains secrets shared across all sites and services:

- `CLOUDFLARE_API_TOKEN` — one token for all Cloudflare zones
- `CLOUDFLARE_ACCOUNT_ID` — one account
- `CLOUDFLARE_ZONE_ID` — default zone (for warpgogol-com; client sites override in their `.env`)
- `R2_AXIOM_*` — evidence bucket
- `R2_NACHWEIS_*` — nachweis bucket
- `OPENAI_API_KEY` — changelog AI
- `PASSPORT_SIGNING_KEY` — identity
- `WARPGOGOL_OTLP_ENDPOINT` — shared observability endpoint
- `WARPGOGOL_OTLP_TOKEN` — shared observability token

Root `.env.example` is updated to include `WARPGOGOL_OTLP_ENDPOINT` and `WARPGOGOL_OTLP_TOKEN`.

### Rule 3 — Site .env.example excludes shared secrets

The `env.example.generate` command no longer includes `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` in the site `.env.example` template. These are shared secrets from root `.env`.

Site `.env.example` retains `CLOUDFLARE_ZONE_ID` (site-specific) and `CLOUDFLARE_READONLY_API_TOKEN` (optional, for client sites on different Cloudflare accounts that need a read-only validation token).

### Rule 4 — Service .env.example excludes shared observability secrets

Service `.env.example` files no longer list `WARPGOGOL_OTLP_ENDPOINT` or `WARPGOGOL_OTLP_TOKEN`. Services read them from `process.env` (root `.env` via `dotenv/config`).

### Rule 5 — Deploy scripts use --secrets-file .env

**Sites (`systems/*/package.json`):**

```json
{
  "deploy:main": "site-kernel run deploy.preflight --site warpgogol-com && wrangler deploy --name warpgogol-com --secrets-file .env",
  "deploy:alt": "site-kernel run deploy.preflight --site warpgogol-com && wrangler deploy --name alt-warpgogol-com --secrets-file .env",
  "build:deploy:main": "pnpm run build:main && pnpm run deploy:main",
  "build:deploy:alt": "pnpm run build:alt && pnpm run deploy:alt"
}
```

**Services (`services/*/package.json`):**

```json
{
  "deploy": "site-kernel run deploy.preflight --service lagebild-sync-worker && wrangler deploy --secrets-file .env"
}
```

### Rule 6 — deploy.preflight simplified

`deploy.preflight` no longer takes `--env main` or `--env alt` for sites. The target is always `.env`.

```sh
# Sites
pnpm exec site-kernel run deploy.preflight --site warpgogol-com

# Services
pnpm exec site-kernel run deploy.preflight --service lagebild-sync-worker
```

### Rule 7 — env.main.check and env.alt.check removed

The commands `env.main.check` and `env.alt.check` are removed. They existed solely to create empty `.env.main` / `.env.alt` files from `.env.example`. With the single-file model, they are unnecessary.

### Rule 8 — mission.materialize creates only .env

`mission.materialize` step 5 creates only `.env` from `.env.example`. `.env.main` and `.env.alt` are not created. The env preservation logic preserves only `.env`.

### Rule 9 — release.prepare copies .env

`release.prepare` copies `.env` (not `.env.main` / `.env.alt`) from the workpiece to the release directory. `resolveConventionSecretsPath` returns the path to `.env` for all channels.

### Rule 10 — DNA-40 updated

DNA-40 is updated to reflect the single-file model: `.env` for local development and deploy, `.env.example` as mandatory template. References to `.env.main`, `.env.alt`, `env.main.check`, and `env.alt.check` are removed.

## Architectural fit

- **DNA-1 (Monorepo boundary):** The simplified contract applies uniformly to `systems/*`, `services/*`, and root.
- **DNA-40 (Env-and-deploy contract):** This RFC amends DNA-40 to reflect the single-file model. The mandate for `.env.main` / `.env.alt` on disk is removed. The `# How to obtain:` requirement and `deploy.preflight` gate are retained.
- **RFC-0388 (predecessor):** This RFC amends RFC-0388. Rules 1, 5, 6, 7, and the file system responsibilities table are updated. Rules 2, 3, 4, 8, 9 are retained unchanged.
- **RFC-0149 (Unified Cloudflare Workers deployment):** The `--secrets-file` flag remains the deployment shape. This RFC simplifies which file is passed.
- **RFC-0168 (Integration Port):** `env.example.generate` remains canonical for `systems/*`. This RFC removes the Cloudflare shared secrets block from the generated template.
- **ADR-0027 (sourceDotenv skip empty values):** Retained. The merge pattern `{ ...filterEnv(process.env), ...secretsEnv }` is unchanged. With a single `.env`, `secretsEnv` contains the site-specific secrets and `process.env` contains the shared secrets from root `.env`.

## Design

### CLI surface

```sh
# Pre-deploy gate (sites — no --env flag)
pnpm exec site-kernel run deploy.preflight --site warpgogol-com

# Pre-deploy gate (services — unchanged)
pnpm exec site-kernel run deploy.preflight --service lagebild-sync-worker

# Validate .env.example presence, comments, how-to-obtain (unchanged)
pnpm exec site-kernel run env.contract.validate

# Check/create .env from .env.example (unchanged)
pnpm exec site-kernel run env.local.check

# Validate deploy scripts (updated — checks --secrets-file .env for all)
pnpm exec site-kernel run deploy.scripts.validate
```

### TypeScript contracts

```ts
// deploy.preflight — --env flag removed for sites
interface DeployPreflightInput {
  site?: string;
  service?: string;
  // env field removed — always targets .env
}

interface DeployPreflightResult {
  command: "deploy.preflight";
  status: "pass" | "fail";
  target: string; // resolved .env file path
  keysChecked: number;
  violations: PreflightViolation[];
}

// resolveConventionSecretsPath — simplified
function resolveConventionSecretsPath(basePath: string): string | undefined {
  const envFile = ".env";
  const filePath = path.join(basePath, envFile);
  return existsSync(filePath) ? filePath : undefined;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/*/.env.example` | Generated by `env.example.generate`. No shared Cloudflare secrets. Checked for comments, `# How to obtain:`, empty values. |
| `systems/*/.env` | Local dev + deploy. Checked by `env.local.check`. Validated by `deploy.preflight`. Gitignored. |
| `services/*/.env.example` | Hand-authored. No `WARPGOGOL_OTLP_*`. Checked for comments, `# How to obtain:`, empty values. |
| `services/*/.env` | Local dev + deploy. Checked by `env.local.check`. Validated by `deploy.preflight`. Gitignored. |
| `.env.example` (root) | Hand-authored. Includes `WARPGOGOL_OTLP_*`. Checked for comments, `# How to obtain:`, empty values. |
| `.env` (root) | Tooling + shared secrets. Checked by `env.local.check`. Gitignored. |
| `systems/*/package.json` | Checked for deploy scripts with `--secrets-file .env` by `deploy.scripts.validate`. |
| `services/*/package.json` | Checked for `deploy` script with preflight + `--secrets-file .env` by `deploy.scripts.validate`. |

### Output format

`deploy.preflight` output shape is unchanged from RFC-0388. The `target` field always points to `.env` (not `.env.main` / `.env.alt`):

```json
{
  "command": "deploy.preflight",
  "status": "pass",
  "target": "systems/warpgogol-com/.env",
  "keysChecked": 8,
  "violations": []
}
```

### Failure modes

- **`deploy.preflight`**: Fails on any violation (missing file, missing key, extra key, empty value). Exits non-zero. Blocks the deploy script.
- **`env.contract.validate`**: Fails on any violation. Unchanged from RFC-0388.
- **`env.local.check`**: Never fails. Reports `present`, `created`, or `not-required`. Unchanged.
- **`deploy.scripts.validate`**: Fails if `deploy:main` or `deploy:alt` does not use `--secrets-file .env`, or if `deploy` (services) does not use `--secrets-file .env` with preflight.

## Rollout

### Phase 1 — Implementation (this RFC)

1. Update `resolveConventionSecretsPath` in `leitstand-commands.ts`: remove channel parameter, always return `.env` path.
2. Update all callers of `resolveConventionSecretsPath` (dev-deploy, propagate, promote, rollback): remove channel argument. `leitstand.rollback` uses `.env` for all channels — channel detection is no longer needed for secret resolution.
3. Update preflight checks in `leitstand-commands.ts` (the `convention-env-exists` check at line ~420): check for `.env` instead of `.env.alt` / `.env.main`.
4. Update `mission.materialize` step 5: create only `.env` from `.env.example`. Remove `.env.main` / `.env.alt` creation. Update env preservation to preserve only `.env`.
5. Update `release.prepare`: copy `.env` (not `.env.main` / `.env.alt`) to release directory.
6. Update `deploy.preflight` in `deploy-preflight.ts`: remove `--env` flag for sites. Target is always `.env`.
7. Update `deploy.scripts.validate` in `env-contract.ts`: check `deploy:main` and `deploy:alt` use `--secrets-file .env` (not `.env.main` / `.env.alt`).
8. Remove `env.main.check` and `env.alt.check` commands from `env-contract.ts` and `infra-contracts.ts` command table.
9. Update `env.example.generate` in `env-example.ts`: remove `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` from the Cloudflare block. Keep `CLOUDFLARE_ZONE_ID` and `CLOUDFLARE_READONLY_API_TOKEN`.
10. Update root `.env.example`: add `WARPGOGOL_OTLP_ENDPOINT` and `WARPGOGOL_OTLP_TOKEN` with `# How to obtain:` instructions.
11. Update service `.env.example` files: remove `WARPGOGOL_OTLP_ENDPOINT` and `WARPGOGOL_OTLP_TOKEN` from `cf-analytics-poller` and `fleet-probe-runner`.
12. Update `package.template.json` in `site-kernel-onboarding`: `deploy:main` and `deploy:alt` use `--secrets-file .env`.
13. Delete root `.env.secrets-main` and `.env.secrets-alt` (local filesystem operation — these files are gitignored).
14. Delete all `.env.main` and `.env.alt` files in workpieces and releases (local filesystem operation — these files are gitignored and cannot be deleted via a git commit).
15. Update `DNA-40` in `docs/architecture-dna.md`: remove `.env.main` / `.env.alt` mandate, `env.main.check` / `env.alt.check` references. Add `WARPGOGOL_OTLP_*` to root env scope.
16. Update `RFC-0388` frontmatter: add `RFC-0761` to `amendedBy` array.
17. Update root `AGENTS.md` line 226: remove `.env.main`, `.env.alt` from the env-and-deploy contract summary.
18. Update `services/AGENTS.md` env-and-deploy contract section.
19. Update `HOW_TO_OBTAIN` map in `env-example.ts`: remove `WARPGOGOL_OTLP_*` entries (now in root only).
20. Update existing `systems/*/package.json` deploy scripts: `--secrets-file .env.main` → `--secrets-file .env`, `--secrets-file .env.alt` → `--secrets-file .env`.
21. Update existing leitstand tests: remove channel parameter from `resolveConventionSecretsPath` calls, update `convention-env-exists` preflight check assertions.

**Implementation order:** Steps 6-7 (`deploy.preflight` and `deploy.scripts.validate`) MUST be implemented simultaneously — updating one without the other breaks validation for existing deploy scripts. Steps 12 and 18 (package template and existing `systems/*/package.json` deploy scripts) should follow immediately after.

### Phase 2 — Pipeline integration

- `env.contract.validate` runs in `services-check.run` and `sites-check.run` pipelines. Unchanged.
- `deploy.scripts.validate` runs in `sites-check.run` pipeline. Updated rules.
- `deploy.preflight` is standalone. Updated to target `.env`.

### Default behavior

- **Fail-hard** for `env.contract.validate`, `deploy.scripts.validate`, and `deploy.preflight`.
- **Warn-only** for `env.local.check`.

### New sites and services

- New `systems/*` scaffolded by `onboarding.scaffold` get `.env.example` (via `env.example.generate` without shared Cloudflare secrets), deploy scripts (via `package.template.json` with `--secrets-file .env`), and `.env` (via `env.local.check`).
- New `services/*` are hand-created with `.env.example` (without `WARPGOGOL_OTLP_*`).

## Alternatives considered

- **Keep `.env.main` / `.env.alt` but make them optional:** Rejected. The merge pattern already handles missing files via `sourceDotenv` returning `{}`. But keeping the files as optional still requires `resolveConventionSecretsPath` to look for them, `deploy.scripts.validate` to accept both `--secrets-file .env.main` and `--secrets-file .env`, and `deploy.preflight` to accept `--env` or not. The complexity remains for zero benefit — nobody uses channel-specific overrides in practice.

- **Introduce `.env.override` for channel-specific overrides:** Rejected. There is no current need for channel-specific overrides. All deployment channels for warpgogol-com use the same Cloudflare account and the same secrets. If a future client site needs channel-specific overrides, a new RFC will define the mechanism.

- **Move `CLOUDFLARE_ZONE_ID` to root `.env` only:** Rejected. `CLOUDFLARE_ZONE_ID` is site-specific — different sites have different zones. It must remain in site `.env.example` and `.env`. Root `.env` has the warpgogol-com zone ID as a convenience default, but client sites override it in their `.env`.

- **Merge root `.env` and site `.env` into a single file:** Rejected. Root `.env` is loaded by `dotenv/config` in the kernel CLI. Site `.env` is loaded by Astro/Vite for `astro dev` / `astro build`. They serve different consumers and must remain separate.

## Risks

- **Channel-specific deploy secrets are no longer possible.** If a future site needs different secrets for main vs alt channels, the operator cannot use `.env.main` / `.env.alt`. Mitigation: shell environment variables can override before deploy, or a new RFC can introduce an override mechanism. Low risk — zero current sites have different values in `.env.main` vs `.env.alt`; all were empty copies of `.env.example`.

- **Root `.env` becomes the single point of failure for shared secrets.** If root `.env` is missing or has wrong values, all sites and services are affected. This is not a regression — `.env.main` / `.env.alt` were never filled with different values; they were always empty copies of `.env.example`, and real secrets came from root `.env` via `process.env`. Mitigation: root `.env.example` documents all variables with `# How to obtain:` instructions. `env.local.check` creates root `.env` from `.env.example` if missing.

- **Operators must update deploy scripts.** `deploy:main` and `deploy:alt` scripts in `systems/*/package.json` change from `--secrets-file .env.main` / `--secrets-file .env.alt` to `--secrets-file .env`. This is a one-time update during implementation. `deploy.scripts.validate` enforces the new shape.

- **`deploy.preflight` API change.** The `--env` flag is removed for sites. Any scripts or agents that pass `--env main` or `--env alt` will fail. Mitigation: the flag is removed entirely (not just ignored), so the failure is immediate and clear.

## Acceptance criteria

- [x] (evidence: 3c9c53b3) `resolveConventionSecretsPath` in `leitstand-commands.ts` returns `.env` path for all channels (no channel parameter)
- [x] (evidence: 3c9c53b3) `leitstand.rollback` uses `.env` for all channels (no channel-dependent env file resolution)
- [x] (evidence: 3c9c53b3) Preflight `convention-env-exists` check in `leitstand-commands.ts` checks for `.env` (not `.env.alt` / `.env.main`)
- [x] (evidence: 3c9c53b3) `mission.materialize` creates only `.env` from `.env.example` (no `.env.main` / `.env.alt`)
- [x] (evidence: 3c9c53b3) `release.prepare` copies `.env` to release directory (not `.env.main` / `.env.alt`)
- [x] (evidence: 3c9c53b3) `deploy.preflight` no longer accepts `--env` flag for sites; targets `.env`
- [x] (evidence: 3c9c53b3) `deploy.scripts.validate` checks `deploy:main` and `deploy:alt` use `--secrets-file .env`
- [x] (evidence: 3c9c53b3) `env.main.check` and `env.alt.check` commands removed from command table and handlers
- [x] (evidence: ccadfa95) `env.example.generate` does not include `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` in site template
- [x] (evidence: ccadfa95) Root `.env.example` includes `WARPGOGOL_OTLP_ENDPOINT` and `WARPGOGOL_OTLP_TOKEN` with `# How to obtain:` instructions
- [x] (evidence: ccadfa95) `cf-analytics-poller/.env.example` and `fleet-probe-runner/.env.example` do not list `WARPGOGOL_OTLP_*`
- [x] (evidence: ccadfa95) `package.template.json` in `site-kernel-onboarding` uses `--secrets-file .env` for `deploy:main` and `deploy:alt`
- [x] (evidence: local-fs) Root `.env.secrets-main` and `.env.secrets-alt` files deleted
- [x] (evidence: ccadfa95) All `systems/*/package.json` deploy scripts updated to `--secrets-file .env`
- [x] (evidence: 20c3b6c9) `DNA-40` in `docs/architecture-dna.md` updated to reflect single-file model
- [x] (evidence: 20c3b6c9) Root `AGENTS.md` env-and-deploy contract summary updated (remove `.env.main`, `.env.alt`)
- [x] (evidence: 20c3b6c9) `services/AGENTS.md` env-and-deploy contract section updated
- [x] (evidence: ccadfa95) `HOW_TO_OBTAIN` map in `env-example.ts` updated (remove `WARPGOGOL_OTLP_*` from site generator)
- [x] (evidence: 397-cmd) `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **Agent env-and-deploy discipline (updated):**
  - When creating a new `systems/*` or `services/*` project, create `.env.example` BEFORE adding the first `process.env` read. Every `KEY=` line MUST have a preceding `#` comment and a `# How to obtain:` line.
  - Shared secrets (`CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `WARPGOGOL_OTLP_*`, R2 keys) belong in root `.env`, NOT in site or service `.env.example`.
  - Site `.env.example` contains only site-specific secrets: integrations, Supabase buffer, Stripe, QStash, Redis, `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_READONLY_API_TOKEN` (for client sites only).
  - When adding a new environment variable to an existing project, add it to `.env.example` in the same commit. For `systems/*`, rerun `env.example.generate` instead of hand-editing.
  - When writing or updating a `README.md`, NEVER include an env-variable table. Use the single reference line: `See [.env.example](./.env.example) for all required and optional environment variables.`
  - When creating deploy scripts, always include `deploy.preflight` before `wrangler deploy`. Use `--secrets-file .env` for all projects (sites and services).
  - After cloning or scaffolding a project, run `env.local.check` to create `.env` from `.env.example` if missing.
  - Never create `.env.main`, `.env.alt`, `.env.secrets-main`, `.env.secrets-alt`, `.dev.vars`, or `.env.production` files — these are superseded by `.env`.
