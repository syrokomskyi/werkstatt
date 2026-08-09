---
rfcId: RFC-0669
planId: PLAN-RFC-0669-01
status: draft
owner: architecture
createdAt: 2026-08-04
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - packages/forge/skills/_shared/fo-pipeline-conventions.md
    - packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md
    - .agents/skills/_shared/fo-pipeline-conventions.md
    - .agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md
---

# Implementation Plan: RFC-0669

## 1. Objectives

- [ ] Objective 1 — Add §Context checkpoint between batch items section to `fo-pipeline-conventions.md` (maps to acceptance criterion 1)
- [ ] Objective 2 — Add checkpoint reference to orchestrator skill's Process section (maps to acceptance criterion 2)
- [ ] Objective 3 — Sync both skill files to `.agents/skills/` (maps to acceptance criteria 3, 4)
- [ ] Objective 4 — Verify `forge.doctor` passes with zero stale copies (maps to acceptance criterion 7)
- [ ] Objective 5 — Verify `rfc.validate` passes on RFC-0669 (maps to acceptance criterion 8)

## 2. Affected artifacts

### 2.1 Code and commands

No code changes. No new Site OS commands. No registry entries. This is a skill-text-only policy change.

### 2.2 Configuration and data

No configuration or data file changes.

### 2.3 Documentation and specs

- `packages/forge/skills/_shared/fo-pipeline-conventions.md` — new §Context checkpoint between batch items section added after the existing §Session-end sequence section.
- `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` — Process section (step 1) gains a "Between batch items" subsection after "For each document, run the full pipeline inline."
- `.agents/skills/_shared/fo-pipeline-conventions.md` — synced copy updated.
- `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md` — synced copy updated.
- `packages/forge/AGENTS.md` — no change needed (documents skill infrastructure, not individual skill behavior).
- No `docs/*.xml` Compass files need synchronization — this RFC does not change repository-wide requirements, technology, or development plans.
- No `docs/architecture-dna.md` change — this RFC does not establish a new DNA invariant.

### 2.4 Validation and pipelines

- `forge.doctor` — verifies synced skill copies are not stale.
- `forge.skill.validate` — verifies skill text complies with SKILL-01..21.
- `rfc.validate --id RFC-0669` — verifies RFC frontmatter and sections.
- No `build:check` needed — no TypeScript code changes.

## 3. Step sequence

### Step 1. Add checkpoint directive to fo-pipeline-conventions.md

**Goal:** Add the §Context checkpoint between batch items section to the shared conventions file.

**Agent actions:**

- Read `packages/forge/skills/_shared/fo-pipeline-conventions.md` (120 lines).
- Append a new `## Context checkpoint between batch items` section after the existing `## Session-end sequence` section (after line 120).
- The section content is specified in RFC-0669 §Design → Checkpoint directive. It contains: the 3-step checkpoint process (emit, release, fresh start), the resume marker note, and the >=2 documents scope limit.

**Validation:**

- `forge.skill.validate` on the forge skills directory passes.
- The section heading matches exactly: `## Context checkpoint between batch items`.

**Completion criterion:** `packages/forge/skills/_shared/fo-pipeline-conventions.md` contains a `## Context checkpoint between batch items` section with the 3-step directive, resume marker note, and >=2 scope limit.

**Human review:** no — the section content is fully specified in the RFC.

---

### Step 2. Add checkpoint reference to orchestrator skill

**Goal:** Add the "Between batch items" subsection to the orchestrator skill's Process section.

**Agent actions:**

- Read `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` (168 lines).
- In the Process section (step 1), after line 55 ("For each document, run the full pipeline inline. The pipeline differs for RFCs and ADRs."), add a new subsection:

  ```markdown
  **Between batch items:** After completing one document's pipeline and before
  starting the next, perform a context checkpoint per
  `_shared/fo-pipeline-conventions.md` §Context checkpoint between batch items.
  Emit the checkpoint block, release completed-item context, and start the next
  item with a fresh read phase. This does not pause for operator input — the
  checkpoint is an agent-internal context management step, not a user interaction.
  ```

- Do not modify the existing "No pauses between pipeline steps" constraint (line 160) — the checkpoint is an agent-internal step, not a pause.

**Validation:**

- `forge.skill.validate` on the forge skills directory passes.
- The subsection references `_shared/fo-pipeline-conventions.md` §Context checkpoint between batch items.

