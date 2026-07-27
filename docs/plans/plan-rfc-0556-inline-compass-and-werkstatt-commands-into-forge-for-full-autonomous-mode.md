---
rfcId: RFC-0556
planId: PLAN-RFC-0556-01
status: draft
owner: architecture
createdAt: 2026-07-27
updatedAt:
scope:
  apps: []
  packages:
    - forge
    - site-kernel
    - site-kernel-checks
    - site-kernel-handoff
  services: []
  docs:
    - packages/forge/AGENTS.md
    - packages/AGENTS.md
    - AGENTS.md
---

# Implementation Plan: RFC-0556

## 1. Objectives

- [ ] Objective 1 — Inline compass command handlers into `packages/forge/os/compass/handlers/` (maps to acceptance criterion: "All 11 compass and werkstatt command handlers exist in...")
- [ ] Objective 2 — Inline werkstatt command handlers into `packages/forge/os/werkstatt/handlers/` (maps to same acceptance criterion)
- [ ] Objective 3 — Remove dynamic `@warpgogol/*` imports and try/catch skip pattern from `compass.module.ts`, `werkstatt.module.ts`, and `bin/cli.ts` (maps to: "forgeCompassModule and forgeWerkstattModule import from handlers/ without try/catch" and "bin/cli.ts loads without .catch")
- [ ] Objective 4 — Add `writeFileIfChanged` and `getRevisionByPath` utilities to forge (maps to: "writeFileIfChanged utility exists" and "getRevisionByPath works with git-history-only fallback")
- [ ] Objective 5 — Convert `site-kernel-checks` and `site-kernel-handoff` to delegation wrappers (maps to: "site-kernel-checks delegates" and "site-kernel-handoff delegates")
- [ ] Objective 6 — Update `port-validate.ts`, AGENTS.md files, and verify with `build:check` + `forge doctor` (maps to: "port-validate.ts updated", "AGENTS.md updated", "build:check passes", "forge doctor passes")

## 2. Affected artifacts

### 2.1 Code and commands

**New files in `packages/forge/`:**

- `packages/forge/src/utils/fs-idempotent.ts` — `writeFileIfChanged` (canonical implementation, moved from `site-kernel/src/fs-idempotent.ts`)
- `packages/forge/os/compass/handlers/compass-inventory.ts` — `createCompassInventoryEntries` (canonical implementation, moved from `site-kernel/src/compass-inventory.ts`)
- `packages/forge/os/compass/handlers/resolve-scan-root.ts` — `resolveCompassScanRoot` (canonical implementation, moved from `site-kernel/src/resolve-compass-scan-root.ts`)
- `packages/forge/os/compass/handlers/compass.ts` — `runCompassInventory`, `runCompassValidation` (from `site-kernel-checks/src/compass.ts`)
- `packages/forge/os/compass/handlers/compass-audit.ts` — `runCompassAuditPlan`, `runCompassAuditRecord`, `runCompassAuditBaseline`, `runCompassAuditValidate` (from `site-kernel-checks/src/compass-audit.ts`)
- `packages/forge/os/compass/handlers/compass-change-summary.ts` — `runCompassChangeSummaryValidate`, `runCompassSummaryTrim` (from `site-kernel-checks/src/compass-change-summary.ts`)
- `packages/forge/os/compass/handlers/git-revision.ts` — `getRevisionByPath` (from `site-kernel-integrity/src/compass-audit-helpers.ts` + `git.ts`)
- `packages/forge/os/werkstatt/handlers/lock.ts` — `acquireLock`, `releaseLock`, `heartbeatLock`, `readAllLocks`, `isLockStale`, `removeStaleLock` (from `site-kernel-handoff/src/werkstatt/lock.ts`)
- `packages/forge/os/werkstatt/handlers/werkstatt-lock-status.ts` — `runWerkstattLockStatus` (from `site-kernel-handoff/src/werkstatt/werkstatt-lock-status.ts`)
- `packages/forge/os/werkstatt/handlers/werkstatt-lock-recover.ts` — `runWerkstattLockRecover` (from `site-kernel-handoff/src/werkstatt/werkstatt-lock-recover.ts`)
- `packages/forge/os/werkstatt/handlers/werkstatt-operation-validate.ts` — `runWerkstattOperationValidate` (from `site-kernel-checks/src/werkstatt-operation-validate.ts`)
- `packages/forge/os/werkstatt/handlers/schema.ts` — `werkstattLockSchema`, `werkstattOperationRecordSchema`, `WerkstattLock`, `WerkstattOperationRecord` (inlined from `ontology/src/operations/werkstatt.ts`)

