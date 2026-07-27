---
rfcId: RFC-0388
planId: PLAN-RFC-0388-01
status: draft
owner: architecture
createdAt: 2026-07-15
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-onboarding"
    - "@gogol/site-kernel"
  services:
    - lagebild-sync-worker
  docs:
    - docs/architecture-dna.md
    - AGENTS.md
    - services/AGENTS.md
    - docs/requirements.xml
    - docs/technology.xml
---

# Implementation Plan: RFC-0388

## 1. Objectives

- [ ] O1 — Implement `deploy.preflight` command (maps to acceptance: "deploy.preflight command implemented")
- [ ] O2 — Update `env.contract.validate` to cover root and enforce `ENV-CONTRACT-05` (maps to acceptance: "env.contract.validate updated" + "enforces ENV-CONTRACT-05")
- [ ] O3 — Replace `env.production.check` with `env.main.check` + add `env.alt.check` (maps to acceptance: "env.production.check replaced" + "env.alt.check added")
- [ ] O4 — Update `deploy.scripts.validate` for `.env.main` / `.env.alt` + services deploy scripts (maps to acceptance: "deploy.scripts.validate updated")
- [ ] O5 — Extend `env.example.generate` with `# How to obtain:` instructions (maps to acceptance: "env.example.generate extended")
- [ ] O6 — Update `package.template.json` with new deploy script shapes (maps to acceptance: "package.template.json updated")
- [ ] O7 — Create root `.env.example` and migrate `lagebild-sync-worker` from `.dev.vars` to `.env` (maps to acceptance: "Root .env.example created" + "lagebild-sync-worker migrated")
- [ ] O8 — Update `lagebild.worker.deploy` with preflight + `--secrets-file .env` (maps to acceptance: "lagebild.worker.deploy updated")
- [ ] O9 — Remove `lagebild.worker.dev.vars.generate` and `lagebild.worker.dev.vars.validate` commands + pipeline entry (maps to acceptance: "commands removed" + "pipeline entry removed")
- [ ] O10 — Update `DNA-40`, `AGENTS.md`, `services/AGENTS.md`, Compass XML (maps to acceptance: "DNA-40 updated" + "AGENTS.md updated" + "services/AGENTS.md updated" + "Compass synchronized")

## 2. Affected artifacts

### 2.1 Code and commands

| Artifact | Change |
| --- | --- |
| `packages/os/site-kernel-checks/src/env/env-contract.ts` | Add root validation scope, `ENV-CONTRACT-05` rule, `parseEnvExample` extension for `# How to obtain:`, rename `env.production.check` → `env.main.check`, add `env.alt.check`, update `deploy.scripts.validate` for `.env.main` / `.env.alt` + services |
| `packages/os/site-kernel-checks/src/env/env-example.ts` | Add `howToObtain` field to each key block in `renderEnvExample` |
| `packages/os/site-kernel-checks/src/env/deploy-preflight.ts` | **New file** — `deploy.preflight` command handler |
| `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` | Register `deploy.preflight`, `env.alt.check`, `env.main.check`; remove `env.production.check`, `lagebild.worker.dev.vars.generate`, `lagebild.worker.dev.vars.validate`; update descriptions |
| `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts` | Add `ENV-CONTRACT-05` rule; update `DEPLOY-SCRIPTS-03` descriptions |
| `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts` | Remove `lagebild.worker.dev.vars.validate` pipeline entry |
| `packages/os/site-kernel-onboarding/src/templates/package.template.json` | Update `deploy:main` / `deploy:alt` with preflight + `.env.main` / `.env.alt` |
| `packages/os/site-kernel/src/lagebild/handlers.ts` | Update `runLagebildWorkerDeploy` to call preflight + `--secrets-file .env`; remove `runLagebildDevVarsGenerate` and `runLagebildDevVarsValidate` |
| `packages/os/site-kernel/src/lagebild/lagebild.module.ts` | Remove `lagebild.worker.dev.vars.generate` and `lagebild.worker.dev.vars.validate` command registrations |

### 2.2 Configuration and data

| Artifact | Change |
| --- | --- |
| `.env.example` (root) | **New file** — hand-authored with all root variables documented + `# How to obtain:` |
| `services/lagebild-sync-worker/.env.example` | **New file** — converted from `.dev.vars.example` with `# How to obtain:` |
| `services/lagebild-sync-worker/.dev.vars` | Renamed to `.env` |
| `services/lagebild-sync-worker/.dev.vars.example` | Deleted (replaced by `.env.example`) |
| `services/lagebild-sync-worker/package.json` | Update `deploy` script with preflight + `--secrets-file .env` |
| `.gitignore` | Remove `.dev.vars*` / `!.dev.vars.example` lines |

