---
rfcId: RFC-0547
planId: PLAN-RFC-0547-01
status: draft
owner: architecture
createdAt: 2026-07-26
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0547

## 1. Objectives

- [ ] Objective 1 — Redesign `forge-bootstrap` SKILL.md with barrier-free process (register selection, name/gender, auto-doctor, silent auto-ADR, project analysis, first creation moment, welcoming report) — maps to acceptance criteria 1-10
- [ ] Objective 2 — Create knowledge files (`forge-about.md`, `operator-profile-template.md`, `project-narrative-template.md`, `milestone-gallery/`) and declare them in skill frontmatter — maps to acceptance criteria 15-20
- [ ] Objective 3 — Add `@webgogol/forge` as devDependency in all scaffold profiles — maps to acceptance criterion 11
- [ ] Objective 4 — Add `operator-profile.md` to `.gitignore` in all scaffold profiles — maps to acceptance criterion 12
- [ ] Objective 5 — Implement git history transfer (remove `.git` from excludes, implement `postSetup` in both adapters) — maps to acceptance criteria 13-14
- [ ] Objective 6 — Update `packages/forge/AGENTS.md` Output contract section — maps to acceptance criterion 21
- [ ] Objective 7 — Pass `forge.skill.validate` on redesigned skill — maps to acceptance criterion 22

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/migration-adapters/types.ts` — remove `.git` from `DEFAULT_EXCLUDE_PATTERNS`
- `packages/forge/src/migration-adapters/node-typescript-pnpm/index.ts` — implement `postSetup` with git init / format-patch + git am
- `packages/forge/src/migration-adapters/phaser-pnpm/index.ts` — implement `postSetup` with git init / format-patch + git am

### 2.2 Configuration and data

- `packages/forge/profiles/forge-shell.yaml` — add `@webgogol/forge` to install steps; add `operator-profile.md` to `.gitignore`
- `packages/forge/profiles/astro-typescript-turborepo.yaml` — add `@webgogol/forge` to root devDependencies install; add `operator-profile.md` to `.gitignore`
- `packages/forge/profiles/phaser-turborepo.yaml` — add `@webgogol/forge` to root devDependencies install; add `operator-profile.md` to `.gitignore`
- `packages/forge/skills/meta/forge-bootstrap/SKILL.md` — redesigned process, `knowledge` frontmatter array

### 2.3 Documentation and specs

- `packages/forge/skills/meta/forge-bootstrap/forge-about.md` — new knowledge file
- `packages/forge/skills/meta/forge-bootstrap/operator-profile-template.md` — new template
- `packages/forge/skills/meta/forge-bootstrap/project-narrative-template.md` — new template
- `packages/forge/skills/meta/forge-bootstrap/milestone-gallery/` — new directory (with .gitkeep)
- `packages/forge/AGENTS.md` — Output contract section: skill reports use aiLanguage, zero CLI commands

### 2.4 Validation and pipelines

- `pnpm --filter @webgogol/forge run build:check` — typecheck
- `pnpm --filter @webgogol/forge run test` — unit tests
- `pnpm exec site-kernel run forge.skill.validate` — skill validation
- `pnpm exec site-kernel run rfc.validate RFC-0547` — RFC validation

## 3. Step sequence

### Step 1. Create knowledge files and templates

**Goal:** Create the four new knowledge artifacts declared in the skill's `knowledge` frontmatter array.

**Agent actions:**

- Create `packages/forge/skills/meta/forge-bootstrap/forge-about.md` with: What Forge is, What Forge is not, What Forge can do, Value proposition. Zero CLI commands, zero `fo-` skill names, zero internal jargon (ADR, RFC, Compass). Declarative prose for a creator.
- Create `packages/forge/skills/meta/forge-bootstrap/operator-profile-template.md` with sections: `## Personal` (name, gender, project story, deep purpose, creative influences, audience, writing voice), `## Register`, `## Communication style`, `## Significance calibration`, `## Common requests`, `## Aesthetic preferences`, `## Unimplemented ideas`, `## Emotional rhythm`, `## Feedback history`, `## Operator directives`, `## External feedback`.
- Create `packages/forge/skills/meta/forge-bootstrap/project-narrative-template.md` with template structure for project narrative (used by RFC-0549).
- Create `packages/forge/skills/meta/forge-bootstrap/milestone-gallery/.gitkeep` to ensure the directory exists in git.

**Validation:**

- All four artifacts exist at their declared paths.
- `forge-about.md` contains no occurrences of: `pnpm exec`, `forge doctor`, `forge --help`, `fo-`, `ADR`, `RFC`, `Compass`, `MODULE_CONTRACT`, `CHANGE_SUMMARY`, `bindings`, `adapter-id`.

**Completion criterion:** All four artifacts exist and `forge-about.md` passes the jargon-free check.

