---
rfcId: RFC-0617
planId: PLAN-RFC-0617-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/forge"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/forge/AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0617

## 1. Objectives

- [ ] Objective 1 — `compass.audit.baseline` accepts `--workpiece <path>` flag and scans only that directory (maps to acceptance criterion 1)
- [ ] Objective 2 — `--workpiece` is mutually exclusive with `--packages` and `--site` (maps to acceptance criterion 2)
- [ ] Objective 3 — `mission.materialize` calls `compass.audit.baseline --workpiece` after codegen and git commit (maps to acceptance criterion 3)
- [ ] Objective 4 — `release.prepare` passes `compass.audit.validate --strict` for new workpiece files without manual baseline (maps to acceptance criterion 4)
- [ ] Objective 5 — Unit test proves `--workpiece` seeds only files within the workpiece directory (maps to acceptance criterion 5)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/compass/handlers/resolve-scan-root.ts` — add `--workpiece` path resolution and mutual exclusivity checks
- `packages/forge/os/compass/handlers/compass-audit-handler.ts` — `runCompassAuditBaseline` uses updated `resolveCompassScanRoot` (no handler-level changes needed if scan-root handles it)
- `packages/forge/os/compass/compass.module.ts` — add `workpiece` flag to `compassScanFlags` (line 29) so all compass commands accept it, or add it only to `compass.audit.baseline` registration (line 147)
- `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` — add `executeKernelCommand({ commandName: "compass.audit.baseline", flags: { workpiece: workpieceDir } })` after git commit (line 980), before materialization report (line 982)

### 2.2 Configuration and data

- `docs/compass-audit-ledger.generated.yaml` — updated by the baseline call during materialization (runtime, not source)

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — note `--workpiece` flag on `compass.audit.baseline` in the OS modules table or import rules section
- `packages/os/site-kernel-handoff/AGENTS.md` — note that `mission.materialize` auto-baselines workpiece files

### 2.4 Validation and pipelines

- No pipeline changes — `build.post` and `compass.audit.validate --strict` remain unchanged
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

## 3. Step sequence

### Step 1. Add `--workpiece` flag to Compass scan-root resolution

**Goal:** Make `resolveCompassScanRoot` handle the `--workpiece <path>` flag, returning the resolved workpiece directory as the scan root.

**Agent actions:**

- In `packages/forge/os/compass/handlers/resolve-scan-root.ts`, add handling for `input.flags["workpiece"]`:
  - If `--workpiece` is set, check mutual exclusivity with `--packages` and `context.siteExplicit` (throw if either is also set)
  - Resolve the workpiece path relative to `context.workspaceRoot`
  - Verify the path exists (throw if not)
  - Return the resolved path as the scan root
- In `packages/forge/os/compass/compass.module.ts`, add `workpiece` to `compassScanFlags` (line 29) as `{ kind: "string", description: "Scan a mission workpiece directory." }` so the flag is accepted by all compass commands that spread `compassScanFlags`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check`

**Completion criterion:** `resolveCompassScanRoot` returns the `--workpiece` path when the flag is set, throws on `--workpiece` + `--packages` or `--workpiece` + `--site`, and throws on non-existent paths.

**Human review:** no

---

### Step 2. Integrate `compass.audit.baseline --workpiece` into `mission.materialize`

