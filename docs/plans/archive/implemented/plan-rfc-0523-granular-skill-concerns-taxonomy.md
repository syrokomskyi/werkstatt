---
rfcId: RFC-0523
planId: PLAN-RFC-0523-01
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

# Implementation Plan: RFC-0523

## 1. Objectives

- [ ] Objective 1 — Update `ForgeSkillEntry.concerns` type and Zod schema to four-level enum (maps to acceptance criterion: `ForgeSkillEntry.concerns` type updated + `skillFrontmatterSchema` updated)
- [ ] Objective 2 — Add SKILL-12 validation rule and update SKILL-10 in `forge.skill.validate` (maps to acceptance criterion: SKILL-12 enforced + SKILL-10 updated)
- [ ] Objective 3 — Reclassify all 30 skills in `registry.ts` per the Rollout table (maps to acceptance criterion: all skills reclassified)
- [ ] Objective 4 — Sync all 30 SKILL.md frontmatter files to new `concerns` values (maps to acceptance criterion: SKILL.md files synced)
- [ ] Objective 5 — Update documentation surfaces (maps to acceptance criterion: `packages/forge/AGENTS.md` + `docs/verification-plan.xml`)
- [ ] Objective 6 — Verify zero violations via `forge.skill.validate --all` (maps to acceptance criterion: zero violations after reclassification)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/registry.ts` — `ForgeSkillEntry.concerns` type union (line 23) + all 30 skill entries reclassified
- `packages/forge/src/skill-schema.ts` — `skillFrontmatterSchema` Zod `concerns` enum (line 21)
- `packages/forge/src/validators/skill-validate.ts` — SKILL-12 rule added; SKILL-10 condition updated (line 142)
- `packages/forge/src/tests/skill-schema.test.ts` — test cases updated for four-level enum

### 2.2 Configuration and data

- `packages/forge/skills/**/SKILL.md` — 30 frontmatter `concerns` fields updated
- `.agents/skills/**/SKILL.md` — 30 synced copies updated (via `forge.init` or direct edit)

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — Skills section: document four-level taxonomy, update skill count (28 → 30)
- `docs/verification-plan.xml` — document SKILL-12 rule in the verification surface

### 2.4 Validation and pipelines

- `forge.skill.validate` — existing command, validation logic changes (SKILL-12 added, SKILL-10 updated)
- `build.check` — already runs `forge.skill.validate`, no pipeline change needed

## 3. Step sequence

### Step 1. Update TypeScript contracts (registry.ts + skill-schema.ts)

**Goal:** Change the `concerns` type from binary to four-level enum in both the interface and the Zod schema.

**Agent actions:**

- In `packages/forge/src/registry.ts` line 23: change `concerns: "document-only" | "implementation"` to `concerns: "read-only" | "document-only" | "content-mutation" | "code-mutation"`
- In `packages/forge/src/skill-schema.ts` line 21: change `concerns: z.enum(["document-only", "implementation"])` to `concerns: z.enum(["read-only", "document-only", "content-mutation", "code-mutation"])`

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` — TypeScript compiles without errors

**Completion criterion:** Both files compile with the new four-level union type.

**Human review:** no

---

### Step 2. Reclassify all 30 skills in registry.ts

**Goal:** Update every `FORGE_SKILLS` entry to the new `concerns` value per the RFC Rollout table.

**Agent actions:**