**Changed files in `packages/forge/`:**

- `packages/forge/os/compass/compass.module.ts` — remove try/catch, import from `./handlers/`
- `packages/forge/os/werkstatt/werkstatt.module.ts` — remove try/catch, import from `./handlers/`
- `packages/forge/bin/cli.ts` — remove `.catch(() => null)` for compass and werkstatt module imports
- `packages/forge/src/validators/port-validate.ts` — adjust `FORBIDDEN_IMPORTS` for os/compass and os/werkstatt
- `packages/forge/src/utils/index.ts` — add `writeFileIfChanged` export

**Changed files in `packages/os/site-kernel/` (re-exports from forge):**

- `packages/os/site-kernel/src/compass-inventory.ts` — becomes thin re-export from `@webgogol/forge/os/compass/handlers/compass-inventory`
- `packages/os/site-kernel/src/resolve-compass-scan-root.ts` — becomes thin re-export from `@webgogol/forge/os/compass/handlers/resolve-scan-root`
- `packages/os/site-kernel/src/fs-idempotent.ts` — becomes thin re-export from `@webgogol/forge/src/utils/fs-idempotent`
- `packages/os/site-kernel/src/index.ts` — update re-exports (no change to public API surface)

**Changed files in `packages/os/site-kernel-checks/` (delegation wrappers):**

- `packages/os/site-kernel-checks/src/compass.ts` — delegate to `@webgogol/forge`
- `packages/os/site-kernel-checks/src/compass-audit.ts` — delegate to `@webgogol/forge`
- `packages/os/site-kernel-checks/src/compass-change-summary.ts` — delegate to `@webgogol/forge`
- `packages/os/site-kernel-checks/src/werkstatt-operation-validate.ts` — delegate to `@webgogol/forge`
- `packages/os/site-kernel-checks/src/index.ts` — update re-exports

**Changed files in `packages/os/site-kernel-handoff/` (delegation wrappers):**

- `packages/os/site-kernel-handoff/src/werkstatt/lock.ts` — delegate to `@webgogol/forge`
- `packages/os/site-kernel-handoff/src/werkstatt/werkstatt-lock-status.ts` — delegate to `@webgogol/forge`
- `packages/os/site-kernel-handoff/src/werkstatt/werkstatt-lock-recover.ts` — delegate to `@webgogol/forge`
- `packages/os/site-kernel-handoff/src/werkstatt/index.ts` — update re-exports

**Test files moved from `site-kernel-checks` to `forge`:**

- `packages/os/site-kernel-checks/src/tests/compass-audit-isauditdue.test.ts` → `packages/forge/os/compass/tests/compass-audit-isauditdue.test.ts`
- `packages/os/site-kernel-checks/src/tests/compass-audit-record.test.ts` → `packages/forge/os/compass/tests/compass-audit-record.test.ts`
- `packages/os/site-kernel-checks/src/tests/compass-audit-validate.test.ts` → `packages/forge/os/compass/tests/compass-audit-validate.test.ts`
- `packages/os/site-kernel-checks/src/tests/helpers.ts` → `packages/forge/os/compass/tests/helpers.ts` (if needed by the test files)
- New edge-case tests: `packages/forge/os/compass/tests/git-revision-fallback.test.ts` (git unavailable, empty workspace), `packages/forge/os/werkstatt/tests/lock-edge-cases.test.ts` (no locks dir, corrupt lock file, stale lock cleanup)

