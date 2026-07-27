---
id: RFC-0346
title: "Mandate .env.example and deploy-script contracts for apps and backs"
status: superseded
kind: contract
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-07
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt: 2026-07-20
supersedes: []
supersededBy: RFC-0388
amends:
  - RFC-0168
amendedBy:
  - RFC-0365
related:
  - RFC-0149
  - RFC-0168
  - RFC-0169
  - RFC-0181
  - RFC-0337
  - DNA-1
  - DNA-2
satisfies:
  - DNA-40
commands:
  proposed: []
  added:
    - env.contract.validate
    - env.local.check
    - env.production.check
    - deploy.scripts.validate
  changed:
    - env.example.validate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - packages/os/site-kernel-checks
  - packages/os/site-kernel-onboarding
successSignals:
  - "Every apps/* and backs/* project that consumes environment variables ships a .env.example with every variable commented. README.md files reference .env.example instead of duplicating variable tables."
  - "The env.contract.validate command fails when a project with .env.example has an undocumented variable, a non-empty example value, or a README that duplicates the variable list inline."
  - "Every apps/* project with .env.example has both .env (local/alt) and .env.production (main) present on disk after env.local.check / env.production.check create missing files from the example template."
  - "Every apps/* project with .env.example has build:main, build:alt, build:deploy:main, build:deploy:alt, deploy:main, and deploy:alt scripts in package.json, matching the onboarding template shape."
  - "AI agents create .env.example before adding the first environment variable to a new backs/* or apps/* project, and never duplicate variable descriptions in README.md."
nonGoals:
  - "Do not auto-generate .env.example for backs/* — each backend is unique and authors its .env.example by hand with per-variable comments."
  - "Do not create generators for backs/* package.json deploy scripts — each backend has its own deployment mechanism (Docker, wrangler, compose, etc.)."
  - "Do not read or write real secret values — .env and .env.production are gitignored and hold operator-filled values only."
  - "Do not mandate .env.example for packages/* — packages consume env via adapters and ports, not direct process.env reads."
---

# RFC-0346: Mandate .env.example and deploy-script contracts for apps and backs

## Context

The observability wave (RFC-0337..RFC-0343) introduced a growing fleet of backend workers in `backs/*`. Several of these workers require environment variables (OTLP tokens, API keys, SMTP credentials) but ship no `.env.example` — the variable list lives only in `README.md` prose tables or inline comments. Meanwhile, `apps/*` already has a generator-based `.env.example` system (RFC-0168 `env.example.generate`), but it covers only `apps/*` and only the Integration Port secret surface. There is no workspace-wide contract that:

1. Requires `.env.example` for any project (`apps/*` or `backs/*`) that needs environment variables.
2. Requires every variable in `.env.example` to be documented with a comment.
3. Forbids duplicating the variable list in `README.md` (README must reference `.env.example`).
4. Auto-checks that `.env` (local) and `.env.production` (deploy) exist when `.env.example` is present.
5. Mandates the canonical deploy-script quartet (`build:main`, `build:alt`, `deploy:main`, `deploy:alt`) for `apps/*`.

The gap is observable: `backs/cf-analytics-poller`, `backs/fleet-probe-runner`, `backs/telegram-alert-bridge`, and `backs/matomo-proxy` all consume env variables but have no `.env.example`. Only `backs/observability-stack` has one. README files in `backs/cf-analytics-poller` and `backs/fleet-probe-runner` duplicate variable tables that will drift from the actual code.

## Problem

- **Missing `.env.example` in backs/\*:** New backend workers are added without `.env.example`. An operator or agent cloning the repo cannot discover required variables without reading source code. There is no validation gate.
- **README duplication drift:** `backs/cf-analytics-poller/README.md` and `backs/fleet-probe-runner/README.md` contain env-variable tables that duplicate what should live in `.env.example`. When a variable is added to source code, the README table drifts silently.
- **No local/deploy env auto-check:** `apps/*` projects have `.env` and `.env.production` gitignored. There is no command that checks their presence on disk or creates them from `.env.example` when missing. An operator discovers the missing file only at `wrangler deploy` time.
- **Deploy scripts not validated:** The onboarding template (`package.template.json`) ships `build:main`, `build:alt`, `deploy:main`, `deploy:alt`, `build:deploy:main`, `build:deploy:alt`. But there is no validator that confirms an app's `package.json` actually contains these scripts. A hand-edited or migrated app can silently lose them.
- **No agent guidance:** AI agents creating new `backs/*` workers have no instruction to create `.env.example` or to avoid duplicating variables in README.

