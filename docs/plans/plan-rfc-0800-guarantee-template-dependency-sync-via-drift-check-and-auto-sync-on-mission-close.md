---
rfcId: RFC-0800
planId: PLAN-RFC-0800-01
status: draft
owner: architecture
createdAt: 2026-08-10
updatedAt:
scope:
  apps: []
  packages:
    - packages/werkstatt-site
    - packages/werkstatt
  services: []
  docs:
    - AGENTS.md
    - packages/werkstatt-site/AGENTS.md
    - packages/werkstatt/AGENTS.md
---

# Implementation Plan: RFC-0800

## 1. Objectives

- [ ] O1 — Create `template.deps.drift` check command that compares `dependencies` and `devDependencies` between workpiece `package.json` and `package.template.json` (maps to acceptance criteria 1, 3, 4)
- [ ] O2 — Integrate `template.deps.drift` into `SITES_BUILD_CHECK_PIPELINE` (maps to acceptance criterion 2)
- [ ] O3 — Add `--skip-template-sync` flag to `mission.close` and auto-call `config.template.sync --site <id>` before final cache clone commits (maps to acceptance criteria 5, 6, 7)
- [ ] O4 — Fix `config.template.sync` module declaration: rename `app` flag to `site` in `module.ts` (maps to RFC `commands.changed` entry)
- [ ] O5 — Update `AGENTS.md` files with template dependency sync behavior (maps to acceptance criteria 8, 9)
- [ ] O6 — Register `TEMPLATE-DEPS-DRIFT-01` and `TEMPLATE-DEPS-DRIFT-02` rule IDs in diagnostics rules registry

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/werkstatt-site/src/checks/template-deps-drift.ts` — **new** check command implementation
- `packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts` — register `template.deps.drift` command entry
- `packages/werkstatt-site/src/checks/pipelines/build-check.ts` — add `template.deps.drift` to `SITES_BUILD_CHECK_PIPELINE`
- `packages/werkstatt-site/src/checks/diagnostics/rules/governance.ts` — register `TEMPLATE-DEPS-DRIFT-01`, `TEMPLATE-DEPS-DRIFT-02`
- `packages/werkstatt-site/src/onboarding/module.ts` — rename `app` flag to `site` in `config.template.sync` declaration (line 298)
- `packages/werkstatt/src/mission/mission-close.ts` — add `--skip-template-sync` flag, auto-call `config.template.sync` via `executeKernelCommand`
- `packages/werkstatt/src/mission/index.ts` — add `skip-template-sync` flag to `mission.close` command registration (line 106-127)

### 2.2 Configuration and data

- `packages/werkstatt-site/src/onboarding/templates/package.template.json` — read by drift check (no changes to the file itself)

### 2.3 Documentation and specs

- `AGENTS.md` (root) — document `--skip-template-sync` flag alongside `--skip-auto-sync` and `--skip-evidence-sync`
- `packages/werkstatt-site/AGENTS.md` — document `template.deps.drift` check in checks section
- `packages/werkstatt/AGENTS.md` — document auto-sync behavior in mission git helpers section

### 2.4 Validation and pipelines

- `SITES_BUILD_CHECK_PIPELINE` — add `template.deps.drift` step
- `diagnostic.shape.lint` — will validate the new rule IDs are registered (DSL-02)

## 3. Step sequence

### Step 1. Register diagnostic rule IDs

**Goal:** Register `TEMPLATE-DEPS-DRIFT-01` and `TEMPLATE-DEPS-DRIFT-02` in the governance rules file so `diagnostic.shape.lint` (DSL-02) passes.

**Agent actions:**

- Add two entries to `GOVERNANCE_RULES` in `packages/werkstatt-site/src/checks/diagnostics/rules/governance.ts`:
  - `TEMPLATE-DEPS-DRIFT-01`: "Dependency version mismatch between workpiece and template", command: `template.deps.drift`
  - `TEMPLATE-DEPS-DRIFT-02`: "Template or workpiece package.json missing", command: `template.deps.drift`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `grep -c "TEMPLATE-DEPS-DRIFT" packages/werkstatt-site/src/checks/diagnostics/rules/governance.ts` — returns 2

**Completion criterion:** Both rule IDs are registered and TypeScript compiles.

**Human review:** no

---

### Step 2. Implement `template.deps.drift` check command

**Goal:** Create the drift check handler that compares `dependencies` and `devDependencies` between workpiece `package.json` and `package.template.json`.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/template-deps-drift.ts`:
  - Import `diagnosticsResult` from `./result-helpers.ts`
  - Import `TEMPLATES_DIR` from `../onboarding/templates.ts`
  - Define `TemplateDepsDriftData` interface extending `CheckResult` with `site`, `templatePath`, `workpiecePath`, `depsCompared`, `drift[]`
  - Implement `runTemplateDepsDrift(input, context)`:
    - Resolve `--site` flag or `context.site?.name`
    - Resolve workpiece path: find current mission for the site, or use `missions/<latest>/workpiece/package.json`
    - Read `package.template.json` from `TEMPLATES_DIR`
    - Read workpiece `package.json`
    - If either file missing: emit `TEMPLATE-DEPS-DRIFT-02` error, exit 1
    - Iterate `dependencies` and `devDependencies` keys in both files
    - For each key: compare version strings. Mismatch → `TEMPLATE-DEPS-DRIFT-01` error with package name, section, workpiece version, template version, fixHint: `Run: pnpm exec werkstatt run config.template.sync --site <site>`
    - Packages present in one but not the other → `TEMPLATE-DEPS-DRIFT-01` error
    - Return `diagnosticsResult` with data
  - Add `MODULE_CONTRACT` header with purpose, non-goals, change summary

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- File exists at `packages/werkstatt-site/src/checks/template-deps-drift.ts`

