---
rfcId: RFC-0883
planId: PLAN-RFC-0883-01
status: draft
owner: architecture
createdAt: 2026-08-19
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt
  services: []
  docs:
    - packages/werkstatt/AGENTS.md
---

# Implementation Plan: RFC-0883

## 1. Objectives

- [ ] Objective 1 — `validate.postbuild` command registered with `--mission` and `--site` flags (maps to acceptance criterion 1)
- [ ] Objective 2 — Command fails with exit code 1 if dist/ does not exist (maps to acceptance criterion 2)
- [ ] Objective 3 — Command runs all validators from `SITES_CHECK_POSTBUILD_PIPELINE` on existing dist/ (maps to acceptance criterion 3)
- [ ] Objective 4 — `--skip-slow` flag skips `mobile.layout.check`, `lighthouse.budget.check`, `qa.independent.run` (maps to acceptance criterion 4)
- [ ] Objective 5 — `--json` output format documented and stable (maps to acceptance criterion 5)
- [ ] Objective 6 — Unconditional stale dist/ warning printed (maps to acceptance criterion 6)
- [ ] Objective 7 — Unit tests cover dist/ exists, dist/ missing, --skip-slow (maps to acceptance criterion 7)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt/src/mission/validate-postbuild.ts` — new command implementation (`runValidatePostbuild`)
- `packages/werkstatt/src/mission/mission.module.ts` — command registration in the mission module registry
- `packages/werkstatt/src/mission/index.ts` — re-export `runValidatePostbuild` and `ValidatePostbuildData`

### 2.2 Configuration and data

None. The command reads existing dist/ and the site registry — no new config files.

### 2.3 Documentation and specs

- `packages/werkstatt/AGENTS.md` — add `validate.postbuild` to the mission commands section
- RFC file (read-only reference): `docs/rfcs/rfc-0883-add-post-build-only-validation-mode-for-fast-iterative-debugging.md`

### 2.4 Validation and pipelines

- No pipeline integration — `validate.postbuild` is a standalone debugging command, not part of any standard pipeline.
- `mission.validate` remains the authoritative validation command.
- `ecosystem.manifest.generate` should be run to update the command manifest with the new command.

## 3. Step sequence

### Step 1. Create TypeScript contracts and command handler

**Goal:** Implement the `validate.postbuild` command handler with all logic for dist/ resolution, step filtering, and pipeline execution.

**Agent actions:**

- Create `packages/werkstatt/src/mission/validate-postbuild.ts` with:
  - `ValidatePostbuildData` interface matching the RFC's `ValidatePostbuildResult` shape
  - `runValidatePostbuild(input, context)` function that:
    1. Reads `--mission` or `--site` flag from `input.flags`
    2. Resolves the workpiece path: if `--mission`, use `readMissionManifest` + `resolveMissionDir` (same as `mission.validate`); if `--site`, use site discovery via `ensureTargetSites`
    3. Checks `dist/` exists (matching `sites-check.postbuild`'s existing guard pattern at `@/packages/werkstatt-site/src/checks/module.ts:328` — checks `dist/`, not `dist/client/`). If missing, return exit code 1 with error message.
    4. Resolves the site registry and retrieves `SITES_CHECK_POSTBUILD_PIPELINE` steps via `registry.getPipeline("sites-check.postbuild")`
    5. If `--skip-slow` flag is set, filter out `mobile.layout.check`, `lighthouse.budget.check`, `qa.independent.run` from the step list
    6. Print unconditional stale dist/ warning: "dist/ may be stale — run mission.validate for a full check."
    7. Execute the (filtered) steps using the kernel pipeline execution mechanism. For `--mission`, pass `siteWorkspace` to bypass discovery (same pattern as `release.prepare` at `@/packages/werkstatt/src/release/release-commands.ts:354`). For `--site`, pass `siteName` directly.
    8. Collect per-step results (name, status, durationMs) and return `ValidatePostbuildData`
- Re-export from `packages/werkstatt/src/mission/index.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compiles

**Completion criterion:** `validate-postbuild.ts` exists, exports `runValidatePostbuild` and `ValidatePostbuildData`, and `build:check` passes.

**Human review:** no

---

### Step 2. Register command in mission module

**Goal:** Register `validate.postbuild` in the kernel command registry so it is discoverable via `pnpm exec werkstatt run validate.postbuild`.

