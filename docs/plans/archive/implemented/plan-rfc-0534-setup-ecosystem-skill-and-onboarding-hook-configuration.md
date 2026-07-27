---
rfcId: RFC-0534
planId: PLAN-RFC-0534-01
status: draft
owner: architecture
createdAt: 2026-07-26
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - .env.example
    - README.md
    - AGENTS.md
---

# Implementation Plan: RFC-0534

## 1. Objectives

- [ ] O1 — `setup-ecosystem` skill exists at `.agents/skills/setup-ecosystem/SKILL.md` with setup instructions — maps to acceptance criterion "`.agents/skills/setup-ecosystem/SKILL.md` exists with setup instructions"
- [ ] O2 — Skill verifies `pnpm install` has been run (checks for `node_modules/`) — maps to acceptance criterion "Skill verifies `pnpm install` has been run"
- [ ] O3 — Skill configures `git config core.hooksPath hooks/` and verifies `hooks/pre-commit` is executable — maps to acceptance criterion "Skill configures `git config core.hooksPath hooks/` and verifies `hooks/pre-commit` is executable"
- [ ] O4 — Skill verifies `ecosystem.commit` command is registered via `--dry-run` invocation — maps to acceptance criterion "Skill verifies `ecosystem.commit` command is registered via `--dry-run` invocation"
- [ ] O5 — `.env.example` includes `ECOSYSTEM_COMMIT` with comment and `# How to obtain:` line — maps to acceptance criterion "`.env.example` includes `ECOSYSTEM_COMMIT` with a comment and `# How to obtain:` line"
- [ ] O6 — `fo-onboard` skill Prepare step verifies `git config core.hooksPath` is set to `hooks/` and configures it if missing — maps to acceptance criterion "`fo-onboard` skill Prepare step (step 2) verifies `git config core.hooksPath` is set to `hooks/` and configures it if missing"
- [ ] O7 — `packages/forge/skills/fo/fo-onboard/SKILL.md` mirrors `.agents/skills/fo-onboard/SKILL.md` — maps to acceptance criterion "`packages/forge/skills/fo/fo-onboard/SKILL.md` is updated to mirror `.agents/skills/fo-onboard/SKILL.md`"
- [ ] O8 — `README.md` Quick start section includes `git config core.hooksPath hooks/` and references `setup-ecosystem` skill — maps to acceptance criterion "`README.md` Quick start section includes `git config core.hooksPath hooks/` and references the `setup-ecosystem` skill"
- [ ] O9 — `rfc.validate` passes on RFC-0534 — maps to acceptance criterion "`rfc.validate` passes on this file before merging"

## 2. Affected artifacts

### 2.1 Code and commands

- `.agents/skills/setup-ecosystem/SKILL.md` — **new file**: project-specific skill with setup instructions
- `.agents/skills/fo-onboard/SKILL.md` — **updated**: Prepare step (step 2) gains hook configuration prerequisite check
- `packages/forge/skills/fo/fo-onboard/SKILL.md` — **updated**: forge skill source mirror, same change as `.agents/skills/fo-onboard/SKILL.md`

### 2.2 Configuration and data

- `.env.example` — **updated**: add `ECOSYSTEM_COMMIT` entry with comment and `# How to obtain:` line

### 2.3 Documentation and specs

- `README.md` — **updated**: Quick start section gains `git config core.hooksPath hooks/` and `setup-ecosystem` skill reference
- `AGENTS.md` (root) — **updated**: add `setup-ecosystem` skill to the skill ecosystem section and note hook configuration requirement

### 2.4 Validation and pipelines

- No new kernel commands, no pipeline changes, no CI gates
- `rfc.validate RFC-0534` — must pass before stamping implemented

## 3. Step sequence

### Step 1. Create `setup-ecosystem` skill

**Goal:** Create the project-specific `setup-ecosystem` skill at `.agents/skills/setup-ecosystem/SKILL.md`.

**Agent actions:**

- Create `.agents/skills/setup-ecosystem/SKILL.md` with frontmatter:
  - `name: setup-ecosystem`
  - `description: Configure git hooks and verify ecosystem tooling. Run after cloning or when setting up a new development environment.`
  - `invocation: user`
  - `category: fo`
  - `concerns: code-mutation`
  - `dependsOn: ['my-preferences']`
  - `languagePolicy: ref(PREFERENCES.md)`
