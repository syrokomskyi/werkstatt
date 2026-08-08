---
rfcId: RFC-0761
planId: PLAN-RFC-0761-01
status: draft
owner: architecture
createdAt: 2026-08-08
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-handoff"
    - "@warpgogol/site-kernel-onboarding"
  services:
    - services/cf-analytics-poller
    - services/fleet-probe-runner
  docs:
    - docs/architecture-dna.md
    - AGENTS.md
    - services/AGENTS.md
    - .env.example
---

# Implementation Plan: RFC-0761

## 1. Objectives

- [ ] O1 — Simplify `resolveConventionSecretsPath` to always return `.env` (maps to AC: `resolveConventionSecretsPath` returns `.env` for all channels)
- [ ] O2 — Remove `env.main.check` and `env.alt.check` commands (maps to AC: commands removed from command table and handlers)
- [ ] O3 — Update `deploy.preflight` to target `.env` only, remove `--env` flag (maps to AC: `deploy.preflight` no longer accepts `--env`)
- [ ] O4 — Update `deploy.scripts.validate` to check `--secrets-file .env` (maps to AC: `deploy.scripts.validate` checks `--secrets-file .env`)
- [ ] O5 — Update `mission.materialize` and `release.prepare` to use single `.env` (maps to AC: materialize creates only `.env`, release.prepare copies `.env`)
- [ ] O6 — Consolidate shared secrets in root `.env.example`, remove from site/service templates (maps to AC: root `.env.example` includes `WARPGOGOL_OTLP_*`, service `.env.example` excludes them, site `.env.example` excludes `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID`)
- [ ] O7 — Update DNA-40, AGENTS.md files, and RFC-0388 `amendedBy` (maps to AC: DNA-40 updated, root AGENTS.md updated, services/AGENTS.md updated)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — `resolveConventionSecretsPath` signature change, preflight `convention-env-exists` check
- `packages/os/site-kernel-handoff/src/release/release-commands.ts` — `release.prepare` env file copy
- `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` — step 5 env file creation, env preservation
- `packages/os/site-kernel-checks/src/env/deploy-preflight.ts` — remove `--env` flag, target always `.env`
- `packages/os/site-kernel-checks/src/env/env-contract.ts` — `deploy.scripts.validate` rules, remove `env.main.check` / `env.alt.check` handlers
- `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` — remove command table entries for `env.main.check` / `env.alt.check`
- `packages/os/site-kernel-checks/src/env/env-example.ts` — remove `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` from Cloudflare block, remove `WARPGOGOL_OTLP_*` from `HOW_TO_OBTAIN`
- `packages/os/site-kernel-onboarding/src/templates/package.template.json` — deploy scripts use `--secrets-file .env`
- `packages/os/site-kernel-onboarding/src/templates/runtime/gitignore.template` — remove `.env.main` / `.env.alt` lines

### 2.2 Configuration and data

- `.env.example` (root) — add `WARPGOGOL_OTLP_ENDPOINT` and `WARPGOGOL_OTLP_TOKEN`
- `services/cf-analytics-poller/.env.example` — remove `WARPGOGOL_OTLP_*`
- `services/fleet-probe-runner/.env.example` — remove `WARPGOGOL_OTLP_*`
- Existing `systems/*/package.json` deploy scripts — update `--secrets-file` references

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — update DNA-40 entry
- `docs/rfcs/archive/implemented/rfc-0388-*.md` — add `RFC-0761` to `amendedBy`
- `AGENTS.md` (root) — line 226, remove `.env.main`, `.env.alt`
- `services/AGENTS.md` — env-and-deploy contract section

### 2.4 Validation and pipelines

- `rfc.validate --id RFC-0761` — must pass (V-19 warning resolved after `amendedBy` update)
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Existing leitstand tests updated and passing

## 3. Step sequence

**Commit strategy:** Steps 1-3 (leitstand, materialize, deploy.preflight+validate) MUST be in one atomic commit — they are tightly coupled and no intermediate state is valid. Steps 4-5 (env templates, onboarding) can be a second commit. Step 6 (tests) can be a third commit. Step 7 (documentation) is a fourth commit. Step 8 (local FS cleanup) is not a commit (gitignored files).

