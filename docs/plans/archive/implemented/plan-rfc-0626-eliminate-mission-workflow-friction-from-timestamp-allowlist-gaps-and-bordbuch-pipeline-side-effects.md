---
rfcId: RFC-0626
planId: PLAN-RFC-0626-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - docs/rfcs/rfc-0626-eliminate-mission-workflow-friction-from-timestamp-allowlist-gaps-and-bordbuch-pipeline-side-effects.md
---

# Implementation Plan: RFC-0626

## 1. Objectives

- [ ] Objective 1 — Add TS-TIME-02 allowlist parity check to `generated.timestamp.validate` (maps to acceptance criterion 1)
- [ ] Objective 2 — Verify zero violations after all runtime-logic modules are allowlisted (maps to acceptance criterion 2)
- [ ] Objective 3 — Add `bordbuch.commit` step to `SITES_BUILD_PREPARE_PIPELINE` after `bordbuch.generate` (maps to acceptance criterion 3)
- [ ] Objective 4 — Exclude `bordbuch.commit` from `SITES_BUILD_PREPARE_DEV_PIPELINE` (maps to acceptance criterion 4)
- [ ] Objective 5 — Ensure cache clone has zero uncommitted bordbuch projections after `build.prepare` (maps to acceptance criterion 5)
- [ ] Objective 6 — Verify `commitBordbuchProjections` only stages bordbuch paths, never `git add -A` (maps to acceptance criterion 6)
- [ ] Objective 7 — Verify `mission.validate`, `mission.close`, `release.prepare` complete without bordbuch dirty warnings (maps to acceptance criterion 7)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-checks/src/generated-timestamp-validate.ts` — Modified: refactor `runPhase1` to return scan results, add `checkAllowlistParity` function, add `TS-TIME-02` rule
- `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts` — Modified: add `bordbuch.commit` step after `bordbuch.generate` in `SITES_BUILD_PREPARE_PIPELINE` only
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts` — New: `commitBordbuchProjections` helper + `runBordbuchCommit` command handler
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch.module.ts` — Modified: register `bordbuch.commit` command
- `packages/os/site-kernel-handoff/src/bordbuch/index.ts` — Modified: export `runBordbuchCommit` from barrel
- `packages/os/site-kernel-checks/src/workspace-write-boundary.ts` — Read: verify if `bordbuch.commit` needs an entry (it commits existing files, does not produce new outputs)

### 2.2 Configuration and data

- No configuration or data files affected.

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0626-eliminate-mission-workflow-friction-from-timestamp-allowlist-gaps-and-bordbuch-pipeline-side-effects.md` — Read-only reference
- `packages/os/site-kernel-handoff/AGENTS.md` — Update Bordbuch section if it lists registered commands
- `packages/os/site-kernel-checks/AGENTS.md` — Update if it lists `generated.timestamp.validate` rules

### 2.4 Validation and pipelines