- Write skill body with these steps:
  1. **Verify prerequisites** — check `node_modules/` exists; if not, report "Run `pnpm install` first" and abort
  2. **Configure git hooks** — run `git config core.hooksPath hooks/`
  3. **Verify hook executable** — run `chmod +x hooks/pre-commit` and verify `hooks/pre-commit` exists; if not, report "hooks/pre-commit not found. Ensure RFC-0533 is implemented." and abort
  4. **Verify ecosystem.commit** — run `node packages/os/site-kernel/bin/site-kernel.mjs run ecosystem.commit --dry-run --message "setup verification"`; if it fails, report "ecosystem.commit command not found. Ensure RFC-0533 is implemented." and abort
  5. **Report success** — "Ecosystem setup complete. Hooks configured, ecosystem.commit verified."
- Include failure modes table from RFC design section

**Validation:**

- File exists at `.agents/skills/setup-ecosystem/SKILL.md`
- Skill is invocable by AI agents (follows `.agents/skills/` convention)

**Completion criterion:** `.agents/skills/setup-ecosystem/SKILL.md` exists with all 5 steps documented

**Human review:** no

---

### Step 2. Update `fo-onboard` skill with hook prerequisite check

**Goal:** Add a git hook configuration prerequisite check to the `fo-onboard` skill's Prepare step.

**Agent actions:**

- Edit `.agents/skills/fo-onboard/SKILL.md` — in step 2 (Prepare), add a prerequisite check at the beginning:
  - "Verify `git config core.hooksPath` is set to `hooks/`. If not, run `git config core.hooksPath hooks/`. This is a non-blocking prerequisite — if the config is already set, proceed without action."
- Edit `packages/forge/skills/fo/fo-onboard/SKILL.md` — apply the same change to the forge skill source mirror

**Validation:**

- `diff .agents/skills/fo-onboard/SKILL.md packages/forge/skills/fo/fo-onboard/SKILL.md` — the hook prerequisite check is identical in both files (the rest of the file should already be in sync)

**Completion criterion:** Both `fo-onboard` SKILL.md files contain the hook prerequisite check in step 2 (Prepare)

**Human review:** no

---

### Step 3. Update `.env.example` with `ECOSYSTEM_COMMIT` documentation

**Goal:** Document the `ECOSYSTEM_COMMIT` transient env var in `.env.example`.

**Agent actions:**

- Edit `.env.example` — add after the Cloudflare API section:
  ```
  # ── Ecosystem commit (transient — set programmatically by ecosystem.commit, not by the operator)
  # How to obtain: Set programmatically by ecosystem.commit; not configured by the operator.
  ECOSYSTEM_COMMIT=
  ```

**Validation:**

- `grep ECOSYSTEM_COMMIT .env.example` — returns the new entry
- Entry includes both a comment and a `# How to obtain:` line per DNA-40/RFC-0388

**Completion criterion:** `.env.example` contains `ECOSYSTEM_COMMIT` with comment and `# How to obtain:` line

**Human review:** no

---

### Step 4. Update `README.md` Quick start section

**Goal:** Add `git config core.hooksPath hooks/` and `setup-ecosystem` skill reference to the README Quick start section.

**Agent actions:**

- Edit `README.md` Quick start section — add after `git lfs install`:
  ```sh
  # One-time: configure git hooks (required for ecosystem.commit enforcement)
  git config core.hooksPath hooks/
  ```
- Add a note after the Quick start code block: "If you cloned without running onboarding, invoke the `setup-ecosystem` skill to configure hooks and verify the ecosystem automatically."

**Validation:**

- `grep "core.hooksPath" README.md` — returns the new line
- `grep "setup-ecosystem" README.md` — returns the skill reference

**Completion criterion:** `README.md` Quick start section includes `git config core.hooksPath hooks/` and references `setup-ecosystem` skill

**Human review:** no

---

### Step 5. Update root `AGENTS.md` with `setup-ecosystem` skill reference

**Goal:** Add the `setup-ecosystem` skill to the root AGENTS.md skill ecosystem documentation.

**Agent actions:**

