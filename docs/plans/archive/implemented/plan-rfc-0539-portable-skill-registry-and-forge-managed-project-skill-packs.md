---
rfcId: RFC-0539
planId: PLAN-RFC-0539-01
status: draft
owner: architecture
createdAt: 2026-07-26
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
    - packages/wgogol-skills
  services: []
  docs:
    - docs/adrs/adr-0003-wgogol-skills-package.md
    - packages/forge/AGENTS.md
    - packages/AGENTS.md
    - docs/technology.xml
---

# Implementation Plan: RFC-0539

## 1. Objectives

- [ ] O1 — Add `ForgeSkillPack` type, `skillPacks` schema, and `discoverPackSkills` helper to forge — maps to acceptance criterion 1
- [ ] O2 — Remove `mission-complete` and `fo-site-scan` from `FORGE_SKILLS` and relocate four skills to `packages/wgogol-skills/skills/` with `wg-` prefix (atomic) — maps to acceptance criteria 2, 3
- [ ] O3 — Extend `forge.init` to sync declared pack skills — maps to acceptance criterion 4
- [ ] O4 — Extend `forge.skill.validate` with SKILL-14 and SKILL-15 — maps to acceptance criterion 5
- [ ] O5 — Extend `forge.doctor` to report stale/missing pack copies and invalid `skillPacks` config — maps to acceptance criterion 6
- [ ] O6 — Remove `wgogol-skills` sync script; declare `wg` pack in `forge.yaml` — maps to acceptance criterion 7
- [ ] O7 — Update documentation (AGENTS.md files, ADR-0003, technology.xml) — maps to acceptance criterion 8
- [ ] O8 — `rfc.validate` passes — maps to acceptance criterion 9

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/config/forge-config.ts` — add `ForgeSkillPack` interface, `forgeSkillPackSchema`, extend `forgeConfigSchema` and `ForgeConfig` with optional `skillPacks`
- `packages/forge/src/registry.ts` — remove `mission-complete` and `fo-site-scan` entries from `FORGE_SKILLS`; add portability invariant comment on `ForgeSkillEntry`; add `discoverPackSkills(workspaceRoot, config)` shared helper that scans pack directories for `<prefix>-<name>/SKILL.md` entries and returns a list of `{ name, pack, path, knowledge? }` objects
- `packages/forge/src/validators/skill-validate.ts` — add SKILL-14 (pack prefix check), SKILL-15 (`fo-` prefix reservation), extend SKILL-07 known-names set to include pack skills (asymmetric: pack→forge allowed, forge→pack forbidden); iterate pack skills alongside forge skills using `discoverPackSkills`
- `packages/forge/src/onboarding/init.ts` — after syncing `FORGE_SKILLS`, call `discoverPackSkills` and sync each pack skill into `.agents/skills/`
- `packages/forge/src/onboarding/doctor.ts` — extend `checkStaleKnowledgeFiles` to iterate pack skills via `discoverPackSkills`; add new check for stale/missing pack skill copies; add `skillPacks` config validation (unique prefixes, unique dirs, no `fo` prefix, dir exists)
- `packages/forge/os/core/core.module.ts` — extend `skillListWrapper` to include pack skills (via `discoverPackSkills`) with `pack: <prefix>` column
- `packages/forge/src/tests/skill-validate.test.ts` — add tests for SKILL-14, SKILL-15, and SKILL-07 asymmetric dependency direction
- `packages/wgogol-skills/sync.mjs` — delete
- `packages/wgogol-skills/package.json` — remove `sync` script

### 2.2 Configuration and data

- `forge.yaml` — add `skillPacks` section: `[{ prefix: wg, dir: packages/wgogol-skills/skills }]`
- Skill files moved:
  - `packages/forge/skills/fo/mission-complete/` → `packages/wgogol-skills/skills/wg-mission-complete/`
  - `packages/forge/skills/fo/fo-site-scan/` → `packages/wgogol-skills/skills/wg-site-scan/`
  - `packages/wgogol-skills/skills/onboard/` → `packages/wgogol-skills/skills/wg-onboard/`
  - `packages/wgogol-skills/skills/mission-reconcile/` → `packages/wgogol-skills/skills/wg-mission-reconcile/`
- Each moved skill's `SKILL.md` frontmatter `name` field updated to new `wg-` name
- Knowledge files move with their skills (qa-log.md, fix-patterns.md, learned-principles.md as applicable)
- Old `.agents/skills/` copies for old skill names (mission-complete, fo-site-scan, onboard, mission-reconcile) deleted manually after `forge.init` resync

### 2.3 Documentation and specs

- `docs/adrs/adr-0003-wgogol-skills-package.md` — add superseding note referencing RFC-0539
- `packages/forge/AGENTS.md` — update Skills section to document skill packs, SKILL-14/15, prefix rules
- `packages/AGENTS.md` — update `forge` ownership table entry (skill count changes from 31 to 29); add `wgogol-skills` to ownership table with prefix/validation info
- `docs/technology.xml` — update `pkg-forge` role description if skill count changes

### 2.4 Validation and pipelines

- `pnpm exec site-kernel run rfc.validate --id RFC-0539`
- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @wgogol/forge run test`
- `pnpm exec site-kernel run forge.skill.validate` (via forge CLI or site-kernel)
- `pnpm exec site-kernel run forge.doctor`

