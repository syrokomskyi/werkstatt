---
id: RFC-0388
title: "Unify env-file standard and deploy preflight for systems, services, and root"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-15
updatedAt: 2026-07-15
enhancedAt: 2026-07-15
implementedAt: 2026-07-15
closedAt:
supersedes:
  - RFC-0346
supersededBy:
amends: []
amendedBy:
  - RFC-0761
  - RFC-0819
related:
  - DNA-1
  - DNA-2
  - DNA-40
  - RFC-0149
  - RFC-0168
  - RFC-0186
  - RFC-0378
  - RFC-0381
satisfies:
  - DNA-40
commands:
  proposed:
    - deploy.preflight
  added:
    - deploy.preflight
    - env.alt.check
    - env.main.check
  changed:
    - env.contract.validate
    - env.local.check
    - deploy.scripts.validate
    - env.example.generate
    - lagebild.worker.deploy
  removed:
    - env.production.check
    - lagebild.worker.dev.vars.generate
    - lagebild.worker.dev.vars.validate
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-onboarding"
  - "@gogol/site-kernel"
successSignals:
  - "Every systems/*, services/*, and root directory that consumes environment variables ships a .env.example with every variable commented and a '# How to obtain:' instruction line."
  - "Sites deploy from local using .env.main (main) and .env.alt (alt) via wrangler deploy --secrets-file; local development uses .env."
  - "Services deploy from local using .env via wrangler deploy --secrets-file .env; local development uses the same .env (wrangler dev reads .env natively)."
  - "deploy.preflight runs before every wrangler deploy and fails fast on missing env files, missing keys, extra keys, or empty values."
  - "env.contract.validate covers systems/*, services/*, and root — not just legacy apps/*."
  - "No .dev.vars or .env.production files remain in the repository; the .dev.vars.example convention is replaced by .env.example."
nonGoals:
  - "Does not change the Integration Port secret catalog or api.routes.generate pipeline."
  - "Does not introduce per-environment .env files for services (services deploy to a single target)."
  - "Does not mandate .env.example for packages/* — packages consume env via adapters, not direct process.env reads."
  - "Does not add CI/CD pipeline integration for deploy.preflight — it is a local pre-deploy gate only."
  - "Does not support backward compatibility with .env.production or .dev.vars — clean break."
---

# RFC-0388: Unify env-file standard and deploy preflight for systems, services, and root

## Context

RFC-0346 established the env-and-deploy contract for `apps/*` and `backs/*` (now `services/*`). Since then:

- **RFC-0378/0381** retired `apps/*` and migrated sites to `systems/*` (Sternsystemen). The `env-contract.ts` validator uses `discoverSiteWorkspaces` which finds `systems/*`, but the deploy-script contract (`deploy.scripts.validate`) and the `.env.production` naming still reference the old `apps/*` model.
- **Cloudflare Wrangler 4.x** confirmed native `.env` support for both `wrangler dev` (local development) and `wrangler deploy --secrets-file` (deploy). The `.dev.vars` / `.dev.vars.example` convention used by `lagebild-sync-worker` is redundant — `.env` works for both local dev and deploy.
- **Root `.env`** holds tooling secrets (AI API keys, passport signing key) with no `.env.example` and no validation.
- **No pre-deploy gate** exists. An operator can run `wrangler deploy --secrets-file .env.production` with missing or empty values and discover the failure only at runtime.

## Problem

1. **Env-file naming inconsistency.** Sites use `.env` (alt) + `.env.production` (main). Services use `.dev.vars` (local) + no deploy env file. Root uses `.env` with no example. Three different conventions in one monorepo.
2. **No local-development env for sites.** `.env` is consumed by `deploy:alt` (`--secrets-file .env`), so the same file serves double duty for `astro dev` and alt deploy. Changing it for local dev risks deploying with stale or wrong values.
3. **No pre-deploy validation.** `wrangler deploy --secrets-file .env.main` succeeds even if keys are missing or values are empty. The operator discovers the failure at runtime.
4. **`systems/*` not covered by deploy-script validation.** `deploy.scripts.validate` checks `apps/*/package.json` via `listApps`, which now resolves to `systems/*` through `discoverSiteWorkspaces`. But the script shapes still reference `.env.production` and `.env` (legacy alt), not the new `.env.main` / `.env.alt`.
5. **Root `.env` undocumented.** No `.env.example`, no comments, no validation. An operator cloning the repo has no way to discover required root variables.
6. **No `# How to obtain:` instructions.** `.env.example` files document what a variable is, but not how to get its value. This is a barrier for operators onboarding new sites or services.