**Human review:** no

---

### Step 2. Redesign forge-bootstrap SKILL.md

**Goal:** Rewrite the skill process with the barrier-free onboarding flow.

**Agent actions:**

- Rewrite `packages/forge/skills/meta/forge-bootstrap/SKILL.md` with the 11-step process from RFC-0547 § Design:
  1. Language selection (unchanged)
  2. Register selection (new — business or creative, stored in PREFERENCES.md and operator-profile.md)
  3. Operator name and gender (new — before first creation moment, gender optional)
  4. Verify forge project (unchanged)
  5. Mode choice (unchanged)
  6. Greenfield or transplant interview (unchanged)
  7. Auto-run doctor (new — runs forge.doctor internally, presents results in aiLanguage)
  8. Auto-create ADR (new, silent — invokes /fo-idea-create-adr inline, operator not told)
  9. Project analysis and recommendations (new, transplant only — 2-3 creator-focused recommendations)
  10. First creation moment (new — create something real, collect personal data organically)
  11. Welcoming report (redesigned — 6 sections, zero CLI commands, in aiLanguage)
- Add `knowledge` frontmatter array: `[forge-about.md, operator-profile-template.md, project-narrative-template.md, milestone-gallery/]`
- Remove all CLI commands from user-facing report text. Remove `fo-compass-annotate` mention. Remove `MODULE_CONTRACT`, `CHANGE_SUMMARY`, `bindings`, `adapter-id` jargon.
- Ensure SKILL.md instruction lines do not contain hardcoded `pnpm exec site-kernel run` or `docs/architecture-dna.md` (SKILL-11).
- Add guardrail: operator-profile.md is local and private, not committed to repository.
- Add guardrail: gender is optional, operator may decline.

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate` passes on the redesigned skill.
- SKILL-11: no hardcoded project literals in instruction lines.
- SKILL-13: all declared knowledge files exist.

**Completion criterion:** `forge.skill.validate` passes with zero violations on the redesigned `forge-bootstrap` skill.

**Human review:** no

---

### Step 3. Update scaffold profiles

**Goal:** Add `@webgogol/forge` as devDependency and `operator-profile.md` to `.gitignore` in all three profiles.

**Agent actions:**

- `packages/forge/profiles/forge-shell.yaml`:
  - Add `pnpm add -D @webgogol/forge` to `install` array.
  - Add a `.gitignore` file entry in `workspace.files` with content including `operator-profile.md`.
- `packages/forge/profiles/astro-typescript-turborepo.yaml`:
  - Add `@webgogol/forge` to the root `install` array (alongside `pnpm add -D typescript turbo`).
  - Add `operator-profile.md` to the existing `.gitignore` file content in `workspace.files`.
- `packages/forge/profiles/phaser-turborepo.yaml`:
  - Add `@webgogol/forge` to the root `install` array (alongside `pnpm add -D typescript turbo`).
  - Add `operator-profile.md` to the existing `.gitignore` file content in `workspace.files`.

**Validation:**

- All three profiles contain `@webgogol/forge` in their install steps.
- All three profiles contain `operator-profile.md` in their `.gitignore` content.
- `pnpm --filter @webgogol/forge run test` — scaffold-project tests pass.

**Completion criterion:** All three profiles include both `@webgogol/forge` in install steps and `operator-profile.md` in `.gitignore` content.

**Human review:** no

---

### Step 4. Implement git history transfer in migration adapters

**Goal:** Remove `.git` from `DEFAULT_EXCLUDE_PATTERNS` and implement `postSetup` in both adapters.

**Agent actions:**

- `packages/forge/src/migration-adapters/types.ts`:
  - Remove `.git` from `DEFAULT_EXCLUDE_PATTERNS` array.
  - Update the `CHANGE_SUMMARY` header to note RFC-0547.
- `packages/forge/src/migration-adapters/node-typescript-pnpm/index.ts`:
  - Implement `postSetup(targetDir, analysis)`: if `analysis.gitHistory` is true, run `git format-patch` on the source and `git am` in the target; if git history transfer fails or `analysis.gitHistory` is false, run `git init` in the target. Wrap in try/catch — failures fall back to clean `git init`.
  - Update `CHANGE_SUMMARY` header.
- `packages/forge/src/migration-adapters/phaser-pnpm/index.ts`:
  - Same `postSetup` implementation as node-typescript-pnpm.
  - Update `CHANGE_SUMMARY` header.

**Validation:**

- `pnpm --filter @webgogol/forge run build:check` — typecheck passes.
- `pnpm --filter @webgogol/forge run test` — migration-adapter tests pass.
- `DEFAULT_EXCLUDE_PATTERNS` no longer contains `.git`.

**Completion criterion:** Both adapters have working `postSetup` implementations; typecheck and tests pass.

**Human review:** no

---

### Step 5. Update tests

**Goal:** Update existing tests and add new tests for the changed behavior.

**Agent actions:**

- `packages/forge/src/tests/migration-adapters.test.ts`:
  - Update the `DEFAULT_EXCLUDE_PATTERNS` test: remove the assertion that `.git` is included. Add assertion that `.git` is NOT included.
  - Add test: `postSetup` runs `git init` when `analysis.gitHistory` is false.
  - Add test: `postSetup` runs `git init` when `analysis.gitHistory` is true but source has no commits (empty repo).
  - Add test: `postSetup` transfers git history via format-patch + git am when source has commits (accept path).
  - Add test: `postSetup` falls back to `git init` when git history transfer fails (decline path / failure path).
- `packages/forge/src/tests/scaffold-project.test.ts` (or `stack-profile.test.ts`):
  - Add test: all three profiles include `@webgogol/forge` in install steps.
  - Add test: all three profiles include `operator-profile.md` in `.gitignore` content.
- `packages/forge/src/tests/skill-validate.test.ts`:
  - Verify `forge-bootstrap` skill passes `forge.skill.validate` with the new `knowledge` array.

**Validation:**

- `pnpm --filter @webgogol/forge run test` — all tests pass.
- `pnpm --filter @webgogol/forge run build:check` — typecheck passes.

**Completion criterion:** All new and updated tests pass; typecheck passes.

**Human review:** no

---

### Step 6. Update packages/forge/AGENTS.md

**Goal:** Update the Output contract section to clarify skill reports use aiLanguage with zero CLI commands.

**Agent actions:**

- In `packages/forge/AGENTS.md`, under the "Output contract (RFC-0542)" section, add a paragraph:
  - Skill reports (agent chat output) use the operator's `aiLanguage` and contain zero CLI commands, guides, or format references in user-facing text. The system hides all complexity from the operator. CLI output remains English per RFC-0542; only the skill (agent chat) uses `aiLanguage`. The `forge-bootstrap` welcoming report is the canonical example of this contract.

**Validation:**

- `packages/forge/AGENTS.md` contains the updated Output contract paragraph.
- `pnpm --filter @webgogol/forge run build:check` — typecheck passes (AGENTS.md is not typechecked, but ensures no code breakage).

**Completion criterion:** AGENTS.md Output contract section includes the zero-CLI-commands-in-skill-reports clarification.

**Human review:** no

---

### Step 7. Final validation and acceptance criteria verification

**Goal:** Run all validation checks, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @webgogol/forge run build:check` — typecheck.
- Run `pnpm --filter @webgogol/forge run test` — all tests.
- Run `pnpm exec site-kernel run forge.skill.validate` — skill validation.
- Run `pnpm exec site-kernel run rfc.validate RFC-0547` — RFC validation.
- Check off each acceptance criterion in the RFC file with inline `(evidence: <file:line>, <test-or-command>)` annotations (V-27).
- Run `fo-review` on all session code changes.
- Run `fo-fix` if review has findings.
- Run `fo-doc-audit` to sync documentation surfaces.
- Stamp the RFC as implemented: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0547 --implementation-commit <sha>`.
- Commit the stamped RFC separately from the implementation commit.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate RFC-0547` — passes with zero violations.
- All acceptance criteria marked `[x]` with evidence annotations.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`; git status clean.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0547`
- `pnpm --filter @webgogol/forge run build:check`
- `pnpm --filter @webgogol/forge run test`
- `pnpm exec site-kernel run forge.skill.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0547` in the subject line (RFC-0265 commit hygiene)
- Review report in `docs/reviews/code/` for this session
- All acceptance criteria in RFC file marked `[x]` with inline `(evidence: ...)` annotations

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| Auto-doctor false positives | Step 2: SKILL.md instructs agent to translate doctor results into human language |
| Auto-ADR content quality | Step 2: SKILL.md instructs agent to ask operator's reason for adopting Forge and include in ADR |
| Recommendation quality | Step 2: SKILL.md specifies creator-facing recommendations, not technical refactors |
| Git history transfer performance | Step 4: postSetup warns operator; operator can decline |
| `@webgogol/forge` version drift | Step 3: `forge.doctor` checks `forge.syncedVersion` (already implemented per RFC-0543) |
| Agent misinterpretation (CLI commands in report) | Step 2: SKILL.md explicitly states "zero CLI commands"; Step 6: AGENTS.md reinforces |
| Operator declines everything | Step 2: SKILL.md notes no step is mandatory beyond language, register, and project verification |
| First creation moment fails | Step 2: SKILL.md offers template or recommendation as fallback |
| Privacy/GDPR (gender in public repo) | Step 3: `operator-profile.md` in `.gitignore`; Step 2: gender optional, operator may decline |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0547 --reason "..." --invariant "DNA-54"` instead of working around it (RFC-0334).
