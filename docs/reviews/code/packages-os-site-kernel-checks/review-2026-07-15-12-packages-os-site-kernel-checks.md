---
reviewId: REVIEW-CODE-2026-07-15-01
date: 2026-07-15
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: fc8070fc3^...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/env/env-contract.ts
  - packages/os/site-kernel-checks/src/env/env-example.ts
  - packages/os/site-kernel-checks/src/env/deploy-preflight.ts
  - packages/os/site-kernel-checks/src/index.ts
  - packages/os/site-kernel-checks/src/lagebild.ts
  - packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts
  - packages/os/site-kernel-checks/src/pipelines/build-prepare.ts
  - packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts
  - packages/os/site-kernel/src/lagebild/handlers.ts
  - packages/os/site-kernel/src/lagebild/lagebild.module.ts
  - packages/os/site-kernel/src/lagebild/env.ts
  - packages/os/site-kernel-onboarding/src/templates/package.template.json
  - services/lagebild-sync-worker/.env.example
  - services/lagebild-sync-worker/package.json
  - services/lagebild-sync-worker/wrangler.jsonc
  - .env.example
  - .gitignore
  - docs/architecture-dna.md
  - AGENTS.md
  - services/AGENTS.md
  - docs/policies/agent-surface-ops.md
  - docs/rfcs/rfc-0388-unify-env-file-standard-and-deploy-preflight-for-systems-services-and-root.md
  - docs/command-manifest.generated.yaml
  - docs/ecosystem.generated.yaml
---

# Code Review: fc8070fc3^...HEAD (RFC-0388 implementation, 6 commits)

### Verdict: Needs revision

The implementation is structurally sound and covers the RFC acceptance criteria comprehensively. However, two findings require fixes before merge: a `fixHint` that produces invalid command names for service deploys, and a stale RFC reference in a diagnostic message.

### Mechanical floor

Pass — all four affected packages pass `build:check`:

- `@warpgogol/site-kernel-checks` — pass
- `@warpgogol/site-kernel` — pass
- `@warpgogol/site-kernel-onboarding` — pass
- `@warpgogol/lagebild-sync-worker` — pass

`rfc.validate RFC-0388` — pass (0 violations).

### Axis A — Structural correctness

- **Duplicated Code (minor)** — `runEnvMainCheck` and `runEnvAltCheck` in `env-contract.ts:464-559` are identical except for the `ENV_MAIN`/`ENV_ALT` constant and command name. This is acceptable for two functions, but if a third env file is ever added, extract a shared `createEnvVariant` helper.
- **Dead code (minor)** — `lagebild.ts:16` MODULE_MAP entry says `stub — passes until full RFC-0186 implementation.` The stub label is stale; `runLagebildValidate` now does real DDL checks. Update the MODULE_MAP entry.

### Axis B — DNA alignment

- **DNA-40 (pass)** — `.env.example` files ship with `# How to obtain:` instructions. `env.contract.validate` enforces ENV-CONTRACT-05. Root `.env.example` created. `deploy.scripts.validate` checks `.env.main`/`.env.alt` for sites and `.env` for services.
- **DNA-42 (pass)** — New file `deploy-preflight.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY`. Updated files have updated `CHANGE_SUMMARY` entries.

### Axis C — Ecosystem fit

- **Command lifecycle (pass)** — New commands (`deploy.preflight`, `env.main.check`, `env.alt.check`) registered in `infra-contracts.ts`. Removed commands (`env.production.check`, `lagebild.worker.dev.vars.generate`, `lagebild.worker.dev.vars.validate`) fully removed from module, handlers, checks, and pipelines. Command manifest regenerated.
- **Pipeline placement (pass)** — `lagebild.worker.dev.vars.validate` removed from `sites-check-author.ts`. `lagebild.worker.dev.vars.generate` removed from `build-prepare.ts`. No new pipeline entries needed (deploy.preflight is standalone).
- **AGENTS.md updates (pass)** — Root `AGENTS.md`, `services/AGENTS.md`, and `docs/policies/agent-surface-ops.md` all updated with RFC-0388 references.

### Axis D — Forward-only compliance

- **Pass** — `.dev.vars` commands fully removed, not kept behind a flag. `.env.production` references replaced with `.env.main`. `lagebild.env.ts` migrated from `.dev.vars` to `.env` directly. `.gitignore` `.dev.vars*` lines removed. No compatibility shims.

### Axis E — Agent-facing clarity

- **Fail — stale RFC reference in diagnostic message.** `env-contract.ts:213` and `env-contract.ts:290` still reference `RFC-0346 Rule 1` in the `ENV-CONTRACT-01` diagnostic message. Since RFC-0388 supersedes RFC-0346, these should reference `RFC-0388 Rule 1`. The same messages in the services section (`env-contract.ts:290`) also say `RFC-0346 Rule 1`.