### 2.3 Documentation and specs

| Artifact | Change |
| --- | --- |
| `docs/architecture-dna.md` | Update DNA-40 entry to reflect new file names, `systems/*` scope, `# How to obtain:`, `deploy.preflight` |
| `AGENTS.md` (root) | Update env-and-deploy contract section |
| `services/AGENTS.md` | Update env-and-deploy contract section to reference `.env` (not `.dev.vars`) and `deploy.preflight` |
| `docs/requirements.xml` | Synchronize if it references env-file naming or deploy-script contracts |
| `docs/technology.xml` | Synchronize if it references env-file naming or deploy-script contracts |

### 2.4 Validation and pipelines

| Pipeline | Change |
| --- | --- |
| `sites-check-author.ts` | Remove `lagebild.worker.dev.vars.validate` entry |
| `services-check.run` | `env.contract.validate` already runs — no change needed |
| `sites-check.run` | `env.contract.validate` and `deploy.scripts.validate` already run — no change needed |

## 3. Step sequence

### Step 1. Extend `parseEnvExample` and add `ENV-CONTRACT-05` rule

**Goal:** Add `# How to obtain:` detection to the env-example parser and register the new diagnostic rule.

**Agent actions:**

- Extend `EnvExampleVariable` interface in `env-contract.ts` with `hasHowToObtain: boolean` field.
- Update `parseEnvExample` to track whether the preceding comment block contains a line starting with `# How to obtain:`.
- Add `ENV-CONTRACT-05` rule to `core-infra.ts` diagnostics rules.
- Add `ENV-CONTRACT-05` check in `runEnvContractValidate` for both sites and services.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `parseEnvExample` returns `hasHowToObtain` for each variable; `ENV-CONTRACT-05` rule is registered in `core-infra.ts`.

---

### Step 2. Add root directory to `env.contract.validate` scope

**Goal:** Extend the validator to check root `.env.example`.

**Agent actions:**

- In `runEnvContractValidate`, add a root directory check block after the services block.
- Read `.env.example` at workspace root.
- Apply the same `parseEnvExample` checks (comments, `# How to obtain:`, empty values).
- Check root `README.md` for env-variable table duplication (if root README exists).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `env.contract.validate` checks root `.env.example` when present.

---

### Step 3. Rename `env.production.check` → `env.main.check`, add `env.alt.check`

**Goal:** Replace the old production check with the new main/alt pair.

**Agent actions:**

- In `env-contract.ts`: rename `runEnvProductionCheck` → `runEnvMainCheck`, change `ENV_PRODUCTION` constant from `.env.production` to `.env.main`.
- Add `runEnvAltCheck` function (mirrors `runEnvMainCheck` but creates `.env.alt`).
- Update command descriptions and `reads`/`writes` arrays.
- In `infra-contracts.ts`: replace `env.production.check` registration with `env.main.check` and add `env.alt.check`.
- Update `env.local.check` description to clarify it creates `.env` for local dev (not alt deploy).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `env.main.check` and `env.alt.check` registered; `env.production.check` removed from command table.

---

### Step 4. Update `deploy.scripts.validate` for new file names + services

**Goal:** Validate deploy scripts against the new `.env.main` / `.env.alt` convention and add services deploy script validation.

**Agent actions:**

- In `runDeployScriptsValidate`: change `.env.production` → `.env.main` in the `deploy:main` check.
- Change `.env` → `.env.alt` in the `deploy:alt` check.
- Add a services loop: for each `services/*/package.json` with a `deploy` script, check it includes `deploy.preflight` and `--secrets-file .env`.
- Update `REQUIRED_DEPLOY_SCRIPTS` comment and error messages to reference RFC-0388.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `deploy.scripts.validate` checks `.env.main` / `.env.alt` for sites and preflight + `--secrets-file .env` for services.

---

### Step 5. Implement `deploy.preflight` command

**Goal:** Create the pre-deploy gate command.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/env/deploy-preflight.ts`.
- Implement `runDeployPreflight` with `DeployPreflightInput` / `DeployPreflightResult` / `PreflightViolation` types per RFC.
- Logic: resolve target env file based on `--site` + `--env` or `--service`; parse `.env.example` and target file; check 4 rules (missing-file, missing-key, extra-key, empty-value).
- Register `deploy.preflight` in `infra-contracts.ts` command table.
- Add `DEPLOY-PREFLIGHT-01` through `DEPLOY-PREFLIGHT-04` diagnostic rules to `core-infra.ts`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `deploy.preflight` registered and type-checks; `--json` output matches RFC spec.

---

### Step 6. Extend `env.example.generate` with `# How to obtain:` instructions

