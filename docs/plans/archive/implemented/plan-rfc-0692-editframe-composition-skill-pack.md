---
rfcId: RFC-0692
planId: PLAN-RFC-0692-01
status: draft
owner: architecture
createdAt: 2026-08-05
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - packages/forge/AGENTS.md
    - packages/forge/profiles/editframe-html-templates/composition-agents.md
---

# Implementation Plan: RFC-0692

## 1. Objectives

- [ ] Create `ef-composition-review` skill with valid frontmatter passing `forge.skill.validate` — maps to acceptance criterion "exists with valid frontmatter" + "forge.skill.validate passes"
- [ ] Create `ef-render-verify` skill with valid frontmatter passing `forge.skill.validate` — maps to acceptance criterion "exists with valid frontmatter" + "forge.skill.validate passes"
- [ ] Sync both skills to `.agents/skills/` — maps to acceptance criterion "forge.create syncs both skills"
- [ ] Enrich `composition-agents.md` template with time model concepts, invariant reference, and skill usage — maps to acceptance criterion "template includes time model concepts, invariant reference, and skill usage"
- [ ] Add unit tests verifying both skills pass schema validation — maps to acceptance criterion "Unit test verifies both skills pass validateSkill"
- [ ] Update `packages/forge/AGENTS.md` skill count — maps to acceptance criterion "AGENTS.md updated with new skill count"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/skills/fo/ef-composition-review/SKILL.md` — New skill definition
- `packages/forge/skills/fo/ef-render-verify/SKILL.md` — New skill definition
- `.agents/skills/ef-composition-review/SKILL.md` — Synced copy (committed alongside source)
- `.agents/skills/ef-render-verify/SKILL.md` — Synced copy (committed alongside source)

### 2.2 Configuration and data

- `packages/forge/profiles/editframe-html.yaml` — No changes (profile already declares skills in `workspaceTypes[].skills`)

### 2.3 Documentation and specs

- `packages/forge/profiles/editframe-html-templates/composition-agents.md` — Extended with time model concepts, invariant reference, skill usage, workflow
- `packages/forge/AGENTS.md` — Update skill count (26 fo → 28 fo skills, total 33 → 35 skills)
- `docs/rfcs/rfc-0692-*.md` — Read-only reference (acceptance criteria checked off at final step)

### 2.4 Validation and pipelines

- `packages/forge/src/tests/skill-validate.test.ts` — Extended with tests for both new skills
- `pnpm exec werkstatt run forge.skill.validate` — must pass on both new skills
- `pnpm exec werkstatt run forge.skill.list` — must include both skills
- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compilation
- `pnpm --filter @warpgogol/forge run test` — Unit tests

## 3. Step sequence

### Step 1. Create `ef-composition-review` skill

**Goal:** Create the skill definition with valid frontmatter and body that guides agents through reviewing Editframe HTML compositions.

**Agent actions:**

- Create `packages/forge/skills/fo/ef-composition-review/SKILL.md` with frontmatter:
  ```yaml
  ---
  name: ef-composition-review
  description: Review an Editframe HTML composition for time model correctness, accessibility, and best practices
  invocation: user
  category: fo
  concerns: read-only
  dependsOn: []
  languagePolicy: ref(PREFERENCES.md)
  ---
  ```
  Note: `category: fo` (not `review`) because `skillFrontmatterSchema` enforces `z.enum(["fo", "shared", "meta"])`. `invocation` and `languagePolicy` are required fields. The skill is placed under `skills/fo/` to match the registry's `discoverForgeSkills` directory structure.
- Write the skill body following the 6-step review process from the RFC (time model, accessibility, asset references, invariant check via `forge doctor`, manual best practices, empty state)
- Ensure no hardcoded project-specific literals (SKILL-11), no software-specific binding keys (SKILL-18)
- Add `<!-- skill-lint-disable SKILL-17 -->` escape hatch preventively — "Editframe" is a third-party tool name that may trigger SKILL-17 false-positive
- Sync to `.agents/skills/ef-composition-review/SKILL.md` (copy the file)

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate` passes with zero violations on the new skill
- File exists at `packages/forge/skills/fo/ef-composition-review/SKILL.md`
- Synced copy exists at `.agents/skills/ef-composition-review/SKILL.md`

**Completion criterion:** `forge.skill.validate` reports zero violations for `ef-composition-review`; both source and synced copies exist.

**Human review:** no

---

### Step 2. Create `ef-render-verify` skill

**Goal:** Create the skill definition with valid frontmatter and body that guides agents through verifying Editframe renders.

**Agent actions:**

- Create `packages/forge/skills/fo/ef-render-verify/SKILL.md` with frontmatter:
  ```yaml
  ---
  name: ef-render-verify
  description: Verify an Editframe render — validate, build, check determinism, inspect output
  invocation: user
  category: fo
  concerns: read-only
  dependsOn: []
  languagePolicy: ref(PREFERENCES.md)
  ---
  ```