**Completion criterion:** Check handler compiles, exports `runTemplateDepsDrift`, emits `TEMPLATE-DEPS-DRIFT-01` for version mismatches and `TEMPLATE-DEPS-DRIFT-02` for missing files.

**Human review:** no

---

### Step 3. Register `template.deps.drift` in command table and pipeline

**Goal:** Wire the new check into the command table and `SITES_BUILD_CHECK_PIPELINE`.

**Agent actions:**

- In `packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts`:
  - Import `runTemplateDepsDrift` from `../template-deps-drift.ts`
  - Add command entry after `workpiece.imports.validate`:
    - `name: "template.deps.drift"`
    - `description: "Compare dependency versions between workpiece package.json and package.template.json (RFC-0800)."`
    - `scope: "app"`
    - `flags: { site: { kind: "string", description: "Site id to resolve workpiece." } }`
    - `reads: ["packages/werkstatt-site/src/onboarding/templates/package.template.json", "missions/*/workpiece/package.json"]`
    - `execute: runTemplateDepsDrift`
- In `packages/werkstatt-site/src/checks/pipelines/build-check.ts`:
  - Add `{ command: "template.deps.drift" }` after `content.regression.check` (last step, line 46)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `grep "template.deps.drift" packages/werkstatt-site/src/checks/command-tables/20-ecosystem.ts` — found
- `grep "template.deps.drift" packages/werkstatt-site/src/checks/pipelines/build-check.ts` — found

**Completion criterion:** Command registered in table, pipeline step added, TypeScript compiles.

**Human review:** no

---

### Step 4. Fix `config.template.sync` module declaration

**Goal:** Rename the `app` flag to `site` in the `config.template.sync` command registration to match the actual handler behavior.

**Agent actions:**

