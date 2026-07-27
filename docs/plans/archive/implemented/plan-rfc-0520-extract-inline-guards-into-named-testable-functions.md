---
rfcId: RFC-0520
planId: PLAN-RFC-0520-01
status: draft
owner: architecture
createdAt: 2026-07-24
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0520

## 1. Objectives

- [ ] O1 — Create shared `GuardResult` types and export from package entrypoint
- [ ] O2 — Extract `evaluateCSurfaceGate` as a pure function
- [ ] O3 — Extract `evaluateExternalEditGate` as a pure function
- [ ] O4 — Delegate `release.prepare` C-surface check to `evaluateCSurfaceGate`
- [ ] O5 — Delegate `sternsystem.validate` Bordbuch-vs-git-log check to `evaluateExternalEditGate`
- [ ] O6 — Add unit tests for extracted functions and helper (13 test cases total: 4 guard + 4 helper + 5 external-edit)
- [ ] O7 — Pass `build:check` and `test`

## 2. Affected artifacts

### 2.1 Code and commands

| Path | Action |
| --- | --- |
| `packages/os/site-kernel-handoff/src/guards.ts` | Create — `GuardResult`, `GuardVerdict`, `GuardViolation` |
| `packages/os/site-kernel-handoff/src/release/c-surface-guard.ts` | Create — `evaluateCSurfaceGate` |
| `packages/os/site-kernel-handoff/src/release/breaks-c-helper.ts` | Create — `checkBreaksCDeclaration` |
| `packages/os/site-kernel-handoff/src/sternsystem/external-edit-guard.ts` | Create — `evaluateExternalEditGate` |
| `packages/os/site-kernel-handoff/src/sternsystem/external-edit-collector.ts` | Create — `collectExternalEditInputs` |
| `packages/os/site-kernel-handoff/src/release/release-commands.ts` | Modify — replace inline block (lines 227-268) |
| `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts` | Modify — replace inline block (lines 235-303) |
| `packages/os/site-kernel-handoff/src/index.ts` | Modify — add type re-exports |
| `packages/os/site-kernel-handoff/src/release/c-surface-guard.test.ts` | Create — unit tests for `evaluateCSurfaceGate` |
| `packages/os/site-kernel-handoff/src/release/breaks-c-helper.test.ts` | Create — unit tests for `checkBreaksCDeclaration` |
| `packages/os/site-kernel-handoff/src/sternsystem/external-edit-guard.test.ts` | Create — unit tests for `evaluateExternalEditGate` |

### 2.2 Configuration and data

None affected.

### 2.3 Documentation and specs

| Path | Action |
| --- | --- |
| `packages/os/site-kernel-handoff/AGENTS.md` | Modify — reference extracted guard files in RFC-0480 section |

No `docs/*.xml` or `docs/architecture-dna.md` changes needed.

### 2.4 Validation and pipelines

No pipeline changes. Existing `build:check` and `test` validate the implementation.

## 3. Step sequence

### Step 1. Create shared `GuardResult` types

**Goal:** Establish shared type contract.

**Agent actions:**

- Create `src/guards.ts` with `GuardVerdict`, `GuardViolation`, `GuardResult` per RFC §Design
- Add Compass `MODULE_CONTRACT`/`CHANGE_SUMMARY` scaffolding
- Add re-exports in `src/index.ts`

**Validation:** `pnpm --filter @gogol/site-kernel-handoff run build:check`

**Completion criterion:** Types exported from `@gogol/site-kernel-handoff`; `build:check` passes.

**Human review:** no

---

### Step 2. Extract `evaluateCSurfaceGate` and `checkBreaksCDeclaration`

**Goal:** Create pure C-surface guard + I/O helper.

**Agent actions:**

- Create `src/release/c-surface-guard.ts` with `evaluateCSurfaceGate` per RFC §Guard 1
- Create `src/release/breaks-c-helper.ts` with `checkBreaksCDeclaration`
- Add Compass scaffolding to both files

