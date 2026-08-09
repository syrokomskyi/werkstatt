---
rfcId: RFC-0671
planId: PLAN-RFC-0671-01
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

# Implementation Plan: RFC-0671

## 1. Objectives

- [ ] Objective 1 — Add §Progress beacon section to `fo-pipeline-conventions.md` (maps to acceptance criterion 1)
- [ ] Objective 2 — Add beacon reference to orchestrator skill (maps to acceptance criterion 2)
- [ ] Objective 3 — Sync both skill files to `.agents/skills/` (maps to acceptance criteria 3, 4)
- [ ] Objective 4 — Verify `forge.doctor` passes with zero stale copies (maps to acceptance criterion 7)
- [ ] Objective 5 — Verify `rfc.validate` passes on RFC-0671 (maps to acceptance criterion 8)

## 2. Affected artifacts

No code changes. Skill-text-only policy change.

- `packages/forge/skills/_shared/fo-pipeline-conventions.md` — new §Progress beacon section.
- `packages/forge/skills/fo/fo-idea-i-just-want-to-see-the-result/SKILL.md` — references beacon convention.
- `.agents/skills/` — synced copies.
- `packages/forge/AGENTS.md` — no change needed.

## 3. Step sequence

### Step 1. Add progress beacon directive to fo-pipeline-conventions.md

**Goal:** Add §Progress beacon section after the step checkpoint section (RFC-0670).

**Completion criterion:** `fo-pipeline-conventions.md` contains `## Progress beacon` section with format and `aiLanguage` requirement.

---

### Step 2. Add beacon reference to orchestrator skill

**Goal:** Add progress beacon reference to orchestrator skill Process section.

**Completion criterion:** Orchestrator skill references `_shared/fo-pipeline-conventions.md` §Progress beacon.

---

### Step 3. Sync to .agents/skills/

**Completion criterion:** Both synced copies byte-identical to sources.

---

### Step 4. Validate

**Completion criterion:** `forge.doctor`, `forge.skill.validate`, `rfc.validate --id RFC-0671` all pass.

---

### Final Step. Acceptance criteria, review, stamp

**Completion criterion:** RFC-0671 is `implemented`.

## 4. Validation suite

- `rfc.validate --id RFC-0671`, `forge.doctor`, `forge.skill.validate`.
- No `build:check` needed.

## 5. Risks and mitigation

| Risk                     | Mitigation                                               |
| ------------------------ | -------------------------------------------------------- |
| Beacon noise in batch    | Step 1: directive notes 30 beacons for 5×6 is acceptable |
| Beacon during fix cycles | Step 1: directive specifies ✗ then ✓                     |
| Wrong language           | Step 1: directive requires `aiLanguage`                  |

## 6. Escalation triggers

- If `forge.skill.validate` reports a SKILL rule violation, revise text to comply.
