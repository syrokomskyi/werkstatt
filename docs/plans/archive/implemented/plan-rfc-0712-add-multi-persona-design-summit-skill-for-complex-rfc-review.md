---
rfcId: RFC-0712
planId: PLAN-RFC-0712-01
status: draft
owner: architecture
createdAt: 2026-08-06
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - docs/summits/README.md
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0712

## 1. Objectives

- [ ] Objective 1 — create `fo-design-summit` skill with 5 personas and summit report format (maps to criteria 1, 4, 5, 6)
- [ ] Objective 2 — sync skill to `.agents/skills/` and create `docs/summits/` directory (maps to criteria 2, 3)
- [ ] Objective 3 — update `fo-idea-plan` with summit suggestion step 5b (maps to criterion 7)
- [ ] Objective 4 — verify `fo-idea-i-just-want-to-see-the-result` does NOT invoke summit (maps to criterion 8)
- [ ] Objective 5 — validate with `skill.validate` and `rfc.validate` (maps to criteria 9, 10)
- [ ] Objective 6 — update `packages/forge/AGENTS.md` skill count (maps to rollout section)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/skills/fo/fo-design-summit/SKILL.md` — new skill definition (created)
- `.agents/skills/fo-design-summit/SKILL.md` — synced copy (created)
- `packages/forge/skills/fo/fo-idea-plan/SKILL.md` — add step 5b summit suggestion (modified)
- `.agents/skills/fo-idea-plan/SKILL.md` — synced copy (modified)

No new Site OS commands. No pipeline wiring. No registry changes.

### 2.2 Configuration and data

None — the summit skill is a markdown-only skill with no code, no schemas, no configuration files.

### 2.3 Documentation and specs

- `docs/summits/README.md` — new directory README explaining summit reports purpose (created)
- `packages/forge/AGENTS.md` — update skill count from "44 skills" to "45 skills" (modified)
- `docs/rfcs/rfc-0712-*.md` — read-only reference (not modified during implementation)

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run skill.validate --skill fo-design-summit` — validate new skill
- `pnpm exec site-kernel run rfc.validate --id RFC-0712` — validate RFC before stamping
- No pipeline integration — summit reports are informational artifacts, not part of any build or validation pipeline

## 3. Step sequence

### Step 1. Create `fo-design-summit` SKILL.md

**Goal:** Create the skill definition with 5 personas, process, report format, and failure modes.

**Agent actions:**

- Create `packages/forge/skills/fo/fo-design-summit/SKILL.md` with frontmatter:
  - `name: fo-design-summit`
  - `description: Simulate a multi-persona design discussion for complex RFCs...`
  - `invocation: user`
  - `category: fo`
  - `concerns: document-only`
  - `dependsOn: ['my-preferences', 'fo-idea-audit']`
  - `languagePolicy: ref(PREFERENCES.md)`
  - `bindings: requires: [paths.invariantsFile], optional: []`
  - `triggers: ["design summit", "multi-persona review", "party mode"]`
- Write skill body with:
  - Process steps 1–6 (read RFC, read audit, run personas, synthesize, persist, suggest actions)
  - 5 persona definitions (Architect, Security Engineer, QA Engineer, Product Manager, Developer Advocate) with focus and key questions
  - Summit report format (YAML frontmatter + markdown body with per-persona findings, consensus findings, recommendation)
  - Invocation criteria (architecture + workspace scope, 2+ DNA invariants, new package/command/lifecycle, supersedes, operator request)
  - Failure modes (RFC not found, audit not run, RFC too small, persona overlap)
  - Constraints section referencing `_shared/fo-pipeline-conventions.md` and `_shared/fo-session-summary.md`
- Use `ref(forge.yaml bindings.paths.invariantsFile)` for DNA invariants file path in skill instructions (DNA-54 compliance)

**Validation:**

- File exists at `packages/forge/skills/fo/fo-design-summit/SKILL.md`
- Frontmatter parses as valid YAML
- `concerns` field is `document-only` (not `read-only`)

**Completion criterion:** SKILL.md created with all 5 personas, process steps, report format, and `ref()` notation for bindings.

**Human review:** no

---

### Step 2. Create `docs/summits/` directory with README

**Goal:** Create the directory for summit reports with an explanatory README.

**Agent actions:**

- Create `docs/summits/` directory
- Create `docs/summits/README.md` explaining:
  - Purpose: multi-persona design summit reports for complex RFCs
  - How summit reports are created: by `fo-design-summit` skill
  - That summit reports are informational artifacts, not governance documents
  - That summit reports do not block RFC acceptance

**Validation:**

- `docs/summits/README.md` exists and contains purpose explanation

**Completion criterion:** `docs/summits/` directory exists with README.

**Human review:** no

---

### Step 3. Sync skill to `.agents/skills/`

**Goal:** Sync the new skill to the flat `.agents/skills/` directory.

**Agent actions:**

- Copy `packages/forge/skills/fo/fo-design-summit/SKILL.md` to `.agents/skills/fo-design-summit/SKILL.md`
- Verify the synced copy matches the source

