---
rfcId: RFC-0362
planId: PLAN-RFC-0362-01
status: draft
owner: architecture
createdAt: 2026-07-09
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel"
    - "@gogol/site-kernel-handoff"
    - "@gogol/site-kernel-checks"
    - "@gogol/ontology"
    - "@gogol/fingerprint"
  services: []
  docs:
    - docs/technology.xml
    - docs/development-plan.xml
    - docs/architecture-dna.md
    - packages/AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
    - AGENTS.md
---

# Implementation Plan: RFC-0362

> **Pilot plan** — RFC-0362 has `status: draft`. Implementation requires explicit architecture acceptance (`draft → accepted`) before any code changes begin (RFC-0224).

> **Cross-dependency** — RFC-0362 uses `@gogol/fingerprint` (RFC-0364) for `inputHash`/`resultHash`. RFC-0364 must be accepted and implemented before RFC-0362 implementation begins. The plan assumes `@gogol/fingerprint` exists and exports `stableJsonHash` by the time step 3 lands.

## 1. Objectives

- [ ] Objective 1 — `WerkstattLock` and `WerkstattOperationRecord` Zod schemas defined in `@gogol/ontology` (maps to: "`WerkstattLock` and `WerkstattOperationRecord` Zod schemas defined in `@gogol/ontology`")
- [ ] Objective 2 — Lock, operation-record, heartbeat, and atomic-staging helpers exist in `packages/os/site-kernel-handoff/src/werkstatt/` (maps to: "Lock, operation, heartbeat, and atomic staging helpers exist in `packages/os/site-kernel-handoff/src/werkstatt/`")
- [ ] Objective 3 — `werkstatt.lock.status` and `werkstatt.lock.recover` registered in `@gogol/site-kernel-handoff` via `createWerkstattModule()` and tested (maps to: "`werkstatt.lock.status` and `werkstatt.lock.recover` are registered in `@gogol/site-kernel-handoff` and tested")
- [ ] Objective 4 — `werkstatt.operation.validate` registered in `@gogol/site-kernel-checks`, path-scoped to `packages/os/site-kernel-handoff/src/`, and fails on direct shared-state writes outside the allowlisted helper module (maps to: "`werkstatt.operation.validate` is registered in `@gogol/site-kernel-checks` and fails on direct shared-state writes outside the allowlisted helper module" + "`werkstatt.operation.validate` is path-scoped to `packages/os/site-kernel-handoff/src/`")
- [ ] Objective 5 — `werkstatt.lock.recover` acquires a meta-lock before classifying artifacts (maps to: "`werkstatt.lock.recover` acquires a meta-lock before classifying artifacts")
- [ ] Objective 6 — `.werkstatt/` is gitignored (maps to: "`.werkstatt/` is gitignored")
- [ ] Objective 7 — Operation-record hashes use `@gogol/fingerprint` with sanitized command arguments (maps to: "Operation-record hashes use `@gogol/fingerprint` (RFC-0364) and command arguments are sanitized before hashing")
- [ ] Objective 8 — `werkstatt.operation.validate` added to `APPS_CHECK_PIPELINE` (maps to: "`werkstatt.operation.validate` is added to the `check` pipeline (`APPS_CHECK_PIPELINE`)")
- [ ] Objective 9 — `packages/AGENTS.md` and `packages/os/site-kernel-handoff/AGENTS.md` document the helper-requirement rule (maps to: "`packages/AGENTS.md` documents the helper-requirement rule")
- [ ] Objective 10 — New helper modules carry Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (maps to: "New helper modules carry Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42)")
- [ ] Objective 11 — `--json` output is stable for all three commands (maps to: "`--json` output is stable for all three commands")
- [ ] Objective 12 — `rfc.validate` passes on RFC-0362 (maps to: "`rfc.validate` passes on this file")

## 2. Affected artifacts

### 2.1 Code and commands

**New schema file:**