**Agent actions:**

- In `packages/werkstatt/src/mission/mission.module.ts`, add a `registry.registerCommand` entry:
  - `name: "validate.postbuild"`
  - `description: "Run post-build validators on existing dist/ without a full rebuild (RFC-0883)."`
  - `scope: "workspace"`
  - `supportsAllSites: false`
  - `flags: { mission: { kind: "string", description: "Mission id." }, site: { kind: "string", description: "Site id." }, "skip-slow": { kind: "boolean", description: "Skip slow Playwright/Lighthouse steps." } }`
  - `reads: ["missions/{mission}/**", "apps/{site}/**"]`
  - `cacheable: false`
  - `execute: runValidatePostbuild`
- Import `runValidatePostbuild` from `./validate-postbuild.ts`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compiles
- `pnpm exec werkstatt run validate.postbuild --help` (or `--json` with no args) — command appears in registry

**Completion criterion:** `validate.postbuild` is registered and discoverable in the command manifest.

**Human review:** no

---

### Step 3. Write unit tests

**Goal:** Cover the three core scenarios from the acceptance criteria.

**Agent actions:**

- Create `packages/werkstatt/src/mission/validate-postbuild.test.ts` with:
  - **Test: dist/ exists → run validators** — set up a temp directory with a fake `dist/` and a minimal site registry stub that returns `SITES_CHECK_POSTBUILD_PIPELINE` steps. Verify the command runs all steps and returns `status: "pass"`.
  - **Test: dist/ missing → error** — point the command at a directory without `dist/`. Verify exit code 1 and error message "No dist/ found — run mission.validate first to build the site."
  - **Test: --skip-slow → slow steps skipped** — run with `--skip-slow` flag. Verify `mobile.layout.check`, `lighthouse.budget.check`, `qa.independent.run` are not in the step results.
  - **Test: --mission resolves workpiece** — verify `--mission` flag resolves the workpiece path via `readMissionManifest`.
  - **Test: stale dist/ warning printed** — verify the warning message is always printed.

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run test` — all tests pass

**Completion criterion:** All 5 test cases pass.

**Human review:** no

---

### Step 4. Update documentation

**Goal:** Update `AGENTS.md` to document the new command.

**Agent actions:**

- Update `packages/werkstatt/AGENTS.md` — add `validate.postbuild` to the mission commands section with a brief description and usage example
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` to update the command manifest

**Validation:**

- `git diff packages/werkstatt/AGENTS.md` shows the new command entry
- `docs/ecosystem.generated.yaml` includes `validate.postbuild` in the command list

**Completion criterion:** `AGENTS.md` updated, ecosystem manifest regenerated.

**Human review:** no

---

### Step 5. Validate and run acceptance checks

**Goal:** Run all validation commands to verify the implementation is complete.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0883`
- Run `pnpm --filter @warpgogol/werkstatt run build:check`
- Run `pnpm --filter @warpgogol/werkstatt run test`
- Check off acceptance criteria in the RFC file

**Validation:**

- `rfc.validate` passes
- `build:check` passes
- All tests pass

**Completion criterion:** All validation commands pass, acceptance criteria checked off.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/werkstatt/AGENTS.md` is updated with the new command
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0883 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0883`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with inline evidence; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0883`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt run test`

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0883.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0883` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| False confidence — developers skip `mission.validate` | Step 4: AGENTS.md documents that `validate.postbuild` is a debugging tool, not a deployment gate; stale dist/ warning is unconditional (Step 1) |
| Stale dist/ — validators pass/fail incorrectly | Step 1: unconditional warning printed on every run; no programmatic staleness detection (documented in RFC) |
| Maintenance burden | Step 1: command reuses existing `SITES_CHECK_POSTBUILD_PIPELINE` and `executeKernelPipeline` — no new pipeline definitions |

## 6. Escalation triggers

- If implementation reveals that `executeKernelPipeline` cannot filter individual steps for `--skip-slow`, consider resolving steps from the registry and running them via `executeKernelCommand` individually instead of changing `executeKernelPipeline`'s API.
- If the dist/ path is `dist/` (not `dist/client/` as the RFC says), use `dist/` to match the existing `sites-check.postbuild` guard pattern. The RFC's `dist/client/` reference is a minor inaccuracy — the validators read from `dist/` which contains both `client/` and `server/` subdirectories.
