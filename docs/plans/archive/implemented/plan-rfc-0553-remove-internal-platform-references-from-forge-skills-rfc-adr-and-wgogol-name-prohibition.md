---
rfcId: RFC-0553
planId: PLAN-RFC-0553-01
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

# Implementation Plan: RFC-0553

## 1. Objectives

- [ ] Objective 1 — Add SKILL-17 validation rule to `forge.skill.validate` prohibiting `RFC-\d{4}` and `ADR-\d{4}` patterns in skill files — maps to acceptance criterion [SKILL-17 added]
- [ ] Objective 2 — Add SKILL-17 platform name check prohibiting "WGogol", "WebGogol", "WarpGogol" (case-insensitive) — maps to acceptance criterion [SKILL-17 added]
- [ ] Objective 3 — Clean all `packages/forge/skills/**/*.md` files of specific platform RFC/ADR id references and platform name references — maps to acceptance criterion [files cleaned]
- [ ] Objective 4 — Document SKILL-17 in `packages/forge/AGENTS.md` alongside SKILL-11..16 — maps to acceptance criterion [AGENTS.md documents SKILL-17]
- [ ] Objective 5 — Add unit tests for SKILL-17 covering both RFC/ADR id and platform name patterns — maps to acceptance criterion [forge.skill.validate passes]

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/validators/skill-validate.ts` — add `checkSkill17()` function, `SKILL17_PATTERNS`, `SKILL17_DISABLE_MARKER`, call in both forge skill loop and pack skill loop
- `packages/forge/src/tests/skill-validate.test.ts` — add SKILL-17 test suite

### 2.2 Configuration and data

- No configuration files affected. `forge.yaml` bindings are not changed.

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — add SKILL-17 documentation in the Skills section alongside SKILL-11..16
- `packages/forge/src/validators/skill-validate.ts` — update MODULE_CONTRACT CHANGE_SUMMARY with RFC-0553 entry

### 2.4 Validation and pipelines

- `forge.skill.validate` — extended with SKILL-17 (already part of `forge.doctor` and build pipeline)
- No new commands or pipeline entries

## 3. Step sequence

### Step 1. Add SKILL-17 validation logic to skill-validate.ts

**Goal:** Implement the `checkSkill17()` function and wire it into both forge skill and pack skill validation loops.

**Agent actions:**

- Add `SKILL17_PATTERNS` array with two regex patterns: `\bRFC-\d{4}\b` (case-sensitive) and `\bADR-\d{4}\b` (case-sensitive)
- Add `SKILL17_PLATFORM_PATTERNS` array with case-insensitive patterns for "WGogol", "WebGogol", "WarpGogol"
- Add `SKILL17_DISABLE_MARKER` constant: `<!-- skill-lint-disable SKILL-17 -->`
- Implement `checkSkill17(skillName, body, pack?)` function that:
  - Checks for file-level disable marker (skip if present)
  - Scans the **entire body** (not just instruction lines — SKILL-17 applies to all text including frontmatter descriptions and triggers)
  - For each RFC/ADR id pattern match, emit a violation with the matched text
  - For each platform name pattern match, emit a violation with the matched text
  - Supports per-line disable marker
- Call `checkSkill17()` in the forge skill loop (after SKILL-16 check, before the loop ends)
- Call `checkSkill17()` in the pack skill loop (after SKILL-15 check, before the loop ends)
- Update MODULE_CONTRACT CHANGE_SUMMARY with: `<item>RFC-0553: added SKILL-17 — skill files must not contain specific platform RFC/ADR ids or platform names.</item>`

**Validation:**

- `pnpm --filter @webgogol/forge run build:check` — typecheck passes
- Manual review: SKILL-17 patterns do not match generic "RFC"/"ADR" terms or file paths like `adr-0000-template.md`

**Completion criterion:** `checkSkill17()` function exists, is called in both validation loops, and typecheck passes.

**Human review:** no

---

### Step 2. Add unit tests for SKILL-17

**Goal:** Verify SKILL-17 detects platform RFC/ADR ids and platform names, and allows generic terms.

**Agent actions:**

- Add `describe("RFC-0553: SKILL-17 platform reference prohibition")` block to `skill-validate.test.ts`
- Add test: "SKILL-17: real workspace has no platform RFC/ADR id violations after cleanup" — filter for `rule === "SKILL-17"` and `message` containing `RFC-` or `ADR-`, expect `[]`
- Add test: "SKILL-17: real workspace has no platform name violations after cleanup" — filter for `rule === "SKILL-17"` and `message` containing `WGogol`/`WebGogol`/`WarpGogol`, expect `[]`
- Add test: "SKILL-17 does not flag generic RFC/ADR terms" — verify that the pattern `\bRFC-\d{4}\b` does NOT match bare "RFC" or "ADR" without a hyphen+digits suffix

**Validation:**

- `pnpm --filter @webgogol/forge run test` — all tests pass

**Completion criterion:** All SKILL-17 tests pass and existing tests still pass.

**Human review:** no

---

### Step 3. Clean forge skill files of platform RFC/ADR id references

**Goal:** Remove all `RFC-NNNN` and `ADR-NNNN` references from `packages/forge/skills/**/*.md` files.

**Agent actions:**

- Scan all `packages/forge/skills/**/*.md` files for `\bRFC-\d{4}\b` and `\bADR-\d{4}\b` patterns
- For each match, replace with a generic description based on context:
  - "cumulative knowledge pattern (RFC-0524)" → "cumulative knowledge pattern"
  - "Compass terminology (RFC-0353)" → "Compass terminology"
  - "ADR lifecycle (RFC-0367, full RFC parity)" → "ADR lifecycle (full RFC parity)"
  - "RFC-0548" references → remove the id, keep the concept description
  - "RFC-0393" references → remove the id, keep the concept description
  - "RFC-0539" references → remove the id, keep the concept description
  - "RFC-0540" references → remove the id, keep the concept description
  - "RFC-0546" references → remove the id, keep the concept description
  - "RFC-0549" references → remove the id, keep the concept description
  - "RFC-0367" references → remove the id, keep the concept description
  - "RFC-0353" references → remove the id, keep the concept description
  - "RFC-0255" references → remove the id, keep the concept description
  - "RFC-0524" references → remove the id, keep the concept description
  - Example ids in instruction text like "RFC-0362", "RFC-0355" → replace with "RFC-XXXX" (generic placeholder)
  - Example ids like "ADR-0003", "ADR-0005" → replace with "ADR-XXXX" (generic placeholder)
- Keep generic "RFC"/"ADR" terms (e.g., "RFC Audit", "ADR Create", "rfc.validate", "adr.validate")
- Keep file path references like `adr-0000-template.md`, `rfc-0000-template.md` (lowercase, not id references)
- Keep binding key names like `validateRfc`, `validateAdr` (camelCase, not id references)
- Run `forge.skill.validate` after each file cleanup to verify no new violations

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate --json` — zero SKILL-17 violations
- Manual review: skill instructions remain clear and meaningful after id removal

