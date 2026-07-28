---
rfcId: RFC-0571
planId: PLAN-RFC-0571-01
status: draft
owner: architecture
createdAt: 2026-07-28
updatedAt:
scope:
  apps: []
  packages:
    - site-kernel-onboarding
    - site-kernel-checks
  services: []
  docs:
    - docs/rfcs/rfc-0569-dev-prod-egress-parity-apply-text-normalization-in-dev-mode-via-astro-middleware.md
    - packages/os/site-kernel-onboarding/AGENTS.md
---

# Implementation Plan: RFC-0571

## 1. Objectives

- [ ] Objective 1 — `config.regenerate` uses `requireAstroSitePaths` instead of hardcoded `apps/` path — maps to acceptance criterion 1
- [ ] Objective 2 — `config.regenerate` is the first step in `SITES_BUILD_PREPARE_PIPELINE` — maps to acceptance criterion 2
- [ ] Objective 3 — `build.prepare` on a mission workpiece regenerates root config files — maps to acceptance criterion 3
- [ ] Objective 4 — `config.regenerate --site <id>` succeeds on mission workpieces — maps to acceptance criterion 4
- [ ] Objective 5 — RFC-0569 acceptance criterion updated — maps to acceptance criterion 5
- [ ] Objective 6 — Both impacted packages pass `build:check` — maps to acceptance criteria 6 and 7

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-onboarding/src/config-regenerate.ts` — path resolution change + error message updates
- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — add `config.regenerate` as first pipeline step

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0569-dev-prod-egress-parity-apply-text-normalization-in-dev-mode-via-astro-middleware.md` — acceptance criterion already updated in enhance step (verify)
- `packages/os/site-kernel-onboarding/AGENTS.md` — update `config.regenerate` description if it claims `apps/`-only scope

### 2.4 Validation and pipelines

- `SITES_BUILD_PREPARE_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — `config.regenerate` added as first step

## 3. Step sequence

### Step 1. Fix `config.regenerate` path resolution

**Goal:** Replace hardcoded `join(context.workspaceRoot, "apps", app)` with `requireAstroSitePaths(context).appDirectory` and update error messages.

**Agent actions:**

- Add `import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";` to the imports in `config-regenerate.ts`
- Replace `const appDir = join(context.workspaceRoot, "apps", app);` with `const { appDirectory: appDir } = requireAstroSitePaths(context);`
- Update error message at line 128: `"config.regenerate: unable to read apps/" + app + "/src/content/system.md"` → `"config.regenerate: unable to read " + appDir + "/src/content/system.md"`
- Remove the `pathExists(appDir)` check and its error return (lines 115-121) — `requireAstroSitePaths` throws if `context.site` is null, and if `context.site` is set, the directory was discovered and exists. The `pathExists` check is dead code after the change.
- Remove the now-unused `pathExists` function (lines 41-48) and the `access` import from `node:fs/promises` (only `mkdir` remains from that import)
- Update the `CHANGE_SUMMARY` block in the file header with `RFC-0571: use requireAstroSitePaths for mission-aware path resolution.`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-onboarding build:check` passes
- `pnpm exec site-kernel run config.regenerate --site warpgogol-com --json` succeeds (no `"apps/<id> does not exist"` error)

**Completion criterion:** `config.regenerate` resolves site directory via `requireAstroSitePaths` and error messages reference the resolved path, not `apps/`.

**Human review:** no

---

### Step 2. Add `config.regenerate` to `SITES_BUILD_PREPARE_PIPELINE`

**Goal:** Insert `config.regenerate` as the first step in the `build.prepare` pipeline so root config files are regenerated from templates on every run.

**Agent actions:**

- Open `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`
- Add `{ command: "config.regenerate" }` as the first element of `SITES_BUILD_PREPARE_PIPELINE`, before `workpiece.imports.validate`
- Add a comment: `// RFC-0571: regenerate root config files from templates before any validation or codegen`
- Update the `CHANGE_SUMMARY` block with `RFC-0571: added config.regenerate as first step.`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks build:check` passes
- `pnpm exec site-kernel run build.prepare --site warpgogol-com --json` succeeds and `config.regenerate` appears in the pipeline output

**Completion criterion:** `config.regenerate` is the first step in `SITES_BUILD_PREPARE_PIPELINE` and `build.prepare` regenerates root config files.

**Human review:** no

---

### Step 3. Update `packages/os/site-kernel-onboarding/AGENTS.md`

**Goal:** Update the `config.regenerate` description in the AGENTS.md if it claims `apps/`-only scope.

**Agent actions:**

- Read `packages/os/site-kernel-onboarding/AGENTS.md`
- Check if the `config.regenerate` description says "only allowed to write to `apps/<site>`" or similar `apps/`-specific language
- If so, update to reflect mission-aware path resolution via `requireAstroSitePaths`

**Validation:**

- Visual inspection — no `apps/`-only claims remain

**Completion criterion:** AGENTS.md description for `config.regenerate` is consistent with mission-aware path resolution.

**Human review:** no

---

### Step 4. Verify on existing mission workpiece

**Goal:** Confirm that `build.prepare` on the existing `warpgogol-com` mission workpiece propagates template updates to root config files.

**Agent actions:**

- Run `pnpm exec site-kernel run build.prepare --site warpgogol-com --json` and verify `config.regenerate` appears in the pipeline output with `generated` or `skipped` files
- Check that `missions/warpgogol-com-m000016/workpiece/astro.config.mjs` matches the template (smartypants setting present)
- Check that `missions/warpgogol-com-m000016/workpiece/package.json` matches the template

**Validation:**

- `build.prepare` exits 0
- `config.regenerate` output shows files generated or skipped (not an error)

**Completion criterion:** `build.prepare` on a mission workpiece regenerates root config files from templates.

**Human review:** no

---

### Step 5. Verify RFC-0569 acceptance criterion

**Goal:** Confirm that RFC-0569's acceptance criterion about `config.regenerate` has been updated (done in enhance step).

**Agent actions:**

- Read the `config.regenerate` acceptance criterion in `docs/rfcs/rfc-0569-dev-prod-egress-parity-apply-text-normalization-in-dev-mode-via-astro-middleware.md`
- Verify it says `config.regenerate reaches mission workpiece paths via requireAstroSitePaths` (not `cannot reach`)

**Validation:**

- Visual inspection — the criterion text is updated

**Completion criterion:** RFC-0569 acceptance criterion reflects the new state.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Update affected `AGENTS.md` files (root, `packages/os/site-kernel-onboarding/`) with the `config.regenerate` path resolution change.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0571 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0571`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0571`
- `pnpm --filter @warpgogol/site-kernel-onboarding build:check`
- `pnpm --filter @warpgogol/site-kernel-checks build:check`
- `pnpm exec site-kernel run build.prepare --site warpgogol-com --json` (integration verification)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0571` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Double generation during materialization | Step 2: `config.regenerate` is idempotent — same templates, same content, GENERATED marker protocol. The second write is a no-op. |
| Customized files not updated | Step 1: GENERATED marker protocol preserved — customized files are skipped, `--force` overrides. |
| Agent confusion about `config.regenerate` scope | Step 3: AGENTS.md updated to clarify `config.regenerate` handles 5 root config files only. |
| `postcss.config.cjs` has no GENERATED marker | Step 1: behavior unchanged — always overwritten. Documented in RFC. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-44 or DNA-47, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0571 --reason "..." --invariant "DNA-N"` instead of working around it.
