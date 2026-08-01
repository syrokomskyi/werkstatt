---
rfcId: RFC-0622
planId: PLAN-RFC-0622-01
status: draft
owner: architecture
createdAt: 2026-07-31
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - AGENTS.md
---

# Implementation Plan: RFC-0622

## 1. Objectives

- [ ] Objective 1 — Create `fo-step-commit` skill file with correct frontmatter (maps to acceptance criterion 1)
- [ ] Objective 2 — Skill passes `forge.skill.validate` with zero violations (maps to acceptance criterion 2)
- [ ] Objective 3 — `AGENTS.md` references the auto-commit policy and `fo-step-commit` skill (maps to acceptance criterion 3)
- [ ] Objective 4 — Skill instruction covers both monorepo and workpiece commit paths (maps to acceptance criterion 4)
- [ ] Objective 5 — Skill instruction explicitly forbids `git add -A` / `git add .` (maps to acceptance criterion 5)
- [ ] Objective 6 — `rfc.validate` passes on RFC-0622 (maps to acceptance criterion 6)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/skills/fo/fo-step-commit/SKILL.md` — new skill instruction file
- `.agents/skills/fo/fo-step-commit/SKILL.md` — synced copy (via `forge.create`)

### 2.2 Configuration and data

No configuration or data files affected.

### 2.3 Documentation and specs

- `AGENTS.md` (root) — update commit hygiene section to reference `fo-step-commit` as default auto-commit behavior; update session-end discipline section (line 219: "The agent does not auto-commit") to reflect the new auto-commit policy.

### 2.4 Validation and pipelines

- `forge.skill.validate` — validate the new skill frontmatter and body
- `rfc.validate --id RFC-0622` — validate the RFC file

## 3. Step sequence

### Step 1. Create the `fo-step-commit` skill file

**Goal:** Create the skill instruction file with correct frontmatter and body.

**Agent actions:**

- Create `packages/forge/skills/fo/fo-step-commit/SKILL.md` with frontmatter:
  - `name: fo-step-commit`
  - `description:` ≤200 chars, describing auto-commit after each operator request
  - `invocation: model`
  - `category: fo`
  - `concerns: code-mutation`
  - `dependsOn: ['my-preferences']`
  - `languagePolicy: ref(PREFERENCES.md)`
  - `triggers:` 3 trigger phrases
- Write the skill body with sections:
  - **Behavior** — 5-step process: detect changes, stage only agent files, form commit message, commit in monorepo, commit in workpiece via `mission.git.commit`
  - **When this skill runs** — standalone operator requests (default) + callable by other skills (pipeline mode)
  - **What this skill does NOT do** — no push, no post-commit status check, no empty commits, no staging foreign files
  - **Opt-out** — operator can say "не коммить" / "don't commit" to skip

**Validation:**

- File exists at `packages/forge/skills/fo/fo-step-commit/SKILL.md`
- Frontmatter parses as valid YAML

**Completion criterion:** Skill file exists with all required frontmatter fields and body sections.

**Human review:** no

---

### Step 2. Sync skill to `.agents/skills/`

**Goal:** Sync the new skill to the active agent skills directory.

**Agent actions:**

- Run `pnpm exec forge create` to sync the skill from `packages/forge/skills/` to `.agents/skills/`
- Verify `.agents/skills/fo/fo-step-commit/SKILL.md` exists and matches the source

**Validation:**

- `diff packages/forge/skills/fo/fo-step-commit/SKILL.md .agents/skills/fo/fo-step-commit/SKILL.md` — identical

**Completion criterion:** Both copies exist and are byte-identical.

**Human review:** no

---

### Step 3. Validate the skill with `forge.skill.validate`

**Goal:** Confirm the skill passes mechanical validation.

**Agent actions:**

- Run `pnpm exec site-kernel run forge.skill.validate --skill fo-step-commit --json`
- Fix any violations (SKILL-01 through SKILL-17)

**Validation:**

- `forge.skill.validate` exits 0 with zero violations

**Completion criterion:** `forge.skill.validate` passes with zero violations.

**Human review:** no

---

### Step 4. Update `AGENTS.md`

**Goal:** Update root `AGENTS.md` to reference the auto-commit policy and reconcile with existing rules.

**Agent actions:**

- In the commit hygiene section (around line 74), add a bullet referencing `fo-step-commit` as the default auto-commit behavior after each standalone operator request.
- Update line 219 ("The agent does not auto-commit. The operator decides whether to commit.") to reflect the new policy: the agent now auto-commits after each standalone request via `fo-step-commit`, but the operator can opt out per-request. Session-end retro's git hygiene check remains as a safety net.
- Ensure the update is consistent with RFC-0480's per-response `git status` verification (line 205) and RFC-0581's session-end check (lines 209-221).

**Validation:**

- `AGENTS.md` contains reference to `fo-step-commit`
- No contradiction between auto-commit policy and session-end discipline

**Completion criterion:** `AGENTS.md` references `fo-step-commit` and the session-end section is reconciled.

**Human review:** no

---

### Step 5. Commit implementation changes

**Goal:** Commit the skill file, synced copy, and AGENTS.md update.

**Agent actions:**

- `git add packages/forge/skills/fo/fo-step-commit/SKILL.md .agents/skills/fo/fo-step-commit/SKILL.md AGENTS.md`
- `git commit -m "feat: add fo-step-commit skill for auto-commit after each operator request (RFC-0622)"`

**Validation:**

- `git status` — clean working tree after commit

**Completion criterion:** All implementation files committed in a single commit referencing RFC-0622.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0622` — confirm RFC still validates
- Run `pnpm --filter @warpgogol/forge run build:check` — confirm forge package typechecks
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0622 --implementation-commit <sha>` (first `--dry-run`, then without).

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0622`
- `pnpm --filter @warpgogol/forge run build:check`
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All acceptance criteria checked off with inline evidence; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0622`
- `pnpm exec site-kernel run forge.skill.validate --skill fo-step-commit`
- `pnpm --filter @warpgogol/forge run build:check`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0622` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Agent misinterpretation — "commit after every tool call" vs "after every request" | Step 1: skill body explicitly says "after every standalone operator request" |
| Staging wrong files | Step 1: skill body explicitly forbids `git add -A` / `git add .` |
| Commit message quality | Step 1: skill body instructs conventional commit format with descriptive summary |
| Workpiece commit conflicts | Step 1: skill body says workpiece commit failure is non-fatal |
| Skill not loaded | Step 2: `forge.create` syncs to `.agents/skills/` which is the standard agent loading path |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0622 --reason "..." --invariant "DNA-N"` instead of working around it.
- If `forge.skill.validate` reports SKILL-17 violations (platform names in skill body), use `<!-- skill-lint-disable SKILL-17 -->` escape hatch or rephrase to use generic terms.