**Completion criterion:** Zero `RFC-\d{4}` or `ADR-\d{4}` matches in `packages/forge/skills/**/*.md` files (except generic placeholders `RFC-XXXX`/`ADR-XXXX`).

**Human review:** no

---

### Step 4. Clean forge skill files of WGogol/WebGogol/WarpGogol platform names

**Goal:** Remove all "WGogol", "WebGogol", "WarpGogol" references from `packages/forge/skills/**/*.md` files.

**Agent actions:**

- Scan all `packages/forge/skills/**/*.md` files for `WGogol|WebGogol|WarpGogol` (case-insensitive)
- For each match, replace with "Forge" or "project" depending on context:
  - "WGogol standards" → "Forge standards"
  - "WGogol ecosystem" → "project ecosystem"
  - "WGogol platform" → "Forge platform" or "project"
  - "against WGogol standards" → "against Forge standards"
  - In `fo-review` description: "Cross-session fitness check of a code diff against WGogol standards" → "against Forge standards"
  - In `fo-review` triggers: "check code against WGogol standards" → "check code against Forge standards"
- Run `forge.skill.validate` after each file cleanup

**Validation:**

- `pnpm exec site-kernel run forge.skill.validate --json` — zero SKILL-17 violations for platform names
- `grep -ri "WGogol\|WebGogol\|WarpGogol" packages/forge/skills/` — zero matches

**Completion criterion:** Zero "WGogol", "WebGogol", or "WarpGogol" matches in `packages/forge/skills/**/*.md` files.

**Human review:** no

---

### Step 5. Document SKILL-17 in packages/forge/AGENTS.md