### 2.2 Configuration and data

No configuration or data file changes. No YAML/JSON manifests, no ontology catalogs, no system.md changes.

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — update Architecture section: remove "graceful skip" language; update OS modules table description for compass and werkstatt
- `packages/AGENTS.md` — update forge ownership entry: `os/` is no longer "kernel-dependent" for compass and werkstatt
- Root `AGENTS.md` — update forge import rules section: `os/compass/` and `os/werkstatt/` no longer need the `@warpgogol/*` dynamic import exception
- RFC file (read-only reference): `docs/rfcs/rfc-0556-inline-compass-and-werkstatt-commands-into-forge-for-full-autonomous-mode.md`

### 2.4 Validation and pipelines

- `pnpm --filter @webgogol/forge run build:check` — must pass after all forge changes
- `pnpm --filter @warpgogol/site-kernel run build:check` — must pass after re-export conversion
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — must pass after delegation conversion
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — must pass after delegation conversion
- `pnpm exec forge doctor` — must pass with no autonomy guard failures
- `pnpm exec site-kernel run rfc.validate --id RFC-0556` — must pass

## 3. Step sequence

### Step 1. Inline shared utilities into forge (canonical implementation)

**Goal:** Move `writeFileIfChanged` to forge as the canonical implementation. `site-kernel` re-exports from forge.

**Agent actions:**

- Create `packages/forge/src/utils/fs-idempotent.ts` — move logic from `packages/os/site-kernel/src/fs-idempotent.ts`. Use `writeFileAtomic` from `./fs-atomic.ts` (already in forge). Return type: `Promise<"written" | "unchanged">`.
- Add `export { writeFileIfChanged } from "./fs-idempotent.ts"` to `packages/forge/src/utils/index.ts`.
- Convert `packages/os/site-kernel/src/fs-idempotent.ts` to a thin re-export: `export { writeFileIfChanged } from "@webgogol/forge/src/utils/fs-idempotent";`
- Verify `packages/os/site-kernel/package.json` already has `@webgogol/forge` as a dependency (confirmed: it does).

**Validation:**

- `pnpm --filter @webgogol/forge run build:check` passes.
- `pnpm --filter @warpgogol/site-kernel run build:check` passes.

**Completion criterion:** `writeFileIfChanged` canonical implementation exists in `packages/forge/src/utils/fs-idempotent.ts`. `site-kernel` re-exports it. Both packages compile.

**Human review:** no

---

### Step 2. Move compass inventory and scan-root to forge (canonical implementation)

**Goal:** Move `createCompassInventoryEntries` and `resolveCompassScanRoot` to forge as canonical implementations. `site-kernel` re-exports from forge.

**Agent actions:**

- Create `packages/forge/os/compass/handlers/compass-inventory.ts` — move logic from `packages/os/site-kernel/src/compass-inventory.ts` (522 lines). Replace `import { hasGeneratedMarker } from "./generated-marker.ts"` with `import { hasGeneratedMarker } from "../../../src/utils/generated-marker.ts"`. Replace `import type { KernelCommandInput } from "./types.ts"` with `import type { ForgeCommandInput } from "../../../src/types.ts"`.
- Create `packages/forge/os/compass/handlers/resolve-scan-root.ts` — move logic from `packages/os/site-kernel/src/resolve-compass-scan-root.ts` (73 lines). Adapt `KernelCommandInput` → `ForgeCommandInput`, `KernelRuntimeContext` → `ForgeRuntimeContext`. The `context.site` and `context.siteExplicit` fields already exist on `ForgeRuntimeContext` — no behavioral change needed.
- Convert `packages/os/site-kernel/src/compass-inventory.ts` to a thin re-export: `export { createCompassInventoryEntries, type CompassInventoryEntry } from "@webgogol/forge/os/compass/handlers/compass-inventory";`
- Convert `packages/os/site-kernel/src/resolve-compass-scan-root.ts` to a thin re-export: `export { resolveCompassScanRoot } from "@webgogol/forge/os/compass/handlers/resolve-scan-root";`
- Verify `packages/os/site-kernel/src/index.ts` re-exports still work (they re-export from the local files, which now re-export from forge).