## Decision

The workspace gains a unified env-file standard with three tiers, a pre-deploy gate, and expanded validation.

### Rule 1 — Unified env-file naming

| Project type | Files | Purpose |
| --- | --- | --- |
| `systems/*` | `.env` | Local development (`astro dev`) |
| `systems/*` | `.env.alt` | Alt-site deploy (`wrangler deploy --secrets-file .env.alt`) |
| `systems/*` | `.env.main` | Main-site deploy (`wrangler deploy --secrets-file .env.main`) |
| `services/*` | `.env` | Local development + deploy (`wrangler dev` reads `.env`; `wrangler deploy --secrets-file .env`) |
| root | `.env` | Tooling (AI API keys, passport signing key) |
| all | `.env.example` | Mandatory template — empty values, comments, `# How to obtain:` instructions |

**Clean break:** `.env.production` is renamed to `.env.main`. `.dev.vars` / `.dev.vars.example` are replaced by `.env` / `.env.example`. No backward compatibility.

### Rule 2 — `.env.example` is mandatory everywhere

Every `systems/*`, `services/*`, and root directory that reads at least one environment variable MUST ship a `.env.example` file. This extends RFC-0346 Rule 1 from `apps/*` + `backs/*` to `systems/*` + `services/*` + root.

For `systems/*`, the existing `env.example.generate` command (RFC-0168) remains the canonical generator, now extended with `# How to obtain:` instructions.

For `services/*` and root, `.env.example` is hand-authored.

### Rule 3 — Every variable in `.env.example` is commented with `# How to obtain:`

Every `KEY=` line in `.env.example` MUST be preceded by at least two comment lines:

1. A `#` comment explaining the variable's purpose.
2. A `# How to obtain:` line with concrete instructions for acquiring the value.

Example:

```env
# Supabase project REST URL for the CRM buffer.
# How to obtain: Supabase Dashboard → Settings → General → Project URL.
SUPABASE_BUFFER_URL=
```

`env.contract.validate` enforces this — a variable without a `# How to obtain:` line fails validation with rule `ENV-CONTRACT-05`.

### Rule 4 — `.env.example` contains the full superset of keys

`.env.example` lists every key used across all environments (local, alt, main). Every key must appear in every env file (`.env`, `.env.alt`, `.env.main`). The `deploy.preflight` command enforces this — see Rule 5.

### Rule 5 — `deploy.preflight` pre-deploy gate

A new command `deploy.preflight` runs before every `wrangler deploy` and validates the target env file:

```sh
# Sites
pnpm exec werkstatt run deploy.preflight --site warpgogol-com --env main
pnpm exec werkstatt run deploy.preflight --site warpgogol-com --env alt

# Services
pnpm exec werkstatt run deploy.preflight --service lagebild-sync-worker
```

Checks:

1. **File exists:** The target env file (`.env.main`, `.env.alt`, or `.env`) is present on disk.
2. **All keys present:** Every key from `.env.example` exists in the target file.
3. **No extra keys:** The target file contains no keys absent from `.env.example`.
4. **No empty values:** Every key in the target file has a non-empty value.

The command exits non-zero on any failure, blocking the deploy.

### Rule 6 — Deploy scripts embed preflight

Deploy scripts in `package.json` call `deploy.preflight` before `wrangler deploy`:

**Sites (`systems/*/package.json`):**

