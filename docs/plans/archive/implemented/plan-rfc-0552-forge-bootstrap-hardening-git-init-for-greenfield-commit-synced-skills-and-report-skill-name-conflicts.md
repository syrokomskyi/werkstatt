---
rfcId: RFC-0552
planId: PLAN-RFC-0552-01
status: draft
owner: architecture
createdAt: 2026-07-27
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0552

## 1. Objectives

- [ ] Add `skippedSkills` field to `InitResult` and detect Forge-vs-pack skill name conflicts in `runInit()` — maps to acceptance criteria 3, 4, 8
- [ ] Add `skippedSkills` field to `UpgradeResult` and detect Forge-vs-pack skill name conflicts in `runUpgrade()` — maps to acceptance criteria 5, 6, 8
- [ ] Add git init step to `forge-bootstrap` SKILL.md greenfield mode — maps to acceptance criterion 1
- [ ] Add skill commit step to `forge-bootstrap` SKILL.md (both greenfield and transplant modes) — maps to acceptance criterion 2
- [ ] Add skipped-skills reporting to `forge-bootstrap` SKILL.md welcoming report — maps to acceptance criterion 7
- [ ] Update `packages/forge/AGENTS.md` with new behavior documentation — maps to acceptance criterion 10
- [ ] Unit tests for conflict detection in both `runInit()` and `runUpgrade()` — maps to acceptance criterion 9

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/onboarding/init.ts` — add `skippedSkills` to `InitResult`, add conflict detection between Forge skills and pack skills
- `packages/forge/src/onboarding/upgrade.ts` — add `skippedSkills` to `UpgradeResult`, add conflict detection in `syncPackSkills`
- `packages/forge/src/tests/init-bindings.test.ts` — add test for pack-vs-Forge conflict detection
- `packages/forge/src/tests/upgrade.test.ts` — add test for pack-vs-Forge conflict detection

### 2.2 Configuration and data

- `packages/forge/skills/meta/forge-bootstrap/SKILL.md` — add greenfield git init step 6.4, add skill commit step (both modes), add skipped-skills reporting to welcoming report

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — document git init for greenfield, skill commit, and conflict reporting behavior

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge run build:check` — typecheck
- `pnpm --filter @warpgogol/forge run test` — unit tests
- `pnpm exec werkstatt run rfc.validate RFC-0552` — RFC validation

## 3. Step sequence

### Step 1. Add `skippedSkills` to `InitResult` and implement conflict detection in `runInit()`

**Goal:** Add conflict detection between Forge skills and pack skills in `runInit()`.

**Agent actions:**

- Add `skippedSkills: { name: string; reason: string }[]` to the `InitResult` interface in `packages/forge/src/onboarding/init.ts`
- Initialize `skippedSkills` array at the top of `runInit()`
- After copying all Forge skills (line ~191), collect the set of Forge skill names
- Before copying each pack skill (line ~195), check if its name matches a Forge skill name
- If conflict: skip the pack skill, push `{ name: skillName, reason: "conflict with Forge skill" }` to `skippedSkills`
- Return `skippedSkills` in the `InitResult` return value

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes

**Completion criterion:** `InitResult` includes `skippedSkills` field; pack skills with same name as Forge skills are skipped, not overwritten.

**Human review:** no

---

### Step 2. Add `skippedSkills` to `UpgradeResult` and implement conflict detection in `runUpgrade()`

**Goal:** Add conflict detection between Forge skills and pack skills in `forge.upgrade`.

**Agent actions:**

- Add `skippedSkills: { name: string; reason: string }[]` to the `UpgradeResult` interface in `packages/forge/src/onboarding/upgrade.ts`
- In `syncPackSkills`, collect the set of Forge skill names from `FORGE_SKILLS`
- Before copying each pack skill, check if its name matches a Forge skill name
- If conflict: skip the pack skill, collect in a `skippedSkills` array
- Return `skippedSkills` from `syncPackSkills` and propagate to `UpgradeResult`
- Update `runUpgrade` to include `skippedSkills` in the return data

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes

**Completion criterion:** `UpgradeResult` includes `skippedSkills` field; pack skills with same name as Forge skills are skipped during upgrade.

**Human review:** no

---

### Step 3. Add unit tests for conflict detection

**Goal:** Test that pack skills with same name as Forge skills are skipped, not overwritten.

