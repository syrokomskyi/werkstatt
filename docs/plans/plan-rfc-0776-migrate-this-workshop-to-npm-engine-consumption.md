---
rfcId: RFC-0776
planId: PLAN-RFC-0776-01
status: draft
owner: architecture
createdAt: 2026-08-09
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
    - packages/werkstatt-site
    - packages/os/*
    - packages/fingerprint
    - packages/agent-gate
    - packages/ui
    - packages/pbp
    - packages/ontology
    - packages/tokens
    - packages/share
    - packages/growth
    - packages/growth-adapter-matomo
    - packages/growth-adapter-null
    - packages/growth-adapter-plausible
    - packages/integration
    - packages/integration-adapter-stripe
    - packages/integration-adapter-supabase-crm
    - packages/chat
    - packages/chat-adapter-null
    - packages/chat-adapter-uchat
    - packages/surface
    - packages/geo
    - packages/faq
    - packages/passport
    - packages/content-source
    - packages/studio-gate
    - packages/check-core
    - packages/check-runner-node
    - packages/observability
    - packages/nebula
    - packages/star-map
    - packages/warpgogol-skills
  services:
    - services/cf-analytics-poller
    - services/check-warpgogol-runner
    - services/fleet-probe-runner
    - services/lagebild-sync-worker
  docs:
    - AGENTS.md
    - packages/AGENTS.md
    - packages/os/AGENTS.md
    - services/AGENTS.md
    - docs/PACKAGE_GRAPH.md
    - docs/COMMANDS.md
    - docs/requirements.xml
    - docs/technology.xml
    - docs/development-plan.xml
    - docs/knowledge-graph.xml
    - docs/verification-plan.xml
    - docs/source-markup.xml
---

# Implementation Plan: RFC-0776

## 1. Objectives

- [ ] O1 — Rewrite `tools/kernel.config.ts` to import from `@warpgogol/werkstatt` and `@warpgogol/werkstatt-site` (acceptance criterion 1)
- [ ] O2 — Sweep all import specifiers across `packages/**`, `services/**`, and `missions/archive/closed/*/workpiece/` from old `@warpgogol/*` to new `@warpgogol/werkstatt*` specifiers (acceptance criterion 2)
- [ ] O3 — Delete all old package directories after sweep and tests green (acceptance criterion 6)
- [ ] O4 — Update `pnpm-workspace.yaml` and `forge.yaml` bindings (acceptance criterion 7)
- [ ] O5 — Retire `site-kernel` CLI name across hooks, CI, docs (acceptance criterion 8)
- [ ] O6 — Verify full mission and release lifecycle green on warpgogol-com (acceptance criteria 3, 4)
- [ ] O7 — Verify `werkstatt.autonomy.validate` and `werkstatt.plugin.validate` pass (acceptance criterion 5)

## 2. Affected artifacts

### 2.1 Code and commands

- `tools/kernel.config.ts` — rewrite: replace ~30 `moduleLoaders` entries with engine + plugin imports
- `packages/**/*.ts` — import specifier rewrite (mechanical sweep)
- `packages/**/*.astro` — import specifier rewrite
- `packages/**/*.css` — no changes expected (CSS doesn't import `@warpgogol/*`)
- `services/**/*.ts` — import specifier rewrite
- `missions/archive/closed/*/workpiece/**/*.ts` — import specifier rewrite
- `hooks/pre-commit` — `site-kernel run` → `werkstatt run` (2 references: lines 20, 165)
- `.github/workflows/*.yml` — `site-kernel run` → `werkstatt run` (ci.yml, rfc-governance.yml, commit-message-lint.yml, cache-parity.yml, generated-edit-guard.yml, scaffold-smoke.yml, changelog.yml)
- `forge.yaml` — binding command rewrites, `skillPacks` dir update
- `pnpm-workspace.yaml` — remove old package globs, add `packages/werkstatt` and `packages/werkstatt-site`

### 2.2 Configuration and data

- `forge.yaml` bindings — `validateRfc`, `validateAdr`, `implementStamp`, `specValidate`, `sessionSave`, `manifestGenerate` commands rewritten to `werkstatt run`
- `forge.yaml` `skillPacks` — dir path updated to `packages/werkstatt-site/src/domain/skills/skills`
- `.forge/pinned.yaml` — no changes (already lists `forge.yaml` and `pnpm-workspace.yaml` as protect)

### 2.3 Documentation and specs

- `AGENTS.md` (root) — update `packages/os/*` references to `packages/werkstatt` and `packages/werkstatt-site`
- `packages/AGENTS.md` — update package boundary references
- `packages/os/AGENTS.md` — update or delete (os packages are deleted)
- `services/AGENTS.md` — update `@warpgogol/site-kernel*` import references
- `docs/PACKAGE_GRAPH.md` — regenerate after package deletion
- `docs/COMMANDS.md` — update CLI name references from `site-kernel` to `werkstatt`
- `docs/requirements.xml` — scan for `site-kernel` and old package specifiers, update
- `docs/technology.xml` — scan for `site-kernel` and old package specifiers, update
- `docs/development-plan.xml` — scan for old package paths, update
- `docs/knowledge-graph.xml` — update package relationship graph
- `docs/verification-plan.xml` — scan for `site-kernel run` references, update
- `docs/source-markup.xml` — scan for old package paths, update

### 2.4 Validation and pipelines

- `imports.validate` — verifies zero old specifiers remain
- `pnpm -r run build:check` — workspace-wide typecheck
- `pnpm test` — full test suite
- `werkstatt.autonomy.validate` — engine autonomy guard
- `werkstatt.plugin.validate` — plugin contract validation
- Mission lifecycle: `mission.open → materialize → validate → dev-deploy` on warpgogol-com
- Release lifecycle: `release.prepare → ready → propagate → promote` on a test release

## 3. Step sequence

### Step 1. Verify prerequisites and close all missions

**Goal:** Ensure all upstream RFCs are accepted/implemented and no open missions block the migration.

**Agent actions:**

- Verify RFC-0769, RFC-0772, RFC-0774, RFC-0775 are all `accepted` or `implemented`
- Verify DNA-64 exists in `docs/architecture-dna.md`
- Run `pnpm exec werkstatt run mission.list --json` and verify zero open missions
- If any missions are open, ask the operator to close them before proceeding

**Validation:**

- `git log --oneline` shows upstream RFC commits
- `mission.list` output shows zero open missions

**Completion criterion:** All upstream RFCs accepted/implemented; DNA-64 in registry; zero open missions.

**Human review:** yes — operator must confirm all missions are closed and upstream RFCs are ready.

---

### Step 2. Rewrite `tools/kernel.config.ts`

**Goal:** Replace the ~30 `moduleLoaders` entries with imports from `@warpgogol/werkstatt` and `@warpgogol/werkstatt-site`.

**Agent actions:**

- Create a temporary `site-kernel` bin alias in `packages/werkstatt` (construction scaffold, removed in Step 6)
- Rewrite `tools/kernel.config.ts` per RFC §1:
  - Import `defineKernelConfig` from `@warpgogol/werkstatt/types`
  - Import `werkstattSitePlugin` from `@warpgogol/werkstatt-site`
  - Import `PACKAGES_CHECK_PIPELINE` from `@warpgogol/werkstatt-site/checks`
  - Add `plugins: [werkstattSitePlugin]` to the config
  - Remove all `moduleLoaders` entries that point at `@warpgogol/site-kernel*` or old domain packages
  - Keep forge module loaders (forge is a separate npm package, unchanged)
- Run `pnpm exec werkstatt run command.manifest.generate` to regenerate the command manifest

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` (if package exists)
- `pnpm --filter @warpgogol/werkstatt-site run build:check` (if package exists)

**Completion criterion:** `tools/kernel.config.ts` imports only from `@warpgogol/werkstatt`, `@warpgogol/werkstatt-site`, and `@warpgogol/forge`. No `@warpgogol/site-kernel*` or old domain package specifiers.

**Human review:** no

---

### Step 3. Sweep import specifiers across `packages/**` and `services/**`

**Goal:** Mechanically rewrite all import specifiers from old `@warpgogol/*` to new `@warpgogol/werkstatt*` specifiers.

**Agent actions:**

- Use the mapping table in RFC §2 to rewrite all import specifiers in:
  - `packages/**/*.ts`
  - `packages/**/*.astro`
  - `services/**/*.ts`
- Commit frequently (per-directory or per-package) to keep revert granularity fine
- Run `pnpm -r run build:check` after each major directory sweep to catch breakages early

**Validation:**

- `imports.validate` green (zero old specifiers in `packages/**` and `services/**`)
- `pnpm -r run build:check` green

**Completion criterion:** Zero `@warpgogol/site-kernel*` or old domain package specifiers in `packages/**` and `services/**`. Typecheck passes.

**Human review:** no

---

### Step 4. Sweep import specifiers in archived mission workpieces

**Goal:** Rewrite import specifiers in `missions/archive/closed/*/workpiece/`.

**Agent actions:**

- Apply the same mapping table to `missions/archive/closed/*/workpiece/**/*.ts`
- Run typecheck on affected workpieces if possible

**Validation:**

- `imports.validate` green (zero old specifiers in `missions/archive/closed/*/workpiece/`)

**Completion criterion:** Zero old specifiers in archived mission workpieces.

**Human review:** no

---

### Step 5. Update `pnpm-workspace.yaml` and `forge.yaml`

**Goal:** Update workspace configuration and forge bindings to reflect the new package structure and CLI name.

**Agent actions:**

- Update `pnpm-workspace.yaml`:
  - Remove `packages/os/*` glob
  - Add `packages/werkstatt` and `packages/werkstatt-site` (already in `packages/*` glob, but verify)
- Update `forge.yaml` bindings per RFC §5 table:
  - `validateRfc`: `site-kernel run` → `werkstatt run`
  - `validateAdr`: `site-kernel run` → `werkstatt run`
  - `implementStamp`: `site-kernel run` → `werkstatt run`
  - `specValidate`: `site-kernel run` → `werkstatt run`
  - `sessionSave`: `site-kernel run` → `werkstatt run`
  - `manifestGenerate`: `site-kernel run` → `werkstatt run`
  - `skillPacks` dir: `packages/warpgogol-skills/skills` → `packages/werkstatt-site/src/domain/skills/skills`
- Use `--allow-pinned-override forge.yaml` and `--allow-pinned-override pnpm-workspace.yaml` when committing (both are pinned in `.forge/pinned.yaml`)
- Run `pnpm install` to update the lockfile

**Validation:**

- `pnpm install` succeeds
- `forge.yaml` bindings resolve correctly

**Completion criterion:** `pnpm-workspace.yaml` and `forge.yaml` updated; `pnpm install` succeeds.

**Human review:** no

---

### Step 6. Retire `site-kernel` CLI name in hooks, CI, and docs

**Goal:** Replace all `site-kernel run` references with `werkstatt run` in hooks, CI workflows, and documentation.

**Agent actions:**

- Update `hooks/pre-commit` (2 references: lines 20, 165)
- Update `.github/workflows/ci.yml` (multiple references)
- Update `.github/workflows/rfc-governance.yml` (references + path trigger `packages/os/site-kernel*/**`)
- Update `.github/workflows/commit-message-lint.yml`
- Update `.github/workflows/cache-parity.yml`
- Update `.github/workflows/generated-edit-guard.yml`
- Update `.github/workflows/scaffold-smoke.yml` (references + path triggers)
- Update `.github/workflows/changelog.yml`
- Update `docs/COMMANDS.md` — CLI name references
- Remove the temporary `site-kernel` bin alias from `packages/werkstatt` (if it was created during implementation)

**Validation:**

- `grep -r "site-kernel" hooks/ .github/ docs/COMMANDS.md` returns zero results (excluding `.git/` and this RFC/plan/audit files)

**Completion criterion:** Zero `site-kernel` references in hooks, CI workflows, and docs (excluding `docs/rfcs/`, `docs/audits/`, `docs/plans/`).

**Human review:** no

---

### Step 7. Delete old package directories

**Goal:** Remove all old package directories after the sweep is complete and tests pass.

**Agent actions:**

- Verify `imports.validate` is green
- Verify `pnpm -r run build:check` is green
- Verify `pnpm test` is green
- Delete `packages/os/*` (all subdirectories) and the `packages/os/` directory itself
- Delete `packages/fingerprint`, `packages/agent-gate`
- Delete all old domain packages: `packages/ui`, `packages/pbp`, `packages/ontology`, `packages/tokens`, `packages/share`, `packages/growth`, `packages/growth-adapter-*`, `packages/integration`, `packages/integration-adapter-*`, `packages/chat`, `packages/chat-adapter-*`, `packages/surface`, `packages/geo`, `packages/faq`, `packages/passport`, `packages/content-source`, `packages/studio-gate`, `packages/check-core`, `packages/check-runner-node`, `packages/observability`, `packages/nebula`, `packages/star-map`, `packages/warpgogol-skills`
- Run `pnpm install` to update the lockfile
- Run `pnpm -r run build:check` again after deletion

**Validation:**

- `ls packages/os/` returns "No such file or directory"
- `pnpm install` succeeds
- `pnpm -r run build:check` green

**Completion criterion:** All old package directories deleted; lockfile updated; typecheck still green.

**Human review:** no

---

### Step 8. Update AGENTS.md files

**Goal:** Update all `AGENTS.md` files that reference old package names.

**Agent actions:**

- Update root `AGENTS.md`:
  - "Monorepo layout" section: replace `packages/os/*` references with `packages/werkstatt` and `packages/werkstatt-site`
  - DNA-36, DNA-44, DNA-46–53 sections: update package path references
  - "External mirror sync" section: update if it references old package names
- Update `packages/AGENTS.md`: update package boundary references
- Delete `packages/os/AGENTS.md` (os packages are deleted)
- Update `services/AGENTS.md`: update `@warpgogol/site-kernel*` import references

**Validation:**

- `grep -r "site-kernel" AGENTS.md packages/AGENTS.md services/AGENTS.md` returns zero results (excluding historical/DNA references that describe the old state)

**Completion criterion:** All `AGENTS.md` files updated; no stale `@warpgogol/site-kernel*` references.

**Human review:** no

---

### Step 9. Update Compass XML and package graph

**Goal:** Synchronize Compass documents and package graph with the new package structure.

**Agent actions:**

- Scan each Compass XML file for `site-kernel` and old package specifiers:
  - `docs/requirements.xml`
  - `docs/technology.xml`
  - `docs/development-plan.xml`
  - `docs/knowledge-graph.xml`
  - `docs/verification-plan.xml`
  - `docs/source-markup.xml`
- Update each file with new package names and CLI references
- Regenerate `docs/PACKAGE_GRAPH.md` after package deletion
- Run `pnpm exec werkstatt run command.manifest.generate` (or `werkstatt run`) to regenerate the command manifest

**Validation:**

- `grep -r "site-kernel" docs/*.xml docs/PACKAGE_GRAPH.md docs/COMMANDS.md` returns zero results (excluding `docs/rfcs/`, `docs/audits/`, `docs/plans/`)

**Completion criterion:** All Compass XML files and package graph updated; command manifest regenerated.

**Human review:** no

---

### Step 10. Run full validation suite

**Goal:** Verify all execution gates from the RFC pass.

**Agent actions:**

- Run `imports.validate` — zero old specifiers
- Run `pnpm -r run build:check` — typecheck green
- Run `pnpm test` — all package tests green
- Run `werkstatt.autonomy.validate` — engine autonomy guard green
- Run `werkstatt.plugin.validate` — plugin contract validation green
- Run `werkstatt --version` — CLI works
- Verify `site-kernel` alias is removed

**Validation:**

- All commands exit 0

**Completion criterion:** All execution gates from RFC §Design pass.

**Human review:** no

---

### Step 11. Verify mission and release lifecycle

**Goal:** Prove the full mission and release lifecycle works end-to-end on warpgogol-com.

**Agent actions:**

- Run `mission.open` on warpgogol-com
- Run `mission.materialize` on the workpiece
- Run `mission.validate` on the workpiece
- Run `leitstand.dev-deploy` to dev channel
- Run `release.prepare` on the validated mission
- Run `release.ready` on the prepared release
- Run `leitstand.propagate` to alt channel
- Run `leitstand.promote` to main channel
- Close the mission after verification

**Validation:**

- All lifecycle commands exit 0
- Dev deployment accessible and Axiom gate green
- Release artifact stored and hash-verified

**Completion criterion:** Full mission lifecycle (open → materialize → validate → dev-deploy) and release lifecycle (prepare → ready → propagate → promote) green on warpgogol-com.

**Human review:** yes — operator should monitor the dev-deploy and release steps.

---

### Step 12. Fix test fixtures

**Goal:** Repair any test fixtures that reference old package names in temp workspaces.

**Agent actions:**

- Run `pnpm test` and identify failures related to old package names
- Fix fixture paths in test files (temp workspaces referencing `@warpgogol/site-kernel*`)
- Re-run `pnpm test` until green

**Validation:**

- `pnpm test` green

**Completion criterion:** All tests pass with no old package name references in fixtures.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run command.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0776 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0776`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0776`
- `pnpm -r run build:check`
- `pnpm test`
- `imports.validate` (zero old specifiers)
- `werkstatt.autonomy.validate`
- `werkstatt.plugin.validate`
- Mission lifecycle on warpgogol-com (open → materialize → validate → dev-deploy)
- Release lifecycle on warpgogol-com (prepare → ready → propagate → promote)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0776` in the subject line (RFC-0265 commit hygiene)
- Mission and release lifecycle evidence (Bordbuch entries, Axiom evidence)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Workpiece import breakage | Step 4 sweeps archived workpieces; Step 1 ensures no open missions |
| Service import breakage | Step 3 sweeps `services/**` |
| Hook and CI references | Step 6 rewrites all hooks and CI workflows |
| Test fixture paths | Step 12 fixes fixture paths after deletion |
| Partial migration failure | Rollback via `git revert` of commit sequence; commit frequently during sweep (Step 3) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0776 --reason "..." --invariant "DNA-N"` instead of working around it.
- If upstream RFCs (0769, 0772, 0774, 0775) are not yet accepted, block implementation until they are.
- If DNA-64 is not yet in `docs/architecture-dna.md`, block implementation until RFC-0769 is implemented.