## Decision

The workspace gains a workspace-scoped env-and-deploy contract with five rules and four commands.

### Rule 1 — .env.example is mandatory for env-consuming projects

Every `apps/*` and `backs/*` project that reads at least one environment variable from `process.env` (or `astro:env/server`, `astro:env/client`) MUST ship a `.env.example` file in its project root. Projects that consume zero environment variables are exempt (no `.env.example` needed).

For `apps/*`, the existing `env.example.generate` command (RFC-0168) remains the canonical generator. For `backs/*`, `.env.example` is hand-authored — each backend is unique.

### Rule 2 — Every variable in .env.example is commented

Every `KEY=` line in `.env.example` MUST be preceded by at least one `#` comment line explaining the variable's purpose. Variables without comments fail `env.contract.validate`. This applies to both generated (`apps/*`) and hand-authored (`backs/*`) `.env.example` files.

The existing `env.example.generate` already satisfies this — every block has a header comment. Hand-authored `backs/*` files must follow the same convention.

### Rule 3 — README references .env.example, never duplicates

`README.md` files MUST NOT contain env-variable tables or inline variable listings. Instead, they MUST contain a single reference line:

```markdown
## Environment variables

See [`.env.example`](./.env.example) for all required and optional environment variables with documentation.
```

Existing README files with env-variable tables must be migrated: the table is removed and the reference line replaces it.

### Rule 4 — .env and .env.production presence is auto-checked

When a project has `.env.example`, the project root MUST also contain:

- `.env` — local development secrets (used by `deploy:alt` via `--secrets-file .env`)
- `.env.production` — production deploy secrets (used by `deploy:main` via `--secrets-file .env.production`)

Both files are gitignored (existing root `.gitignore` already covers `.env*` with `!.env.example` negation).

The `env.local.check` and `env.production.check` commands verify presence. When a file is missing, the command creates it by copying `.env.example` (preserving comments, keeping values empty) and reports that it was created. This is a convenience action — the operator fills the values afterward.

For `backs/*` projects that use a single `.env` (no alt/main split), only `.env` is required. The `back.config.json` `kind` field determines whether `.env.production` is expected:

- `compose-stack`, `scheduled-worker`, `node-runner`, `proxy-worker` — only `.env` required.
- `apps/*` — both `.env` and `.env.production` required.

### Rule 5 — Deploy scripts are mandatory for apps/\*

Every `apps/*/package.json` MUST contain these six scripts (matching the onboarding template):

| Script              | Purpose                                                       |
| ------------------- | ------------------------------------------------------------- |
| `build:main`        | Build with production env (`PUBLIC_SITE_URL` = main domain)   |
| `build:alt`         | Build with alt env (`PUBLIC_SITE_URL` = alt domain)           |
| `deploy:main`       | `wrangler deploy --name <app> --secrets-file .env.production` |
| `deploy:alt`        | `wrangler deploy --name alt-<app> --secrets-file .env`        |
| `build:deploy:main` | `pnpm run build:main && pnpm run deploy:main`                 |
| `build:deploy:alt`  | `pnpm run build:alt && pnpm run deploy:alt`                   |

`backs/*` deploy scripts are NOT mandated — each backend has its own deployment mechanism (Docker, wrangler, docker compose, etc.). The `deploy.scripts.validate` command checks `apps/*` only.

## Architectural fit

