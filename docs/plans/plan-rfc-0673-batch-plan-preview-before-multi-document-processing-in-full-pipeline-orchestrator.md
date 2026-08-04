---
rfcId: RFC-0673
planId: PLAN-RFC-0673-01
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

# Implementation Plan: RFC-0673

## 1. Objectives

- [ ] Objective 1 — Add §Batch plan preview section to `fo-pipeline-conventions.md` (maps to acceptance criterion 1)
- [ ] Objective 2 — Add batch plan preview reference to orchestrator skill (maps to acceptance criterion 2)
- [ ] Objective 3 — Sync both skill files to `.agents/skills/` (maps to acceptance criteria 3, 4)
- [ ] Objective 4 — Verify `forge.doctor` passes with zero stale copies (maps to acceptance criterion 7)
- [ ] Objective 5 — Verify `rfc.validate` passes on RFC-0673 (maps to acceptance criterion 8)

## 2. Affected artifacts

No code changes. Skill-text-only policy change.

- `packages/forge/skills/_shared/fo-pipeline-conventions.md` — new §Batch plan preview section.
- `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` — references batch plan preview convention.
- `.agents/skills/` — synced copies.
- `packages/forge/AGENTS.md` — no change needed.

## 3. Step sequence

### Step 1. Add batch plan preview directive to fo-pipeline-conventions.md

**Goal:** Add §Batch plan preview section after the error checkpoint section (RFC-0672).

**Completion criterion:** `fo-pipeline-conventions.md` contains `## Batch plan preview` section with table format, "informational, not a gate" principle, and `aiLanguage` requirement.

---

### Step 2. Add batch plan preview reference to orchestrator skill

**Goal:** Add batch plan preview reference to orchestrator skill Process section, step 1, before "For each document, run the full pipeline inline".

**Completion criterion:** Orchestrator skill references `_shared/fo-pipeline-conventions.md` §Batch plan preview.

---

### Step 3. Sync to .agents/skills/

**Completion criterion:** Both synced copies byte-identical to sources.

---

### Step 4. Validate

**Completion criterion:** `forge.doctor`, `forge.skill.validate`, `rfc.validate --id RFC-0673` all pass.

---

### Final Step. Acceptance criteria, review, stamp

**Completion criterion:** RFC-0673 is `implemented`.

## 4. Validation suite

- `rfc.validate --id RFC-0673`, `forge.doctor`, `forge.skill.validate`.
- No `build:check` needed.

## 5. Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| Preview noise for small batches | Step 1: directive notes 2-document batch gets concise table |
| Wrong complexity estimate | Step 1: directive states heuristic is informational, not a commitment |
| Operator confusion (interprets as approval gate) | Step 1: directive explicitly says "informational, not a gate" |

## 6. Escalation triggers

- If `forge.skill.validate` reports a SKILL rule violation, revise text to comply.
