---
rfcId: RFC-0524
planId: PLAN-RFC-0524-01
status: draft
owner: architecture
createdAt: 2026-07-25
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - docs/verification-plan.xml
    - packages/forge/AGENTS.md
---

# Implementation Plan: RFC-0524

## 1. Objectives

- [ ] Objective 1 — Add `knowledge?: string[]` field to `ForgeSkillEntry` interface and Zod schema (maps to acceptance criterion: `ForgeSkillEntry.knowledge?: string[]` field added)
- [ ] Objective 2 — Implement SKILL-13 validation rule in `forge.skill.validate` (maps to acceptance criterion: SKILL-13 enforced)
- [ ] Objective 3 — Extend `forge.init` to sync declared knowledge files (maps to acceptance criterion: `forge.init` syncs knowledge files)
- [ ] Objective 4 — Extend `forge.doctor` to detect stale knowledge files (maps to acceptance criterion: `forge.doctor` reports stale knowledge files)
- [ ] Objective 5 — Document the cumulative knowledge convention in `writing-great-skills.md` (maps to acceptance criterion: convention section added)
- [ ] Objective 6 — Adopt knowledge system in `fo-site-scan` and `grilling` skills (maps to acceptance criterion: `fo-site-scan` + `grilling` frontmatter and files)
- [ ] Objective 7 — Update `skill-create` to prompt for knowledge system adoption (maps to acceptance criterion: `skill-create` updated)
- [ ] Objective 8 — Verify zero violations via `forge.skill.validate` (maps to acceptance criterion: zero violations after adoption)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/registry.ts` — `ForgeSkillEntry` interface: add `knowledge?: string[]` field; add `knowledge` arrays to `fo-site-scan` and `grilling` registry entries
- `packages/forge/src/skill-schema.ts` — `skillFrontmatterSchema`: add optional `knowledge: z.array(z.string()).optional()`
- `packages/forge/src/validators/skill-validate.ts` — add SKILL-13 validation rule (check declared knowledge files exist)
- `packages/forge/src/onboarding/init.ts` — extend skill sync loop to copy declared knowledge files in addition to SKILL.md
- `packages/forge/src/onboarding/doctor.ts` — add stale knowledge file detection check
- `packages/forge/src/tests/skill-schema.test.ts` — add test cases for `knowledge` field
- `packages/forge/src/tests/skill-validate.test.ts` — add test cases for SKILL-13 (create if not exists, or add to existing test file)

### 2.2 Configuration and data

- `packages/forge/skills/fo/fo-site-scan/SKILL.md` — add `knowledge: [qa-log.md, fix-patterns.md, learned-principles.md]` to frontmatter
- `packages/forge/skills/shared/grilling/SKILL.md` — add `knowledge: [qa-log.md, learned-principles.md]` to frontmatter; update body to use knowledge system
- `packages/forge/skills/shared/grilling/qa-log.md` — create empty template
- `packages/forge/skills/shared/grilling/learned-principles.md` — create empty template
- `packages/forge/skills/meta/skill-create/SKILL.md` — update to prompt for knowledge system adoption
- `.agents/skills/fo-site-scan/SKILL.md` — synced copy updated
- `.agents/skills/grilling/SKILL.md` — synced copy updated
- `.agents/skills/grilling/qa-log.md` — synced copy created
- `.agents/skills/grilling/learned-principles.md` — synced copy created

### 2.3 Documentation and specs

- `packages/forge/skills/shared/writing-great-skills/SKILL.md` — add "Cumulative knowledge pattern" section
- `packages/forge/AGENTS.md` — document `knowledge` field and SKILL-13 in Skills section
- `docs/verification-plan.xml` — document SKILL-13 rule in the verification surface

### 2.4 Validation and pipelines

- `forge.skill.validate` — existing command, new SKILL-13 rule added
- `forge.init` — existing command, extended to sync knowledge files
- `forge.doctor` — existing command, new stale knowledge file check added
- `build.check` — already runs `forge.skill.validate`, no pipeline change needed

## 3. Step sequence

### Step 1. Add `knowledge` field to TypeScript contracts

**Goal:** Add the optional `knowledge?: string[]` field to `ForgeSkillEntry` and the Zod schema.

**Agent actions:**

- In `packages/forge/src/registry.ts`: add `knowledge?: string[]` to the `ForgeSkillEntry` interface (after `path: string`)
- In `packages/forge/src/skill-schema.ts`: add `knowledge: z.array(z.string()).optional()` to `skillFrontmatterSchema` (after `bindings`)

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` — TypeScript compiles without errors

**Completion criterion:** Both files compile with the new `knowledge` field.