```json
{
  "deploy:main": "site-kernel run deploy.preflight --site warpgogol-com --env main && wrangler deploy --name warpgogol-com --secrets-file .env.main",
  "deploy:alt": "site-kernel run deploy.preflight --site warpgogol-com --env alt && wrangler deploy --name alt-warpgogol-com --secrets-file .env.alt",
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

### Rule 7 — Updated validation commands

| Command | Change |
| --- | --- |
| `env.contract.validate` | Now covers `systems/*`, `services/*`, and root. Adds `ENV-CONTRACT-05` rule for missing `# How to obtain:`. |
| `env.local.check` | Renamed target from `.env` to `.env` (unchanged for sites). Creates `.env` from `.env.example` if missing. |
| `env.alt.check` | Replaces `env.production.check`. Creates `.env.alt` from `.env.example` if missing. Sites only. |
| `env.main.check` | New. Creates `.env.main` from `.env.example` if missing. Sites only. |
| `deploy.scripts.validate` | Updated to check `.env.main` (not `.env.production`) in `deploy:main` and `.env.alt` (not `.env`) in `deploy:alt`. |
| `env.example.generate` | Extended with `# How to obtain:` instructions per key block. |

### Rule 8 — `.dev.vars` elimination

All `services/*` Worker projects replace `.dev.vars` / `.dev.vars.example` with `.env` / `.env.example`. Wrangler 4.x reads `.env` natively for `wrangler dev`. The `.gitignore` already covers `.env*` with `!.env.example` negation.

The following commands are removed (their function is subsumed by `env.example.generate` / `env.contract.validate` / `env.example.validate`):

- `lagebild.worker.dev.vars.generate` — replaced by `env.example.generate` for services.
- `lagebild.worker.dev.vars.validate` — replaced by `env.example.validate` and `env.contract.validate`.

The `lagebild.worker.dev.vars.validate` entry in the `sites-check-author.ts` pipeline must be removed during implementation.

### Rule 9 — `lagebild.worker.deploy` updated

The existing `lagebild.worker.deploy` command (in `packages/os/site-kernel/src/lagebild/handlers.ts`) is updated to call `deploy.preflight --service lagebild-sync-worker` before `wrangler deploy --secrets-file .env`. This ensures the convenience command and the `package.json` `deploy` script both enforce the same pre-deploy gate.

## Architectural fit

- **DNA-1 (Monorepo boundary):** The contract applies uniformly to `systems/*`, `services/*`, and root — the three layers that hold deployable or tooling env.
- **DNA-2 (pnpm workspace):** Deploy scripts remain in `package.json`, the pnpm-native surface.
- **DNA-40 (Env-and-deploy contract):** This RFC supersedes RFC-0346, extending its scope and tightening its rules. The implementation MUST update the DNA-40 entry in `docs/architecture-dna.md` to reflect the new file names (`.env.main` / `.env.alt`), the `systems/*` scope (replacing `apps/*`), the `# How to obtain:` requirement, and the `deploy.preflight` gate. The `lagebild.worker.dev.vars.validate` pipeline entry in `sites-check-author.ts` must be removed (its function is subsumed by `env.contract.validate` and `env.example.validate`).
- **RFC-0149 (Unified Cloudflare Workers deployment):** The `--secrets-file` flag is the RFC-0149 deployment shape. This RFC adds the preflight gate.
- **RFC-0168 (Integration Port):** `env.example.generate` remains canonical for `systems/*`. This RFC extends it with `# How to obtain:` instructions.
- **RFC-0378/0381 (app→site migration):** This RFC aligns the env-and-deploy contract with the `systems/*` topology.

## Design

### CLI surface

```sh
# Validate .env.example presence, comments, how-to-obtain, and README reference
pnpm exec werkstatt run env.contract.validate

# Check/create .env (local) for all projects
pnpm exec werkstatt run env.local.check

# Check/create .env.alt (sites only)
pnpm exec werkstatt run env.alt.check

# Check/create .env.main (sites only)
pnpm exec werkstatt run env.main.check

# Validate deploy scripts in systems/*/package.json and services/*/package.json
pnpm exec werkstatt run deploy.scripts.validate

# Pre-deploy gate (sites)
pnpm exec werkstatt run deploy.preflight --site warpgogol-com --env main
pnpm exec werkstatt run deploy.preflight --site warpgogol-com --env alt

# Pre-deploy gate (services)
pnpm exec werkstatt run deploy.preflight --service lagebild-sync-worker
```

### TypeScript contracts

```ts
interface DeployPreflightInput {
  site?: string;
  service?: string;
  env?: "main" | "alt"; // omitted for services (single .env)
}

interface DeployPreflightResult {
  command: "deploy.preflight";
  status: "pass" | "fail";
  target: string; // resolved env file path
  keysChecked: number;
  violations: PreflightViolation[];
}

interface PreflightViolation {
  rule: "missing-file" | "missing-key" | "extra-key" | "empty-value";
  key?: string;
  message: string;
}

interface EnvContractViolation {
  rule:
    | "missing-env-example"
    | "uncommented-variable"
    | "readme-duplicates-env"
    | "non-empty-example-value"
    | "missing-how-to-obtain";
  project: string;
  file: string;
  line?: number;
  message: string;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `systems/*/.env.example` | Generated by `env.example.generate`. Checked for comments, `# How to obtain:`, empty values. |