- `generated.timestamp.validate` is in `build.check` — the new `TS-TIME-02` rule runs within the same command
- `bordbuch.commit` is added to `SITES_BUILD_PREPARE_PIPELINE` (not dev pipeline)
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks test`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

## 3. Step sequence

### Step 1. Refactor `runPhase1` to expose scan results

**Goal:** Refactor `runPhase1` in `generated-timestamp-validate.ts` to return both `Diagnostic[]` and a `Map<string, { line: number; pattern: string }[]>` of raw scan results, so the parity check can reuse them without additional file I/O.

**Agent actions:**

- Change `runPhase1` return type from `Diagnostic[]` to `{ diagnostics: Diagnostic[]; scanResults: Map<string, { line: number; pattern: string }[]> }`
- Build the `scanResults` map inside the existing loop: for each `modulePath`, store `scanModuleForTimestamps(modulePath, workspaceRoot)` result in the map
- Return both `diagnostics` and `scanResults`
- Update the call site in `runGeneratedTimestampValidate` to destructure the new return type

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- Existing tests in `generated-timestamp-validate.test.ts` must be updated to use the new return type

**Completion criterion:** `runPhase1` returns `{ diagnostics, scanResults }` and all existing tests pass with the updated call pattern.

**Human review:** no

---

### Step 2. Add `checkAllowlistParity` function and `TS-TIME-02` rule

**Goal:** Add the Phase 2 allowlist parity check that errors when a module in `GENERATOR_OWNERSHIP_MAP` uses volatile timestamp patterns but is missing from `TIMESTAMP_ALLOWLIST`.

**Agent actions:**

- Add `const RULE_ID_PARITY = "TS-TIME-02"` constant
- Add `checkAllowlistParity(scanResults: Map<string, { line: number; pattern: string }[]>, allowlistModules: Set<string>): Diagnostic[]` function
- The function iterates `scanResults` entries: for each module with non-empty violations that is NOT in `allowlistModules`, emit a `TS-TIME-02` error diagnostic with message: "Module <path> uses volatile timestamp patterns [<patterns>] but is missing from TIMESTAMP_ALLOWLIST. If this is runtime logic (not a generated-file field), add it to the allowlist with a reason."
- In `runGeneratedTimestampValidate`, after `runPhase1`, call `checkAllowlistParity(scanResults, allowlistModules)` and append the resulting diagnostics
- Build `allowlistModules` set from `TIMESTAMP_ALLOWLIST` in `runGeneratedTimestampValidate` (or export it)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks test`

**Completion criterion:** `generated.timestamp.validate` emits `TS-TIME-02` errors for modules with volatile timestamps missing from the allowlist; zero `TS-TIME-02` errors when all such modules are allowlisted.

**Human review:** no

---

### Step 3. Create `bordbuch-commit.ts` with `commitBordbuchProjections` helper and `runBordbuchCommit` handler

**Goal:** Create the new `bordbuch-commit.ts` file in `packages/os/site-kernel-handoff/src/bordbuch/` containing the `commitBordbuchProjections` helper and the `runBordbuchCommit` command handler.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-commit.ts`
- Implement `commitBordbuchProjections(workspaceRoot: string, systemId: string): Promise<{ committed: boolean; commitSha: string | null }>`:
  1. Resolve cache clone path via `resolveCachePath(workspaceRoot, systemId)` from `../sternsystem/registry-io.ts`
  2. Run `gitExec(cachePath, "status --porcelain")` to get dirty files
  3. Filter for bordbuch projection paths only: `bordbuch/status.generated.yaml`, `public/.well-known/bordbuch.json`, `public/.well-known/bordbuch/index.html`
  4. If no matching dirty files → return `{ committed: false, commitSha: null }`
  5. If matching dirty files → `gitExec(cachePath, "add -- <specific paths>")` + `gitExec(cachePath, "commit -m chore: bordbuch projections from build.prepare")`
  6. Return `{ committed: true, commitSha: gitExec(cachePath, "rev-parse HEAD") }`
- Implement `runBordbuchCommit(input: KernelCommandInput, context: KernelRuntimeContext): Promise<KernelCommandResult>`:
  - Extract `systemId` from `--system` flag or `context.site?.name`
  - If no `systemId`, return no-op summary
  - Call `commitBordbuchProjections(workspaceRoot, systemId)`
  - Return summary: `[bordbuch.commit] committed N bordbuch projection files for <systemId>` or `[bordbuch.commit] no dirty bordbuch files for <systemId>`
- Import `gitExec` from `../werkstatt/git-exec.ts`
- Import `resolveCachePath` from `../sternsystem/registry-io.ts`
- Add MODULE_CONTRACT: "Internal pipeline step — auto-commits bordbuch projections after bordbuch.generate. Not intended for direct operator invocation."
- Add CHANGE_SUMMARY: "RFC-0626: initial bordbuch.commit command handler."

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `bordbuch-commit.ts` compiles, exports `runBordbuchCommit` and `commitBordbuchProjections`, uses `gitExec` and `resolveCachePath` from existing modules.

**Human review:** no

---

### Step 4. Register `bordbuch.commit` command in bordbuch module

**Goal:** Register the `bordbuch.commit` command in the bordbuch kernel module so it can be dispatched by the pipeline executor.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/bordbuch/bordbuch.module.ts`:
  - Add `const { runBordbuchCommit } = await import("./bordbuch-commit.ts")` in the `register` function
  - Add `registry.registerCommand({ name: "bordbuch.commit", ... })` with:
    - `description: "Auto-commit dirty bordbuch projection files in the cache clone (RFC-0626). Internal pipeline step."`
    - `scope: "workspace"`
    - `supportsAllSites: false`
    - `mutatesState: true`
    - `flags: { system: { kind: "string", description: "Sternsystem id. Defaults to the site name when running in a site-scoped pipeline." } }`
    - `reads: ["systems/{system}/public/.well-known/bordbuch.json", "systems/{system}/public/.well-known/bordbuch/index.html", "systems/{system}/bordbuch/status.generated.yaml"]`
    - `cacheable: false`
    - `execute: runBordbuchCommit`