- `packages/ontology/src/schemas/werkstatt.ts` — `WerkstattLockSchema`, `WerkstattOperationRecordSchema` Zod schemas
- `packages/ontology/src/schemas/index.ts` — re-export new schemas and types

**New helper modules in `packages/os/site-kernel-handoff/src/werkstatt/`:**

- `werkstatt/lock.ts` — `acquireLock()`, `releaseLock()`, `readLocks()`, `isStaleLock()`, `WerkstattLock` type re-export
- `werkstatt/operation.ts` — `createOperationRecord()`, `completeOperationRecord()`, `failOperationRecord()`, `findOperationById()`, `sanitizeCommandArgs()`, `WerkstattOperationRecord` type re-export
- `werkstatt/heartbeat.ts` — `startHeartbeat()`, `stopHeartbeat()` — refreshes `heartbeatAt` every 30 seconds
- `werkstatt/atomic-write.ts` — `atomicWriteFile()`, `atomicWriteDirectory()` — temp-file + fsync + rename (POSIX) / two-phase rename (Windows)
- `werkstatt/index.ts` — barrel export for the `werkstatt/` module

**New command handlers:**

- `packages/os/site-kernel-handoff/src/werkstatt-lock-status.ts` — handler for `werkstatt.lock.status`
- `packages/os/site-kernel-handoff/src/werkstatt-lock-recover.ts` — handler for `werkstatt.lock.recover`
- `packages/os/site-kernel-checks/src/werkstatt-operation-validate.ts` — handler for `werkstatt.operation.validate`

**New command table:**

- `packages/os/site-kernel-checks/src/command-tables/38-werkstatt.ts` — `WERKSTATT_COMMANDS` array with `werkstatt.operation.validate` entry
- `packages/os/site-kernel-checks/src/command-tables/index.ts` — import and spread `WERKSTATT_COMMANDS`

**Module registration:**

- `packages/os/site-kernel-handoff/src/index.ts` — add `createWerkstattModule()` function registering `werkstatt.lock.status` and `werkstatt.lock.recover`; export new helpers and types
- `tools/kernel.config.ts` (root) — import and add `createWerkstattModule()` to modules list (if not already auto-wired)

**Pipeline wiring:**

- `packages/os/site-kernel-checks/src/pipelines/apps-check-author.ts` — add `{ command: "werkstatt.operation.validate" }` at end of pipeline

**Package dependency updates:**

- `packages/os/site-kernel-handoff/package.json` — add `@gogol/fingerprint: workspace:*` dependency

**Configuration:**

- `.gitignore` (root) — add `.werkstatt/` entry

### 2.2 Configuration and data

- `.werkstatt/locks/` — lock files (gitignored, runtime artifact)
- `.werkstatt/operations/` — operation records (gitignored, runtime artifact)

### 2.3 Documentation and specs

- `packages/AGENTS.md` — add rule: all mutating Werkstatt commands MUST use shared helpers and MUST NOT use direct `writeFile`/`rename` outside `packages/os/site-kernel-handoff/src/werkstatt/`
- `packages/os/site-kernel-handoff/AGENTS.md` — add Werkstatt section: scope of `createWerkstattModule()`, helper module location, lock scope ordering, atomic-write requirement
- `docs/technology.xml` — register new `werkstatt` schema in `@gogol/ontology` and new helper modules in `@gogol/site-kernel-handoff`
- `docs/development-plan.xml` — reference Werkstatt consistency primitives and pipeline placement
- `docs/architecture-dna.md` — no change (DNA-51 already established by RFC-0362)
- `AGENTS.md` (root) — no change needed (DNA-51 is already referenced; the helper-requirement rule lives in `packages/AGENTS.md`)

### 2.4 Validation and pipelines