- Write the skill body following the 5-step verification process from the RFC (pre-render validation via `forge validate`, render via `forge build`, determinism check via `forge determinism check`, output inspection, report)
- Ensure no hardcoded project-specific literals (SKILL-11), no software-specific binding keys (SKILL-18)
- Add `<!-- skill-lint-disable SKILL-17 -->` escape hatch preventively — "Editframe" is a third-party tool name that may trigger SKILL-17 false-positive
- Sync to `.agents/skills/ef-render-verify/SKILL.md` (copy the file)

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate` passes with zero violations on the new skill
- File exists at `packages/forge/skills/fo/ef-render-verify/SKILL.md`
- Synced copy exists at `.agents/skills/ef-render-verify/SKILL.md`

**Completion criterion:** `forge.skill.validate` reports zero violations for `ef-render-verify`; both source and synced copies exist.

**Human review:** no

---

### Step 3. Enrich `composition-agents.md` template

**Goal:** Enrich the template with time model concepts, invariant reference, skill usage, and workflow guidance.

**Agent actions:**

- Edit `packages/forge/profiles/editframe-html-templates/composition-agents.md`
- Add **Time model concepts** section: brief explanation of `ef-timegroup`, modes (`sequence`, `fixed`, `contain`, `fit`), `duration`, `offset`, `fps`, `loop`
- Add **Invariant reference** section: table of VIDEO-01 through VIDEO-03 (always present). Note that VIDEO-04..09 are available after RFC-0691 is implemented — `forge doctor` checks the full invariant set
- Add **Skill usage** section: how to invoke `ef-composition-review` and `ef-render-verify`
- Add **Workflow** section: create composition → preview → review → render → verify
- Ensure template uses standard markdown (no `{{placeholder}}` syntax in comments per AGENTS.md rule)
- Ensure template file is listed in `package.json` `files` array (it already is — `editframe-html-templates/` is included)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes (template is not TypeScript but may be referenced by tests)
- Template content is valid markdown

**Completion criterion:** `composition-agents.md` includes all 4 new sections (time model, invariant reference, skill usage, workflow).

**Human review:** no

---

### Step 4. Add unit tests

**Goal:** Add tests verifying both new skills pass schema validation and appear in the registry.

**Agent actions:**

- Edit `packages/forge/src/tests/skill-validate.test.ts`
- Add test: `forge.skill.validate` passes on `ef-composition-review` (zero violations)
- Add test: `forge.skill.validate` passes on `ef-render-verify` (zero violations)
- Add test: `FORGE_SKILLS` registry includes both `ef-composition-review` and `ef-render-verify`
- Add test: both skills have `category: "fo"` and `concerns: "read-only"`
- Verify existing `registry.test.ts` tests still pass (the new skills will be auto-discovered)

**Validation:**

- `pnpm --filter @warpgogol/forge run test` passes

**Completion criterion:** All new tests pass; existing tests still pass.

**Human review:** no

---

### Step 5. Update `packages/forge/AGENTS.md`

**Goal:** Update the skill count in the AGENTS.md to reflect the two new skills.

**Agent actions:**

- Edit `packages/forge/AGENTS.md` line 10: update "26 fo skills + 4 shared + 3 meta = 33 skills" to "28 fo skills + 4 shared + 3 meta = 35 skills"
- Edit `packages/AGENTS.md` ownership table if it references the skill count (check and update if needed)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes

**Completion criterion:** AGENTS.md skill count updated to 35 (28 fo + 4 shared + 3 meta).

**Human review:** no

---

### Step 6. Validation and verification

**Goal:** Run all validation commands to ensure the implementation is complete and correct.

**Agent actions:**

- Run `pnpm exec werkstatt run rfc.validate --id RFC-0692`
- Run `pnpm exec werkstatt run forge.skill.validate` (validates all skills including new ones)
- Run `pnpm --filter @warpgogol/forge run build:check`
- Run `pnpm --filter @warpgogol/forge run test`
- Verify `forge.skill.list` includes both skills (check via test or CLI)

**Validation:**

- All commands pass with exit code 0

**Completion criterion:** `rfc.validate`, `forge.skill.validate`, `build:check`, and `test` all pass.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` skill count is updated (Step 5)
- Verify `composition-agents.md` template is enriched (Step 3)
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands added — skip)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations. For unchecked `[ ]` criteria, document why.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0692 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec werkstatt run rfc.validate --id RFC-0692`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0692`
- `pnpm exec werkstatt run forge.skill.validate`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0692` in the subject line (RFC-0265 commit hygiene)
- `docs/reviews/code/` review report for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Skill drift (source vs `.agents/skills/`) | Steps 1-2 sync both copies; `forge.doctor` detects drift |
| Template bloat | Step 3 keeps sections concise — bullet points, table, short list |
| Skill naming conflict with pack skills | `ef-` prefix is forge-level; SKILL-15 prevents pack skills from using `fo-` prefix; RFC-0552 skip logic handles conflicts |
| Category schema mismatch (`review`/`verify` not in enum) | Steps 1-2 use `category: fo` instead; documented in plan rationale |
| Missing required frontmatter fields (`invocation`, `languagePolicy`) | Steps 1-2 include all required fields per `skillFrontmatterSchema` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0692 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `forge.skill.validate` reports SKILL-17 violations for `ef-` prefix despite the preventive escape hatch, review the violation — "Editframe" is a third-party tool name, not a platform name. If the escape hatch is insufficient, investigate the SKILL-17 pattern matching logic.