**Validation:**

- `pnpm --filter @webgogol/forge run build:check` passes.
- `pnpm --filter @warpgogol/site-kernel run build:check` passes.
- `pnpm --filter @warpgogol/site-kernel-codegen run build:check` passes (it re-exports `resolveCompassScanRoot` from `site-kernel`, which now re-exports from forge).

**Completion criterion:** Both files exist in forge and compile without `@warpgogol/*` imports. `site-kernel` re-exports them. All three packages compile.

**Human review:** no

---

### Step 3. Inline compass command handlers

**Goal:** Add all 8 compass command implementations to forge.

**Agent actions:**

- Create `packages/forge/os/compass/handlers/compass.ts` — copy `runCompassInventory` and `runCompassValidation` from `packages/os/site-kernel-checks/src/compass.ts`. Replace imports: `resolveCompassScanRoot`, `createCompassInventoryEntries`, `writeFileIfChanged` → import from forge utils/handlers. `KernelCommandInput`/`KernelRuntimeContext`/`KernelCommandResult` → `ForgeCommandInput`/`ForgeRuntimeContext`/`ForgeCommandResult`.
- Create `packages/forge/os/compass/handlers/compass-audit.ts` — copy all 4 audit handlers from `packages/os/site-kernel-checks/src/compass-audit.ts` (382 lines). Replace `getRevisionByPath` import from `@warpgogol/site-kernel-integrity` with import from `./git-revision.ts`. Replace `writeFileAtomic`/`buildGeneratedHeader` imports with forge utils. Use `yaml` package (already a forge dependency).
- Create `packages/forge/os/compass/handlers/compass-change-summary.ts` — copy from `packages/os/site-kernel-checks/src/compass-change-summary.ts` (286 lines). Replace imports same pattern.
- Create `packages/forge/os/compass/handlers/git-revision.ts` — inline `getRevisionByPath` from `site-kernel-integrity/src/compass-audit-helpers.ts` + `getFileRevisionFromHistory` from `site-kernel-integrity/src/git.ts`. Drop the integrity-registry path (`loadPathsCurrent`/`loadEntitiesById`). Use `git log --follow --diff-filter=AMT --format=%H -- <file>` and count lines. Return `revision=1` on any git error. Include `contentHash` computation using `node:crypto` `createHash`.

**Validation:**

- `pnpm --filter @webgogol/forge run build:check` passes.

**Completion criterion:** All 8 compass handler functions exist in `packages/forge/os/compass/handlers/` and compile without `@warpgogol/*` imports.

**Human review:** no

---

### Step 4. Inline werkstatt command handlers

**Goal:** Add all 3 werkstatt command implementations to forge.

**Agent actions:**

- Create `packages/forge/os/werkstatt/handlers/schema.ts` — inline `werkstattLockSchema` and `werkstattOperationRecordSchema` from `packages/ontology/src/operations/werkstatt.ts`. Use `zod` (already a forge dependency). Export `WerkstattLock` and `WerkstattOperationRecord` types.
- Create `packages/forge/os/werkstatt/handlers/lock.ts` — copy from `packages/os/site-kernel-handoff/src/werkstatt/lock.ts` (145 lines). Replace `werkstattLockSchema` import from `@warpgogol/ontology/operations` with import from `./schema.ts`.
- Create `packages/forge/os/werkstatt/handlers/werkstatt-lock-status.ts` — copy from `site-kernel-handoff/src/werkstatt/werkstatt-lock-status.ts`. Adapt types.
- Create `packages/forge/os/werkstatt/handlers/werkstatt-lock-recover.ts` — copy from `site-kernel-handoff/src/werkstatt/werkstatt-lock-recover.ts` (174 lines). Adapt types. Import lock helpers from `./lock.ts`.
- Create `packages/forge/os/werkstatt/handlers/werkstatt-operation-validate.ts` — copy from `site-kernel-checks/src/werkstatt-operation-validate.ts` (105 lines). Replace `context.io.readFile(filePath)` with `import { readFile } from "node:fs/promises"` — `ForgeRuntimeContext` has no `io` field. Replace `collectFiles` from `@warpgogol/share/fs` with `collectFiles` from `../../../src/utils/fs.ts` (already inlined in forge).