- `APPS_CHECK_AUTHOR_PIPELINE` — gains `werkstatt.operation.validate` at end
- `pnpm --filter @gogol/ontology run build:check` — schema compilation
- `pnpm --filter @gogol/site-kernel-handoff run build:check` — helper compilation
- `pnpm --filter @gogol/site-kernel-handoff run test` — unit tests for helpers
- `pnpm --filter @gogol/site-kernel-checks run build:check` — command handler compilation
- `pnpm exec werkstatt run rfc.validate RFC-0362 --json` — RFC validation

## 3. Step sequence

### Step 1. Add Zod schemas to `@gogol/ontology`

**Goal:** Define `WerkstattLockSchema` and `WerkstattOperationRecordSchema` in `@gogol/ontology` per RFC §7.

**Agent actions:**

- Create `packages/ontology/src/schemas/werkstatt.ts` with `WerkstattLockSchema` and `WerkstattOperationRecordSchema` matching the TypeScript interfaces in RFC §1 and §3. Use `z.literal("1.0.0")` for `schemaVersion`, `z.string().datetime()` for timestamp fields, `z.number().positive()` for `timeoutSeconds`.
- Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42) at the top of the file.
- Update `packages/ontology/src/schemas/index.ts` — add re-exports for `WerkstattLockSchema`, `WerkstattOperationRecordSchema` and their inferred types (`WerkstattLock`, `WerkstattOperationRecord`).

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` passes
- `pnpm exec werkstatt run rfc.validate RFC-0362 --json` passes

**Completion criterion:** Schemas compile, are exported from `@gogol/ontology/schemas`, and match the RFC interfaces.

**Human review:** No

---

### Step 2. Add `.werkstatt/` to gitignore

**Goal:** Ensure Werkstatt runtime artifacts (locks, operation records) are never committed.

**Agent actions:**

- Add `.werkstatt/` entry to root `.gitignore` with a comment: `# RFC-0362: Werkstatt lock files and operation records are local runtime artifacts`

**Validation:**

- `git status` does not show `.werkstatt/` as untracked after creating the directory

**Completion criterion:** `.werkstatt/` is gitignored.

**Human review:** No

---

### Step 3. Implement lock, heartbeat, and atomic-write helpers

**Goal:** Create the shared consistency primitives in `packages/os/site-kernel-handoff/src/werkstatt/`.