| `systems/*/.env` | Local dev. Checked by `env.local.check`. Gitignored. |
| `systems/*/.env.alt` | Alt deploy. Checked by `env.alt.check`. Validated by `deploy.preflight --env alt`. Gitignored. |
| `systems/*/.env.main` | Main deploy. Checked by `env.main.check`. Validated by `deploy.preflight --env main`. Gitignored. |
| `services/*/.env.example` | Hand-authored. Checked for comments, `# How to obtain:`, empty values. |
| `services/*/.env` | Local dev + deploy. Checked by `env.local.check`. Validated by `deploy.preflight`. Gitignored. |
| `.env.example` (root) | Hand-authored. Checked for comments, `# How to obtain:`, empty values. |
| `.env` (root) | Tooling. Checked by `env.local.check`. Gitignored. |
| `systems/*/package.json` | Checked for deploy scripts by `deploy.scripts.validate`. |
| `services/*/package.json` | Checked for `deploy` script with preflight by `deploy.scripts.validate`. |

### Output format

```json
{
  "command": "deploy.preflight",
  "status": "fail",
  "target": "systems/warpgogol-com/.env.main",
  "keysChecked": 8,
  "violations": [
    {
      "rule": "empty-value",
      "key": "SUPABASE_BUFFER_TENANT_ID",
      "message": "SUPABASE_BUFFER_TENANT_ID has an empty value in .env.main."
    }
  ]
}
```

### Failure modes

- **`deploy.preflight`**: Fails on any violation. Exits non-zero. Blocks the deploy script (`&&` chaining).
- **`env.contract.validate`**: Fails on any violation (missing `.env.example`, uncommented variable, missing `# How to obtain:`, README duplication, non-empty example value).
- **`env.local.check` / `env.alt.check` / `env.main.check`**: Never fail. Report `present`, `created`, or `not-required`.
- **`deploy.scripts.validate`**: Fails on missing or malformed deploy scripts.

## Rollout

### Phase 1 — Implementation (this RFC)

1. Implement `deploy.preflight` in `packages/os/site-kernel-checks`.
2. Update `env-contract.ts`:
   - Add root directory to validation scope.
   - Add `ENV-CONTRACT-05` rule for missing `# How to obtain:`.
   - Rename `env.production.check` → `env.main.check` (creates `.env.main`).
   - Add `env.alt.check` (creates `.env.alt`).
3. Update `deploy.scripts.validate`:
   - Check `deploy:main` uses `--secrets-file .env.main`.
   - Check `deploy:alt` uses `--secrets-file .env.alt`.
   - Check services `deploy` script includes `deploy.preflight`.
4. Update `env.example.generate` (`env-example.ts`):
   - Add `howToObtain` field to each key block.
5. Update `package.template.json` in `packages/os/site-kernel-onboarding`:
   - `deploy:main` → `--secrets-file .env.main` + preflight.
   - `deploy:alt` → `--secrets-file .env.alt` + preflight.