**Goal:** Add how-to-obtain lines to each key block in the generator output.

**Agent actions:**

- In `env-example.ts`: change `renderBlock` signature from `(title: string, keys: readonly string[])` to `(title: string, keys: Array<{ key: string; howToObtain: string }>)`. Each key entry now carries a `howToObtain` string.
- Update all `renderBlock` call sites to pass `howToObtain` per key:
  - **Stripe** (`STRIPE_SECRET_KEY`): `Stripe Dashboard → Developers → API Keys → Secret key (sk_live_*).`
  - **Telegram** (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`): `Bot token: @BotFather → /newbot. Chat ID: send a message to the bot, then query https://api.telegram.org/bot<TOKEN>/getUpdates.`
  - **WhatsApp** (`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TO`): `Meta Business Suite → WhatsApp Manager → API tokens. PHONE_ID: phone number ID. TO: recipient in E.164.`
  - **Pipedrive** (`PIPEDRIVE_TOKEN`, `PIPEDRIVE_DOMAIN`): `Pipedrive → Settings → Personal Preferences → API. TOKEN: API token. DOMAIN: <domain> in https://<domain>.pipedrive.com.`
  - **Email Routing** (`INTEGRATION_EMAIL_TO`, `INTEGRATION_EMAIL_FROM`): `Cloudflare Dashboard → Email Routing. FROM: verified sender on zone. TO: verified destination.`
  - **Lagebild Buffer** (`SUPABASE_BUFFER_URL`, `SUPABASE_BUFFER_SERVICE_KEY`, `SUPABASE_BUFFER_TENANT_ID`): `URL: Supabase Dashboard → Settings → General → Project URL. KEY: Settings → API → service_role key. TENANT_ID: run site-kernel run lagebild.tenant.add.`
  - **QStash** (`UPSTASH_QSTASH_URL`, `UPSTASH_QSTASH_TOKEN`): `Upstash Console → QStash → eu-central-1 endpoint. TOKEN: COPY/DELETE tokens section.`
  - **Redis** (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`): `Upstash Console → Redis → eu-central-1 → REST API section.`
  - **Cloudflare Regional Services** (`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_READONLY_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID`): `Dashboard → My Profile → API Tokens. ACCOUNT_ID/ZONE_ID: Dashboard → Overview → API section.`
  - **PUBLIC_IMAGE_PROVIDER**: `Set to "build-portable" to enable; leave empty for raw origin assets.`
- The `renderBlock` function outputs each key as: `# <purpose>\n# How to obtain: <instructions>\nKEY=`
- Update the generated header comment to mention `# How to obtain:` lines.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `renderEnvExample` output includes `# How to obtain:` line for every `KEY=`.

---

### Step 7. Update `package.template.json` and `lagebild.worker.deploy`

**Goal:** Align deploy scripts and the lagebild worker deploy command with the new standard.

**Agent actions:**

- In `package.template.json`: update `deploy:main` to `site-kernel run deploy.preflight --site {{CLIENT_ID}} --env main && wrangler deploy --name {{CLIENT_ID}} --secrets-file .env.main`.
- Update `deploy:alt` to `site-kernel run deploy.preflight --site {{CLIENT_ID}} --env alt && wrangler deploy --name alt-{{CLIENT_ID}} --secrets-file .env.alt`.
- In `handlers.ts`: update `runLagebildWorkerDeploy` to spawn `site-kernel run deploy.preflight --service lagebild-sync-worker` first, then `wrangler deploy --secrets-file .env`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-onboarding run build:check`
- `pnpm --filter @gogol/site-kernel run build:check`

**Completion criterion:** Template and handler use preflight + new file names.

---

### Step 8. Remove `.dev.vars` commands and pipeline entry

**Goal:** Clean up legacy `.dev.vars` commands.

**Agent actions:**

- In `packages/os/site-kernel/src/lagebild/lagebild.module.ts`: remove `lagebild.worker.dev.vars.generate` and `lagebild.worker.dev.vars.validate` command registrations.
- In `packages/os/site-kernel/src/lagebild/handlers.ts`: remove `runLagebildDevVarsGenerate` and `runLagebildDevVarsValidate` functions.
- In `packages/os/site-kernel-checks/src/lagebild.ts`: remove `runLagebildDevVarsValidate` function and its export.
- In `packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts`: remove the `lagebild.worker.dev.vars.validate` pipeline entry.
- Remove any imports of the deleted functions from `index.ts` or module barrel files.

**Validation:**

- `pnpm --filter @gogol/site-kernel run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** No references to `dev.vars` remain in command registrations or pipeline definitions.

---

### Step 9. Migrate `lagebild-sync-worker` files and create root `.env.example`

**Goal:** Execute the file-level migration.

**Agent actions:**

- Create `services/lagebild-sync-worker/.env.example` from `.dev.vars.example` content, adding `# How to obtain:` lines for each key.
- Copy `services/lagebild-sync-worker/.dev.vars` → `services/lagebild-sync-worker/.env` (preserving secret values so the operator does not lose them).
- Delete `services/lagebild-sync-worker/.dev.vars` and `services/lagebild-sync-worker/.dev.vars.example` (both are tracked or local files; `.dev.vars.example` is tracked, `.dev.vars` is gitignored but exists locally).
- Update `services/lagebild-sync-worker/package.json` deploy script: `"deploy": "site-kernel run deploy.preflight --service lagebild-sync-worker && wrangler deploy --secrets-file .env"`.
- Create root `.env.example` with all root variables (`ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENAI_API_KEY`, `PASSPORT_SIGNING_KEY`) documented with `# How to obtain:` lines.
- Update `.gitignore`: remove `.dev.vars*` and `!.dev.vars.example` lines.

**Validation:**

- `pnpm exec site-kernel run env.contract.validate --json`

**Completion criterion:** `lagebild-sync-worker` has `.env.example` + `.env` (no `.dev.vars*`); root has `.env.example`; `.gitignore` has no `.dev.vars` lines.

**Human review:** no — agent copies `.dev.vars` → `.env` automatically. Operator verifies values are intact after migration.

---

### Step 10. Update documentation (DNA-40, AGENTS.md, services/AGENTS.md, Compass XML)

**Goal:** Synchronize all documentation with the new standard.

**Agent actions:**

- Update `docs/architecture-dna.md` DNA-40 entry: replace `apps/*` with `systems/*`, `.env.production` with `.env.main`, add `.env.alt`, add `# How to obtain:` requirement, add `deploy.preflight` gate, remove `env.production.check` from enforced commands list.
- Update `AGENTS.md` (root): update env-and-deploy contract section with new file names and `deploy.preflight`.
- Update `services/AGENTS.md`: replace `.dev.vars` references with `.env`, add `deploy.preflight` requirement, update deploy script convention.
- Check `docs/requirements.xml` and `docs/technology.xml` for env-file naming references; update if found.

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0388 --json`

**Completion criterion:** DNA-40, AGENTS.md, services/AGENTS.md updated; Compass XML checked.

---

### Step 11. Final validation and evidence

**Goal:** Run all validation commands and emit evidence.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0388 --json` — must pass.
- Run `pnpm --filter @gogol/site-kernel-checks run build:check` — must pass.
- Run `pnpm --filter @gogol/site-kernel run build:check` — must pass.
- Run `pnpm exec site-kernel run env.contract.validate --json` — must pass (all `.env.example` files have `# How to obtain:`).
- Run `pnpm exec site-kernel run deploy.scripts.validate --json` — must pass.
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0388` and commit evidence file.

**Validation:**

- All commands above pass.

**Completion criterion:** All validation commands pass; evidence file committed.

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0388`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel run build:check`
- `pnpm --filter @gogol/site-kernel-onboarding run build:check`
- `pnpm exec site-kernel run env.contract.validate --json`
- `pnpm exec site-kernel run deploy.scripts.validate --json`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0388` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0388.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0388` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Operator must rename env files manually | Step 9 creates `.env.example` files; `env.local.check` / `env.alt.check` / `env.main.check` create empty files from template |
| `deploy.preflight` adds latency to deploy | Step 5 — parsing is sub-millisecond, no mitigation needed |
| Wrangler `.env` loading behavior may change | Step 7 — `wrangler.jsonc` `dev` config can be adjusted; low risk per Wrangler docs |
| Root `.env.example` may leak key names | Step 9 — only empty values and key names, same as any `.env.example` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-40, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0388 --reason "..." --invariant "DNA-40"` instead of working around it.
- If Wrangler `.env` loading fails in `wrangler dev`, check Wrangler version and `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV` env var before modifying the standard.