**Validation:** `pnpm --filter @gogol/site-kernel-handoff run build:check`

**Completion criterion:** Both files exist; `build:check` passes.

**Human review:** no

---

### Step 3. Extract `evaluateExternalEditGate` and `collectExternalEditInputs`

**Goal:** Create pure external-edit guard + I/O helper.

**Agent actions:**

- Create `src/sternsystem/external-edit-guard.ts` with `evaluateExternalEditGate` per RFC §Guard 2
- **Preserve `type` field check** (not `kind`) — known bug deferred to separate RFC
- Create `src/sternsystem/external-edit-collector.ts` with `collectExternalEditInputs`
- Add Compass scaffolding to both files

**Validation:** `pnpm --filter @gogol/site-kernel-handoff run build:check`

**Completion criterion:** Both files exist; `build:check` passes.

**Human review:** no

---

### Step 4. Modify `release.prepare` call site

**Goal:** Replace inline C-surface block with delegation.

**Agent actions:**

- In `release-commands.ts`, replace lines 227-268 with delegation code per RFC §Guard 1 §Call site
- Import `evaluateCSurfaceGate` and `checkBreaksCDeclaration`
- **Preserve `err.message.includes("C-surface regression")` string matching**
- Preserve exact error message and `cSurfaceVerdict` variable

**Validation:** `pnpm --filter @gogol/site-kernel-handoff run build:check`

**Completion criterion:** Inline block replaced; `build:check` passes.

**Human review:** no

---

### Step 5. Modify `sternsystem.validate` call site

**Goal:** Replace inline Bordbuch-vs-git-log block with delegation.

**Agent actions:**

- In `sternsystem-validate.ts`, replace lines 235-303 with delegation code per RFC §Guard 2 §Call site
- Import `evaluateExternalEditGate` and `collectExternalEditInputs`
- Preserve exact violation shape and message format

**Validation:** `pnpm --filter @gogol/site-kernel-handoff run build:check`

**Completion criterion:** Inline block replaced; `build:check` passes.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** 13 test cases covering guard functions and breaksC helper.

**Agent actions:**

- Create `src/release/c-surface-guard.test.ts` (4 cases: pass, fail no RFC, fail no breaksC, fail with breaksC:true)
- Create `src/release/breaks-c-helper.test.ts` (4 cases: breaksC:true, breaksC:yes, missing field, empty frontmatter)
- Create `src/sternsystem/external-edit-guard.test.ts` (5 cases: empty/empty pass, match pass, extra SHA fail, range pass, range+extra fail)

**Validation:** `pnpm --filter @gogol/site-kernel-handoff test`

**Completion criterion:** All 13 tests pass.

**Human review:** no

---

### Step 7. Update AGENTS.md

**Goal:** Reference extracted guard files.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`, under "Mission git workpiece and Layer C protection (RFC-0480)" section, add references to `c-surface-guard.ts`, `external-edit-guard.ts`, `guards.ts`

**Completion criterion:** AGENTS.md references the new files.

**Human review:** no

---

### Final Step. Acceptance criteria verification and stamp

**Goal:** Verify all criteria, stamp implemented.

**Agent actions:**

- Verify all 10 acceptance criteria against code
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0520`
- Run `pnpm --filter @gogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff test`
- Stamp: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0520 --implementation-commit <sha>`

**Completion criterion:** All criteria checked; RFC stamped `implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0520`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm --filter @gogol/site-kernel-handoff test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0520`
- This plan file

## 5. Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| Behavioral drift | Steps 4-5 preserve exact messages; existing integration tests as regression |
| String matching fragility | Step 4 preserves heuristic; deferred to separate RFC |
| `collectExternalEditInputs` I/O-bound | Guard logic is pure; I/O helper tested with fixtures |
| Pre-existing `type` vs `kind` bug | Preserved per operator decision; deferred to separate RFC |

## 6. Escalation triggers

- If extraction reveals invariant conflict with DNA-46 or DNA-48, run `rfc.supersede.propose` instead of working around it.