**Human review:** no

---

### Step 2. Add SKILL-13 validation rule to skill-validate.ts

**Goal:** Implement the SKILL-13 check: declared `knowledge:` files must exist relative to the SKILL.md directory.

**Agent actions:**

- In `packages/forge/src/validators/skill-validate.ts`, after the SKILL-11 check block (line 158-161), add a SKILL-13 check:
  - Read `parsed.data.knowledge` (if present)
  - For each file name in the array, check `fs.existsSync(path.join(skillDir, fileName))`
  - If file does not exist, push a violation: `{ skill: entry.name, rule: "SKILL-13", message: "Declared knowledge file '<fileName>' not found relative to SKILL.md directory" }`
- Update the `MODULE_CONTRACT` purpose comment from `SKILL-01..SKILL-11` to `SKILL-01..SKILL-13`
- Update the `CHANGE_SUMMARY` with an RFC-0524 entry
- Update the command description in `core.module.ts` line 156 from `SKILL-01..SKILL-10` to `SKILL-01..SKILL-13` (also accounts for SKILL-11 and SKILL-12)

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` — compiles without errors
- `pnpm --filter @wgogol/forge run test` — existing tests pass

**Completion criterion:** `skill-validate.ts` enforces SKILL-13 and compiles cleanly.

**Human review:** no

---

### Step 3. Extend forge.init to sync knowledge files

**Goal:** Extend the skill sync loop in `init.ts` to copy declared knowledge files alongside SKILL.md.

**Agent actions:**

- In `packages/forge/src/onboarding/init.ts`, in the skill sync loop (lines 125-140), after copying `SKILL.md`:
  - Read the SKILL.md frontmatter and parse `knowledge:` array (if present)
  - For each declared knowledge file, copy from `path.join(forgeRoot, skill.path, '..', fileName)` to `path.join(destDir, fileName)`
  - Append to `created` list: `${config.paths.skillsDir}/${skillName}/${fileName}`
- Handle missing source files gracefully: if a declared knowledge file doesn't exist in source, push to `errors`

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` — compiles without errors
- `pnpm --filter @wgogol/forge run test` — existing tests pass

**Completion criterion:** `forge.init` copies declared knowledge files from source to `.agents/skills/`.

**Human review:** no

---

### Step 4. Extend forge.doctor to detect stale knowledge files

**Goal:** Add a stale knowledge file detection check to `doctor.ts`.

**Agent actions:**

- In `packages/forge/src/onboarding/doctor.ts`, add a new async check function `checkStaleKnowledgeFiles`:
  - For each skill in `FORGE_SKILLS` that has a `knowledge` array:
    - Resolve source path: `path.join(forgeRoot, skill.path, '..', fileName)`
    - Resolve `.agents/` copy: `path.join(workspaceRoot, config.paths.skillsDir, skill.name, fileName)`
    - If both exist, compare contents (via `readFile`); if they differ, add a warning: `{ name: "stale-knowledge-file", status: "warn", message: "Knowledge file '<fileName>' for skill '<skill.name>' differs between source and .agents/ — run forge.init to sync" }`
    - If source exists but `.agents/` copy doesn't, skip (expected on first install)
- Add the check to the doctor's check list so it runs alongside existing checks
- Update the `CHANGE_SUMMARY` with an RFC-0524 entry

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` — compiles without errors
- `pnpm --filter @wgogol/forge run test` — existing tests pass

**Completion criterion:** `forge.doctor` reports stale knowledge files as warnings when source and `.agents/` copies differ.

**Human review:** no

---

### Step 5. Add knowledge field to fo-site-scan and grilling registry entries

**Goal:** Update the `FORGE_SKILLS` registry entries for `fo-site-scan` and `grilling` to declare their knowledge files.

**Agent actions:**

- In `packages/forge/src/registry.ts`, find the `fo-site-scan` entry and add: `knowledge: ["qa-log.md", "fix-patterns.md", "learned-principles.md"]`
- Find the `grilling` entry and add: `knowledge: ["qa-log.md", "learned-principles.md"]`

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` — compiles without errors

**Completion criterion:** Both registry entries declare their `knowledge` arrays.

**Human review:** no

---

### Step 6. Update SKILL.md frontmatter for fo-site-scan and grilling

**Goal:** Add the `knowledge:` frontmatter field to `fo-site-scan` and `grilling` SKILL.md files.

**Agent actions:**

- In `packages/forge/skills/fo/fo-site-scan/SKILL.md` frontmatter, add:
  ```yaml
  knowledge:
    - qa-log.md
    - fix-patterns.md
    - learned-principles.md
  ```