**Goal:** `runMissionMaterialize` automatically seeds the audit ledger for workpiece files after codegen and git commit.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts`, after the git commit block (line 980) and before the materialization report (line 982), add:
  ```ts
  // RFC-0617: Seed compass-audit ledger for workpiece files
  logger.info(`  Running compass.audit.baseline for workpiece…`);
  try {
    await executeKernelCommand({
      workspaceRoot,
      commandName: "compass.audit.baseline",
      flags: { workpiece: workpieceDir },
    });
    logger.info(`  Compass audit baseline seeded for workpiece`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.info(`  Warning: compass.audit.baseline failed: ${msg}`);
  }
  ```
- Use non-fatal error handling (warn, not throw) — a baseline failure should not block materialization. The operator can run `compass.audit.baseline --workpiece` manually.

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `runMissionMaterialize` calls `compass.audit.baseline --workpiece <workpieceDir>` after the git commit step. Baseline failures are logged as warnings, not thrown.

**Human review:** no

---

### Step 3. Unit tests

**Goal:** Prove `--workpiece` flag works correctly and `mission.materialize` invokes it.

**Agent actions:**

- In `packages/forge/os/compass/handlers/` (or `packages/forge/os/compass/` — vitest config includes `os/**/*.test.ts`), create `resolve-scan-root-workpiece.test.ts`:
  - Test: `--workpiece` returns the resolved path
  - Test: `--workpiece` + `--packages` throws
  - Test: `--workpiece` + `context.siteExplicit` throws
  - Test: non-existent `--workpiece` path throws
- In `packages/os/site-kernel-handoff/src/tests/` (vitest config includes `src/**/*.test.ts`), create or extend a mission-materialize test:
  - Mock `@warpgogol/site-kernel` `executeKernelCommand` to capture the `compass.audit.baseline` call
  - Assert `executeKernelCommand` is called with `commandName: "compass.audit.baseline"` and `flags: { workpiece: <expected path> }`
  - Follow the mock pattern from the system-retrieved memory: mock `executeKernelPipeline`, `executeKernelCommand`, `runKernelWire`, `@warpgogol/site-kernel-codegen`, `@warpgogol/site-kernel-onboarding`, `@warpgogol/site-kernel-checks`
  - Include `logger: { info: () => {} }` in test context
  - Include `i18n: { default: de, languages: [de] }` in test `system.md`
  - Add `pnpm-workspace.yaml` with `packages: []` to temp workspace

**Validation:**

- `pnpm --filter @warpgogol/forge run test`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

**Completion criterion:** All new tests pass. `--workpiece` flag tests cover mutual exclusivity and path resolution. Materialize test proves the baseline call is made.

**Human review:** no

---

### Step 4. Documentation sync

**Goal:** Update AGENTS.md files to reflect the new `--workpiece` flag and auto-baseline behavior.

**Agent actions:**

- In `packages/forge/AGENTS.md`, add a note in the OS modules table or a new subsection: `compass.audit.baseline` accepts `--workpiece <path>` flag for scoping to a mission workpiece directory (RFC-0617).
- In `packages/os/site-kernel-handoff/AGENTS.md`, add a note in the mission section: `mission.materialize` automatically runs `compass.audit.baseline --workpiece` after codegen and git commit to seed the audit ledger (RFC-0617). Baseline failures are non-fatal warnings.

**Validation:**

- `git diff` shows only the two AGENTS.md files changed

**Completion criterion:** Both AGENTS.md files mention the new `--workpiece` flag and the auto-baseline behavior with RFC-0617 reference.

**Human review:** no

---

### Step 5. Validation, review, fix, and acceptance criteria verification

**Goal:** Run all validation, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0617`
- Run `pnpm --filter @warpgogol/forge run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/forge run test`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Run code review: invoke `fo-review` via the `skill` tool on all session code changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- Check off acceptance criteria: verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria.
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0617 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0617`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All validation passes; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0617`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0617` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Performance — baseline scans workpiece directory | Step 2: workpiece is small (tens to hundreds of files), scan is < 1s |
| Ledger churn — stale entries from aborted missions | Step 2: benign, `compass.audit.validate` only checks files that still exist |
| Agent confusion — `--workpiece` scope unclear | Step 4: AGENTS.md documents the flag and its purpose |
| Baseline failure blocks materialization | Step 2: non-fatal error handling (warn, not throw) |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-43, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0617 --reason "..." --invariant "DNA-43"` instead of working around it.