**Agent actions:**

- In `packages/forge/src/tests/init-bindings.test.ts`, add test: set up a forge source with a Forge skill named `fo-idea`, set up a pack skill also named `fo-idea` in the workspace, run `runInit()`, assert `skippedSkills` contains `fo-idea` with reason `"conflict with Forge skill"`, assert the Forge skill content is in `.agents/skills/fo-idea/SKILL.md` (not the pack skill content)
- In `packages/forge/src/tests/upgrade.test.ts`, add test: set up a project with Forge skill `fo-idea` already synced, set up a pack skill also named `fo-idea`, run `runUpgrade()`, assert `skippedSkills` contains `fo-idea`, assert Forge skill content is preserved

**Validation:**

- `pnpm --filter @warpgogol/forge run test` passes

**Completion criterion:** Tests verify conflict detection in both `runInit()` and `runUpgrade()`; tests pass.

**Human review:** no

---

### Step 4. Update `forge-bootstrap` SKILL.md with greenfield git init, skill commit, and skipped-skills reporting

**Goal:** Add the three behavioral changes to the forge-bootstrap skill definition.

**Agent actions:**

- In `packages/forge/skills/meta/forge-bootstrap/SKILL.md`:
  - **Greenfield git init:** After step 6.3 (stack bindings), add step 6.4: "Check if `.git` exists in the project root. If not, run `git init` and make an initial commit with all project files. If yes, proceed."
  - **Skill commit (both modes):** After git init (greenfield 6.4) or after post-setup (transplant 6.6), add a step: "Commit synced skills: `git add .agents/skills/` and `git commit -m 'chore: sync Forge skills'`. This happens before the welcoming report."
  - **Skipped-skills reporting:** In the welcoming report section (step 11), add: "If `runInit()` returned `skippedSkills`, report each skipped skill to the operator in human language: 'The following skills were not transferred because they conflict with Forge skills: [list]. You can rename them after onboarding if you want to keep them.'"

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0552` passes
- SKILL.md is well-formed (no validation errors)

**Completion criterion:** SKILL.md includes greenfield git init step, skill commit step, and skipped-skills reporting in welcoming report.

**Human review:** no

---

### Step 5. Update `packages/forge/AGENTS.md`

**Goal:** Document the new git init, skill commit, and conflict reporting behavior.

**Agent actions:**

- In `packages/forge/AGENTS.md`, add a new subsection under "Skills" or "Stack profiles" documenting:
  - Greenfield mode now runs `git init` after stack bindings are filled
  - Both modes commit `.agents/skills/` to git after skill sync
  - `runInit()` and `forge.upgrade` detect Forge-vs-pack skill name conflicts and skip pack skills
  - `forge-bootstrap` reports skipped skills to the operator

**Validation:**

- File is well-formed Markdown

**Completion criterion:** `packages/forge/AGENTS.md` documents all three new behaviors.

**Human review:** no

---

### Step 6. Validate, review, fix, and stamp

**Goal:** Run all validation, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/forge run build:check` — typecheck
- Run `pnpm --filter @warpgogol/forge run test` — all tests pass
- Run `pnpm exec werkstatt run rfc.validate RFC-0552` — zero errors
- Check off acceptance criteria: verify each criterion against implemented code, mark `[x]` with `(evidence: ...)` annotations
- Run `fo-review` on all session code changes
- Run `fo-fix` if review findings
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0552 --implementation-commit <sha>`

**Validation:**

- `git status` clean
- `rfc.validate` passes with zero errors
- All tests pass
- Review report exists

**Completion criterion:** All acceptance criteria checked off; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate RFC-0552`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0552` in the subject line
- `skippedSkills` field in `InitResult` and `UpgradeResult` types

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Operator loses custom pack skills silently | Step 1+2: conflict detection skips pack skills; Step 4: reports skipped skills |
| Skill commit includes unrelated files | Step 4: SKILL.md specifies `git add .agents/skills/` only, not `git add -A` |
| Agent misinterpretation — agents overwrite pack skills | Step 1+2: programmatic enforcement in `init.ts` and `upgrade.ts` |
| `forge.create` does not pass `InitResult` to `forge-bootstrap` | Step 4: SKILL.md reads project state from disk; `skippedSkills` can be re-derived or persisted |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0552 --reason "..." --invariant "DNA-N"` instead of working around it.
