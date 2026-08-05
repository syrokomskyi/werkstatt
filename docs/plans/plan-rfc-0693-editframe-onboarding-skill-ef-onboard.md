---
rfcId: RFC-0693
planId: PLAN-RFC-0693-01
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
---

# Implementation Plan: RFC-0693

## 1. Objectives

- [ ] Objective 1 — Create `ef-onboard` skill in `packages/forge/skills/fo/ef-onboard/SKILL.md` with valid frontmatter (maps to acceptance criterion: "skill exists with valid frontmatter")
- [ ] Objective 2 — `forge.skill.validate` passes on the new skill (maps to: "`forge.skill.validate` passes on the skill")
- [ ] Objective 3 — `forge.skill.list` includes `ef-onboard` (maps to: "`forge.skill.list` includes `ef-onboard`")
- [ ] Objective 4 — `editframe-html.yaml` declares `ef-onboard` in `workspaceTypes[].skills` (maps to: "`editframe-html.yaml` declares `ef-onboard`")
- [ ] Objective 5 — `composition-agents.md` template updated with expanded "Skills" section and "External resources" section (maps to: "template includes onboarding reference and external resources")
- [ ] Objective 6 — Skill includes prerequisites check, discovery flow, and references to Editframe domain knowledge (maps to: prerequisites, discovery, llms.txt, editframe-composition criteria)
- [ ] Objective 7 — Unit tests verify skill passes `validateSkill` schema validation (maps to: implicit from RFC-0692 pattern)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/skills/fo/ef-onboard/SKILL.md` — **New** — skill definition with frontmatter and 6-step process body
- `packages/forge/src/tests/skill-validate.test.ts` — **Extended** — add test block for `ef-onboard` skill (registry inclusion, frontmatter validation, zero violations)
- `.agents/skills/ef-onboard/SKILL.md` — **New** — synced flat copy (committed alongside source per AGENTS.md rules)

### 2.2 Configuration and data

- `packages/forge/profiles/editframe-html.yaml` — **Extended** — add `ef-onboard` as first entry in `workspaceTypes[0].skills[]`
- `packages/forge/profiles/editframe-html-templates/composition-agents.md` — **Extended** — replace existing "Skill usage" section (lines 41–46) with expanded "Skills" section including `ef-onboard`, add "External resources" section

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — **Updated** — skill count in the Skills section description (currently "28 fo skills + 4 shared + 3 meta = 35 skills" → add 1 fo skill → "29 fo skills + 4 shared + 3 meta = 36 skills")

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run rfc.validate --id RFC-0693` — RFC mechanical validation
- `pnpm --filter @warpgogol/forge run build:check` — TypeScript type check
- `pnpm --filter @warpgogol/forge run test` — unit tests (including new ef-onboard tests)
- `forge.skill.validate` — skill schema validation (SKILL-01..21)
- `forge.skill.list` — skill registry inclusion check

## 3. Step sequence

### Step 1. Create `ef-onboard` skill definition

**Goal:** Create the SKILL.md file with correct frontmatter and 6-step process body.

**Agent actions:**

- Create `packages/forge/skills/fo/ef-onboard/SKILL.md` with frontmatter:
  - `name: ef-onboard`
  - `description: Onboard a new Editframe video project — check prerequisites, discover requirements, scaffold, and start preview. Use when the operator asks to create a new video project.`
  - `invocation: user`
  - `category: fo`
  - `concerns: content-mutation`
  - `dependsOn: []`
  - `languagePolicy: ref(PREFERENCES.md)`
  - `triggers: ["create a new editframe project", "start a new video project", "build a video with editframe", "create a video composition"]`
- Write the skill body following the 6-step process from RFC-0693 § Design:
  1. Prerequisites check (Node.js 18+, FFmpeg)
  2. Discovery (project type, assets, stack preference, libraries)
  3. Scaffold (`forge create --profile editframe-html`)
  4. Install Editframe domain skills (`npm create @editframe@latest` with fallback to online docs)
  5. Read domain knowledge (`editframe-composition` skill or online URL)
  6. Build and preview (`forge dev`, `forge doctor`)
- Add `<!-- skill-lint-disable SKILL-17 -->` at top of body (same pattern as existing ef-skills, since the body references Editframe URLs and domain concepts)
- Include `Before starting, read PREFERENCES.md...` preamble (same as existing ef-skills)

**Validation:**

- `forge.skill.validate` produces zero violations for `ef-onboard`
- SKILL-01 (frontmatter schema) passes
- SKILL-12 (concerns enum) passes — `content-mutation` is valid
- SKILL-16 (triggers) passes — 4 triggers, each 5–100 chars, on fo-category skill
- SKILL-17 (platform references) passes — no RFC/ADR/DNA ids or platform names

**Completion criterion:** `packages/forge/skills/fo/ef-onboard/SKILL.md` exists and `forge.skill.validate` reports zero violations for `ef-onboard`.

**Human review:** no

---

### Step 2. Sync skill to `.agents/skills/`

**Goal:** Create the flat synced copy that `forge.doctor` checks for drift.

**Agent actions:**

- Copy `packages/forge/skills/fo/ef-onboard/SKILL.md` to `.agents/skills/ef-onboard/SKILL.md`
- Commit both files together (source + synced copy) per AGENTS.md rule: "the synced copy MUST also be committed in the same session"