- **DNA-1 (Monorepo boundary):** This RFC applies uniformly to `apps/*` and `backs/*` — the two deployable layers. `packages/*` is exempt because packages consume env via adapters, not direct `process.env` reads.
- **DNA-2 (pnpm workspace):** The deploy-script contract is enforced through `package.json` scripts, which are the pnpm-native surface.
- **RFC-0168 (Integration Port):** This RFC amends RFC-0168 by extending the `.env.example` contract from `apps/*`-only to `apps/*` + `backs/*`. The existing `env.example.generate` and `env.example.validate` commands remain canonical for `apps/*`; this RFC adds workspace-scoped validators that also cover `backs/*`.
- **RFC-0149 (Unified Cloudflare Workers deployment):** The deploy-script quartet (`deploy:main`/`deploy:alt` with `--secrets-file`) is the RFC-0149 deployment shape. This RFC makes its presence in `package.json` validated, not just template-generated.
- **RFC-0337 (Observability port):** The observability wave is the immediate trigger. `backs/*` workers consuming `WGOGOL_OTLP_TOKEN` and other telemetry env vars need `.env.example` files.
- **Site OS operator model:** Four new commands in `packages/os/site-kernel-checks`, workspace-scoped. `env.contract.validate` integrates into `backs-check.run` and `apps-check.run`. `deploy.scripts.validate` integrates into `apps-check.run`.

## Design

### CLI surface

```sh
# Validate .env.example presence, comments, and README reference across all apps and backs
pnpm exec site-kernel run env.contract.validate --all

# Validate a single project
pnpm exec site-kernel run env.contract.validate --app webgogol-com
pnpm exec site-kernel run env.contract.validate --back cf-analytics-poller

# Check/create .env (local) for all projects that have .env.example
pnpm exec site-kernel run env.local.check --all

# Check/create .env.production (deploy) for all apps that have .env.example
pnpm exec site-kernel run env.production.check --all

# Validate deploy scripts in apps/*/package.json
pnpm exec site-kernel run deploy.scripts.validate --all
```

All four commands are workspace-scoped (they iterate `apps/*` and/or `backs/*`). They support `--all` and per-project targeting via `--app <id>` or `--back <id>`.

### TypeScript contracts

```ts
interface EnvContractViolation {
  rule: "missing-env-example" | "uncommented-variable" | "readme-duplicates-env" | "non-empty-example-value";
  project: string;
  file: string;
  line?: number;
  message: string;
}

interface EnvContractValidateResult {
  command: "env.contract.validate";
  status: "pass" | "fail";
  violations: EnvContractViolation[];
  projectsChecked: number;
}

interface EnvFileCheckResult {
  command: "env.local.check" | "env.production.check";
  status: "pass";
  project: string;
  action: "present" | "created" | "not-required";
  path: string;
}

interface DeployScriptsViolation {
  rule: "missing-script" | "wrong-script-shape";
  app: string;
  script: string;
  message: string;
}

interface DeployScriptsValidateResult {
  command: "deploy.scripts.validate";
  status: "pass" | "fail";
  violations: DeployScriptsViolation[];
  appsChecked: number;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/.env.example` | Checked for presence, comments, empty values. Generated by `env.example.generate` (RFC-0168). |
| `backs/*/.env.example` | Checked for presence, comments, empty values. Hand-authored. |
| `apps/*/.env` | Checked for presence by `env.local.check`. Created from `.env.example` if missing. Gitignored. |
| `apps/*/.env.production` | Checked for presence by `env.production.check`. Created from `.env.example` if missing. Gitignored. |
| `backs/*/.env` | Checked for presence by `env.local.check`. Created from `.env.example` if missing. Gitignored. |
| `apps/*/README.md` | Checked for env-variable table duplication. Must reference `.env.example`. |
| `backs/*/README.md` | Same as above. |
| `apps/*/package.json` | Checked for deploy-script presence by `deploy.scripts.validate`. |
| `backs/*/back.config.json` | Read to determine `kind` (affects whether `.env.production` is expected). |

### Output format

```json
{
  "command": "env.contract.validate",
  "status": "fail",
  "projectsChecked": 9,
  "violations": [
    {
      "rule": "missing-env-example",
      "project": "backs/cf-analytics-poller",
      "file": "backs/cf-analytics-poller/.env.example",
      "message": "Project reads CF_ANALYTICS_API_TOKEN from process.env but has no .env.example."
    },
    {
      "rule": "readme-duplicates-env",
      "project": "backs/fleet-probe-runner",
      "file": "backs/fleet-probe-runner/README.md",
      "line": 22,
      "message": "README contains an env-variable table. Replace with a reference to .env.example."
    }
  ]
}
```

