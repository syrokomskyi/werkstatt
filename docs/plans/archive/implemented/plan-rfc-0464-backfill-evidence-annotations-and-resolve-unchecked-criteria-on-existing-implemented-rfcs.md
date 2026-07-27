---
rfcId: RFC-0464
planId: PLAN-RFC-0464-01
status: draft
owner: architecture
createdAt: 2026-07-20
updatedAt:
scope:
  apps: []
  packages: []
  services: []
  docs:
    - docs/rfcs/archive/implemented/**/*.md
---

# Implementation Plan: RFC-0464

## 1. Objectives

- [ ] Objective 1 — V-27 backfill: all 2846 evidenceless `[x]` items in 342 RFCs get `(evidence: ...)` annotations (maps to acceptance criterion 1)
- [ ] Objective 2 — V-26 triage: all 165 RFCs with unchecked `[ ]` at `implemented` status resolved (maps to acceptance criterion 2)
- [ ] Objective 3 — Full RFC tree validation passes with zero V-26 and V-27 violations (maps to acceptance criterion 3)
- [ ] Objective 4 — No fake evidence: spot-check confirms evidence points to real files (maps to acceptance criterion 4)
- [ ] Objective 5 — `rfc.validate` passes on RFC-0464 itself (maps to acceptance criterion 5)

## 2. Affected artifacts

### 2.1 Code and commands

No code changes. No new commands. This is a document-editing operation only.

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- `docs/rfcs/archive/implemented/**/*.md` — 342 files with V-27 violations, backfilled with `(evidence: ...)` annotations
- `docs/rfcs/archive/implemented/**/*.md` — 165 files with V-26 violations, triaged (checked + evidence or split via supersede)
- `docs/rfcs/rfc-0464-*.md` — acceptance criteria checked with evidence during implementation

### 2.4 Validation and pipelines

- `rfc.validate --json` — verification command, already runs in `build.check`
- No pipeline changes

## 3. Step sequence

### Step 1. V-27 backfill — batch 1 (first 50 RFCs)

**Goal:** Start the V-27 evidence annotation backfill with the first batch of 50 RFCs.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --json` and extract the list of V-27 violations
- Sort violations by file path, take the first 50 files
- For each file, read the RFC, find each `[x]` without `(evidence: ...)`, inspect the codebase to find the real implementation file and/or test, add `(evidence: <file-path:line>, <test-or-command>)` annotation
- Verify each evidence file path exists before writing
- Commit the batch

**Validation:**

- `pnpm exec site-kernel run rfc.validate --json` — V-27 count decreased by at least the number of items fixed in this batch

**Completion criterion:** 50 RFCs backfilled with evidence annotations, V-27 count decreased.

**Human review:** no

---

### Step 2..N. V-27 backfill — subsequent batches

**Goal:** Continue V-27 backfill in batches of 50 RFCs until all 342 files are done.

**Agent actions:**

- Repeat Step 1 for the next 50 RFCs
- Continue until V-27 count reaches 0
- Each batch is a separate commit

**Validation:**

- `pnpm exec site-kernel run rfc.validate --json` — V-27 count reaches 0 after the final batch

**Completion criterion:** V-27 count = 0 in `rfc.validate --json`.

**Human review:** no

---

### Step N+1. V-26 triage — batch 1 (first 20 RFCs)

**Goal:** Start V-26 triage of RFCs with unchecked `[ ]` at `implemented` status.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --json` and extract the list of V-26 violations
- Sort by file path, take the first 20 files
- For each RFC, read it and determine for each unchecked `[ ]`:
  - Was the work completed? Check the codebase for the implementation. If yes, check `[x]` and add `(evidence: ...)`.
  - Is the work genuinely deferred? If yes, use `rfc.supersede.propose` to create a follow-up RFC for the deferred work.
- Commit the batch

**Validation:**

- `pnpm exec site-kernel run rfc.validate --json` — V-26 count decreased

**Completion criterion:** 20 RFCs triaged, V-26 count decreased.

**Human review:** no — agent triages autonomously per RFC-0464 decision

---

### Step N+2..M. V-26 triage — subsequent batches

**Goal:** Continue V-26 triage in batches of 20 RFCs until all 165 files are resolved.

**Agent actions:**

- Repeat Step N+1 for the next 20 RFCs
- Continue until V-26 count reaches 0
- Each batch is a separate commit

**Validation:**

- `pnpm exec site-kernel run rfc.validate --json` — V-26 count reaches 0

**Completion criterion:** V-26 count = 0 in `rfc.validate --json`.

**Human review:** no

---

### Step M+1. Final validation and evidence spot-check

**Goal:** Confirm all violations are resolved and evidence is genuine.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --json` — must exit 0 with zero V-26 and V-27 violations
- Spot-check 10 random RFCs: verify evidence annotations point to files that exist in the codebase
- If any fake evidence is found, fix it

**Validation:**

- `rfc.validate --json` exitCode = 0
- 10 random RFCs pass spot-check

**Completion criterion:** Full RFC tree validation passes, spot-check passes.

**Human review:** no

---

### Step M+2. Check RFC-0464 acceptance criteria and stamp implemented

**Goal:** Verify all acceptance criteria, check all checkboxes with evidence, transition to `implemented`.

**Agent actions:**

- For each acceptance criterion in RFC-0464:
  - Verify it is met
  - Check `[x]` and add `(evidence: ...)` annotation
- Run `pnpm exec site-kernel run rfc.validate RFC-0464 --json` — must pass
- Set `status: implemented`, `implementedAt: <today's date>`, `updatedAt: <today's date>`
- Commit the RFC file

**Validation:**

- `rfc.validate RFC-0464 --json` passes

**Completion criterion:** RFC-0464 is `status: implemented` with all checkboxes `[x]` and evidence annotations.

**Human review:** no

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --json` — full RFC tree passes with zero V-26 and V-27 violations
- `pnpm exec site-kernel run rfc.validate RFC-0464 --json` — RFC-0464 passes validation

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0464` in the subject line (RFC-0265 commit hygiene)
- Evidence annotations on all RFC-0464 acceptance criteria checkboxes

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Evidence annotations are inaccurate | Each batch verifies file paths exist before writing; final spot-check (Step M+1) |
| Triage produces too many supersede proposals | Batch triage in groups of 20, prioritize completed work |
| Backfill takes multiple sessions (10-25 estimated) | Each batch is a separate commit; progress is resumable |
| New RFCs created during backfill | Out of scope — new RFCs self-comply per RFC-0463 |

## 6. Escalation triggers

- If triage of an RFC reveals an invariant conflict (the RFC's unchecked criterion contradicts a DNA invariant), run `pnpm exec site-kernel run rfc.supersede.propose --id <rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If an RFC has so many unchecked criteria that supersede would fragment the work, consider creating a single follow-up RFC that supersede the original and covers all deferred work.
