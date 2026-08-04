---
rfcId: RFC-0672
planId: PLAN-RFC-0672-01
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

# Implementation Plan: RFC-0672

## 1. Objectives

- [ ] Objective 1 — Add §Error checkpoint for pipeline step failures section to `fo-pipeline-conventions.md` (maps to acceptance criterion 1)
- [ ] Objective 2 — Add error checkpoint reference to orchestrator skill (maps to acceptance criterion 2)
- [ ] Objective 3 — Sync both skill files to `.agents/skills/` (maps to acceptance criteria 3, 4)
- [ ] Objective 4 — Verify `forge.doctor` passes with zero stale copies (maps to acceptance criterion 8)
- [ ] Objective 5 — Verify `rfc.validate` passes on RFC-0672 (maps to acceptance criterion 9)

## 2. Affected artifacts

No code changes. Skill-text-only policy change.

- `packages/forge/skills/_shared/fo-pipeline-conventions.md` — new §Error checkpoint for pipeline step failures section.
- `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` — references error checkpoint convention.
- `.agents/skills/` — synced copies.
- `packages/forge/AGENTS.md` — no change needed.

## 3. Step sequence

### Step 1. Add error checkpoint directive to fo-pipeline-conventions.md

**Goal:** Add §Error checkpoint for pipeline step failures section after the progress beacon section (RFC-0671).

**Completion criterion:** `fo-pipeline-conventions.md` contains `## Error checkpoint for pipeline step failures` section with 3-step directive (emit, stop, report), 2-attempt threshold, and explicit "no pauses" exception justification.

---

### Step 2. Add error checkpoint reference to orchestrator skill

**Goal:** Add error checkpoint reference to orchestrator skill Process section.

**Completion criterion:** Orchestrator skill references `_shared/fo-pipeline-conventions.md` §Error checkpoint for pipeline step failures.

---

### Step 3. Sync to .agents/skills/

**Completion criterion:** Both synced copies byte-identical to sources.

---

### Step 4. Validate

**Completion criterion:** `forge.doctor`, `forge.skill.validate`, `rfc.validate --id RFC-0672` all pass.

---

### Final Step. Acceptance criteria, review, stamp

**Completion criterion:** RFC-0672 is `implemented`.

## 4. Validation suite

- `rfc.validate --id RFC-0672`, `forge.doctor`, `forge.skill.validate`.
- No `build:check` needed.

## 5. Risks and mitigation

| Risk | Mitigation |
| --- | --- |
| Agent continues past error | Step 1: directive says "stop the pipeline" with explicit exception justification |
| Stale checkpoint on resume | Step 1: resume logic verifies partialState.rfcStatus against current frontmatter |
| No mechanical enforcement | Step 4: `forge.skill.validate` + `fo-review` |

## 6. Escalation triggers

- If `forge.skill.validate` reports a SKILL rule violation, revise text to comply.