- In `packages/werkstatt-site/src/onboarding/module.ts` (line 298):
  - Change `app: { kind: "string", description: "Reference app name to sync template values from." }` to `site: { kind: "string", description: "Reference site name to sync template values from." }`
  - Update `writes` paths from `packages/os/site-kernel-onboarding/src/templates/...` to `packages/werkstatt-site/src/onboarding/templates/...` (fix stale metadata)
  - Update `reads` from `systems/<app>/package.json` to `systems/<site>/package.json`

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run build:check` — TypeScript compiles
- `grep "\"site\"" packages/werkstatt-site/src/onboarding/module.ts | grep -i "sync"` — found

**Completion criterion:** Module declaration uses `site` flag, paths updated to current package layout.

**Human review:** no

---

### Step 5. Add `--skip-template-sync` flag and auto-sync to `mission.close`

**Goal:** Modify `mission.close` to auto-call `config.template.sync --site <id>` **before inline validate** so the drift check passes, with `--skip-template-sync` escape hatch.

**Agent actions:**

- In `packages/werkstatt/src/mission/mission-close.ts`:
  - Add `const skipTemplateSync = flagBoolean(input, "skip-template-sync");` after line 180
  - Add `CloseReportTemplateSync` interface: `{ synced: boolean; syncError: string | null }`
  - Add `templateSync` field to `CloseReport` interface
  - Add `templateSync` to `closeReport` initialization: `{ synced: false, syncError: null }`
  - Insert auto-sync block **before inline validate** (before line 204, after the reconciledAt check at line 199):
    ```ts
    // RFC-0800: Auto-sync template dependencies from cache clone to template.
    // Placed BEFORE inline validate so the drift check (in SITES_BUILD_CHECK_PIPELINE)
    // passes after the template is synced. If sync fails (non-fatal), the drift
    // check catches the residual drift and blocks close — safety net working as
    // intended. The template file is committed later via commitWerkstattSideEffects.
    if (!skipTemplateSync) {
      try {
        const { executeKernelCommand } = await import("@warpgogol/werkstatt/kernel");
        logger.info(`  Auto-syncing template dependencies from workpiece…`);
        const syncResult = (await executeKernelCommand({
          workspaceRoot,
          commandName: "config.template.sync",
          argv: [`--site=${manifest.systemId}`],
        })) as { exitCode?: number; summary?: string };
        const syncExitCode = syncResult.exitCode ?? 0;
        if (syncExitCode !== 0) {
          const syncError = syncResult.summary ?? `config.template.sync exited with code ${syncExitCode}`;
          logger.warn(`  Template sync failed (non-fatal): ${syncError}`);
          closeReport.templateSync.synced = false;
          closeReport.templateSync.syncError = syncError;
        } else {
          closeReport.templateSync.synced = true;
          closeReport.templateSync.syncError = null;
          logger.info(`  Template dependencies synced`);
        }
      } catch (syncErr) {
        logger.warn(
          `  Template sync threw (non-fatal): ${syncErr instanceof Error ? syncErr.message : String(syncErr)}`,
        );
        closeReport.templateSync.synced = false;
        closeReport.templateSync.syncError = syncErr instanceof Error ? syncErr.message : String(syncErr);
      }
    }
    ```
  - Add CHANGE_SUMMARY entry: `RFC-0800: add --skip-template-sync flag and auto-call config.template.sync before inline validate.`
  - In the `commitWerkstattSideEffects` call at line 583, add the template path to the file list:
    ```ts
    await commitWerkstattSideEffects(
      workspaceRoot,
      [
        path.join("missions", missionId, "mission.yaml"),
        "packages/werkstatt-site/src/onboarding/templates/package.template.json",
      ],
      `werkstatt: mission.close ${missionId}`,
    );
    ```
- In `packages/werkstatt/src/mission/index.ts` (line 127):
  - Add flag after `skip-content-regression`:
    ```ts
    "skip-template-sync": {
      kind: "boolean",
      description: "Skip auto-sync of template dependencies from workpiece (escape hatch, RFC-0800).",
    },
    ```

**Validation:**

- `pnpm --filter @warpgogol/werkstatt run build:check` — TypeScript compiles
- `grep "skip-template-sync" packages/werkstatt/src/mission/mission-close.ts` — found
- `grep "skip-template-sync" packages/werkstatt/src/mission/index.ts` — found
- `grep "config.template.sync" packages/werkstatt/src/mission/mission-close.ts` — found

**Completion criterion:** `mission.close` has `--skip-template-sync` flag, auto-calls `config.template.sync` before inline validate, template path added to `commitWerkstattSideEffects`, failure is non-fatal (drift check is safety net).

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Write unit tests for `template.deps.drift` and `mission.close` auto-sync behavior.

**Agent actions:**

- Create `packages/werkstatt-site/src/checks/template-deps-drift.test.ts`:
  - Test 1: mismatched dep versions → `TEMPLATE-DEPS-DRIFT-01` error, exit 1
  - Test 2: identical deps → zero drift, exit 0
  - Test 3: package present in workpiece but not template → `TEMPLATE-DEPS-DRIFT-01` error
  - Test 4: template or workpiece missing → `TEMPLATE-DEPS-DRIFT-02` error, exit 1
  - Test 5: `devDependencies` mismatch → error with `section: "devDependencies"`
- Add tests to `packages/werkstatt/src/tests-handoff/rfc-0797-eliminate-manual-git-interventions.test.ts` (or a new `rfc-0800-template-deps-auto-sync.test.ts`):
  - Test 1: `mission.close` calls `executeKernelCommand` with `config.template.sync` and `--site=<systemId>` BEFORE inline validate
  - Test 2: `--skip-template-sync` flag → `executeKernelCommand` not called with `config.template.sync`
  - Test 3: `config.template.sync` failure → `logger.warn`, `closeReport.templateSync.synced === false`; inline validate may block close (drift check safety net)

**Validation:**

- `pnpm --filter @warpgogol/werkstatt-site run test -- --reporter=verbose template-deps-drift` — all tests pass
- `pnpm --filter @warpgogol/werkstatt run test -- --reporter=verbose rfc-0800` — all tests pass

**Completion criterion:** All tests pass, covering drift detection (pass/fail), missing files, auto-sync call, skip flag, and non-fatal failure.

**Human review:** no

---

### Step 7. Update AGENTS.md files

**Goal:** Document the new check command and auto-sync behavior in AGENTS.md files.

**Agent actions:**

- In root `AGENTS.md`:
  - Add `--skip-template-sync` to the mission.close flag documentation alongside `--skip-auto-sync` and `--skip-evidence-sync`
  - Add a note in the onboarding/template section: "Template dependencies are auto-synced on mission close (RFC-0800). The `template.deps.drift` check in `SITES_BUILD_CHECK_PIPELINE` catches any residual drift."
- In `packages/werkstatt-site/AGENTS.md`:
  - Add `template.deps.drift` to the checks section: "RFC-0800: compares dependency versions between workpiece `package.json` and `package.template.json`."
- In `packages/werkstatt/AGENTS.md`:
  - Add to mission git helpers section: "RFC-0800: `mission.close` auto-calls `config.template.sync --site <id>` before final cache clone commits. Non-fatal — `--skip-template-sync` disables. The `template.deps.drift` check is the safety net."

**Validation:**

- `grep "skip-template-sync" AGENTS.md` — found
- `grep "template.deps.drift" packages/werkstatt-site/AGENTS.md` — found
- `grep "config.template.sync" packages/werkstatt/AGENTS.md` — found

**Completion criterion:** All three AGENTS.md files document the new behavior.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (new command `template.deps.drift` added).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0800 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0800`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test -- template-deps-drift`
- `pnpm --filter @warpgogol/werkstatt run test -- rfc-0800`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0800`
- `pnpm --filter @warpgogol/werkstatt-site run build:check`
- `pnpm --filter @warpgogol/werkstatt run build:check`
- `pnpm --filter @warpgogol/werkstatt-site run test -- template-deps-drift`
- `pnpm --filter @warpgogol/werkstatt run test -- rfc-0800`
- `pnpm exec werkstatt run diagnostic.shape.lint` — verifies new rule IDs are registered (DSL-02)

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0800` in the subject line (RFC-0265 commit hygiene)
- `docs/reviews/code/` — code review report for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives from temporary debug dependencies | Step 5: auto-sync runs before inline validate, propagating workpiece deps to template; `--skip-template-sync` for temporary deps |
| Auto-sync unreachable when drift exists (close blocked by inline validate) | Step 5: auto-sync placed BEFORE inline validate (line 204); if sync succeeds, drift check passes; if sync fails, drift check blocks close (safety net) |
| Auto-sync failure in mission.close | Step 5: non-fatal `logger.warn`, `closeReport.templateSync.synced = false`; drift check (Step 2-3) is the safety net |
| Auto-sync committing unwanted changes | Step 5: template is version-controlled; commit visible in git history and revertible |
| Agent confusion about mission.close modifying packages/werkstatt-site/ | Step 7: AGENTS.md documents the behavior and `--skip-template-sync` flag |
| Multiple sites — last close wins | Accepted per RFC nonGoals: all sites share the same template by convention |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0800 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `config.template.sync` cannot be called from `mission.close` via `executeKernelCommand` (e.g. package boundary violation), split into a pure function + thin kernel handler (RFC-0647 pattern) instead of calling the kernel handler with synthetic context.

## 7. Plan deviations from RFC text

- **Auto-sync placement**: RFC line 154 says "auto-sync call before final commits" and line 189 says "the mission is already closing". The plan places auto-sync **before inline validate** (not just before final commits), which means a sync failure can still block close (via the drift check in inline validate). This is safer than the RFC's implied behavior — the drift check safety net fires immediately rather than on the next mission. The auto-sync itself remains non-fatal (`logger.warn`); it is the drift check that blocks close, which is the intended safety-net behavior. The RFC's acceptance criterion ("calls config.template.sync before final cache clone commits") is still satisfied — the auto-sync IS before the final commits.