**Completion criterion:** `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` Process section contains a "Between batch items" subsection referencing the checkpoint convention.

**Human review:** no — the subsection text is fully specified in the RFC.

---

### Step 3. Sync to .agents/skills/

**Goal:** Copy the updated skill files to `.agents/skills/` so `forge.doctor` does not report drift.

**Agent actions:**

- Copy `packages/forge/skills/_shared/fo-pipeline-conventions.md` to `.agents/skills/_shared/fo-pipeline-conventions.md`.
- Copy `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` to `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md`.
- Commit all 4 files (2 source + 2 synced) in a single commit.

**Validation:**

- `forge.doctor` reports zero stale skill copies.
- `diff` between source and synced copies shows no differences.

**Completion criterion:** Both `.agents/skills/` copies are byte-identical to their `packages/forge/skills/` sources.

**Human review:** no — mechanical sync.

---

### Step 4. Validate skills and RFC

**Goal:** Run all validation commands to verify the changes are clean.

**Agent actions:**

- Run `pnpm exec werkstatt run forge.doctor` — verify zero stale skill copies.
- Run `pnpm exec werkstatt run forge.skill.validate` — verify skill text complies with SKILL-01..21.
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0669` — verify RFC is valid.

**Validation:**

- All three commands return `status: pass` / `ok: true`.

**Completion criterion:** `forge.doctor`, `forge.skill.validate`, and `rfc.validate --id RFC-0669` all pass.

**Human review:** no — mechanical validation.

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Verify all acceptance criteria, run code review, and stamp the RFC as implemented.

**Agent actions:**

- Verify every acceptance criterion in RFC-0669 against the implemented changes:
  - [x] `fo-pipeline-conventions.md` contains §Context checkpoint section (evidence: `packages/forge/skills/_shared/fo-pipeline-conventions.md:<line>`)
  - [x] Orchestrator SKILL.md Process section references checkpoint convention (evidence: `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md:<line>`)
  - [x] `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md` synced (evidence: `.agents/skills/fo-idea-i-just-want-to-see-the-result/SKILL.md:<line>`)
  - [x] `.agents/skills/_shared/fo-pipeline-conventions.md` synced (evidence: `.agents/skills/_shared/fo-pipeline-conventions.md:<line>`)
  - [x] Checkpoint block format documented with YAML example (evidence: `docs/rfcs/rfc-0669-*.md:<line>`)
  - [x] Resume logic documented (evidence: `docs/rfcs/rfc-0669-*.md:<line>`)
  - [x] `forge.doctor` passes (evidence: command output)
  - [x] `rfc.validate` passes (evidence: command output)
- No `AGENTS.md` updates needed — `packages/forge/AGENTS.md` documents skill infrastructure, not individual skill behavior.
- No `docs/*.xml` Compass sync needed — no repository-wide semantic changes.
- No `docs/architecture-dna.md` update needed — no new DNA invariant.
- No `ecosystem.manifest.generate` needed — no command surfaces changed.
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Since this is a skill-text-only change (no `.ts` code), the review checks skill text quality, binding compliance, and sync correctness.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0669 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0669` — passes.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0669`
- `pnpm exec werkstatt run forge.doctor`
- `pnpm exec werkstatt run forge.skill.validate`
- No `build:check` needed — no TypeScript code changes.
- No `rfc.verification.emit` needed — RFC-0669 has no acceptance probes (commented out in frontmatter).

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0669` in the subject line (RFC-0265 commit hygiene).
- No `docs/rfcs/verification/rfc-0669.generated.json` — no acceptance probes declared.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent misinterpretation ("release context" = delete files) | Step 1: checkpoint directive explicitly states "release means treat as no longer actionable for reasoning, not delete or undo" |
| Checkpoint verbosity | Step 1: directive specifies 1-3 short freeform sentences |
| False resume confidence | Step 1: directive includes git log verification; Step 2: orchestrator references the full resume logic from RFC §Resume behavior |
| No mechanical enforcement | Step 4: `forge.skill.validate` validates skill text structure; `fo-review` in Final Step checks for checkpoint blocks in session output |
| Single-RFC edge case | Step 1: directive specifies >=2 documents scope limit |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0669 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `forge.skill.validate` reports a SKILL rule violation in the new checkpoint text, revise the text to comply — do not weaken the directive.
