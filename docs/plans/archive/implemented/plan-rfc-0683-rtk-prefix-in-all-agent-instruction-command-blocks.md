---
rfcId: RFC-0683
planId: PLAN-RFC-0683-01
status: draft
owner: architecture
createdAt: 2026-08-04
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - .windsurfrules
    - AGENTS.md
    - PREFERENCES.md
    - packages/forge/skills/**/*.SKILL.md
    - .agents/skills/**/*.SKILL.md
    - packages/*/AGENTS.md
    - services/*/AGENTS.md
    - docs/authoring/*.md
    - docs/specs/**/*.md
    - docs/implementation/*.md
    - docs/policies/*.md
    - docs/COMMANDS.md
---

# Implementation Plan: RFC-0683

## 1. Objectives

- [ ] Objective 1 — Update `.windsurfrules` and root `AGENTS.md` with RTK usage rule including graceful degradation and `ref()` clarification (maps to acceptance criteria 1, 2)
- [ ] Objective 2 — Update `PREFERENCES.md` command references with `rtk` prefix (maps to acceptance criterion 3)
- [ ] Objective 3 — Update all Forge skill files with `rtk` prefix on direct commands, RTK-optional note, and sync to `.agents/skills/` (maps to acceptance criteria 4, 5, 6)
- [ ] Objective 4 — Update all nested `packages/*/AGENTS.md` and `services/*/AGENTS.md` command blocks (maps to acceptance criterion 7)
- [ ] Objective 5 — Update all `docs/**/*.md` command blocks with `rtk` prefix (maps to acceptance criterion 8)
- [ ] Objective 6 — Verify archived files are NOT updated (maps to acceptance criterion 9)
- [ ] Objective 7 — Pass `forge.skill.validate` and `rfc.validate` (maps to acceptance criteria 10, 11)

## 2. Affected artifacts

### 2.1 Code and commands

No source code changes. No new commands. No pipeline changes.

### 2.2 Configuration and data

No YAML/JSON/manifest changes.

### 2.3 Documentation and specs

- `.windsurfrules` — RTK section updated with graceful degradation, session-start check, `ref()` clarification
- `AGENTS.md` (root) — new "RTK usage" section added
- `PREFERENCES.md` — `git status` in checklists prefixed with `rtk`
- `packages/forge/skills/**/*.SKILL.md` — all 33 skill files: direct commands get `rtk` prefix, `ref()` references unchanged, RTK-optional note added
- `.agents/skills/**/*.SKILL.md` — synced copies of all 33 skills
- `packages/*/AGENTS.md` — 15+ nested package AGENTS.md files: `pnpm --filter` and `pnpm exec` commands prefixed
- `services/*/AGENTS.md` — 5+ service AGENTS.md files: same treatment
- `docs/authoring/*.md` — 10+ authoring docs: `pnpm exec site-kernel run` commands prefixed
- `docs/specs/**/*.md` — spec docs with command blocks prefixed
- `docs/implementation/*.md` — implementation docs with command blocks prefixed
- `docs/policies/*.md` — policy docs with command blocks prefixed
- `docs/COMMANDS.md` — command reference doc prefixed

### 2.4 Validation and pipelines

- `forge.skill.validate` — must pass on all updated skills
- `rfc.validate --id RFC-0683` — must pass on the RFC
- No build pipeline changes (documentation-only RFC)

## 3. Step sequence

### Step 1. Update `.windsurfrules` and root `AGENTS.md`

**Goal:** Update the RTK usage rule with graceful degradation, session-start check, and `ref()` clarification in both `.windsurfrules` and `AGENTS.md`.

**Agent actions:**

- Update `.windsurfrules` RTK section (lines 34–65): add graceful degradation clause ("If RTK is not installed, run commands without the `rtk` prefix"), add session-start check subsection, add `ref()` bindings subsection
- Add new "RTK usage (token optimization)" section to root `AGENTS.md` after the existing commit discipline section
- Add `rtk` prefix to all command blocks already present in `AGENTS.md` (lines 203–205, 209–211, 215–218, 413–419, 430–436, 255)

**Validation:**

- `grep -c "rtk " .windsurfrules` — count of `rtk` prefixed commands increased
- `grep "RTK usage" AGENTS.md` — new section exists
- `grep "graceful degradation\|If RTK is not installed" .windsurfrules AGENTS.md` — degradation rule present

**Completion criterion:** `.windsurfrules` has graceful degradation, session-start check, and `ref()` clarification; `AGENTS.md` has new RTK usage section and all existing command blocks use `rtk` prefix.

**Human review:** no

---

### Step 2. Update `PREFERENCES.md`

**Goal:** Add `rtk` prefix to all command references in `PREFERENCES.md`.

**Agent actions:**

- Update `git status` in pre-response checklists (lines 48, 56) to `rtk git status`
- Update any other command references in the file

**Validation:**

- `grep "git status" PREFERENCES.md` — all instances prefixed with `rtk`

**Completion criterion:** All command blocks in `PREFERENCES.md` use `rtk` prefix.

**Human review:** no

---

### Step 3. Update Forge skill files and sync

**Goal:** Add `rtk` prefix to direct commands in all 33 Forge skill files, add RTK-optional note, and sync to `.agents/skills/`.

**Agent actions:**

- For each `packages/forge/skills/**/*.SKILL.md`:
  - Add RTK-optional note at the first command block: "> Commands below assume RTK is installed. To check, run `rtk --version` (this is the detection command — it is not prefixed with `rtk` because it IS an `rtk` command). If `rtk --version` fails, RTK is not installed — run all commands without the `rtk` prefix."
  - Add `rtk` prefix to all direct shell commands (`pnpm`, `git`, `npm`, `npx`, `node`, `find`, `cat`, `wrangler`, etc.) in command blocks
  - Do NOT prefix `ref()` binding references
  - Do NOT prefix RTK's own install/init/diagnostic commands (§6.10 in `forge-bootstrap`)
- Sync each updated skill to `.agents/skills/<name>/SKILL.md`
- Run `forge.skill.validate` on all updated skills

**Validation:**

- `forge.skill.validate` passes on all skills
- `grep -r "rtk pnpm\|rtk git\|rtk node\|rtk find\|rtk cat" packages/forge/skills/` — prefixed commands present
- `diff` between `packages/forge/skills/<name>/SKILL.md` and `.agents/skills/<name>/SKILL.md` — no drift

**Completion criterion:** All 33 Forge skill files have `rtk` prefix on direct commands, RTK-optional note, `ref()` references unchanged, and synced copies in `.agents/skills/` match.

**Human review:** no

---

### Step 4. Update nested `packages/*/AGENTS.md` and `services/*/AGENTS.md`

**Goal:** Add `rtk` prefix to all command blocks in nested AGENTS.md files.

**Agent actions:**

- For each `packages/*/AGENTS.md`:
  - Add `rtk` prefix to `pnpm --filter` commands
  - Add `rtk` prefix to `pnpm exec site-kernel run` commands
  - Add `rtk` prefix to `git` commands
  - Add `rtk` prefix to any other direct shell commands
- For each `services/*/AGENTS.md`:
  - Same treatment

**Validation:**

- `grep -r "pnpm --filter\|pnpm exec" packages/*/AGENTS.md services/*/AGENTS.md | grep -v "rtk " | grep -v "^.*#"` — no unprefixed commands remain (excluding comments)

**Completion criterion:** All nested `packages/*/AGENTS.md` and `services/*/AGENTS.md` command blocks use `rtk` prefix.

**Human review:** no

---

### Step 5. Update `docs/**/*.md` command blocks

**Goal:** Add `rtk` prefix to all command blocks in documentation files.

**Agent actions:**

- Update `docs/authoring/*.md` — all `pnpm exec site-kernel run`, `pnpm --filter`, `pnpm run`, `wrangler` commands
- Update `docs/specs/**/*.md` — all `pnpm exec site-kernel run`, `wrangler` commands
- Update `docs/implementation/*.md` — all `pnpm exec site-kernel run` commands
- Update `docs/policies/*.md` — any command blocks
- Update `docs/COMMANDS.md` — any command blocks
- Do NOT update `docs/rfcs/archive/**`, `docs/audits/**`, `docs/reviews/**`

**Validation:**

- `grep -r "pnpm exec\|pnpm --filter\|pnpm run\|wrangler\|git " docs/authoring/ docs/specs/ docs/implementation/ docs/policies/ docs/COMMANDS.md | grep -v "rtk " | grep -v "^.*#"` — no unprefixed commands remain (excluding comments and archives)

**Completion criterion:** All `docs/**/*.md` command blocks (excluding archives) use `rtk` prefix.

**Human review:** no

---

### Step 6. Verify archived files are NOT updated

**Goal:** Confirm that archived files were not modified.

**Agent actions:**

- Run `git diff --name-only` and verify no files under `missions/archive/**`, `docs/rfcs/archive/**`, `docs/audits/**`, `docs/reviews/**` appear in the diff

**Validation:**

- `git diff --name-only | grep -E "missions/archive|docs/rfcs/archive|docs/audits|docs/reviews"` — empty output

**Completion criterion:** Zero archived files modified.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Run validation suite, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `forge.skill.validate` on all updated skills
- Run `rfc.validate --id RFC-0683`
- Check off all acceptance criteria with inline `(evidence: ...)` annotations
- Run code review: invoke `fo-review` via the `skill` tool on all session changes
- Run fix if needed: if `fo-review` reported findings, invoke `fo-fix`
- Stamp the RFC as implemented: run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0683 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes from the current session
- `rfc.validate --id RFC-0683` passes
- `forge.skill.validate` passes on all skills
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0683`
- `pnpm --filter @warpgogol/forge run build:check` (if any forge source touched — unlikely for docs-only RFC)
- `forge.skill.validate` on all updated skills

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0683` in the subject line
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Agent confusion about `ref()` handling | Step 1 adds explicit `ref()` clarification to `.windsurfrules` and `AGENTS.md` |
| Stale examples in archived files | Step 6 verifies archived files are not updated |
| External Forge consumers without RTK | Step 3 adds RTK-optional note to all Forge skills |
| Maintenance burden | Step 1 adds standing rule in `AGENTS.md` and `.windsurfrules` |
| RTK not installed in CI | RFC scope is `.md` files only, not `.github/workflows/*.yml` — no CI impact |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0683 --reason "..." --invariant "DNA-N"` instead of working around it.