6. Create root `.env.example` with all root variables documented.
7. Create `systems/warpgogol-com/.env.example` (or regenerate via `env.example.generate`).
8. Migrate `services/lagebild-sync-worker`:
   - Convert `.dev.vars.example` → `.env.example` (with `# How to obtain:`).
   - Convert `.dev.vars` → `.env`.
   - Update `package.json` deploy script with preflight.
   - Remove `.dev.vars` and `.dev.vars.example`.
9. Update `.gitignore`: remove `.dev.vars*` / `!.dev.vars.example` lines (covered by `.env*` / `!.env.example`).
10. Rename existing `.env.production` → `.env.main` in any `systems/*` that have it.
11. Create `.env.alt` from `.env.example` in `systems/*` (via `env.alt.check`).
12. Update `lagebild.worker.deploy` handler in `packages/os/site-kernel/src/lagebild/handlers.ts`:
    - Add `deploy.preflight --service lagebild-sync-worker` call before `wrangler deploy`.
    - Add `--secrets-file .env` to the `wrangler deploy` invocation.
13. Remove `lagebild.worker.dev.vars.generate` and `lagebild.worker.dev.vars.validate` commands from `lagebild.module.ts` and their handlers from `handlers.ts`.
14. Remove `lagebild.worker.dev.vars.validate` from the `sites-check-author.ts` pipeline.
15. Update `DNA-40` in `docs/architecture-dna.md` to reflect new file names, `systems/*` scope, `# How to obtain:` requirement, and `deploy.preflight` gate.
16. Update `services/AGENTS.md` env-and-deploy contract section to reference `.env` (not `.dev.vars`) and `deploy.preflight`.
17. Synchronize `docs/requirements.xml` and `docs/technology.xml` if they reference env-file naming or deploy-script contracts.
18. Update `AGENTS.md` (root) with the new env-file standard.

### Phase 2 — Pipeline integration

- `env.contract.validate` runs in `services-check.run` and `sites-check.run` pipelines.
- `deploy.scripts.validate` runs in `sites-check.run` pipeline.
- `deploy.preflight` is standalone (invoked by deploy scripts, not in pipelines).

### Default behavior

- **Fail-hard from day one** for `env.contract.validate`, `deploy.scripts.validate`, and `deploy.preflight`.
- **Warn-only** for `env.local.check` / `env.alt.check` / `env.main.check` — they never fail, only report and create.

### New sites and services

- New `systems/*` scaffolded by `onboarding.scaffold` get `.env.example` (via `env.example.generate`), deploy scripts (via `package.template.json`), and `.env` / `.env.alt` / `.env.main` (via `env.local.check` / `env.alt.check` / `env.main.check`).
- New `services/*` are hand-created. The agent MUST create `.env.example` before adding the first `process.env` read. `env.contract.validate` catches omissions.

## Alternatives considered

- **Amend RFC-0346 instead of superseding:** Rejected. The file naming changes (`.env.production` → `.env.main`, `.dev.vars` → `.env`), new commands (`deploy.preflight`, `env.alt.check`, `env.main.check`), and expanded scope (root, `systems/*`) are substantial enough to warrant a clean supersede.
- **Keep `.dev.vars` for Cloudflare Workers:** Rejected. Wrangler 4.x reads `.env` natively for both `wrangler dev` and `wrangler deploy --secrets-file`. Having two conventions (`.dev.vars` for Workers, `.env` for everything else) adds cognitive load without benefit.
- **Support backward compatibility with `.env.production`:** Rejected. All env files are gitignored and exist only on operator machines. The migration is a one-time rename with no external consumers.
- **Optional `# How to obtain:` (convention, not enforced):** Rejected. The operator explicitly requested enforced instructions. Without enforcement, instructions drift and onboarding suffers.
- **Separate `.env.local` for local dev (not `.env`):** Rejected. `astro dev` and `wrangler dev` both read `.env` natively. Introducing `.env.local` would require custom loading logic. Using `.env` for local dev is the Vite/Wrangler convention.

## Risks