- In `packages/forge/skills/shared/grilling/SKILL.md` frontmatter, add:
  ```yaml
  knowledge:
    - qa-log.md
    - learned-principles.md
  ```

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate` — zero SKILL-01 violations (frontmatter parses with new `knowledge` field)

**Completion criterion:** Both SKILL.md files have `knowledge:` frontmatter matching their registry entries.

**Human review:** no

---

### Step 7. Create grilling knowledge files and update grilling SKILL.md body

**Goal:** Create empty knowledge file templates for `grilling` and update its SKILL.md body to use the knowledge system.

**Agent actions:**

- Create `packages/forge/skills/shared/grilling/qa-log.md` with header comments and format documentation (mirror the `fo-site-scan` qa-log.md template structure)
- Create `packages/forge/skills/shared/grilling/learned-principles.md` with header comments and format documentation (mirror the `fo-site-scan` learned-principles.md template structure)
- Update `packages/forge/skills/shared/grilling/SKILL.md` body to add after the "Before starting" line:
  - Read L2 (`learned-principles.md`) at the start of each session to improve recommended answers
  - Append Q&A pairs to L0 (`qa-log.md`) during the session
  - At the end of the session, perform meta-analysis: identify recurring decision patterns, formulate concrete principles, present to operator for approval, append approved principles to L2

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate` — zero SKILL-13 violations (declared knowledge files exist)

**Completion criterion:** `grilling` has `qa-log.md` and `learned-principles.md` files, and its SKILL.md body references the knowledge system.

**Human review:** no

---

### Step 8. Sync .agents/skills/ copies

**Goal:** Update synced copies in `.agents/skills/` to match `packages/forge/skills/`.

**Agent actions:**

- Copy updated `fo-site-scan/SKILL.md` to `.agents/skills/fo-site-scan/SKILL.md`
- Copy updated `grilling/SKILL.md` to `.agents/skills/grilling/SKILL.md`
- Copy new `grilling/qa-log.md` to `.agents/skills/grilling/qa-log.md`
- Copy new `grilling/learned-principles.md` to `.agents/skills/grilling/learned-principles.md`

**Validation:**

- Diff check: `diff packages/forge/skills/fo/fo-site-scan/SKILL.md .agents/skills/fo-site-scan/SKILL.md` — no differences
- Diff check: `diff packages/forge/skills/shared/grilling/ .agents/skills/grilling/` — no differences

**Completion criterion:** `.agents/skills/` copies are synced with `packages/forge/skills/` versions.

**Human review:** no

---

### Step 9. Add "Cumulative knowledge pattern" section to writing-great-skills.md

**Goal:** Document the three-layer knowledge convention in the shared skill reference.

**Agent actions:**

- In `packages/forge/skills/shared/writing-great-skills/SKILL.md`, add a new section "## Cumulative knowledge pattern" (after the "Failure modes" section) describing:
  - The three-layer reference pattern (L0 qa-log, L1 fix-patterns, L2 learned-principles)
  - The `knowledge:` frontmatter field
  - Confidence progression (`confirmations: N`, threshold 3, reset on rejection)
  - Mutation contract (source-of-truth in `packages/forge/skills/`, `.agents/` is synced read-only)
  - npm portability (empty templates shipped, accumulated knowledge excluded via `.npmignore`)

**Validation:**

- Visual review — the section is consistent with the RFC

**Completion criterion:** `writing-great-skills.md` contains a "Cumulative knowledge pattern" section.

**Human review:** no

---

### Step 10. Update skill-create SKILL.md to prompt for knowledge system

**Goal:** Update the `skill-create` skill to prompt operators about knowledge system adoption when appropriate.

**Agent actions:**

- In `packages/forge/skills/meta/skill-create/SKILL.md`, after step 1 (Determine skill metadata), add a step 1.5:
  - If `concerns: implementation` (current binary) or `concerns: content-mutation | code-mutation` (after RFC-0523) AND `invocation: user`, ask the operator whether to adopt the cumulative knowledge pattern
  - Provide a concise explanation of why it may benefit this specific skill
  - If yes, create empty knowledge files with header comments and add `knowledge:` to frontmatter