**Validation:**

- `pnpm --filter @webgogol/forge run build:check` passes.

**Completion criterion:** All 3 werkstatt handler functions + lock helpers + schema exist in `packages/forge/os/werkstatt/handlers/` and compile without `@warpgogol/*` imports.

**Human review:** no

---

### Step 5. Update compass and werkstatt module registrations

**Goal:** Remove try/catch dynamic imports from module files; import from handlers/ directly.

**Agent actions:**

- Edit `packages/forge/os/compass/compass.module.ts`:
  - Remove the `try/catch` block that dynamically imports `@warpgogol/site-kernel-checks`.
  - Add static imports: `import { runCompassInventory, runCompassValidation } from "./handlers/compass.ts"` etc. for all 8 handlers.
  - Remove the `ForgeExecute` type alias and `checks` variable.
- Edit `packages/forge/os/werkstatt/werkstatt.module.ts`:
  - Remove the `try/catch` blocks that dynamically import `@warpgogol/site-kernel-handoff` and `@warpgogol/site-kernel-checks`.
  - Add static imports from `./handlers/`.
- Edit `packages/forge/bin/cli.ts`:
  - Remove `.catch(() => null)` from the compass and werkstatt module imports. Change to direct `import` statements or `await import(...).then((m) => m.forgeCompassModule)` without catch.

**Validation:**

- `pnpm --filter @webgogol/forge run build:check` passes.
- `grep -r "@warpgogol/" packages/forge/os/compass/ packages/forge/os/werkstatt/ packages/forge/bin/cli.ts` returns no matches (excluding comments).

**Completion criterion:** `compass.module.ts` and `werkstatt.module.ts` have no try/catch or dynamic `@warpgogol/*` imports. `cli.ts` has no `.catch(() => null)` for compass/werkstatt.

**Human review:** no

---

### Step 6. Update port-validate.ts forbidden imports

**Goal:** Adjust the `FORBIDDEN_IMPORTS` list to allow os/compass and os/werkstatt to exist without triggering autonomy guard failures.

**Agent actions:**

- Edit `packages/forge/src/validators/port-validate.ts`:
  - Remove `"@warpgogol/site-kernel-checks"` and `"@warpgogol/site-kernel-handoff"` from `FORBIDDEN_IMPORTS` — these are no longer imported by any forge file after inlining.
  - Keep `"@warpgogol/site-kernel"`, `"@warpgogol/ui"`, `"@warpgogol/share/page"` in the list.

**Validation:**

- `pnpm --filter @webgogol/forge run build:check` passes.
- `pnpm exec forge doctor` passes with no autonomy guard failures.

**Completion criterion:** `FORBIDDEN_IMPORTS` no longer includes `@warpgogol/site-kernel-checks` or `@warpgogol/site-kernel-handoff`.

**Human review:** no

---

### Step 7. Convert site-kernel-checks to delegation wrappers and move tests to forge