## 3. Step sequence

### Step 1. Add `ForgeSkillPack` type, `skillPacks` schema, and `discoverPackSkills` helper

**Goal:** Extend the forge configuration contract to support project-declared skill packs and add a shared helper for pack skill discovery.

**Agent actions:**

- In `packages/forge/src/config/forge-config.ts`:
  - Add `forgeSkillPackSchema` Zod schema: `z.object({ prefix: z.string().regex(/^[a-z][a-z0-9]{1,7}$/).refine(v => v !== "fo", "fo prefix is reserved for forge"), dir: z.string().min(1) })`
  - Add `ForgeSkillPack` interface matching the schema
  - Extend `forgeConfigSchema` with `skillPacks: z.array(forgeSkillPackSchema).optional()`
  - Extend `ForgeConfig` interface with `skillPacks?: ForgeSkillPack[]`
  - Update `defaultForgeConfig` to not include `skillPacks` (absent = opt-in)
  - Update MODULE_CONTRACT/CHANGE_SUMMARY
- In `packages/forge/src/registry.ts`:
  - Add `discoverPackSkills(workspaceRoot: string, config: ForgeConfig): PackSkillEntry[]` shared helper that scans each declared pack directory for `<prefix>-<name>/SKILL.md` entries and returns `{ name, pack, dir, path, knowledge? }` objects. This helper is imported by `init.ts`, `skill-validate.ts`, `doctor.ts`, and `core.module.ts` to avoid duplicating directory-scan logic (dedup.helper.lint compliance).
  - Add `PackSkillEntry` interface

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- Schema rejects `fo` prefix: write a quick inline test or verify via existing test infrastructure

**Completion criterion:** `ForgeSkillPack` type, `skillPacks` schema, and `discoverPackSkills` helper exist; `build:check` passes; schema rejects `fo` prefix.

**Human review:** no

---

### Step 2. Remove `mission-complete` and `fo-site-scan` from `FORGE_SKILLS` and relocate four skills (atomic)

**Goal:** Make `FORGE_SKILLS` a purely portable registry and move ecosystem-bound skills to the project skill pack directory with new names in a single atomic commit.

**Agent actions:**

- In `packages/forge/src/registry.ts`:
  - Remove the `mission-complete` entry (lines ~186-194)
  - Remove the `fo-site-scan` entry (lines ~278-286)
  - Add a portability invariant comment on `ForgeSkillEntry`: "Every entry MUST be portable — it runs in any forge-bootstrapped project using only forge commands, forge bindings, and standard project files."
  - Update CHANGE_SUMMARY with RFC-0539 entry
- Move directories (preserving knowledge files):
  - `packages/forge/skills/fo/mission-complete/` → `packages/wgogol-skills/skills/wg-mission-complete/`
  - `packages/forge/skills/fo/fo-site-scan/` → `packages/wgogol-skills/skills/wg-site-scan/`
  - `packages/wgogol-skills/skills/onboard/` → `packages/wgogol-skills/skills/wg-onboard/`
  - `packages/wgogol-skills/skills/mission-reconcile/` → `packages/wgogol-skills/skills/wg-mission-reconcile/`