**Goal:** Add SKILL-17 documentation alongside existing SKILL-11..16 documentation.

**Agent actions:**

- In `packages/forge/AGENTS.md`, find the Skills section that documents SKILL-11 through SKILL-16
- Add a new bullet point for SKILL-17:
  - `forge.skill.validate` enforces SKILL-17: skill files must not contain specific platform RFC/ADR ids (`RFC-\d{4}`, `ADR-\d{4}`) or platform names ("WGogol", "WebGogol", "WarpGogol"). Generic "RFC"/"ADR" terms, generic placeholder ids (`RFC-XXXX`), file paths (`adr-0000-template.md`), and binding key names (`validateRfc`) are allowed. Supports `<!-- skill-lint-disable SKILL-17 -->` escape hatch.

**Validation:**

- `git diff packages/forge/AGENTS.md` — shows the new SKILL-17 bullet
- `pnpm --filter @webgogol/forge run build:check` — typecheck passes (AGENTS.md is not typechecked, but verifies no accidental code changes)

**Completion criterion:** `packages/forge/AGENTS.md` documents SKILL-17 alongside SKILL-11..16.

**Human review:** no

---

### Step 6. Run forge.skill.validate and verify all acceptance criteria

**Goal:** Verify the implementation passes all validation and acceptance criteria are met.

**Agent actions:**

- Run `pnpm exec site-kernel run forge.skill.validate --json` — expect status: "pass", zero violations
- Run `pnpm --filter @webgogol/forge run build:check` — expect pass
- Run `pnpm --filter @webgogol/forge run test` — expect all tests pass
- Run `pnpm exec site-kernel run rfc.validate` — expect zero RFC-0553 violations
- Verify each acceptance criterion in the RFC:
  - [x] SKILL-17 is added to forge.skill.validate prohibiting specific platform RFC/ADR ids and platform names
  - [x] SKILL-17 allows generic "RFC"/"ADR" terms and generic placeholder ids
  - [x] SKILL-17 excludes file paths and binding key names
  - [x] All existing skill files are cleaned
  - [x] forge.skill.validate passes on all cleaned skill files
  - [x] packages/forge/AGENTS.md documents SKILL-17
  - [x] rfc.validate passes on RFC-0553

**Validation:**

- `forge.skill.validate` — status: "pass"
- `build:check` — pass
- `test` — all pass
- `rfc.validate` — zero violations

**Completion criterion:** All validation commands pass and all acceptance criteria are checked off with inline `(evidence: ...)` annotations.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` is updated with SKILL-17 documentation (step 5 already does this)
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands in this RFC, so likely not needed)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0553 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session
- `pnpm exec site-kernel run rfc.validate` — zero violations
- Every file in `scope.docs` is either updated or documented as not-applicable
- Review report exists in `docs/reviews/code/` for this session

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476), which validates all preconditions atomically. Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate`
- `pnpm --filter @webgogol/forge run build:check`
- `pnpm --filter @webgogol/forge run test`
- `pnpm exec site-kernel run forge.skill.validate --json`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0553` in the subject line (RFC-0265 commit hygiene)
- `docs/reviews/code/` review report for this session

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --------------- | ---------------------- |
| False positive on generic example ids | Step 3 replaces all specific platform RFC references with generic descriptions or `RFC-XXXX` placeholders; after cleanup, remaining `RFC-\d{4}` patterns are genuine violations |
| False positive on file paths | Step 1 uses `\bADR-\d{4}\b` (case-sensitive, word-boundary) which does not match lowercase `adr-0000-template.md` |
| Binding key names contain "Rfc" | Step 1 uses `RFC-\d{4}` (hyphen + 4 digits) which does not match camelCase `validateRfc` |
| Cleanup introduces errors | Steps 3-4 run `forge.skill.validate` after each file cleanup; step 6 verifies all tests pass |
| Skill knowledge files contain platform RFC references | Steps 3-4 scan all `packages/forge/skills/**/*.md` files including `_shared/` and knowledge files |
| Maintenance burden | Step 1 adds SKILL-17 to `forge.skill.validate` which runs in CI, catching future violations |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0553 --reason "..." --invariant "DNA-54"` instead of working around it.
- If the cleanup of skill files reveals that removing RFC/ADR id references makes instructions ambiguous or unclear, escalate to the operator for guidance on rewording rather than leaving unclear instructions.