### Axis F — Pragmatism

- **Pass** — Each new command earns its existence: `deploy.preflight` is a standalone gate, `env.main.check`/`env.alt.check` create distinct files. No scope creep. Changes are minimal and focused.

### Axis G — Blind spots

- **Fail — `fixHint` produces invalid command name for service deploys.** `deploy-preflight.ts:121` emits `Run env.${env ?? "local"}.check to create it from .env.example`. When `--service` is used (no `--env` flag), `env` is `undefined`, so the hint says `env.local.check`. While `env.local.check` does create `.env` for services, the hint is technically correct but could confuse operators who expect a service-specific command. More importantly, when a site deploy fails and `env` is set to `"main"` or `"alt"`, the hint says `env.main.check` or `env.alt.check` — which is correct. The issue is that for services, `env` is `undefined` and the fallback `"local"` produces the right command name but the hint doesn't mention the service context. Consider: `Run env.local.check (for services) or env.${env}.check (for sites) to create it from .env.example`.
- **Edge case (minor)** — `deploy-preflight.ts:57-59` reads flags via both `flags.site` and `flags["--site"]`. The `--site` fallback is a defensive pattern for CLI argument parsing, but the command table in `infra-contracts.ts:168-180` defines `site` as a flag (not `--site`). If the kernel always normalizes `--site` to `flags.site`, the fallback is dead code. Verify whether the fallback is needed.

### Spec compliance

| Requirement from RFC-0388 | Status | Evidence |
| --- | --- | --- |
| `deploy.preflight` command implemented | Done | `deploy-preflight.ts:52-190` |
| `env.contract.validate` covers systems/_, services/_, root | Done | `env-contract.ts:199-389` |
| `ENV-CONTRACT-05` enforced | Done | `env-contract.ts:232-241`, `env-contract.ts:309-318`, `env-contract.ts:366-375` |
| `env.production.check` → `env.main.check` | Done | `env-contract.ts:464-510`, `infra-contracts.ts:138-148` |
| `env.alt.check` added | Done | `env-contract.ts:514-559`, `infra-contracts.ts:150-160` |
| `deploy.scripts.validate` checks `.env.main`/`.env.alt` + services | Done | `env-contract.ts:608-660` |
| `env.example.generate` with `# How to obtain:` | Done | `env-example.ts:96-160` |
| `package.template.json` updated | Done | `package.template.json:18-20` |
| Root `.env.example` created | Done | `.env.example` |
| `lagebild-sync-worker` migrated from `.dev.vars` to `.env` | Done | `services/lagebild-sync-worker/.env.example`, `package.json:10` |
| `lagebild.worker.deploy` updated with preflight + `--secrets-file .env` | Partial | `handlers.ts:438` adds `--secrets-file .env` but does NOT call `deploy.preflight` before spawning wrangler. The `package.json` deploy script does call preflight, but the kernel command `lagebild.worker.deploy` itself does not. |
| `lagebild.worker.dev.vars.*` commands removed | Done | `lagebild.module.ts`, `handlers.ts`, `lagebild.ts` |
| `lagebild.worker.dev.vars.validate` removed from pipeline | Done | `sites-check-author.ts:210` |
| `.gitignore` cleaned up | Done | `.gitignore:194-197` |
| All commands registered + exported | Done | `infra-contracts.ts`, `index.ts` |
| DNA-40 updated | Done | `docs/architecture-dna.md:175-177` |
| AGENTS.md (root) updated | Done | `AGENTS.md:108` |
| services/AGENTS.md updated | Done | `services/AGENTS.md:16-27` |
| `docs/requirements.xml` / `docs/technology.xml` synchronized | Done | No references to env-file naming or deploy-script contracts found in these files — no update needed. |
| `rfc.validate` passes | Done | Verified — 0 violations |
| Remove `.dev.vars` and `.dev.vars.example` files | Partial | `.dev.vars` and `.dev.vars.example` still exist on disk in `services/lagebild-sync-worker/`. They are gitignored (`.env*` pattern covers `.dev.vars` now), but the RFC rollout step 8 says "Remove `.dev.vars` and `.dev.vars.example`." |

### Questions for the author

1. `lagebild.worker.deploy` in `handlers.ts:438` spawns `wrangler deploy --secrets-file .env` but does not invoke `deploy.preflight` before spawning. The `package.json` deploy script does call preflight, but the kernel command itself does not. Should the kernel command also run preflight internally, or is the `package.json` wrapper the sole entry point?
2. The `.dev.vars` and `.dev.vars.example` files still exist on disk in `services/lagebild-sync-worker/`. Should they be deleted as part of this implementation, or left for the operator to clean up manually?
3. `env-contract.ts:213` and `env-contract.ts:290` still reference `RFC-0346 Rule 1` in diagnostic messages. Should these be updated to `RFC-0388 Rule 1` for consistency with the supersede?