**Goal:** Replace compass and werkstatt-operation-validate implementations in `site-kernel-checks` with re-exports from `@webgogol/forge`. Move all compass/werkstatt test files to forge.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/compass.ts` — replace the file body with: `export { runCompassInventory, runCompassValidation } from "@webgogol/forge/os/compass/handlers/compass";`
- Edit `packages/os/site-kernel-checks/src/compass-audit.ts` — replace with: `export { runCompassAuditPlan, runCompassAuditRecord, runCompassAuditBaseline, runCompassAuditValidate } from "@webgogol/forge/os/compass/handlers/compass-audit";`
- Edit `packages/os/site-kernel-checks/src/compass-change-summary.ts` — replace with re-exports from `@webgogol/forge/os/compass/handlers/compass-change-summary`.
- Edit `packages/os/site-kernel-checks/src/werkstatt-operation-validate.ts` — replace with: `export { runWerkstattOperationValidate } from "@webgogol/forge/os/werkstatt/handlers/werkstatt-operation-validate";`
- Edit `packages/os/site-kernel-checks/src/index.ts` — update re-exports. `createCompassInventoryEntries` re-export now comes from forge (via `site-kernel` re-export chain).
- Ensure `packages/os/site-kernel-checks/package.json` has `@webgogol/forge` as a dependency (add if missing).
- Move test files from `packages/os/site-kernel-checks/src/tests/` to `packages/forge/os/compass/tests/`:
  - `compass-audit-isauditdue.test.ts`
  - `compass-audit-record.test.ts`
  - `compass-audit-validate.test.ts`
  - `helpers.ts` (test context helper, if needed by the moved tests)
- Adapt moved test imports: `from "../compass-audit.ts"` → `from "../handlers/compass-audit.ts"`, `from "@warpgogol/site-kernel"` → `from "../../../src/types.ts"` (for types).
- Delete the original test files from `site-kernel-checks/src/tests/`.

**Validation:**

- `pnpm --filter @webgogol/forge run test` — moved tests pass.
- `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes.
- `pnpm --filter @warpgogol/site-kernel-checks run test` — remaining tests (non-compass) still pass.

**Completion criterion:** `site-kernel-checks/src/compass*.ts` and `werkstatt-operation-validate.ts` are thin re-export wrappers. All compass test files moved to forge and passing. `build:check` passes on both packages.

**Human review:** no

---

### Step 8. Convert site-kernel-handoff werkstatt to delegation wrappers

**Goal:** Replace werkstatt lock implementations in `site-kernel-handoff` with re-exports from `@webgogol/forge`.

**Agent actions:**

- Edit `packages/os/site-kernel-handoff/src/werkstatt/lock.ts` — replace with: `export { acquireLock, releaseLock, heartbeatLock, readAllLocks, isLockStale, removeStaleLock, HEARTBEAT_INTERVAL_MS, DEFAULT_TIMEOUT_SECONDS } from "@webgogol/forge/os/werkstatt/handlers/lock";`
- Edit `packages/os/site-kernel-handoff/src/werkstatt/werkstatt-lock-status.ts` — replace with re-export from forge.
- Edit `packages/os/site-kernel-handoff/src/werkstatt/werkstatt-lock-recover.ts` — replace with re-export from forge.
- Edit `packages/os/site-kernel-handoff/src/werkstatt/index.ts` — update re-exports if needed.
- Ensure `packages/os/site-kernel-handoff/package.json` has `@webgogol/forge` as a dependency (add if missing).
- Keep `operation.ts` and `atomic.ts` in `site-kernel-handoff` — they are not part of this RFC (not inlined into forge).

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes.
- Existing tests still pass.

**Completion criterion:** `site-kernel-handoff/src/werkstatt/lock*.ts` are thin re-export wrappers. `build:check` passes.

**Human review:** no

---

### Step 9. Update documentation

**Goal:** Update all AGENTS.md files to reflect the new architecture.

**Agent actions:**

- Edit `packages/forge/AGENTS.md`:
  - Architecture section: change `os/` description from "kernel-optional" to "kernel-optional. `os/compass/` and `os/werkstatt/` are fully autonomous (inlined handlers, no `@warpgogol/*` imports). Other `os/` modules may still dynamically import kernel packages."
  - Remove "graceful skip" language from the Architecture section.
  - Import rules section: update to note that `os/compass/` and `os/werkstatt/` no longer use dynamic `@warpgogol/*` imports.
- Edit `packages/AGENTS.md`:
  - Update forge ownership table entry: change "`src/` is portable (no kernel imports); `os/` is kernel-dependent" to "`src/` is portable (no kernel imports); `os/` is kernel-optional. `os/compass/` and `os/werkstatt/` are fully autonomous."