- Update all 30 entries in `packages/forge/src/registry.ts` per the reclassification table in RFC-0523 lines 183-212. Key changes:
  - `fo-idea-audit`: `document-only` → `read-only`
  - `fo-idea-implement`: `document-only` → `code-mutation`
  - `fo-idea-status`: `document-only` → `read-only`
  - `fo-idea-i-just-want-to-see-the-result`: `document-only` → `code-mutation`
  - `fo-review`: `document-only` → `read-only`
  - `fo-fix`: `document-only` → `code-mutation`
  - `fo-add-tests`: `implementation` → `code-mutation`
  - `fo-harvest`: `implementation` → `code-mutation`
  - `fo-site-scan`: `implementation` → `content-mutation`
  - `grilling`: `document-only` → `read-only`
  - `writing-great-skills`: `document-only` → `read-only`
  - `port-to-forge`: `document-only` → `code-mutation`
  - `forge-bootstrap`: `implementation` → `code-mutation`
  - All other skills remain `document-only`

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` — TypeScript compiles (enum values match the updated type)

**Completion criterion:** All 30 registry entries have `concerns` values from the four-level enum, matching the RFC Rollout table.

**Human review:** no

---

### Step 3. Update SKILL.md frontmatter files (packages/forge/skills/)

**Goal:** Sync all 30 SKILL.md frontmatter `concerns` fields to match the new registry values.

**Agent actions:**

- For each of the 30 SKILL.md files in `packages/forge/skills/**/SKILL.md`, update the `concerns` frontmatter field to the new value from the reclassification table.
- Ensure the value matches the registry entry for that skill (cross-reference).

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --all` — zero SKILL-01 violations (frontmatter parses against updated Zod schema)

**Completion criterion:** All 30 SKILL.md files have `concerns` values matching their registry entries.

**Human review:** no

---

### Step 4. Sync .agents/skills/ copies

**Goal:** Update the synced copies in `.agents/skills/` to match `packages/forge/skills/`.

**Agent actions:**

- For each of the 30 SKILL.md files in `.agents/skills/**/SKILL.md`, update the `concerns` frontmatter field to match the `packages/forge/skills/` version.
- Alternatively, run `pnpm exec werkstatt run forge.init` to sync all skills at once (if the command supports sync-only mode without overwriting other forge artifacts).

**Validation:**

- Diff check: `diff -r packages/forge/skills/ .agents/skills/ --include=SKILL.md` — no differences in `concerns` fields

**Completion criterion:** `.agents/skills/` SKILL.md files are synced with `packages/forge/skills/` versions.

**Human review:** no

---

### Step 5. Add SKILL-12 and update SKILL-10 in skill-validate.ts

**Goal:** Implement the new validation rule and update the existing one for the expanded taxonomy.

**Agent actions:**

- **SKILL-12:** The Zod schema already rejects unknown `concerns` values, but emits SKILL-01 violations. To produce the `ruleId: "SKILL-12"` diagnostic specified in the RFC output format, add an explicit post-parse check: if `parsed.success` is false and one of the issues targets the `concerns` path, emit a SKILL-12 violation with the RFC-0523 message format instead of (or in addition to) the generic SKILL-01. This gives precise diagnostics without duplicating the enum enforcement logic.
- **SKILL-10 update:** On line 142, change `if (parsed.data.concerns === "document-only")` to `if (parsed.data.concerns === "read-only" || parsed.data.concerns === "document-only")`. This ensures `read-only` skills are also blocked from containing code execution instructions.
- Update the comment on line 112 from `SKILL-06: concerns is document-only|implementation` to `SKILL-06: concerns is read-only|document-only|content-mutation|code-mutation`.

**Validation:**

- `pnpm --filter @wgogol/forge run build:check` — compiles without errors
- `pnpm --filter @wgogol/forge run test` — existing tests pass (some may need updating, see Step 6)

**Completion criterion:** `skill-validate.ts` enforces SKILL-12 and the updated SKILL-10 condition.

**Human review:** no

---

### Step 6. Update tests in skill-schema.test.ts

**Goal:** Update existing test cases to reflect the four-level enum and add coverage for new values.

**Agent actions:**

