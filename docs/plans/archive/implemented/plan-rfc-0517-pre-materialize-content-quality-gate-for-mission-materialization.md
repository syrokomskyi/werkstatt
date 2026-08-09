---
rfcId: RFC-0517
planId: PLAN-RFC-0517-01
status: draft
owner: architecture
createdAt: 2026-07-24
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/ontology"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0517

## 1. Objectives

- [ ] Objective 1 — Export preflight pipeline constants from site-kernel-checks (maps to acceptance criterion: pipeline constants exported)
- [ ] Objective 2 — Extend Bordbuch schema with `preflight-skipped` kind and writer-role (maps to acceptance criterion: bordbuch.validate accepts, WRITER_ROLE_KINDS includes)
- [ ] Objective 3 — Embed preflight gate in `mission.materialize` between `atomicMoveDir` and `git init` (maps to acceptance criterion: runs after atomicMoveDir before git init)
- [ ] Objective 4 — Implement `--skip-preflight` flag with Bordbuch audit trail (maps to acceptance criterion: skip-preflight bypasses and appends Bordbuch entry)
- [ ] Objective 5 — Write `evidence/preflight-report.json` for every materialization attempt (maps to acceptance criterion: report written for pass/fail/skipped)
- [ ] Objective 6 — Update `packages/os/site-kernel-handoff/AGENTS.md` with preflight gate documentation (maps to acceptance criterion: AGENTS.md documents preflight)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/operations/mission.ts` — add `"preflight-skipped"` to `bordbuchEntryKindSchema` enum
- `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` — add `"preflight-skipped"` to `WRITER_ROLE_KINDS["mission"]`
- `packages/os/site-kernel-checks/src/pipelines/mission-preflight.ts` — new file: `MISSION_PREFLIGHT_CRITICAL` and `MISSION_PREFLIGHT_WARNING` constants
- `packages/os/site-kernel-checks/src/pipelines/index.ts` — re-export new constants
- `packages/os/site-kernel-handoff/src/mission/mission-materialize.ts` — add `--skip-preflight` flag, preflight gate insertion, report writing, Bordbuch entry append

### 2.2 Configuration and data

- No YAML/JSON config changes. No ontology catalog changes. No content schema changes.

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — document preflight gate in mission materialization section
- No `docs/*.xml` Compass sync needed — no repository-wide requirements or shared package contract changes
- No `docs/architecture-dna.md` changes — no new DNA invariant

### 2.4 Validation and pipelines

- No new pipeline registration. The preflight constants are imported and run directly by `mission-materialize.ts`, not registered as a named pipeline in `module.ts`.
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`

## 3. Step sequence

### Step 1. Extend Bordbuch schema with `preflight-skipped` kind

**Goal:** Add the new Bordbuch event kind to the closed enum and writer-role map so `appendBordbuchEntry` accepts it.

**Agent actions:**

- Add `"preflight-skipped"` to `bordbuchEntryKindSchema` in `packages/ontology/src/operations/mission.ts` (after `"mission-migrate"`)
- Add `"preflight-skipped"` to `WRITER_ROLE_KINDS["mission"]` array in `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts`
- Add `<item>RFC-0517: add preflight-skipped kind for preflight gate bypass audit trail.</item>` to `CHANGE_SUMMARY` in both files

**Validation:**

- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`

**Completion criterion:** `bordbuchEntryKindSchema` includes `"preflight-skipped"` and `WRITER_ROLE_KINDS["mission"]` includes it; both packages typecheck.

**Human review:** no

---

### Step 2. Create preflight pipeline constants

**Goal:** Export `MISSION_PREFLIGHT_CRITICAL` and `MISSION_PREFLIGHT_WARNING` from site-kernel-checks.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/pipelines/mission-preflight.ts` with:
  - `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding
  - `import type { KernelPipelineStep } from "@gogol/site-kernel"`
  - `export const MISSION_PREFLIGHT_CRITICAL: KernelPipelineStep[]` with 4 critical validators
  - `export const MISSION_PREFLIGHT_WARNING: KernelPipelineStep[]` with 7 warning validators
- Add re-export to `packages/os/site-kernel-checks/src/pipelines/index.ts`: `export { MISSION_PREFLIGHT_CRITICAL, MISSION_PREFLIGHT_WARNING } from "./mission-preflight.ts";`

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks run build:check`

**Completion criterion:** `MISSION_PREFLIGHT_CRITICAL` (4 steps) and `MISSION_PREFLIGHT_WARNING` (7 steps) are exported from `packages/os/site-kernel-checks/src/pipelines/mission-preflight.ts` and re-exported from `index.ts`; package typechecks.

**Human review:** no

---

### Step 3. Embed preflight gate in `mission.materialize`

**Goal:** Insert the preflight gate between `atomicMoveDir` and `git init` in `runMissionMaterialize`, with `--skip-preflight` flag support, report writing, and Bordbuch entry.

**Agent actions:**

- Add `skipPreflight` flag parsing: `const skipPreflight = flagBool(input, "skip-preflight");`
- Import `executeKernelPipeline` from `@gogol/site-kernel` (already used in `mission-materialization-commands.ts`)
- Import `MISSION_PREFLIGHT_CRITICAL`, `MISSION_PREFLIGHT_WARNING` from `@gogol/site-kernel-checks`
- Import `appendBordbuchEntry` from `../bordbuch/bordbuch-io.ts`
- After `atomicMoveDir(stagingDir, workpieceDir, { replace: true })` and before `git init`:
  - If `skipPreflight` is true:
    - Append Bordbuch entry: `appendBordbuchEntry(workspaceRoot, manifest.systemId, "preflight-skipped", "Preflight content quality gate skipped via --skip-preflight flag", "agent", { writerRole: "mission", missionId, metadata: { reason: "operator override via --skip-preflight flag" } })`
    - Write `evidence/preflight-report.json` with `skipped: true`
    - Continue to `git init`
  - If `skipPreflight` is false:
    - Run `executeKernelPipeline` with `MISSION_PREFLIGHT_CRITICAL` steps against the workpiece (app-scoped context with `site.directory = workpieceDir`)
    - Run `executeKernelPipeline` with `MISSION_PREFLIGHT_WARNING` steps
    - Build `PreflightReport` object with results
    - Write `evidence/preflight-report.json`
    - If any critical validator failed: throw with summary referencing `evidence/preflight-report.json` (workpiece preserved, no `git init`)
    - If warning validators failed: log to console, continue to `git init`
- Add `<item>RFC-0517: add preflight content quality gate between atomicMoveDir and git init.</item>` to `CHANGE_SUMMARY`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`

**Completion criterion:** `mission.materialize` runs preflight after `atomicMoveDir` and before `git init`; critical failure throws with report reference; warning failure continues; `--skip-preflight` bypasses and appends Bordbuch entry; `evidence/preflight-report.json` written for all paths; package typechecks and tests pass.

**Human review:** no

---

### Step 4. Update AGENTS.md documentation

**Goal:** Document the preflight gate in the handoff package AGENTS.md.

**Agent actions:**

- Add a new subsection under "Mission git workpiece and Layer C protection (RFC-0480)" in `packages/os/site-kernel-handoff/AGENTS.md`:
  - **Preflight content quality gate (RFC-0517):** `mission.materialize` runs a two-level preflight gate after `atomicMoveDir` and before `git init`. Critical validators (content-types, schema.drift, cosmic.catalog, biome.contract) block on failure; warning validators (content.filename, naming.content, mirroring, semantic.drift, content.links, content.references, pbp.content) continue with a report. `--skip-preflight` bypasses the gate and appends a `preflight-skipped` Bordbuch entry. `evidence/preflight-report.json` is written for every materialization.

**Validation:**

- Visual review of AGENTS.md content

**Completion criterion:** `packages/os/site-kernel-handoff/AGENTS.md` has a preflight gate subsection documenting the gate, flag, and report.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Verify all acceptance criteria, run validation suite, stamp RFC as implemented.

**Agent actions:**

- Verify every acceptance criterion in RFC-0517 against the implemented code. Mark `[x]` with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0517`
- Run `pnpm --filter @gogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff run test`
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `mission.materialize` gains a flag — check if manifest needs regeneration)
- Stamp: `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0517 --implementation-commit <sha> --dry-run` then without `--dry-run`
- Commit the stamped RFC separately

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0517`
- All acceptance criteria checked off with evidence

**Completion criterion:** All acceptance criteria verified with inline evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; validation suite passes.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0517`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-checks run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run test`

### 4.2 Evidence artifacts

- `evidence/preflight-report.json` written during materialization (runtime evidence, not committed)
- Commit messages referencing `RFC-0517` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| False positives on critical validators | Step 3: `--skip-preflight` with Bordbuch audit trail allows bypass |
| Performance overhead (12 validators) | Step 2: only author-time validators (file scanning, no build); Step 3: runs in seconds |
| Agent misinterpretation of preflight failure | Step 3: error message references `evidence/preflight-report.json` and directs to fix Sternsystem data set |
| Validator selection drift | Step 2: constants exported from `pipelines/` and reviewed during pipeline changes |
| Bordbuch schema extension | Step 1: `preflight-skipped` added to enum and writer-role map atomically |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-46 or DNA-47, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0517 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `executeKernelPipeline` cannot run against the workpiece directory (e.g. discovery fails), escalate as a critical preflight failure rather than silently skipping the gate.