- Edit `AGENTS.md` — add a note in the appropriate section about the `setup-ecosystem` skill and the git hook configuration requirement
- Add a rule: "Agents MUST invoke the `setup-ecosystem` skill when setting up a new development environment or after cloning the repository without onboarding."

**Validation:**

- `grep "setup-ecosystem" AGENTS.md` — returns the new reference

**Completion criterion:** `AGENTS.md` references `setup-ecosystem` skill and the hook configuration requirement

**Human review:** no

---

### Step 6. Validate and verify acceptance criteria

**Goal:** Run all validation checks and verify every acceptance criterion.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0534 --json` — must pass with zero violations
- Verify each acceptance criterion in the RFC:
  1. `.agents/skills/setup-ecosystem/SKILL.md` exists with setup instructions
  2. Skill verifies `pnpm install` has been run (checks for `node_modules/`)
  3. Skill configures `git config core.hooksPath hooks/` and verifies `hooks/pre-commit` is executable
  4. Skill verifies `ecosystem.commit` command is registered via `--dry-run` invocation
  5. `.env.example` includes `ECOSYSTEM_COMMIT` with a comment and `# How to obtain:` line
  6. `fo-onboard` skill Prepare step (step 2) verifies `git config core.hooksPath` is set to `hooks/` and configures it if missing
  7. `packages/forge/skills/fo/fo-onboard/SKILL.md` is updated to mirror `.agents/skills/fo-onboard/SKILL.md`
  8. `README.md` Quick start section includes `git config core.hooksPath hooks/` and references the `setup-ecosystem` skill
  9. `rfc.validate` passes on this file before merging
- Mark each criterion `[x]` with inline `(evidence: <file:line>, <check>)` annotation
- Commit the evidence updates

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0534 --json` — zero violations
- All acceptance criteria marked `[x]` with evidence

**Completion criterion:** All 9 acceptance criteria verified and marked `[x]` with evidence; `rfc.validate` passes

**Human review:** no

---

### Final Step. Stamp RFC as implemented

**Goal:** Atomically transition the RFC from `accepted` to `implemented` using `rfc.implement.stamp`.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0534 --implementation-commit <sha> --dry-run` first to verify preconditions
- Run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0534 --implementation-commit <sha>` (without `--dry-run`) to stamp
- Commit the stamped RFC separately (implementation commit and stamp commit MUST be separate)

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate RFC-0534 --json` — passes with `status: implemented`

**Completion criterion:** RFC-0534 status is `implemented` via `rfc.implement.stamp`; implementation commit and stamp commit are separate; `git status` is clean

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476)

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0534 --json` — must pass with zero violations
- `pnpm exec site-kernel run forge.skill.validate --json` — must pass (validates `fo-onboard` forge skill changes against SKILL-01..SKILL-13)
- No `build:check` needed — no TypeScript code changes (skill files are markdown, `.env.example` and `README.md` are documentation)
- No acceptance probes declared in RFC frontmatter — `rfc.verification.emit` not required

### 4.2 Evidence artifacts

- Acceptance criteria marked `[x]` with inline `(evidence: ...)` annotations in the RFC file
- Commit messages referencing `RFC-0534` in the subject line

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Skill staleness — if RFC-0533 adds new hooks or env vars, the `setup-ecosystem` skill must be updated | Step 1 includes `ecosystem.commit --dry-run` verification which fails if the command is removed or renamed |
| Onboarding coupling — adding hook-configuration to `fo-onboard` couples onboarding to RFC-0533 | Step 2 adds a non-blocking prerequisite check — if config is already set, the skill proceeds without action |
| `.env.example` confusion — documenting a transient env var may confuse operators | Step 3 includes clear comment: "Set programmatically by ecosystem.commit, not by the operator" |
| Dependency on RFC-0533 — skill verifies `hooks/pre-commit` and `ecosystem.commit` exist | Plan notes RFC-0533 dependency; skill reports missing dependency if RFC-0533 is not yet implemented |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-53, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0534 --reason "..." --invariant "DNA-53"` instead of working around it.
- If `rfc.implement.stamp` fails due to unmet preconditions, do NOT hand-edit the RFC frontmatter — resolve the failing precondition and re-run the stamp command.
