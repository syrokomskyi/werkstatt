---
rfcId: RFC-0463
planId: PLAN-RFC-0463-01
status: draft
owner: architecture
createdAt: 2026-07-20
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - docs/rfcs/**/*.md
---

# Implementation Plan: RFC-0463

## 1. Objectives

- [ ] Objective 1 — V-26 completeness rule added to `rfc.validate` (maps to acceptance criterion 1)
- [ ] Objective 2 — V-27 evidence rule added to `rfc.validate` (maps to acceptance criterion 2)
- [ ] Objective 3 — Unit tests for V-26 and V-27 (maps to acceptance criterion 3)
- [ ] Objective 4 — `fo-idea-implement` skill step 3.6 strengthened (maps to acceptance criterion 4)
- [ ] Objective 5 — Backfill existing implemented RFCs with evidence annotations (maps to acceptance criterion 5)
- [ ] Objective 6 — `rfc.validate` passes on RFC-0463 and full tree (maps to acceptance criteria 6, 7)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/os/rfc/handlers/validate-rules.ts` — add V-26 and V-27 rules after V-14 block (line ~295)
- `packages/forge/os/rfc/handlers/validate-rules.test.ts` — new test file, colocated with source (pattern from `packages/forge/os/naming/naming-convention.test.ts`)
- `packages/forge/skills/fo/fo-idea-implement/SKILL.md` — step 3.6 (lines 142–149) rewritten with semantic verification, evidence annotation, and stub prohibition

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- `docs/rfcs/**/*.md` — all 428 existing `status: implemented` RFCs audited and backfilled with `(evidence: ...)` annotations on `[x]` items; `[ ]` items at `implemented` status resolved (completed or split via supersede)
- `docs/rfcs/rfc-0463-*.md` — acceptance criteria checkboxes checked with evidence annotations during implementation

### 2.4 Validation and pipelines

- `rfc.validate` — gains V-26 and V-27 rules; already runs in `build.check`
- No new commands, no pipeline changes

## 3. Step sequence

### Step 1. Add V-26 and V-27 rules to validate-rules.ts

**Goal:** Implement the two new validation rules in the existing `rfc.validate` handler.

**Agent actions:**

- Read `packages/forge/os/rfc/handlers/validate-rules.ts` lines 281–295 (V-14 block)
- After the V-14 block, add V-26: if `status === "implemented"` and `acceptanceMatch` exists, count unchecked `^- \[ \]` matches; if >0, emit error with message "status is \"implemented\" but N acceptance criteria are unchecked. Complete the work or split deferred criteria into a follow-up RFC via supersede."
- After V-26, add V-27: for each line matching `^- \[x\]` in the acceptance criteria section, check for `\(evidence:\s*.+\)`; if missing, emit error with message "checked acceptance criterion lacks inline (evidence: ...) annotation: \"<line>\""
- Both rules use `addViolation` with severity `"error"` (never warning)

**Validation:**

- `pnpm --filter forge run build:check` passes
- `pnpm exec werkstatt run rfc.validate RFC-0463 --json` — V-26 and V-27 do not fire on RFC-0463 (it is `accepted`, not `implemented`; its `[x]` items have evidence)

**Completion criterion:** V-26 and V-27 rules present in `validate-rules.ts`, `build:check` passes.

**Human review:** no

---

### Step 2. Write unit tests for V-26 and V-27

**Goal:** Verify V-26 and V-27 behave correctly across all cases.

**Agent actions:**

- Create `packages/forge/os/rfc/handlers/validate-rules.test.ts`
- Test cases for V-26:
  - `status: implemented` with unchecked `[ ]` → error
  - `status: implemented` with all checked `[x]` → no V-26 error
  - `status: accepted` with unchecked `[ ]` → no V-26 error (rule only fires at `implemented`)
  - `status: draft` with unchecked `[ ]` → no V-26 error
- Test cases for V-27:
  - `[x]` with `(evidence: ...)` → no error
  - `[x]` without `(evidence: ...)` → error
  - `[ ]` without evidence → no V-27 error (V-27 only checks `[x]`)
  - Indented `  - [x]` without evidence → no V-27 error (top-level only)
- Use the existing test pattern from `packages/forge/os/naming/naming-convention.test.ts` or `packages/forge/src/tests/` for test structure

**Validation:**

- `pnpm --filter forge run test` passes
- `pnpm --filter forge run build:check` passes

**Completion criterion:** All test cases pass, covering the four V-26 cases and four V-27 cases.

**Human review:** no

---

### Step 3. Strengthen fo-idea-implement skill step 3.6

**Goal:** Update the skill instructions to require semantic verification, evidence annotations, and stub prohibition.

**Agent actions:**

- Read `packages/forge/skills/fo/fo-idea-implement/SKILL.md` lines 142–149 (step 3.6)
- Replace step 3.6 with strengthened instructions:
  1. Verify the criterion is met semantically — check the code does what the criterion says, run the relevant command, inspect the artifact. Mechanical existence (command registered, test passes) is not sufficient.
  2. If the code contains TODO, stub, not-implemented, or placeholder logic in the path the criterion covers, the criterion is NOT met. Implement the real logic.
  3. If a criterion is not met, implement the missing work, commit it, and re-verify.
  4. Annotate every `[x]` with inline evidence: `(evidence: <file-path:line>, <test-or-command>)`.
  5. If a criterion cannot be met (e.g., requires external dependency not yet available), do NOT mark it `[x]` and do NOT stamp `implemented`. Instead, split the deferred work into a follow-up RFC via supersede (RFC-0334).
- Do not proceed to step 3.7 until every acceptance criterion checkbox is checked with evidence.

**Validation:**

- `pnpm --filter forge run build:check` passes
- `forge.skill.validate` passes on the modified skill

**Completion criterion:** Step 3.6 contains semantic verification, evidence annotation requirement, stub prohibition, and supersede escalation for unmet criteria.

**Human review:** no

---

### Step 4. Backfill existing implemented RFCs

**Goal:** Bring all 428 existing `status: implemented` RFCs into compliance with V-26 and V-27.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.list --status implemented --json` to get the full list
- Write a detection script (inline or temporary) that for each implemented RFC:
  - Parses the acceptance criteria section
  - Detects `[x]` without `(evidence: ...)` → candidate for backfill
  - Detects `[ ]` at `implemented` status → candidate for triage