- Update the `valid` fixture (line 10): `concerns: "document-only"` remains valid.
- Add test cases: `concerns: "read-only"`, `concerns: "content-mutation"`, `concerns: "code-mutation"` all parse successfully.
- Update the "rejects invalid concerns" test (line 57-59): `concerns: "hybrid"` still rejected, and `concerns: "implementation"` is now also rejected (old value no longer valid).
- Add test: `concerns: "implementation"` is rejected (old binary value removed).

**Validation:**

- `pnpm --filter @wgogol/forge run test` — all tests pass

**Completion criterion:** Test suite covers all four new values and rejects old `implementation` value.

**Human review:** no

---

### Step 7. Update packages/forge/AGENTS.md

**Goal:** Document the four-level taxonomy in the Skills section and fix the skill count.

**Agent actions:**

- In `packages/forge/AGENTS.md` line 10: update "21 fo skills + 4 shared + 3 meta = 28 skills" to "23 fo skills + 4 shared + 3 meta = 30 skills".
- In the Skills section (line 29): add a sentence documenting the four-level `concerns` taxonomy: `concerns: read-only | document-only | content-mutation | code-mutation` with a brief description of each value.
- Add a reference to RFC-0523 and SKILL-12.

**Validation:**

- Visual review — the AGENTS.md text is consistent with the RFC

**Completion criterion:** `packages/forge/AGENTS.md` documents the four-level taxonomy and references SKILL-12.

**Human review:** no

---

### Step 8. Update docs/verification-plan.xml

**Goal:** Document the SKILL-12 rule in the verification surface.

**Agent actions:**

- Add a SKILL-12 entry to the forge skill validation section of `docs/verification-plan.xml`, documenting: rule ID, description ("concerns must be one of: read-only, document-only, content-mutation, code-mutation"), severity (error), and the enforcing command (`forge.skill.validate`).
- Update the SKILL-10 entry to reflect the expanded check (`read-only` and `document-only`).

**Validation:**

- `pnpm exec werkstatt run rfc.validate RFC-0523 --json` — passes

**Completion criterion:** `docs/verification-plan.xml` documents SKILL-12 and the updated SKILL-10.

**Human review:** no

---

### Step 9. Run forge.skill.validate and verify zero violations

**Goal:** Confirm the full validation passes after all changes.

**Agent actions:**

- Run `pnpm exec werkstatt run forge.skill.validate --all` — expect zero violations
- If violations appear, fix the offending SKILL.md or registry entry and re-run

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --all` — status: pass, zero violations

**Completion criterion:** `forge.skill.validate --all` passes with zero violations.

**Human review:** no

---

### Final Step. Documentation sync and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `forge.skill.validate` logic changed — check if manifest needs refresh).
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>, <test-or-command>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0523 --implementation-commit <sha> --dry-run` first, then without `--dry-run`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0523`
- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @wgogol/forge run test`
- `pnpm exec werkstatt run forge.skill.validate --all`

**Completion criterion:** All documentation artifacts in scope are updated; all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476).

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0523`
- `pnpm --filter @wgogol/forge run build:check`
- `pnpm --filter @wgogol/forge run test`
- `pnpm exec werkstatt run forge.skill.validate --all`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0523` in the subject line (RFC-0265 commit hygiene)
- `forge.skill.validate --all` output showing zero violations

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Misclassification of edge-case skills | Step 2 uses the explicit reclassification table from the RFC; Step 9 catches any mismatches via `forge.skill.validate` |
| Agent misinterpretation of `concerns` as gating | Step 7 updates AGENTS.md to clarify `concerns` is informational, not a gating mechanism |
| Maintenance burden for four values | Step 7 documents the default (`document-only`) in AGENTS.md; `skill-create` already prompts for classification |
| SKILL-10 regression for `read-only` skills | Step 5 explicitly updates SKILL-10 to check both `read-only` and `document-only` |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0523 --reason "..." --invariant "DNA-54"` instead of working around it.
- If `forge.skill.validate` reveals orphan SKILL.md files not in the registry, add them to the registry or remove the files — do not suppress the SKILL-01 violation.
