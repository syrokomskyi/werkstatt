---
rfcId: RFC-0583
planId: PLAN-RFC-0583-01
status: draft
owner: architecture
createdAt: 2026-07-29
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0583

## 1. Objectives

- [ ] Objective 1 — Export `computeEntryHash` from `bordbuch-io.ts` for reuse by the repair module (maps to acceptance criterion: `computeEntryHash` exported)
- [ ] Objective 2 — Implement `bordbuch.repair` command handler in `bordbuch-repair.ts` that detects `orphan-mission-close` violations, inserts missing `mission-open` events, recomputes hash chain and event-id sequence (maps to acceptance criteria: detect orphans, insert mission-open, recompute hashes, auto-derive metadata, `--metadata` override, `--dry-run`, post-repair validate)
- [ ] Objective 3 — Register `bordbuch.repair` in `bordbuch.module.ts` and export from `bordbuch/index.ts` barrel (maps to acceptance criterion: command registered)
- [ ] Objective 4 — Write unit test covering the orphan-mission-close repair scenario (maps to acceptance criterion: unit test)
- [ ] Objective 5 — Update `packages/os/site-kernel-handoff/AGENTS.md` to document `bordbuch.repair` (maps to acceptance criterion: AGENTS.md updated)
- [ ] Objective 6 — Run scoped `build:check` and `test` to verify no regressions (maps to acceptance criterion: `bordbuch.validate` passes after repair)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` — export `computeEntryHash` (currently private function at line 69)
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-repair.ts` — **new file**: `runBordbuchRepair` command handler, `BordbuchRepairPlan`, `BordbuchRepairResult` types
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch.module.ts` — register `bordbuch.repair` command in `createBordbuchModule()` with `mutatesState: true`, `cacheable: false`, `supportsAllSites: false`, `writes`/`reads` paths
- `packages/os/site-kernel-handoff/src/bordbuch/index.ts` — export `runBordbuchRepair`, `BordbuchRepairPlan`, `BordbuchRepairResult`
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-repair.test.ts` — **new file**: unit test for orphan-mission-close repair

### 2.2 Configuration and data

- No configuration or data files affected. The command operates on existing bordbuch NDJSON files.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — add `bordbuch.repair` to the Bordbuch command family documentation
- RFC file is read-only reference (`docs/rfcs/rfc-0583-*.md`)
- No `docs/*.xml` Compass files need synchronization (no repository-wide semantics changed)
- No `docs/architecture-dna.md` changes (no new DNA invariant; DNA-51 already exists)

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — scoped typecheck
- `pnpm --filter @warpgogol/site-kernel-handoff run test` — unit tests including new repair test
- `pnpm exec werkstatt run rfc.validate RFC-0583` — RFC mechanical validation
- No pipeline integration — `bordbuch.repair` is on-demand only, never in any pipeline

## 3. Step sequence

### Step 1. Export `computeEntryHash` from `bordbuch-io.ts`

**Goal:** Make the private `computeEntryHash` function available for reuse by the repair module.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts`, change `function computeEntryHash` (line 69) to `export function computeEntryHash`
- Add `computeEntryHash` to the re-exports in `bordbuch/index.ts` barrel
- Add a `CHANGE_SUMMARY` item to the `bordbuch-io.ts` Compass block: `RFC-0583: export computeEntryHash for reuse by bordbuch.repair`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `computeEntryHash` is exported from `bordbuch-io.ts` and re-exported from `bordbuch/index.ts`; typecheck passes.

**Human review:** no

---

### Step 2. Implement `bordbuch-repair.ts` command handler

**Goal:** Create the repair command handler that detects orphan-mission-close violations, inserts missing mission-open events, recomputes the hash chain, and writes atomically.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-repair.ts` with:
  - `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding (DNA-42)
  - `BordbuchRepairPlan` interface (per RFC TypeScript contracts)
  - `BordbuchRepairResult` interface (per RFC TypeScript contracts, including optional `orphans` for dry-run)
  - `runBordbuchRepair(input: KernelCommandInput, context: KernelRuntimeContext)` function implementing the 8-step algorithm from the RFC:
    1. Read entries via `readBordbuch`
    2. Run `validateBordbuch` — if no violations, exit 0 with `insertedEvents: 0`
    3. Filter to `orphan-mission-close` only — if other violations exist, exit non-zero
    4. For each orphan (in log order), derive or accept operator-supplied metadata for `mission-open`:
       - `occurredAt`: from corresponding `mission-close`/`mission-abort` event's `occurredAt` (auto-derived) or operator-supplied
       - `summary`: "Mission opened (auto-repaired)" unless operator-supplied
       - `actor`: "agent" unless operator-supplied
       - `status`: "done"
       - `missionId`: from orphan close/abort event
       - `releaseId`: `null`
    5. Insert each `mission-open` immediately before its corresponding close/abort event
    6. Recompute all `id` (sequential from `event-000001`), `previousHash`, and `hash` using exported `computeEntryHash`
    7. Validate repaired bordbuch with `validateBordbuch` — if violations remain, exit non-zero, do not write
    8. Write atomically (unless `--dry-run`) using `atomicWriteFile`
  - Acquire `system:<id>` and `bordbuch:<id>` locks via `acquireLock`/`releaseLock` (same pattern as `bordbuch-append.ts`)
  - Handle `--mission` flag: filter orphans to only the specified mission id; if other orphans remain, post-repair validate fails
  - Handle `--dry-run` flag: return plan with `orphans` array, do not write
  - Handle `--metadata` flag: parse JSON, override auto-derived metadata
- Import `KernelCommandInput`, `KernelCommandResult`, `KernelRuntimeContext` from `@warpgogol/site-kernel`
- Import `readBordbuch`, `validateBordbuch`, `computeEntryHash`, `resolveBordbuchPath` from `./bordbuch-io.ts`
- Import `acquireLock`, `releaseLock`, `generateOperationId` from `../werkstatt/index.ts`
- Import `atomicWriteFile` from `../werkstatt/atomic.ts`
- Import `bordbuchEntrySchema`, `BordbuchEntry` from `@warpgogol/ontology/operations`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `bordbuch-repair.ts` exists with all types and the `runBordbuchRepair` handler; typecheck passes.

**Human review:** no

---

### Step 3. Register `bordbuch.repair` in module and barrel exports

**Goal:** Wire the repair command into the bordbuch module and export it from the barrel.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/bordbuch/bordbuch.module.ts`:
  - Add dynamic import: `const { runBordbuchRepair } = await import("./bordbuch-repair.ts");`
  - Register command:
    ```ts
    registry.registerCommand({
      name: "bordbuch.repair",
      description: "Repair orphan-mission-close violations by inserting missing mission-open events and recomputing the hash chain (RFC-0583).",
      scope: "workspace",
      supportsAllSites: false,
      mutatesState: true,
      flags: {
        system: { kind: "string", required: true, description: "Sternsystem id." },
        "dry-run": { kind: "boolean", description: "Show planned repairs without writing." },
        mission: { kind: "string", description: "Repair only the specified mission id." },
        metadata: { kind: "string", description: "JSON object with occurredAt, summary, actor for the inserted mission-open event." },
      },
      writes: ["systems/{system}/bordbuch/events.ndjson"],
      reads: ["systems/{system}/bordbuch/events.ndjson"],
      cacheable: false,
      execute: runBordbuchRepair,
    });
    ```