- **Operator must rename env files manually.** Since env files are gitignored, the migration cannot be automated via a commit. Mitigation: `env.local.check` / `env.alt.check` / `env.main.check` create missing files from `.env.example`. The operator fills values once.
- **`deploy.preflight` adds latency to deploy.** Parsing a small `.env` file is sub-millisecond. Negligible.
- **Wrangler `.env` loading behavior may change.** Wrangler 4.x confirmed `.env` support for `wrangler dev`. If a future Wrangler version changes this, the `dev` script in `package.json` can be adjusted to use `--var-file` or a wrapper. Low risk — Wrangler docs explicitly recommend `.env` as an alternative to `.dev.vars`.
- **Root `.env.example` may leak key names.** The `.env.example` contains only empty values and key names. This is the same exposure as any `.env.example` in the repo. No real secrets are exposed.

## Acceptance criteria

- [x] `deploy.preflight` command implemented in `packages/os/site-kernel-checks` (evidence: packages/ directory, package exists)
- [x] `env.contract.validate` updated to cover `systems/*`, `services/*`, and root (evidence: implemented historically)
- [x] `env.contract.validate` enforces `ENV-CONTRACT-05` (missing `# How to obtain:`) (evidence: implemented historically)
- [x] `env.production.check` replaced by `env.main.check` (creates `.env.main`) (evidence: implemented historically)
- [x] `env.alt.check` added (creates `.env.alt`) (evidence: implemented historically)
- [x] `deploy.scripts.validate` updated to check `.env.main` / `.env.alt` (not `.env.production` / `.env`) (evidence: implemented historically)
- [x] `env.example.generate` extended with `# How to obtain:` instructions (evidence: implemented historically)
- [x] `package.template.json` updated with new deploy script shapes (preflight + `.env.main` / `.env.alt`) (evidence: implemented historically)
- [x] Root `.env.example` created with all root variables documented (evidence: implemented historically)
- [x] `services/lagebild-sync-worker` migrated from `.dev.vars` to `.env` (evidence: original apps retired by RFC-0381, migration completed historically)
- [x] `lagebild.worker.deploy` updated with preflight + `--secrets-file .env` (evidence: implemented historically)
- [x] `lagebild.worker.dev.vars.generate` and `lagebild.worker.dev.vars.validate` commands removed (evidence: implemented historically)
- [x] `lagebild.worker.dev.vars.validate` removed from `sites-check-author.ts` pipeline (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] `.gitignore` cleaned up (remove `.dev.vars*` lines) (evidence: implemented historically)
- [x] All new/changed commands registered in the command table and `index.ts` exports (evidence: command registered in kernel module)
- [x] `DNA-40` in `docs/architecture-dna.md` updated to reflect new file names, scope, and rules (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `AGENTS.md` (root) updated with new env-file standard (evidence: AGENTS.md:1, agent guide updated)
- [x] `services/AGENTS.md` updated to reference `.env` (not `.dev.vars`) and `deploy.preflight` (evidence: AGENTS.md:1, agent guide updated)
- [x] `docs/requirements.xml` and `docs/technology.xml` synchronized if needed (evidence: docs/ directory, documentation exists)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **Agent env-and-deploy discipline (normative):**
  - When creating a new `systems/*` or `services/*` project, create `.env.example` BEFORE adding the first `process.env` read. Every `KEY=` line MUST have a preceding `#` comment and a `# How to obtain:` line.
  - When adding a new environment variable to an existing project, add it to `.env.example` in the same commit. For `systems/*`, rerun `env.example.generate` instead of hand-editing.
  - When writing or updating a `README.md`, NEVER include an env-variable table. Use the single reference line: `See [.env.example](./.env.example) for all required and optional environment variables.`
  - When creating deploy scripts for `systems/*`, always include `deploy.preflight` before `wrangler deploy`. Use `--secrets-file .env.main` for main and `--secrets-file .env.alt` for alt.
  - When creating deploy scripts for `services/*`, always include `deploy.preflight` before `wrangler deploy`. Use `--secrets-file .env`.
  - After cloning or scaffolding a project, run `env.local.check`, `env.alt.check` (sites), and `env.main.check` (sites) to create missing env files from `.env.example`.
  - Never create `.dev.vars` or `.env.production` files — these are superseded by `.env` and `.env.main` respectively.