- Edit root `AGENTS.md`:
  - Update the forge import rules section (if present) to reflect that `os/compass/` and `os/werkstatt/` no longer need the `@warpgogol/*` dynamic import exception.

**Validation:**

- `grep -r "graceful skip" packages/forge/AGENTS.md` returns no matches.
- `grep -r "kernel-dependent" packages/AGENTS.md` returns no matches for the forge row.

**Completion criterion:** All three AGENTS.md files updated. No "graceful skip" or "kernel-dependent" language remains for compass/werkstatt.

**Human review:** no

---

### Step 11. Add edge-case tests in forge

**Goal:** Add new edge-case tests for autonomous-mode behavior that wasn't covered in kernel-packages.

**Agent actions:**

- Create `packages/forge/os/compass/tests/git-revision-fallback.test.ts` — test `getRevisionByPath` when git is unavailable (mock `execFile` to throw), when the file has no git history, when the file doesn't exist. Verify `revision=1` is returned in all fallback cases.
- Create `packages/forge/os/werkstatt/tests/lock-edge-cases.test.ts` — test `readAllLocks` when `.werkstatt/locks/` doesn't exist (returns empty array), when a lock file is corrupt JSON (skipped), when a lock is stale (pid not alive), when `removeStaleLock` is called on a non-stale lock (returns false).
- Create `packages/forge/os/compass/tests/empty-workspace.test.ts` — test `compass.inventory` and `compass.validate` on a workspace with no `apps/`, `packages/`, or `services/` directories (should produce empty inventory, zero failures).

**Validation:**

- `pnpm --filter @webgogol/forge run test` — all new tests pass.

**Completion criterion:** All new edge-case test files exist and pass.

**Human review:** no

---

### Step 12. Final validation and review

**Goal:** Run all validation checks, code review, fix findings, and verify acceptance criteria.

**Agent actions:**

- Run `pnpm --filter @webgogol/forge run build:check` — must pass.
- Run `pnpm --filter @warpgogol/site-kernel run build:check` — must pass.
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` — must pass.
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — must pass.
- Run `pnpm exec forge doctor` — must pass with no autonomy guard failures.
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0556` — must pass.
- Run `pnpm --filter @webgogol/forge test` — all tests (moved + new edge-case) must pass.
- Run `pnpm --filter @warpgogol/site-kernel-checks test` — remaining (non-compass) tests must pass.
- Run `pnpm --filter @warpgogol/site-kernel-handoff test` — existing tests must pass.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0556 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- All `build:check` commands pass.
- `forge doctor` passes.
- `rfc.validate` passes.
- Review report exists for this session.

**Completion criterion:** All acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`, which validates all preconditions atomically.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0556`
- `pnpm --filter @webgogol/forge run build:check`
- `pnpm --filter @warpgogol/site-kernel run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm exec forge doctor`
- `pnpm --filter @webgogol/forge test`
- `pnpm --filter @warpgogol/site-kernel-checks test`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0556` in the subject line (RFC-0265 commit hygiene)
- `fo-review` report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Code duplication (~2200 lines) | Steps 7-8: kernel-packages delegate to forge, so there is one implementation, not two |
| Audit revision accuracy in autonomous mode | Step 3: `git-revision.ts` uses `--diff-filter=AMT` and returns `revision=1` on error — safe-degradation prevents false failures |
| `port-validate.ts` relaxation | Step 6: removes forbidden imports that are no longer imported at all — guard becomes unnecessary for these modules |
| Agent misinterpretation | Step 9: updates all AGENTS.md files to remove "graceful skip" language |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-42, DNA-43, or DNA-51, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0556 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If `forge doctor` reports autonomy guard failures that cannot be resolved by adjusting `FORBIDDEN_IMPORTS`, stop and escalate — the guard may need a more nuanced exemption mechanism.
- If existing tests in `site-kernel-checks` or `site-kernel-handoff` fail after delegation conversion, investigate whether the forge-inlined implementation produces different output shapes — this would indicate a behavioral regression that must be fixed before stamping implemented.