- In `packages/os/site-kernel-handoff/src/bordbuch/index.ts`:
  - Add export: `export { runBordbuchRepair, type BordbuchRepairPlan, type BordbuchRepairResult } from "./bordbuch-repair.ts";`
  - Update `MODULE_CONTRACT` purpose and `CHANGE_SUMMARY` if needed

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check` passes

**Completion criterion:** `bordbuch.repair` is registered in both `bordbuch.module.ts` and `bordbuch/index.ts`; typecheck passes.

**Human review:** no

---

### Step 4. Write unit test for orphan-mission-close repair

**Goal:** Verify the repair algorithm correctly detects orphans, inserts mission-open events, recomputes hashes, and passes post-repair validation.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-repair.test.ts` with:
  - Test fixture: a bordbuch NDJSON with an `orphan-mission-close` violation (mission-close without preceding mission-open)
  - Test: `runBordbuchRepair` detects the orphan, inserts a `mission-open` event with auto-derived metadata, recomputes all hashes, and `validateBordbuch` passes on the repaired bordbuch
  - Test: `--dry-run` mode returns the plan with `orphans` array and does not write the file
  - Test: `--metadata` flag overrides auto-derived metadata
  - Test: running repair on an already-valid bordbuch is a no-op (idempotency)
  - Test: unrepairable violations (e.g. `duplicate-mission-id`) cause non-zero exit without writing
  - Use `vitest` (`describe`, `it`, `expect`)
  - Use `bordbuchEntrySchema` to create valid test entries (all required fields: `schemaVersion`, `id`, `systemId`, `occurredAt`, `kind`, `status`, `missionId`, `releaseId`, `actor`, `summary`, `previousHash`, `hash`)
  - Use temp directories for test bordbuch files

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run test` passes

**Completion criterion:** All test cases pass; test covers orphan detection, insertion, hash recompute, dry-run, metadata override, idempotency, and unrepairable violation rejection.

**Human review:** no

---

### Step 5. Update `packages/os/site-kernel-handoff/AGENTS.md`

**Goal:** Document the `bordbuch.repair` command in the package AGENTS.md.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`, add a new section or update the existing Bordbuch section to document:
  - `bordbuch.repair` command: purpose, flags (`--system`, `--dry-run`, `--mission`, `--metadata`), and that it is on-demand only (not in any pipeline)
  - The command amends RFC-0355 §3.4 append-only invariant as a meta-level disaster-recovery tool
  - The command does not auto-commit — operator must commit the repaired bordbuch in the cache clone
  - Agents MUST NOT run `bordbuch.repair` proactively — only when `bordbuch.validate` reports `orphan-mission-close`

**Validation:**

- Visual inspection of AGENTS.md content

**Completion criterion:** `AGENTS.md` documents `bordbuch.repair` with flags, usage policy, and post-repair commit requirement.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces or pipeline topology changed (not expected — no pipeline integration).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0583 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0583`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0583`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0583` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Fabricated mission-open events | Step 2: `summary` field is "Mission opened (auto-repaired)" — clearly marks synthetic events |
| Agent misuse (proactive repair) | Step 5: AGENTS.md documents on-demand-only policy; implementation notes in RFC prohibit proactive use |
| Hash-chain trust after repair | Step 2: post-repair `validateBordbuch` (step 7 of algorithm) confirms internal consistency before writing |
| Performance | Negligible — bordbuch files are small (<100 entries); no mitigation needed |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-51 (Werkstatt consistency primitives), run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0583 --reason "..." --invariant "DNA-51"` instead of working around it (RFC-0334).
- If the `amends: [RFC-0355]` relationship causes validation issues beyond the V-19 warning (which is expected for archived RFCs), do not remove the `amends` — the V-19 warning is benign and the relationship is architecturally correct.