### Step 1. Update `resolveConventionSecretsPath` and leitstand callers

**Goal:** Simplify secret resolution to always use `.env`.

**Agent actions:**

- In `leitstand-commands.ts`: change `resolveConventionSecretsPath(basePath: string, channel: "dev" | "alt" | "main")` to `resolveConventionSecretsPath(basePath: string)`. Always return `path.join(basePath, ".env")` if it exists.
- Update all 4 callers: `leitstand.dev-deploy` (line ~834), `leitstand.propagate` (line ~688), `leitstand.promote` (line ~2160), `leitstand.rollback` (line ~2488) — remove channel argument.
- Update preflight `convention-env-exists` check (line ~420): check for `.env` instead of `.env.alt` / `.env.main`.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes
- Existing leitstand tests updated (remove channel parameter from mocks)

**Completion criterion:** `resolveConventionSecretsPath` takes no channel parameter; all callers pass only `basePath`.

**Human review:** no

---

### Step 2. Update `mission.materialize` and `release.prepare`

**Goal:** Single `.env` file in workpieces and releases.

**Agent actions:**

- In `mission-materialize.ts` step 5: create only `.env` from `.env.example`. Remove `.env.main` / `.env.alt` creation.
- Update env preservation logic: preserve only `.env` (remove `.env.main` / `.env.alt` from `envFilesToPreserve` and `envFiles` arrays).
- In `release-commands.ts`: copy `.env` (not `.env.alt` / `.env.main`) from workpiece to release directory.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes
- Materialize tests updated and passing

**Completion criterion:** `mission.materialize` creates only `.env`; `release.prepare` copies only `.env`.

**Human review:** no

---

### Step 3. Update `deploy.preflight` and `deploy.scripts.validate` (simultaneous)

**Goal:** Deploy preflight and script validation target `.env` only.

**Agent actions:**

- In `deploy-preflight.ts`: remove `env` field from `DeployPreflightInput`. Remove `--env` flag parsing. Target is always `.env` for both sites and services.
- Add explicit `--env` guard: if `flags.env` is present, return error: `"--env flag is no longer supported. Use --secrets-file .env. See RFC-0761."` — this gives operators a clear signal instead of a cryptic unknown-flag error.
- In `env-contract.ts` `runDeployScriptsValidate`: check `deploy:main` uses `--secrets-file .env` (not `.env.main`). Check `deploy:alt` uses `--secrets-file .env` (not `.env.alt`). Update error messages and fix hints.
- Remove `env.main.check` (`runEnvMainCheck`) and `env.alt.check` (`runEnvAltCheck`) handlers from `env-contract.ts`.
- Remove `env.main.check` and `env.alt.check` entries from `infra-contracts.ts` command table.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- `deploy.preflight --env main` returns explicit error referencing RFC-0761
- `deploy.scripts.validate` accepts `--secrets-file .env`

**Completion criterion:** `deploy.preflight` has no `--env` flag; `deploy.scripts.validate` checks `--secrets-file .env`; `env.main.check` and `env.alt.check` not in command table.

**Human review:** no

---

### Step 4. Update `env.example.generate` and env templates

**Goal:** Remove shared secrets from site template; add OTLP to root.

**Agent actions:**

- In `env-example.ts`: remove `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the Cloudflare block `withHowToObtain` array. Keep `CLOUDFLARE_READONLY_API_TOKEN` and `CLOUDFLARE_ZONE_ID`.
- Remove `WARPGOGOL_OTLP_ENDPOINT` and `WARPGOGOL_OTLP_TOKEN` from `HOW_TO_OBTAIN` map.
- Update root `.env.example`: add `WARPGOGOL_OTLP_ENDPOINT` and `WARPGOGOL_OTLP_TOKEN` with `# How to obtain:` instructions.
- Update `services/cf-analytics-poller/.env.example`: remove `WARPGOGOL_OTLP_*` entries.
- Update `services/fleet-probe-runner/.env.example`: remove `WARPGOGOL_OTLP_*` entries.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes
- `env.contract.validate` passes on root and service `.env.example` files

