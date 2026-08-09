---
rfcId: RFC-0670
planId: PLAN-RFC-0670-01
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

# Implementation Plan: RFC-0670

## 1. Objectives

- [ ] Objective 1 — Add §Step-level context checkpoint during implementation section to `fo-pipeline-conventions.md` (maps to acceptance criterion 1)
- [ ] Objective 2 — Add step checkpoint reference to orchestrator skill's step 4 (maps to acceptance criterion 2)
- [ ] Objective 3 — Sync both skill files to `.agents/skills/` (maps to acceptance criteria 3, 4)
- [ ] Objective 4 — Verify `forge.doctor` passes with zero stale copies (maps to acceptance criterion 7)
- [ ] Objective 5 — Verify `rfc.validate` passes on RFC-0670 (maps to acceptance criterion 8)

## 2. Affected artifacts

### 2.1 Code and commands

No code changes. No new Site OS commands. This is a skill-text-only policy change.

### 2.2 Documentation and specs

- `packages/forge/skills/_shared/fo-pipeline-conventions.md` — new §Step-level context checkpoint during implementation section added after the existing §Context checkpoint between batch items section (added by RFC-0669).
- `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` — step 4 (Implement) gains a step-level checkpoint reference.
- `.agents/skills/` — synced copies of both files.
- `packages/forge/AGENTS.md` — no change needed.

### 2.3 Validation and pipelines

- `forge.doctor`, `forge.skill.validate`, `rfc.validate --id RFC-0670`.
- No `build:check` needed — no TypeScript code changes.

## 3. Step sequence

### Step 1. Add step checkpoint directive to fo-pipeline-conventions.md

**Goal:** Add the §Step-level context checkpoint during implementation section after the §Context checkpoint between batch items section.

**Agent actions:**

- Read `packages/forge/skills/_shared/fo-pipeline-conventions.md`.
- Append the new section after the RFC-0669 checkpoint section. Content from RFC-0670 §Design → Step checkpoint directive.

**Completion criterion:** `fo-pipeline-conventions.md` contains `## Step-level context checkpoint during implementation` section with the 3-step directive and >=5 steps threshold.

---

### Step 2. Add step checkpoint reference to orchestrator skill

**Goal:** Add step-level checkpoint reference to step 4 (Implement) of the orchestrator skill.

**Agent actions:**

- Read `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md`.
- In step 4 (Implement), after the existing `fo-idea-implement` text, add the step-level checkpoint reference from RFC-0670 §Design → Orchestrator skill reference.

**Completion criterion:** Orchestrator skill step 4 references `_shared/fo-pipeline-conventions.md` §Step-level context checkpoint during implementation.

---

### Step 3. Sync to .agents/skills/

**Goal:** Copy updated skill files to `.agents/skills/`.

**Agent actions:**

- Copy both source files to their `.agents/skills/` counterparts.
- Commit all 4 files in a single commit.

**Completion criterion:** Both synced copies are byte-identical to sources.

---

### Step 4. Validate

**Goal:** Run all validation commands.

**Agent actions:**

- Run `forge.doctor`, `forge.skill.validate`, `rfc.validate --id RFC-0670`.

**Completion criterion:** All three commands pass.

---

### Final Step. Acceptance criteria, review, stamp

**Goal:** Verify all acceptance criteria, run code review, stamp as implemented.

**Agent actions:**

- Mark all 8 acceptance criteria with `[x]` and inline evidence.
- Run `fo-review` on session changes.
- Run `fo-fix` if findings.
- Run `rfc.implement.stamp --id RFC-0670 --implementation-commit <sha>`.

**Completion criterion:** RFC-0670 is `implemented`.

## 4. Validation suite

- `rfc.validate --id RFC-0670`
- `forge.doctor`
- `forge.skill.validate`
- No `build:check` needed.
- No `rfc.verification.emit` needed — no acceptance probes.

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Checkpoint overhead for medium RFCs | Step 1: directive specifies >=5 steps threshold |
| Agent confusion between step and batch checkpoints | Step 1: different marker names (`--- step checkpoint ---` vs `--- checkpoint ---`) |
| No mechanical enforcement | Step 4: `forge.skill.validate` + `fo-review` |
| False resume confidence | Step 1: directive includes git log verification |

## 6. Escalation triggers

- If `forge.skill.validate` reports a SKILL rule violation, revise text to comply.
- If invariant conflict, run `rfc.supersede.propose`.