- In `packages/os/site-kernel-handoff/src/bordbuch/index.ts`:
  - Add `export { runBordbuchCommit, commitBordbuchProjections } from "./bordbuch-commit.ts"` (barrel re-export)
  - Remove the stale duplicate `createBordbuchModule()` from `index.ts` — `bordbuch.module.ts` is the single source of truth for command registration (forward-only: no legacy duplicates)
  - `index.ts` becomes a pure barrel (exports only, no module factory)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run bordbuch.commit --site warpgogol-com --json` (manual smoke test)

**Completion criterion:** `bordbuch.commit` is a registered kernel command callable via `site-kernel run bordbuch.commit`.

**Human review:** no

---

### Step 5. Add `bordbuch.commit` to `SITES_BUILD_PREPARE_PIPELINE`

**Goal:** Insert the `bordbuch.commit` step into the build-prepare pipeline after `bordbuch.generate` and before `passport.key.ensure`. Ensure it is NOT added to the dev pipeline.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`:
  - Add `{ command: "bordbuch.commit" }` after `{ command: "bordbuch.generate" }` (line 123) and before `{ command: "passport.key.ensure" }` (line 124) in `SITES_BUILD_PREPARE_PIPELINE`
  - Add a comment: `// RFC-0626: auto-commit bordbuch projections after bordbuch.generate`
  - Do NOT add it to `SITES_BUILD_PREPARE_DEV_PIPELINE`
- Update the CHANGE_SUMMARY in the file header

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks test`

**Completion criterion:** `SITES_BUILD_PREPARE_PIPELINE` contains `bordbuch.commit` after `bordbuch.generate`; `SITES_BUILD_PREPARE_DEV_PIPELINE` does NOT contain `bordbuch.commit`.

**Human review:** no

---

### Step 6. Update `workspace-write-boundary.ts` if required

**Goal:** Check whether `workspace-write-boundary.ts` validation requires an entry for `bordbuch.commit`. Since `bordbuch.commit` commits existing files (does not produce new file outputs), it may not need an entry.

**Agent actions:**

- Read `workspace-write-boundary.ts` to understand if pipeline commands are validated against the boundary list
- If validation requires all pipeline commands to have entries, add a `bordbuch.commit` entry with empty `outputs` (since it commits, not writes)
- If not, skip this step

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`

**Completion criterion:** `workspace-write-boundary.ts` is either updated with `bordbuch.commit` or confirmed not to require an entry; `build:check` passes.

**Human review:** no

---

### Step 7. Write unit tests