- Update `name:` field in each moved skill's `SKILL.md` frontmatter to the new `wg-` name
- Update internal self-references in SKILL.md bodies (e.g. "mission-complete" → "wg-mission-complete" in headings, knowledge file paths, commit instructions, source-of-truth paths)
- Delete old directories: `packages/forge/skills/fo/mission-complete/`, `packages/forge/skills/fo/fo-site-scan/`, `packages/wgogol-skills/skills/onboard/`, `packages/wgogol-skills/skills/mission-reconcile/`
- In `packages/forge/skills/meta/skill-create/SKILL.md` and `packages/forge/skills/shared/writing-great-skills/SKILL.md`: replace references to `fo-site-scan` and `mission-complete` with generic descriptions or existing forge skill examples (e.g. `grilling`). Forge skills must not reference project-specific skills — that breaks portability.
- Repo-wide grep for old skill names (`mission-complete`, `fo-site-scan`, `onboard`, `mission-reconcile`) in `.md`, `.yaml`, `.yml`, `.mjs`, `.ts` files (excluding `missions/`, `docs/rfcs/`, `docs/plans/`, `docs/audits/`, `docs/reviews/`, `.agents/` and this RFC's own references) and update references to new `wg-` names

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- No orphan skill directories remain under `packages/forge/skills/fo/`
- `grep -r "mission-complete" --include="*.md" --include="*.ts" packages/forge/skills/` returns no results (old name fully removed from forge skills)
- `forge.skill.validate` passes (no orphan violations — files moved and registry updated atomically)

**Completion criterion:** `FORGE_SKILLS` array contains no `mission-complete` or `fo-site-scan` entries; four skills exist under `packages/wgogol-skills/skills/` with `wg-` names and their knowledge files; old directories deleted; no stale references in forge skills; `build:check` passes.

**Human review:** no

---

### Step 3. Extend `forge.init` to sync declared pack skills

**Goal:** Make `forge.init` the single sync path for both forge skills and project skill packs.

**Agent actions:**

- In `packages/forge/src/onboarding/init.ts`:
  - After the existing `FORGE_SKILLS` sync loop (line ~167), add a new loop:
    - Load `config.skillPacks` (if present)
    - For each pack, resolve `pack.dir` relative to `workspaceRoot`
    - Scan the pack directory for `<prefix>-<name>/SKILL.md` entries
    - For each found skill, copy `SKILL.md` and declared knowledge files to `.agents/skills/<skill-name>/` (same copy semantics as the forge skills loop)
  - Update MODULE_CONTRACT/CHANGE_SUMMARY

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- Manual: run `forge.init` and verify pack skills appear in `.agents/skills/`

**Completion criterion:** `forge.init` syncs declared pack skills into `.agents/skills/` alongside forge skills; `build:check` passes.

**Human review:** no

---

### Step 4. Extend `forge.skill.validate` with SKILL-14 and SKILL-15

**Goal:** Enforce pack prefix and `fo-` prefix reservation rules.

**Agent actions:**

- In `packages/forge/src/validators/skill-validate.ts`:
  - Load `forge.yaml` config to get `skillPacks`
  - Call `discoverPackSkills(workspaceRoot, config)` to get pack skills
  - Extend the main validation loop to also iterate pack skills (same SKILL-01..13 checks)
  - SKILL-14: for each pack skill, verify the skill name starts with `<pack.prefix>-`. If not, emit violation `{ skill, pack: <prefix>, rule: "SKILL-14", message: "skill name must start with pack prefix '<prefix>-'" }`
  - SKILL-15: for each pack skill, verify the skill name does NOT start with `fo-`. If it does, emit violation `{ skill, rule: "SKILL-15", message: "non-forge skill may not use the 'fo-' prefix" }`
  - Extend SKILL-07 (asymmetric dependency direction): the `knownNames` set includes both `FORGE_SKILLS` names and pack skill names. For forge skills, `dependsOn` entries must only reference other forge skills (forge→pack is forbidden — breaks portability). For pack skills, `dependsOn` entries may reference forge skills or other pack skills (pack→forge and pack→pack are allowed).
  - Update MODULE_CONTRACT/CHANGE_SUMMARY
- In `packages/forge/src/tests/skill-validate.test.ts`:
  - Add test for SKILL-14: a pack skill without the correct prefix produces a violation
  - Add test for SKILL-15: a pack skill with `fo-` prefix produces a violation
  - Add test for SKILL-07 cross-references: a pack skill depending on a forge skill passes

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- `pnpm --filter @wgogol/forge run test` passes
- `forge.skill.validate --json` returns `status: pass` on the current repo (all pack skills have `wg-` prefix)

**Completion criterion:** `forge.skill.validate` enforces SKILL-14 and SKILL-15 with `--json` violations as specified; tests pass.

**Human review:** no

---

### Step 5. Extend `forge.doctor` for pack skill diagnostics

**Goal:** Detect stale/missing pack skill copies and invalid `skillPacks` config.

**Agent actions:**

- In `packages/forge/src/onboarding/doctor.ts`:
  - Extend `checkStaleKnowledgeFiles` to also iterate pack skills: for each pack, scan for skills with `knowledge:` frontmatter, compare source vs `.agents/skills/` copies
  - Add new check `pack-skills-sync`: for each declared pack, verify every `<prefix>-<name>/SKILL.md` on disk has a corresponding `.agents/skills/<name>/SKILL.md` copy. Report missing/stale copies as `warn`
  - Add new check `skillPacks-config`: validate `skillPacks` entries — unique prefixes, unique dirs, no `fo` prefix, dir exists. Report violations as `fail`
  - Update MODULE_CONTRACT/CHANGE_SUMMARY

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- `forge.doctor` reports pack skill checks alongside existing checks

**Completion criterion:** `forge.doctor` reports stale/missing pack copies and invalid `skillPacks` config; `build:check` passes.

**Human review:** no

---

### Step 6. Extend `forge.skill.list` to include pack skills

**Goal:** Show pack skills alongside forge skills with a `pack` column.

**Agent actions:**

- In `packages/forge/os/core/core.module.ts`:
  - In `skillListWrapper`, load `skillPacks` from config
  - Scan each pack directory for skills
  - Merge pack skills into the output with a `pack: <prefix>` field
  - Update pretty output to show `pack` column
  - Update summary count to include pack skills

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` passes
- `forge.skill.list` output includes pack skills

**Completion criterion:** `forge.skill.list` lists pack skills with `pack: <prefix>` column.

**Human review:** no

---

### Step 7. Remove `wgogol-skills` sync script; declare `wg` pack in `forge.yaml`

**Goal:** Eliminate the parallel sync mechanism; make `forge.init` the single sync path.

**Agent actions:**

- Delete `packages/wgogol-skills/sync.mjs`
- In `packages/wgogol-skills/package.json`: remove the `sync` script entry
- In `forge.yaml` (repo root): add `skillPacks` section:
  ```yaml
  skillPacks:
    - prefix: wg
      dir: packages/wgogol-skills/skills
  ```
- Explicitly delete stale `.agents/skills/` directories for old skill names:
  - `rm -rf .agents/skills/mission-complete/`
  - `rm -rf .agents/skills/fo-site-scan/`
  - `rm -rf .agents/skills/onboard/`
  - `rm -rf .agents/skills/mission-reconcile/`
- Run `forge.init` to sync the new `wg-` pack skills into `.agents/skills/`

**Validation:**

- `packages/wgogol-skills/sync.mjs` does not exist
- `forge.yaml` contains `skillPacks` with `wg` pack
- `forge.doctor` reports no stale pack copies

**Completion criterion:** Sync script removed; `forge.yaml` declares `wg` pack; no stale copies in `.agents/skills/`; new `wg-` skills synced to `.agents/skills/`.

**Human review:** no

---

### Step 8. Update documentation

**Goal:** Synchronize all documentation artifacts with the new skill pack system.

**Agent actions:**

- `docs/adrs/adr-0003-wgogol-skills-package.md`: add a superseding note at the top or bottom: "Superseded by RFC-0539: WGogol-specific skills are now managed by forge under the `wg` skill pack with prefix enforcement and validation."
- `packages/forge/AGENTS.md`: update Skills section to document skill packs, `skillPacks` config, SKILL-14/15 rules, prefix reservation
- `packages/AGENTS.md`: update `forge` ownership table entry (skill count: 29 forge skills); add `wgogol-skills` to the ownership table with note about `wg-` prefix and forge validation
- `docs/technology.xml`: update `pkg-forge` role description if skill count is mentioned (currently says "31 skills" — update to "29 skills" or remove count)

**Validation:**

- All four docs updated; `git diff` shows changes in each file
- `pnpm --filter @wgogol/forge run build:check` passes

**Completion criterion:** All documentation artifacts in scope are updated with skill pack information.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Verify all acceptance criteria, stamp the RFC as implemented.

**Agent actions:**

- Verify every acceptance criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0539`
- Run `pnpm --filter @wgogol/forge run build:check`
- Run `pnpm --filter @wgogol/forge run test`
- Run `pnpm exec site-kernel run forge.skill.validate` — zero violations
- Run `pnpm exec site-kernel run forge.doctor` — no fails
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `forge.skill.list` output shape changed)
- Stamp the RFC: `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0539 --implementation-commit <sha>`
- Verify `git status` is clean

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate --id RFC-0539` — pass
- All acceptance criteria marked `[x]` with evidence

**Completion criterion:** All acceptance criteria checked off with inline `(evidence: ...)` annotations; RFC stamped as `implemented` via `rfc.implement.stamp`; `git status` clean.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0539`
- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @wgogol/forge run test`
- `pnpm exec site-kernel run forge.skill.validate` — zero violations
- `pnpm exec site-kernel run forge.doctor` — no fails

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0539` in the subject line (RFC-0265 commit hygiene)
- Implementation commit SHA for `rfc.implement.stamp`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Rename churn — missed references to old skill names | Step 3 includes repo-wide grep for old names; forward-only policy makes fix trivial |
| Prefix squatting — project chooses a prefix forge wants | Only `fo` is reserved (Step 1 schema enforces); project manages its own namespace |
| Agent misinterpretation — re-adding ecosystem skill to FORGE_SKILLS | Step 2 adds portability invariant comment on type; SKILL-15 (Step 5) blocks reverse |
| Validator false positives | SKILL-14/15 use deterministic prefix matching (Step 5) — zero false positives by construction |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0539 --reason "..." --invariant "DNA-54"` instead of working around it (RFC-0334).
- If the `skillPacks` schema cannot be expressed as a Zod refinement (e.g. cross-field uniqueness), escalate to a custom validation function in `forge-config.ts` rather than weakening the schema.