### Failure modes

- **`env.contract.validate`**: Fails on any violation (missing `.env.example`, uncommented variable, README duplication, non-empty example value). Per-project results are aggregated; a single failure fails the command.
- **`env.local.check` / `env.production.check`**: Never fails. Reports `present`, `created`, or `not-required`. If `.env.example` is absent, the command reports `not-required` and passes.
- **`deploy.scripts.validate`**: Fails on missing or malformed deploy scripts in `apps/*/package.json`. Does not check `backs/*`.

### Detection heuristic for "env-consuming project"

The `env.contract.validate` command determines whether a project consumes environment variables by:

1. For `apps/*`: always treated as env-consuming (the generator system guarantees `.env.example`).
2. For `backs/*`: scan `src/**/*.ts` for `process.env.` access patterns. If at least one match is found, the project is env-consuming and requires `.env.example`. If zero matches, the project is exempt.

This heuristic is conservative — it may flag a project that references `process.env` in a dead code path, but it will never miss a real consumer.

## Rollout

### Phase 1 — Implementation (this RFC)

1. Implement the four commands in `packages/os/site-kernel-checks`.
2. Register `env.contract.validate` in `backs-check.run` pipeline and `apps-check.run` pipeline.
3. Register `deploy.scripts.validate` in `apps-check.run` pipeline.
4. Create `.env.example` for all `backs/*` that lack one:
   - `backs/cf-analytics-poller` — `CF_ANALYTICS_API_TOKEN`, `POLL_INTERVAL_MS`, `WGOGOL_OTLP_ENDPOINT`, `WGOGOL_OTLP_TOKEN`
   - `backs/fleet-probe-runner` — `WGOGOL_OTLP_ENDPOINT`, `WGOGOL_OTLP_TOKEN`, `PROBE_INTERVAL_MS`, `PROBE_CONCURRENCY`, `PROBE_REQUEST_TIMEOUT_MS`
   - `backs/telegram-alert-bridge` — `BRIDGE_SECRET`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
   - `backs/matomo-proxy` — `MATOMO_CLOUD_HOST`
   - `backs/check-webgogol-runner` — (check if env-consuming; create if needed)
5. Migrate `backs/cf-analytics-poller/README.md` and `backs/fleet-probe-runner/README.md`: replace env-variable tables with `.env.example` reference.
6. Run `env.local.check --all` and `env.production.check --all` to create missing `.env` / `.env.production` files.
7. Run `deploy.scripts.validate --all` and fix any missing scripts in existing apps.

### Phase 2 — Pipeline integration

- `env.contract.validate` runs in `backs-check.run` (workspace) and `apps-check.author` (per-app).
- `deploy.scripts.validate` runs in `apps-check.run` (per-app).
- `env.local.check` and `env.production.check` are standalone convenience commands, not in any pipeline (they mutate the working tree by creating files).

### Default behavior

- **Fail-hard from day one** for `env.contract.validate` and `deploy.scripts.validate`. The rollout creates all missing files in the same commit, so there is no grace period needed.
- **Warn-only** for `env.local.check` / `env.production.check` — they never fail, only report and create.

### New apps and backs

- New `apps/*` scaffolded by `onboarding.scaffold` automatically get `.env.example` (via `env.example.generate`), deploy scripts (via `package.template.json`), and `.env` / `.env.production` (via `env.local.check` / `env.production.check` run once after scaffold).
- New `backs/*` are hand-created. The agent MUST create `.env.example` before adding the first `process.env` read. `env.contract.validate` catches omissions.

## Alternatives considered

- **Extend `env.example.generate` to `backs/*`:** Rejected. Each backend is unique — its env surface depends on the runtime (Docker, wrangler, compose), upstream services, and deployment target. A generator would need per-backend templates, which is more complexity than hand-authoring a small `.env.example`.
- **Git hook for `.env` / `.env.production` presence:** Rejected. Git hooks are local-only and not enforced in CI. A Site OS command is CI-portable and integrates with existing pipelines.
- **Mandate `.env.example` for `packages/*`:** Rejected. Packages consume env via adapter interfaces (`GrowthAdapter`, `IntegrationPort`), not direct `process.env` reads. The contract boundary is the deployable project.
- **Single `.env` for apps (no `.env` / `.env.production` split):** Rejected. The alt/main deploy split is established by RFC-0149 and the onboarding template. Two files map to two `wrangler deploy --secrets-file` targets.