**Completion criterion:** Site `.env.example` template excludes `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`; root `.env.example` includes `WARPGOGOL_OTLP_*`; service `.env.example` files exclude `WARPGOGOL_OTLP_*`.

**Human review:** no

---

### Step 5. Update onboarding templates

**Goal:** New sites get single `.env` deploy scripts.

**Agent actions:**

- In `package.template.json`: update `deploy:main` to `--secrets-file .env`, `deploy:alt` to `--secrets-file .env`. Remove `--env main` / `--env alt` from preflight calls.
- In `gitignore.template`: remove `.env.main` and `.env.alt` lines.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-onboarding run build:check` passes

**Completion criterion:** `package.template.json` uses `--secrets-file .env` for all deploy scripts; `gitignore.template` has no `.env.main` / `.env.alt`.

**Human review:** no

---

### Step 6. Update existing leitstand tests

**Goal:** Test suite reflects new `resolveConventionSecretsPath` signature.

**Agent actions:**

- Update all leitstand test files that mock or call `resolveConventionSecretsPath`: remove channel parameter.
- Update `convention-env-exists` preflight check assertions: expect `.env` instead of `.env.alt` / `.env.main`.
- Update materialize tests: expect only `.env` creation (no `.env.main` / `.env.alt`).
- Update release.prepare tests: expect `.env` copy (not `.env.alt` / `.env.main`).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` passes
- `pnpm --filter @warpgogol/site-kernel-checks run test` passes

**Completion criterion:** All existing tests pass with updated signatures and assertions.

**Human review:** no

---

### Step 7. Update documentation

**Goal:** DNA-40, AGENTS.md files, and RFC-0388 reflect single-file model.

**Agent actions:**

- Update `docs/architecture-dna.md` DNA-40: remove `.env.main` / `.env.alt` mandate, `env.main.check` / `env.alt.check` references. Add `WARPGOGOL_OTLP_*` to root env scope.
- Update `docs/rfcs/archive/implemented/rfc-0388-*.md` frontmatter: add `RFC-0761` to `amendedBy` array.
- Update root `AGENTS.md` line 226: remove `.env.main`, `.env.alt` from env-and-deploy contract summary.
- Update `services/AGENTS.md` env-and-deploy contract section: remove `.env.main` / `.env.alt` references, update deploy script examples to `--secrets-file .env`.

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0761` passes (V-19 warning resolved)
- `pnpm exec site-kernel run rfc.validate --id RFC-0388` passes

**Completion criterion:** DNA-40 updated; RFC-0388 `amendedBy` includes RFC-0761; root and services AGENTS.md updated.

**Human review:** no

---

### Step 8. Delete gitignored env files (local FS operation)

**Goal:** Remove dead `.env.secrets-*`, `.env.main`, `.env.alt` files from local filesystem.

**Agent actions:**

- Delete root `.env.secrets-main` and `.env.secrets-alt` (local FS, gitignored).
- Delete all `.env.main` and `.env.alt` files in workpieces and releases (local FS, gitignored).
- Note: This is a local filesystem operation, not a git commit. These files are gitignored.

**Validation:**

- `ls .env.secrets-*` returns no results
- `find . -name ".env.main" -o -name ".env.alt"` returns no results (in workpieces/releases)

**Completion criterion:** No `.env.secrets-*`, `.env.main`, or `.env.alt` files exist on local filesystem.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`.
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0761` (RFC-0330).
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0761 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0761` passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off; RFC is stamped as `implemented`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0761`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-onboarding run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- `pnpm --filter @warpgogol/site-kernel-checks run test`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0761` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0761.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0761` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Channel-specific deploy secrets no longer possible | Step 3 removes `--env` flag; risk is low (zero sites had different values) |
| Root `.env` single point of failure | Step 4 adds `WARPGOGOL_OTLP_*` to root `.env.example` with `# How to obtain:`; not a regression |
| Operators must update deploy scripts | Step 3 updates `deploy.scripts.validate` to enforce new shape; Step 5 updates template |
| `deploy.preflight` API change | Step 3 removes `--env` flag entirely (not ignored) for immediate clear failure |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-40, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0761 --reason "..." --invariant "DNA-40"` instead of working around it.