**Validation:**

- `forge.doctor` does not report drift for `ef-onboard`

**Completion criterion:** `.agents/skills/ef-onboard/SKILL.md` exists and matches source.

**Human review:** no

---

### Step 3. Update `editframe-html.yaml` profile

**Goal:** Add `ef-onboard` as the first entry in the skills list.

**Agent actions:**

- Edit `packages/forge/profiles/editframe-html.yaml` line 57–59: add `- ef-onboard` before `- ef-composition-review` in the `workspaceTypes[0].skills` list
- Result:
  ```yaml
  skills:
    - ef-onboard
    - ef-composition-review
    - ef-render-verify
  ```

**Validation:**

- `forge.profile.validate` (or `forge.doctor`) passes on the profile
- YAML is valid

**Completion criterion:** `editframe-html.yaml` declares `ef-onboard` in `workspaceTypes[].skills` as first entry.

**Human review:** no

---

### Step 4. Update `composition-agents.md` template

**Goal:** Replace existing "Skill usage" section with expanded "Skills" section and add "External resources" section.

**Agent actions:**

- Edit `packages/forge/profiles/editframe-html-templates/composition-agents.md`:
  - Replace the "## Skill usage" section (lines 41–46) with:
    ```markdown
    ## Skills

    - **ef-onboard** — onboard a new project: prerequisites, discovery, scaffold, preview. Trigger: "create a new video project".
    - **ef-composition-review** — review a composition for time model correctness, accessibility, and best practices before rendering. Trigger: "review this composition".
    - **ef-render-verify** — verify a render: validate, build, check determinism, inspect output. Trigger: "render and verify".
    ```
  - Add after the Skills section:
    ```markdown
    ## External resources

    - [Editframe llms.txt](https://editframe.com/llms.txt) — machine-readable index of Editframe domain skills
    - [Editframe composition skill](https://editframe.com/skills/composition.md) — full reference for time model, elements, and rendering
    - [Editframe getting started](https://editframe.com/getting-started) — step-by-step guide and agent prompt
    ```
  - Keep "Workflow", "Reference template", "File naming" sections unchanged

**Validation:**

- Template renders correctly (standard markdown)
- `forge.agents.generate` would not break on this template (uses standard markdown headings)

**Completion criterion:** `composition-agents.md` contains "## Skills" section with all three ef-skills and "## External resources" section with three links.

**Human review:** no

---

### Step 5. Add unit tests

**Goal:** Add test block for `ef-onboard` skill in the existing skill-validate test file.

**Agent actions:**

- Edit `packages/forge/src/tests/skill-validate.test.ts`:
  - Extend the existing `describe("ef-composition-review and ef-render-verify skills", ...)` block (or add a new describe block) to cover `ef-onboard`:
    - Test: `FORGE_SKILLS` registry includes `ef-onboard`
    - Test: `ef-onboard` has `category: fo` and `concerns: content-mutation`
    - Test: `forge.skill.validate` passes with zero violations for `ef-onboard`

**Validation:**

- `pnpm --filter @warpgogol/forge run test` passes

**Completion criterion:** All new tests pass and cover the three assertions above.

**Human review:** no

---

### Step 6. Update `packages/forge/AGENTS.md` skill count

**Goal:** Update the skill count in the AGENTS.md description.

**Agent actions:**

- Edit `packages/forge/AGENTS.md` line: "28 fo skills + 4 shared + 3 meta = 35 skills" → "29 fo skills + 4 shared + 3 meta = 36 skills"

**Validation:**

- `forge.doctor` does not report AGENTS.md skill count mismatch (if it checks this)

**Completion criterion:** AGENTS.md skill count reflects the new total.

**Human review:** no

---

### Step 7. Validation suite

**Goal:** Run all validation commands to confirm the implementation is clean.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0693`
- Run `pnpm --filter @warpgogol/forge run build:check`
- Run `pnpm --filter @warpgogol/forge run test`
- Run `pnpm exec site-kernel run forge.skill.validate` (via forge CLI or site-kernel)
- Run `pnpm exec site-kernel run forge.skill.list` and verify `ef-onboard` appears

**Validation:**

- All commands exit 0
- `forge.skill.list --json` includes `ef-onboard` with `category: fo`

**Completion criterion:** All validation commands pass with zero errors.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` skill count is updated.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands added — skip).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in RFC-0693 against the implemented code. Mark `[x]` for verified criteria.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0693 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0693`
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0693`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0693` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` from `fo-review`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Skill drift (source vs `.agents/skills/`) | Step 2 commits both files together; `forge.doctor` detects drift |
| Editframe skills installation failure | Step 1 skill body includes fallback to online documentation |
| Two sources of skills confusion | Step 4 template "Skills" section clearly distinguishes forge skills (ef-*) from Editframe skills (editframe-*) |
| React template gap | Step 1 skill body explicitly states profile targets HTML only; React requires manual install |

## 6. Escalation triggers

- If `forge.skill.validate` reports SKILL-17 violations for `ef-onboard` that cannot be resolved with the `<!-- skill-lint-disable SKILL-17 -->` escape hatch, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0693 --reason "SKILL-17 conflict" --invariant "DNA-54"` instead of working around it.