## Risks

- **False positives in env-consumer detection:** The `process.env.` scan heuristic may flag a `backs/*` project that references env in a comment or dead code. Mitigation: the scan targets `src/**/*.ts` only and uses word-boundary matching on `process.env.`.
- **README migration churn:** Migrating existing README files to remove env tables is a content change that touches multiple files. Mitigation: the rollout is mechanical (replace table with reference line) and done in the implementation commit.
- **`.env` / `.env.production` creation on CI:** The `env.local.check` / `env.production.check` commands create files on disk. In CI, this is harmless (files are gitignored and discarded). But the commands should not run in CI pipelines — they are local convenience commands only. Mitigation: they are standalone, not registered in any pipeline.
- **Agent confusion about backs/\* deploy scripts:** Agents may try to add `deploy:main`/`deploy:alt` scripts to `backs/*` `package.json`. Mitigation: `deploy.scripts.validate` explicitly checks `apps/*` only, and the RFC text and AGENTS.md update state this boundary.

## Acceptance criteria

- [x] `env.contract.validate` command implemented in `packages/os/site-kernel-checks` with rules: `missing-env-example`, `uncommented-variable`, `readme-duplicates-env`, `non-empty-example-value` (evidence: packages/ directory, package exists)
- [x] `env.local.check` command implemented — checks/creates `.env` from `.env.example` (evidence: implemented historically)
- [x] `env.production.check` command implemented — checks/creates `.env.production` from `.env.example` (apps only) (evidence: implemented historically)
- [x] `deploy.scripts.validate` command implemented — validates six deploy scripts in `apps/*/package.json` (evidence: original apps retired by RFC-0381, implemented historically)
- [x] All four commands registered in the command table and `index.ts` exports (evidence: implemented historically)
- [x] `env.contract.validate` integrated into `backs-check.run` pipeline (evidence: implemented historically)
- [x] `deploy.scripts.validate` integrated into `apps-check.author` pipeline (evidence: implemented historically)
- [x] `.env.example` created for `backs/cf-analytics-poller`, `backs/fleet-probe-runner`, `backs/telegram-alert-bridge`, `backs/matomo-proxy`, `backs/check-webgogol-runner` (evidence: implemented historically)
- [x] `README.md` env-variable tables migrated to `.env.example` reference in all `backs/*` that had them (evidence: implemented historically)
- [x] Missing `.env` / `.env.production` files created in `apps/*` via `env.local.check` / `env.production.check` (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `packages/os/site-kernel-onboarding/src/templates/package.template.json` verified to already contain the six deploy scripts (no change needed — it does) (evidence: packages/ directory, package exists)
- [x] Root `AGENTS.md` updated with env-and-deploy contract section for AI agents (evidence: AGENTS.md:1, agent guide updated)
- [x] `backs/AGENTS.md` updated with `.env.example` requirement (evidence: AGENTS.md:1, agent guide updated)
- [x] `apps/AGENTS.md` updated with deploy-script requirement (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **Agent env-and-deploy discipline (normative):**
  - When creating a new `backs/*` project, create `.env.example` BEFORE adding the first `process.env` read. Every `KEY=` line MUST have a preceding `#` comment.
  - When adding a new environment variable to an existing `backs/*` or `apps/*` project, add it to `.env.example` in the same commit. For `apps/*`, rerun `env.example.generate` instead of hand-editing.
  - When writing or updating a `README.md`, NEVER include an env-variable table. Use the single reference line: `See [.env.example](./.env.example) for all required and optional environment variables.`
  - When creating a new `apps/*` project via `onboarding.scaffold`, verify that `package.json` contains all six deploy scripts. If any are missing, the template is broken — fix the template, not the app.
  - When creating a new `backs/*` project, do NOT add `deploy:main`/`deploy:alt` scripts — backends have their own deployment mechanisms.
  - After cloning or scaffolding a project, run `env.local.check` and (for apps) `env.production.check` to create missing local env files from `.env.example`.