**Validation:**

- `.agents/skills/fo-design-summit/SKILL.md` exists
- Content matches `packages/forge/skills/fo/fo-design-summit/SKILL.md`

**Completion criterion:** Skill synced to `.agents/skills/fo-design-summit/SKILL.md`.

**Human review:** no

---

### Step 4. Update `fo-idea-plan` with summit suggestion (step 5b)

**Goal:** Add the summit suggestion sub-step to `fo-idea-plan` step 5 (grill the plan).

**Agent actions:**

- Edit `packages/forge/skills/fo/fo-idea-plan/SKILL.md`:
  - After step 5 (grill the plan), add step 5b:
    > **5b. Summit suggestion.** If the RFC meets summit criteria (architecture + workspace scope, 2+ DNA invariants, new package/command/lifecycle, supersedes), suggest using `fo-design-summit` before acceptance. Use `ask_user_question`:
    >
    > "This RFC is complex (architecture, workspace scope, 2+ DNA invariants). Should I run a multi-persona design summit before acceptance?"
    >
    > Recommended option: "Run summit" — because complex RFCs benefit from multi-perspective review.
- Sync the updated `fo-idea-plan` to `.agents/skills/fo-idea-plan/SKILL.md`

**Validation:**

- `packages/forge/skills/fo/fo-idea-plan/SKILL.md` contains step 5b
- `.agents/skills/fo-idea-plan/SKILL.md` matches the source

**Completion criterion:** `fo-idea-plan` SKILL.md updated with step 5b in both source and synced copy.

**Human review:** no

---

### Step 5. Update `packages/forge/AGENTS.md` skill count

**Goal:** Update the skill count from "44 skills" to "45 skills".

**Agent actions:**

- Edit `packages/forge/AGENTS.md`:
  - Change "44 skills" to "45 skills" in the Skills section description
  - The line currently reads: "36 fo skills + 5 shared + 3 meta = 44 skills" — update to "37 fo skills + 5 shared + 3 meta = 45 skills"

**Validation:**

- `packages/forge/AGENTS.md` contains "45 skills" (not "44 skills")

**Completion criterion:** AGENTS.md skill count updated.

**Human review:** no

---

### Step 6. Validate

**Goal:** Run all validation checks to confirm the implementation is correct.

**Agent actions:**

- Run `pnpm exec site-kernel run skill.validate --skill fo-design-summit` — verify SKILL-01..13 pass
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0712` — verify RFC passes
- Verify `fo-idea-i-just-want-to-see-the-result` SKILL.md does NOT reference `fo-design-summit` (criterion 8)
- Run `pnpm --filter @warpgogol/forge run build:check` — verify typecheck passes

**Validation:**

- `skill.validate` passes on `fo-design-summit`
- `rfc.validate` passes on RFC-0712
- `build:check` passes on `@warpgogol/forge`
- `fo-idea-i-just-want-to-see-the-result` does NOT invoke summit

**Completion criterion:** All validation checks pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify all acceptance criteria in RFC-0712 are met:
  1. `fo-design-summit` skill created in `packages/forge/skills/fo/fo-design-summit/` with SKILL.md
  2. `fo-design-summit` synced to `.agents/skills/fo-design-summit/SKILL.md`
  3. `docs/summits/` directory created with a README explaining the purpose
  4. Skill implements 5 personas with distinct review focuses
  5. Summit report includes consensus findings and unique findings
  6. Summit report persisted to `docs/summits/summit-<rfc-id>.md`
  7. `fo-idea-plan` skill instructions updated with summit suggestion (step 5b)
  8. `fo-idea-i-just-want-to-see-the-result` does NOT invoke summit by default
  9. `skill.validate` passes on `fo-design-summit` SKILL.md
  10. `rfc.validate` passes on this file before merging
- Mark each criterion `[x]` with inline `(evidence: <file:line>)` annotation
- Run `fo-review` on all session code changes
- Run `fo-fix` if review has findings
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0712 --implementation-commit <sha>`
- Run `fo-doc-audit` to sync documentation surfaces

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0712` — passes
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0712`
- `pnpm exec site-kernel run skill.validate --skill fo-design-summit`
- `pnpm --filter @warpgogol/forge run build:check`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0712` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Persona caricature — shallow persona findings | Step 1: skill instructions include persona-specific review checklists and example findings |
| Summit report rot — stale reports after RFC amendment | Step 1: summit report includes RFC status at summit time; new summit may be run after amendment |
| False confidence — clean summit creates false sense of security | Step 1: summit report explicitly states "no findings does not mean no issues" |
| Operator fatigue — running summits for every RFC | Step 4: criteria-based suggestion in `fo-idea-plan` limits suggestions to complex RFCs |

## 6. Escalation triggers

- If `skill.validate` reveals a SKILL-11 violation (hardcoded project literals) in `fo-design-summit`, fix the skill instructions to use `ref()` notation — do not suppress the violation.
- If `skill.validate` reveals a SKILL-12 violation (wrong concern level), ensure `concerns` is `document-only` — do not downgrade to `read-only`.