**Goal:** Add unit tests for the new `checkAllowlistParity` function, the refactored `runPhase1`, the `commitBordbuchProjections` helper, and the updated pipeline.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/tests/generated-timestamp-validate.test.ts`:
  - Update existing `runPhase1` tests to use the new `{ diagnostics, scanResults }` return type
  - Add test: `checkAllowlistParity` emits `TS-TIME-02` for a module with violations not in allowlist
  - Add test: `checkAllowlistParity` emits zero diagnostics when all modules with violations are allowlisted
  - Add test: `checkAllowlistParity` emits zero diagnostics when scan results are empty
  - Add test: full command handler `runGeneratedTimestampValidate` includes `TS-TIME-02` diagnostics in the result
- In `packages/os/site-kernel-checks/src/tests/build-prepare-pipeline.test.ts`:
  - Add test: `bordbuch.commit` is in `SITES_BUILD_PREPARE_PIPELINE`
  - Add test: `bordbuch.commit` appears after `bordbuch.generate` and before `passport.key.ensure`
  - Add test: `bordbuch.commit` is NOT in `SITES_BUILD_PREPARE_DEV_PIPELINE`
- In `packages/os/site-kernel-handoff/src/tests/` (new file `bordbuch-commit.test.ts`):
  - Add test: `commitBordbuchProjections` skips when no dirty bordbuch files
  - Add test: `commitBordbuchProjections` commits when bordbuch files are dirty
  - Add test: `commitBordbuchProjections` only stages bordbuch paths, not other dirty files
  - Add test: `commitBordbuchProjections` is idempotent (second run is no-op)
  - Add test: `runBordbuchCommit` returns no-op summary when systemId is missing

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks test`
- `pnpm --filter @warpgogol/site-kernel-handoff test`

**Completion criterion:** All new tests pass; existing tests pass with updated `runPhase1` return type.

**Human review:** no

---

### Step 8. Update AGENTS.md files

**Goal:** Update package-level AGENTS.md files if they reference the bordbuch command family or `generated.timestamp.validate` rules.

**Agent actions:**

- Check `packages/os/site-kernel-handoff/AGENTS.md` — if it lists bordbuch commands (`bordbuch.append`, `bordbuch.validate`, `bordbuch.status`, `bordbuch.generate`, `bordbuch.repair`), add `bordbuch.commit` with a brief description
- Check `packages/os/site-kernel-checks/AGENTS.md` — if it lists `generated.timestamp.validate` rules, add `TS-TIME-02` (allowlist parity)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`

**Completion criterion:** AGENTS.md files reflect the new command and rule; `ecosystem.manifest.generate` is up to date.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (do not hand-edit `docs/ecosystem.generated.yaml`).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0626 --implementation-commit <sha>` to atomically transition `accepted → implemented` (RFC-0476).

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0626`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0626`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks test`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0626` (RFC-0330, for RFCs created on or after 2026-07-07)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0626.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0626` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positive in parity check (string literals/comments) | Step 2: reuses `scanModuleForTimestamps` which already strips comments/strings via `stripCommentsAndStrings` |
| Agent confusion about TS-TIME-02 | Step 2: error message explicitly says "add it to the allowlist with a reason" |
| Cache clone commit conflicts (non-bordbuch dirty files) | Step 3: `commitBordbuchProjections` only stages 3 bordbuch paths, never `git add -A` |
| Non-mission `build.prepare` (no cache clone) | Step 3: `resolveCachePath` failure returns no-op summary |
| Performance (parity check double-scanning) | Step 1: `runPhase1` refactored to return scan results, parity check reuses them — zero additional file I/O |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-51, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0626 --reason "..." --invariant "DNA-51"` instead of working around it.
- If `bordbuch.commit` registration conflicts with existing command names, check for duplicate registration in `bordbuch.module.ts` vs `bordbuch/index.ts` — the active module is `bordbuch.module.ts` (imported in `kernel.config.ts`).