- Update step 4 (Validate) to mention SKILL-13

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate` — zero violations

**Completion criterion:** `skill-create` SKILL.md documents the knowledge system adoption prompt.

**Human review:** no

---

### Step 11. Add tests for knowledge field and SKILL-13

**Goal:** Add test coverage for the new `knowledge` field in the Zod schema and the SKILL-13 validation rule.

**Agent actions:**

- In `packages/forge/src/tests/skill-schema.test.ts`, add test cases:
  - "accepts optional knowledge field": frontmatter with `knowledge: ["qa-log.md"]` parses successfully
  - "accepts frontmatter without knowledge field": `knowledge` is undefined when absent
  - "rejects non-array knowledge": `knowledge: "qa-log.md"` (string) is rejected
- Create `packages/forge/src/tests/skill-validate.test.ts` (or add to existing test file) with test cases for SKILL-13:
  - "SKILL-13 passes when declared knowledge files exist": mock a skill with `knowledge: ["qa-log.md"]` and `qa-log.md` present → no SKILL-13 violation
  - "SKILL-13 fails when declared knowledge file is missing": mock a skill with `knowledge: ["missing.md"]` and file absent → SKILL-13 violation emitted

**Validation:**

- `pnpm --filter @wgogol/forge run test` — all tests pass

**Completion criterion:** Test suite covers the `knowledge` field and SKILL-13 validation.

**Human review:** no

---

### Step 12. Update packages/forge/AGENTS.md

**Goal:** Document the `knowledge` field and SKILL-13 in the forge AGENTS.md.

**Agent actions:**

- In `packages/forge/AGENTS.md`, in the Skills section (line 29), add:
  - Document the optional `knowledge: string[]` field in `ForgeSkillEntry`
  - Document SKILL-13: declared knowledge files must exist relative to SKILL.md directory
  - Reference RFC-0524 and the convention in `writing-great-skills.md`
  - Note the mutation contract: skills read from source (`packages/forge/skills/`), `.agents/` is a synced read-only copy for npm consumers

**Validation:**

- Visual review — AGENTS.md text is consistent with the RFC

**Completion criterion:** `packages/forge/AGENTS.md` documents the `knowledge` field and SKILL-13.

**Human review:** no

---

### Step 13. Update docs/verification-plan.xml

**Goal:** Document the SKILL-13 rule in the verification surface.

**Agent actions:**

- Add a SKILL-13 entry to the forge skill validation section of `docs/verification-plan.xml`, documenting: rule ID, description ("declared knowledge files must exist relative to SKILL.md directory"), severity (error), and the enforcing command (`forge.skill.validate`).

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0524 --json` — passes

**Completion criterion:** `docs/verification-plan.xml` documents SKILL-13.

**Human review:** no

---

### Step 14. Run forge.skill.validate and verify zero violations

**Goal:** Confirm the full validation passes after all changes.

**Agent actions:**

- Run `pnpm exec site-kernel run forge.skill.validate` — expect zero violations
- If violations appear, fix the offending SKILL.md, registry entry, or knowledge file and re-run

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate` — status: pass, zero violations

**Completion criterion:** `forge.skill.validate` passes with zero violations.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `forge.skill.validate`, `forge.init`, and `forge.doctor` logic changed — check if manifest needs refresh).
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0524 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate RFC-0524`
- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @wgogol/forge run test`
- `pnpm exec site-kernel run forge.skill.validate`

**Completion criterion:** All documentation artifacts in scope are updated; all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0524`
- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @wgogol/forge run test`
- `pnpm exec site-kernel run forge.skill.validate`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0524` in the subject line (RFC-0265 commit hygiene)
- `forge.skill.validate` output showing zero violations

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Stale `.agents/` copies | Step 3 extends `forge.init` to sync knowledge files; Step 4 adds `forge.doctor` stale detection; SKILL.md body instructs skills to read from source |
| Knowledge file growth | Not addressed in implementation — convention documents manual archival in `writing-great-skills.md` (Step 9) |
| npm publishing portability | Step 9 documents the empty-template + `.npmignore` pattern in `writing-great-skills.md`; existing `fo-site-scan` knowledge files already follow this pattern |
| Concurrent execution | Not addressed in implementation — convention assumes single-agent execution per skill (documented in Step 9) |
| False confidence | Step 9 documents the `confirmations` reset mechanism in `writing-great-skills.md` |
| Agent misinterpretation | Step 9 documents that autonomous application is context-dependent, not absolute |
| Convention adoption rate | Not addressed — convention is opt-in, skills adopt at their own pace |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0524 --reason "..." --invariant "DNA-54"` instead of working around it.
- If SKILL-13 numbering conflicts with another RFC (e.g., RFC-0523 introduces SKILL-12 and another RFC claims SKILL-13), coordinate numbering via RFC supersedence — do not renumber unilaterally.
- If `forge.init` sync logic cannot handle knowledge files without a full re-init, escalate to a separate RFC for incremental sync — do not add a `--sync-knowledge-only` flag without RFC governance.