- For evidenceless `[x]` items: backfill with `(evidence: ...)` annotations by inspecting the actual implementation files and tests. Each evidence annotation must point to a real file path and line.
- For unchecked `[ ]` items at `implemented` status: triage each one:
  - If the work was actually completed, check `[x]` and add evidence
  - If the work is genuinely deferred, split via `rfc.supersede.propose` (RFC-0334) — create a follow-up RFC for the deferred work and supersede the original
- Commit backfill in batches per RFC or per logical group

**Validation:**

- `pnpm exec werkstatt run rfc.validate --json` — no V-26 or V-27 violations on any implemented RFC

**Completion criterion:** `rfc.validate` passes on the full RFC tree with zero V-26 and V-27 violations.

**Human review:** no — agent triages autonomously: completed work gets checked with evidence, genuinely deferred work is split via supersede (RFC-0334)

---

### Step 5. Check RFC-0463 acceptance criteria and stamp implemented

**Goal:** Verify all acceptance criteria are met, check all checkboxes with evidence, and transition to `implemented`.

**Agent actions:**

- For each acceptance criterion in RFC-0463:
  - Verify it is met (check the code, run the command, inspect the artifact)
  - Check `[x]` and add `(evidence: ...)` annotation
- Run `pnpm exec werkstatt run rfc.validate RFC-0463 --json` — must pass
- Run `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0463 --json` — must pass (3 file-contains probes)
- Run `pnpm exec werkstatt run rfc.verification.emit --id RFC-0463` — emit evidence file
- Set `status: implemented`, `implementedAt: 2026-07-20`, `updatedAt: 2026-07-20`
- Commit the RFC file and evidence file

**Validation:**

- `rfc.validate RFC-0463 --json` passes
- `rfc.acceptance.run --id RFC-0463 --json` passes
- `rfc.verification.emit --id RFC-0463` produces evidence file with `overall: pass`

**Completion criterion:** RFC-0463 is `status: implemented` with all checkboxes `[x]` and evidence annotations, verification evidence file committed.

**Human review:** no

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm --filter forge run build:check` — scoped typecheck
- `pnpm --filter forge run test` — unit tests for V-26 and V-27
- `pnpm exec werkstatt run rfc.validate RFC-0463 --json` — RFC passes validation
- `pnpm exec werkstatt run rfc.validate --json` — full RFC tree passes validation (after backfill)
- `pnpm exec werkstatt run rfc.acceptance.run --id RFC-0463 --json` — acceptance probes pass
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0463` — verification evidence emitted (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0463.generated.yaml` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0463` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Retroactive failures on existing implemented RFCs | Step 4 backfills all 428 RFCs before stamping implemented |
| Evidence annotations become boilerplate | Step 3 strengthens skill to require semantic verification before writing evidence |
| False positives from regex matching | Step 2 tests edge cases including indented sub-items |
| Agents add evidence but do not verify semantics | Step 3 explicitly prohibits marking met when stubs/TODOs are present |
| Maintenance burden on RFC authors | Mitigated by simple format — one-line `(evidence: ...)` annotation |

## 6. Escalation triggers

- If backfilling existing implemented RFCs reveals an RFC whose deferred work cannot be split via supersede (e.g., the RFC is foundational and splitting would break traceability), run `pnpm exec werkstatt run rfc.supersede.propose --id <rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If V-26 or V-27 produces false positives on a legitimate edge case (e.g., RFC with no acceptance criteria section but `status: implemented`), do not weaken the rules — instead, ensure V-13 (missing section check) fires first and the RFC is fixed to include the section.