**Prerequisite:** RFC-0364 must be accepted and `@gogol/fingerprint` must exist and export `stableJsonHash`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/werkstatt/lock.ts`:
  - `acquireLock(scope, operationId, command, owner, timeoutSeconds?)` — writes a `WerkstattLock` JSON file to `.werkstatt/locks/<sanitized-scope>.lock.json`. The scope is sanitized for the filename by replacing `:` with `--` (e.g., `system:warpgogol-com` → `system--warpgogol-com.lock.json`) to stay Windows-safe. The `scope` field inside the JSON retains the original value. Fails if the lock file exists and is not stale; returns the lock object.
  - `releaseLock(scope)` — removes the lock file using the same sanitization.
  - `readAllLocks()` — reads all `.werkstatt/locks/*.lock.json` files; returns array with `stale: boolean` computed from `heartbeatAt + timeoutSeconds` vs current time and process liveness.
  - `isStaleLock(lock)` — checks `heartbeatAt + timeoutSeconds` age and process absence.
  - Lock scope ordering is enforced by the caller (the command handler), not by `acquireLock` itself.
- Create `packages/os/site-kernel-handoff/src/werkstatt/heartbeat.ts`:
  - `startHeartbeat(lock, intervalMs = 30000)` — returns a `NodeJS.Timeout` that updates `heartbeatAt` in the lock file every interval.
  - `stopHeartbeat(handle)` — clears the interval.
- Create `packages/os/site-kernel-handoff/src/werkstatt/atomic-write.ts`:
  - `atomicWriteFile(filePath, content)` — write to `<filePath>.tmp-<operationId>`, `fsync`, `rename` to target. On Windows, use two-phase rename if direct rename fails with `EXDEV` or `EPERM`.
  - `atomicWriteDirectory(targetDir, stagingDir, operationId)` — validate staging contents, `fs.rename(stagingDir, targetDir)`. On Windows, use `rename → temp → rename` with retry.
  - Existing non-empty targets are never overwritten unless `--replace` is passed (enforced by the caller, not the helper).
- Create `packages/os/site-kernel-handoff/src/werkstatt/operation.ts`:
  - `createOperationRecord(command, scopes, inputHash)` — writes a `started` record to `.werkstatt/operations/<operationId>.json`.
  - `completeOperationRecord(operationId, resultHash, artifacts)` — updates record to `completed`.
  - `failOperationRecord(operationId, error)` — updates record to `failed`.
  - `findOperationById(operationId)` — reads and returns the record or `null`.
  - `sanitizeCommandArgs(args)` — replace secret-like values (tokens, passwords, repo URLs with embedded credentials) with `[redacted]` before hashing. Use regex patterns for known secret flags (`--token`, `--password`, `--repo` with credentials).
  - `computeInputHash(command, args)` — sanitize args, then call `stableJsonHash({ command, args: sanitizedArgs })` from `@gogol/fingerprint`.
- Create `packages/os/site-kernel-handoff/src/werkstatt/index.ts` — barrel export of all helpers and types.
- Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42) to each new file.
- Add `@gogol/fingerprint: workspace:*` to `packages/os/site-kernel-handoff/package.json` dependencies.
- Import `WerkstattLockSchema` and `WerkstattOperationRecordSchema` from `@gogol/ontology/schemas` for validation — do not duplicate schema shapes locally.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- Manual smoke test: acquire a lock, read it, release it; create an operation record, complete it, find it by id.

**Completion criterion:** All four helper modules compile, export the documented functions, and use `@gogol/ontology` schemas for validation. `computeInputHash` uses `@gogol/fingerprint`.

**Human review:** No

---

### Step 4. Implement `werkstatt.lock.status` and `werkstatt.lock.recover` commands

**Goal:** Register the two lock management commands in `@gogol/site-kernel-handoff` via `createWerkstattModule()`.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/werkstatt-lock-status.ts`:
  - Handler reads all locks via `readAllLocks()`.
  - Empty `.werkstatt/locks/` (or missing directory) returns `{ status: "pass", data: { locks: [], count: 0 }, summary: "[werkstatt.lock.status] 0 active locks" }`.
  - `--json` output matches RFC §9 format.
- Create `packages/os/site-kernel-handoff/src/werkstatt-lock-recover.ts`:
  - Handler acquires a meta-lock (`scope: "werkstatt-recovery"`) before classifying artifacts.
  - Classifies `.tmp` files, `.staging-<operationId>/` directories, and `.incomplete/` directories per RFC §2 recovery table.
  - `--scope <scope>` filters to a single scope. `--purge` forces removal of unclassified artifacts.
  - `--json` output matches RFC §9 format.
  - Mutated registry without completed operation record → fail with human-review message.
- Update `packages/os/site-kernel-handoff/src/index.ts`:
  - Add `createWerkstattModule()` function that registers `werkstatt.lock.status` (scope: `workspace`, `mutatesState: false`) and `werkstatt.lock.recover` (scope: `workspace`, `mutatesState: true`).
  - Export `createWerkstattModule` from the package entrypoint.
  - Export all helpers and types from `./werkstatt/index.ts`.
- Update `tools/kernel.config.ts` (root) — import `createWerkstattModule` from `@gogol/site-kernel-handoff` and add it to the `modules` array alongside `createHandoffModule()`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` passes
- `pnpm exec werkstatt run werkstatt.lock.status --json` returns `{ status: "pass", data: { locks: [], count: 0 } }`
- `pnpm exec werkstatt run werkstatt.lock.recover --json` returns `{ status: "pass", data: { recovered: [], failed: [] } }`

**Completion criterion:** Both commands are registered, callable via `site-kernel run`, return correct `--json` envelopes, and handle empty-state cleanly.

**Human review:** No

---

### Step 5. Implement `werkstatt.operation.validate` command

**Goal:** Register the workspace-level validator in `@gogol/site-kernel-checks` that scans command metadata and source files for direct writes outside the allowlisted helper module.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/werkstatt-operation-validate.ts`:
  - Handler scans `ALL_COMMANDS` (from `./command-tables/index.ts`) for commands that declare `writes` matching Werkstatt paths (`systems/`, `missions/`, `releases/`, `.werkstatt/`, deployment targets, Notausgang output paths).
  - For each mutating Werkstatt command, scan its source file (resolved from the `execute` function's origin) for direct `writeFile`, `appendFile`, `rename`, or recursive directory moves outside `packages/os/site-kernel-handoff/src/werkstatt/`.
  - The scan is path-scoped to `packages/os/site-kernel-handoff/src/` only — files outside this path are not scanned.
  - Fail with rule `missing-lock-scope` when a mutating command declares no lock scopes.
  - Fail with rule `direct-write-outside-helper` when `writeFile`/`appendFile`/`rename` is found outside `werkstatt/`.
  - Fail with rule `missing-operation-id` when a mutating command does not accept or generate an operation id.
  - `--json` output matches RFC §9 format: `{ scannedCommands, scannedFiles, violations }`.
  - Expected cost: sub-second (O(N) in registered commands + O(M) in source files under `site-kernel-handoff/src/`).
- Create `packages/os/site-kernel-checks/src/command-tables/38-werkstatt.ts`:
  - `WERKSTATT_COMMANDS` array with one `CheckCommandEntry` for `werkstatt.operation.validate` (scope: `workspace`, `supportsAllApps: false`).
  - Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding.
- Update `packages/os/site-kernel-checks/src/command-tables/index.ts` — import and spread `WERKSTATT_COMMANDS` after `ENV_CONTRACT_COMMANDS`.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- `pnpm exec werkstatt run werkstatt.operation.validate --json` returns `{ status: "pass", data: { scannedCommands: N, scannedFiles: M, violations: [] } }` (zero violations expected since no Werkstatt commands are implemented yet)

**Completion criterion:** Validator is registered, callable, path-scoped to `packages/os/site-kernel-handoff/src/`, and returns correct `--json` envelope with zero violations on the current codebase.

**Human review:** No

---

### Step 6. Wire `werkstatt.operation.validate` into `APPS_CHECK_AUTHOR_PIPELINE`

**Goal:** Add the validator to the standard check pipeline so it runs on every `pnpm run check`.

**Agent actions:**

- Edit `packages/os/site-kernel-checks/src/pipelines/apps-check-author.ts` — add `{ command: "werkstatt.operation.validate" }` at the end of the pipeline (after `lighthouse.validate`).
- Add RFC-0362 comment annotation.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check` passes
- `pnpm exec werkstatt run apps-check.run --app warpgogol-com --json` passes (new step runs with zero violations)

**Completion criterion:** `APPS_CHECK_AUTHOR_PIPELINE` includes `werkstatt.operation.validate`; `apps-check.run` passes.

**Human review:** No

---

### Step 7. Create test suite

**Goal:** Test lock acquisition/release, stale lock detection, idempotency retries, atomic writes, and recovery classification.

**Agent actions:**

- All tests use a temporary directory (e.g., `os.tmpdir() + "/werkstatt-test-" + crypto.randomUUID()`) as the workspace root, passed to the helpers. This isolates test artifacts from the real workspace and allows parallel test execution without lock contention. Clean up the temp directory in `afterEach` / `afterAll`.
- Create `packages/os/site-kernel-handoff/src/tests/werkstatt-lock.test.ts`:
  - Test acquire + release cycle.
  - Test stale lock detection (expired `heartbeatAt + timeoutSeconds`).
  - Test lock contention (second acquire fails with non-zero exit).
  - Test `readAllLocks()` on empty directory (returns `[]`).
  - Test `readAllLocks()` on missing directory (returns `[]`, not an error).
- Create `packages/os/site-kernel-handoff/src/tests/werkstatt-operation.test.ts`:
  - Test create + complete cycle.
  - Test create + fail cycle.
  - Test `findOperationById` returns `null` for unknown id.
  - Test retry: same command + same `operationId` + same `inputHash` + `completed` returns previous result.
  - Test retry: same `operationId` with different `inputHash` fails.
  - Test `sanitizeCommandArgs` replaces `--token`, `--password`, and `--repo git@user:pass@...` with `[redacted]`.
- Create `packages/os/site-kernel-handoff/src/tests/werkstatt-atomic-write.test.ts`:
  - Test `atomicWriteFile` writes content and target file exists after.
  - Test `atomicWriteFile` does not leave `.tmp` file on success.
  - Test `atomicWriteDirectory` renames staging to target.
- Create `packages/os/site-kernel-handoff/src/tests/werkstatt-recover.test.ts`:
  - Test recovery classifies `.tmp` file (removes if no matching operation record).
  - Test recovery classifies `.staging-<operationId>/` (keeps if resumable, removes otherwise).
  - Test recovery classifies `.incomplete/` (renames to `.failed-<timestamp>/`).
  - Test recovery acquires meta-lock and a second concurrent recovery waits.
  - Test `--purge` forces removal of unclassified artifacts.

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run test` passes (all new tests green)

**Completion criterion:** All test files pass, covering lock lifecycle, idempotency retry rules, atomic writes, and recovery classification.

**Human review:** No

---

### Step 8. Update documentation

**Goal:** Synchronize `AGENTS.md` files, Compass XML, and ownership tables.

**Agent actions:**

- Edit `packages/AGENTS.md` — add a new section after "Ownership boundaries" titled "Werkstatt consistency primitives (RFC-0362)" with the rule: all mutating Werkstatt commands MUST use the shared lock, idempotency, and atomic-write helpers in `packages/os/site-kernel-handoff/src/werkstatt/`. Mutating Werkstatt commands MUST NOT use direct `writeFile`, `appendFile`, `rename`, or recursive directory moves outside the allowlisted `werkstatt/` module. `werkstatt.operation.validate` enforces this.
- Edit `packages/os/site-kernel-handoff/AGENTS.md` — add a "Werkstatt consistency primitives" section documenting: `createWerkstattModule()` scope, helper module location (`src/werkstatt/`), lock scope ordering (`registry` → `system:*` → `mission:*` → `release:*` → `deployment:*` → `export:*`), heartbeat refresh interval (30s), default timeout (900s), atomic-write requirement, and the `@gogol/fingerprint` dependency for `inputHash`/`resultHash`.
- Edit `docs/technology.xml` — register `werkstatt.ts` schema in `@gogol/ontology` and `werkstatt/` helper modules in `@gogol/site-kernel-handoff`.
- Edit `docs/development-plan.xml` — reference Werkstatt consistency primitives and `APPS_CHECK_AUTHOR_PIPELINE` placement.

**Validation:**

- `pnpm exec werkstatt run compass.validate --json` passes
- `pnpm exec werkstatt run ecosystem.manifest.validate --json` passes
- `pnpm exec werkstatt run workspace.surface.validate --json` passes

**Completion criterion:** All documentation files updated, Compass validation passes.

**Human review:** No

---

### Step 9. Final validation and evidence

**Goal:** Run the full validation suite and emit verification evidence.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate RFC-0362 --json` — verify pass
- Run `pnpm --filter @gogol/ontology run build:check` — verify pass
- Run `pnpm --filter @gogol/site-kernel-handoff run build:check` — verify pass
- Run `pnpm --filter @gogol/site-kernel-handoff run test` — verify pass
- Run `pnpm --filter @gogol/site-kernel-checks run build:check` — verify pass
- Run `pnpm exec werkstatt run apps-check.run --app warpgogol-com --json` — verify pass (includes `werkstatt.operation.validate`)
- Run `pnpm exec werkstatt run werkstatt.lock.status --json` — verify empty-state pass
- Run `pnpm exec werkstatt run werkstatt.lock.recover --json` — verify empty-state pass
- Run `pnpm exec werkstatt run werkstatt.operation.validate --json` — verify zero violations
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0362` (RFC-0330) — emit verification evidence
- Update RFC-0362 acceptance criteria checkboxes to reflect verified state

**Validation:**

- `rfc.validate RFC-0362` passes
- All affected `build:check` passes
- All tests pass
- `apps-check.run` passes
- Verification evidence file emitted

**Completion criterion:** All validation passes, evidence artifact committed, acceptance criteria checkboxes updated.

**Human review:** Yes — architecture acceptance required to transition RFC from `draft` to `accepted` before implementation begins (RFC-0224). After implementation, architecture review required to transition from `accepted` to `implemented`.

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0362 --json`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm exec werkstatt run apps-check.run --app warpgogol-com --json`
- `pnpm exec werkstatt run werkstatt.lock.status --json`
- `pnpm exec werkstatt run werkstatt.lock.recover --json`
- `pnpm exec werkstatt run werkstatt.operation.validate --json`
- `pnpm exec werkstatt run compass.validate --json`
- `pnpm exec werkstatt run ecosystem.manifest.validate --json`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0362` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0362.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0362` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Lock remains after crash | Step 3: heartbeat refreshes every 30s; Step 4: `werkstatt.lock.recover` classifies and clears stale locks; Step 7: recovery tests |
| Operation record says completed but artifact is missing | Step 5: `werkstatt.operation.validate` checks result hashes and declared artifact paths |
| Cross-platform rename/fsync behavior differs | Step 3: `atomicWriteFile` and `atomicWriteDirectory` encapsulate platform-specific behavior (POSIX `fs.rename`, Windows two-phase rename with retry); Step 7: atomic-write tests |
| Commands forget to declare scopes | Step 5: `werkstatt.operation.validate` checks command metadata for lock scope declarations; Step 6: validator runs in `APPS_CHECK_AUTHOR_PIPELINE` |
| Agent bypasses helpers with direct `writeFile` | Step 5: validator scans `packages/os/site-kernel-handoff/src/` for direct writes outside `werkstatt/`; Step 8: `packages/AGENTS.md` documents the rule |
| `werkstatt.operation.validate` false positives on legitimate writes | Step 5: validator is path-scoped to `packages/os/site-kernel-handoff/src/` only; codegen, test fixtures, and other packages are not scanned |
| Concurrent `werkstatt.lock.recover` calls race | Step 4: `werkstatt.lock.recover` acquires meta-lock (`scope: "werkstatt-recovery"`); Step 7: concurrent recovery test |
| RFC-0364 cross-dependency delays implementation | Plan prerequisite: RFC-0364 must be accepted and implemented first; Step 3 depends on `@gogol/fingerprint` existing |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-51, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0362 --reason "..." --invariant "DNA-51"` instead of working around it.
- If `@gogol/fingerprint` (RFC-0364) cannot be accepted before RFC-0362 implementation is needed, escalate via `rfc.supersede.propose` with `--reason "RFC-0364 dependency blocking — propose soft-dependency variant with null hashes"` rather than adding a temporary hash implementation.
- If the `werkstatt.operation.validate` false-positive surface is larger than expected (legitimate writes in `site-kernel-handoff/src/` outside `werkstatt/` are flagged), escalate to adjust the allowlist mechanism rather than suppressing violations silently.
