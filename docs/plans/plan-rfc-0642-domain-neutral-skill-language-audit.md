---
rfcId: RFC-0642
planId: PLAN-RFC-0642-01
status: draft
owner: architecture
createdAt: 2026-08-02
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - packages/forge/AGENTS.md
    - forge.yaml
---

# Implementation Plan: RFC-0642

## 1. Objectives

- [ ] O1 — SKILL-18 validation rule implemented in `forge.skill.validate` (maps to acceptance criterion: "SKILL-18 rule implemented in `forge.skill.validate`")
- [ ] O2 — SKILL-18 checks instruction lines for software-specific binding keys (maps to acceptance criterion: "SKILL-18 checks instruction lines for `bindings.commands.typecheck`, `bindings.commands.scopedBuild`, `bindings.commands.test`")
- [ ] O3 — Escape hatch `<!-- skill-lint-disable SKILL-18 -->` works (maps to acceptance criterion: "`<!-- skill-lint-disable SKILL-18 -->` escape hatch works")
- [ ] O4 — All 26 fo-* skills audited and migrated (maps to acceptance criterion: "All 26 fo-* skills audited and migrated to semantic keys where applicable")
- [ ] O5 — Software-specific skills use escape hatch with documentation (maps to acceptance criterion: "Software-specific skills use escape hatch with documentation comment")
- [ ] O6 — `.agents/skills/` synced copies updated (maps to acceptance criterion: "`.agents/skills/` synced copies updated")
- [ ] O7 — Unit tests for SKILL-18 (maps to acceptance criterion: "Unit tests for SKILL-18: pass case, fail case, escape hatch")
- [ ] O8 — `packages/forge/AGENTS.md` updated (maps to acceptance criterion: "`packages/forge/AGENTS.md` updated with SKILL-18 documentation")

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/validators/skill-validate.ts` — SKILL-18 rule added to forge-skill validation path (after SKILL-11, before SKILL-13). New `checkSkill18()` function + `SKILL18_PATTERNS` + `SKILL18_DISABLE_MARKER`. Uses existing `extractInstructionLines()`.
- `packages/forge/src/tests/skill-validate.test.ts` — New test block for SKILL-18 (pass, fail, escape hatch).
- `packages/forge/skills/fo/fo-idea-implement/SKILL.md` — 2 occurrences of `bindings.commands.typecheck` in code blocks → `bindings.commands.validate`.
- `packages/forge/skills/fo/fo-doc-audit/SKILL.md` — 6 occurrences of `bindings.commands.scopedBuild` in code blocks → `bindings.commands.produce`.
- `packages/forge/skills/meta/forge-bootstrap/SKILL.md` — 1 occurrence of `bindings.commands.scopedBuild` in prose → `bindings.commands.produce` (prose migration).
- `.agents/skills/fo/fo-idea-implement/SKILL.md` — Synced copy.
- `.agents/skills/fo/fo-doc-audit/SKILL.md` — Synced copy.
- `.agents/skills/meta/forge-bootstrap/SKILL.md` — Synced copy.

### 2.2 Configuration and data

- `forge.yaml` — Add semantic binding keys (`validate`, `produce`, `verify`) alongside existing software-specific keys (`typecheck`, `scopedBuild`, `test`). Values mirror existing keys: `validate` = `typecheck` value, `produce` = `scopedBuild` value, `verify` = `test` value. Prevents skill degradation after migration. Requires RFC-0639 schema extension to be implemented first (Step 0 prerequisite).

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — Add SKILL-18 documentation to the Skills section (after SKILL-17 description).
- `docs/rfcs/rfc-0642-domain-neutral-skill-language-audit.md` — Read-only reference (accepted RFC).

### 2.4 Validation and pipelines

- `forge.skill.validate` — Changed command (added SKILL-18 rule).
- `pnpm --filter @warpgogol/forge run build:check` — Scoped typecheck for forge package.
- `pnpm --filter @warpgogol/forge run test` — Scoped test run for forge package.

## 3. Step sequence

### Step 0. Prerequisite: verify RFC-0639 is implemented

**Goal:** Ensure RFC-0639 (Semantic Bindings Schema Extensions) is `implemented` before starting RFC-0642 implementation. RFC-0642's binding-key migration depends on RFC-0639's semantic keys (`validate`, `produce`, `verify`) being available in the bindings schema.

**Agent actions:**

- Read `docs/rfcs/rfc-0639-semantic-bindings-schema-extensions.md` frontmatter `status` field.
- If status is not `implemented`, stop with message: "RFC-0642 implementation is blocked on RFC-0639. RFC-0639 status is `<status>`. Implement RFC-0639 first."
- If status is `implemented`, proceed to Step 1.

**Validation:**

- Visual check of RFC-0639 frontmatter `status` field.

**Completion criterion:** RFC-0639 status is `implemented`.

**Human review:** no

---

### Step 1. Implement SKILL-18 validation rule

**Goal:** Add `checkSkill18()` function to `skill-validate.ts` and wire it into the forge-skill validation path.

**Agent actions:**

- Open `packages/forge/src/validators/skill-validate.ts`.
- Add `SKILL18_PATTERNS` constant (array of 3 RegExp): `/bindings\.commands\.typecheck/gi`, `/bindings\.commands\.scopedBuild/gi`, `/bindings\.commands\.test/gi`.
- Add `SKILL18_DISABLE_MARKER` constant: `"<!-- skill-lint-disable SKILL-18 -->"`.
- Add `checkSkill18(skillName: string, body: string): Violation[]` function. Implementation: if `body.includes(SKILL18_DISABLE_MARKER)`, return empty. Otherwise, call `extractInstructionLines(body)` (same as SKILL-11), for each line check each pattern, push violation with message: `Instruction line references software-specific binding key '${match[0]}' — use semantic key instead`.
- Wire `checkSkill18` into the forge-skill validation path: after the SKILL-11 block (line ~185), before the SKILL-13 block (line ~187). Add: `const skill18Violations = checkSkill18(entry.name, body); violations.push(...skill18Violations);`
- Do NOT add SKILL-18 to the pack-skill validation path (after line ~348).

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — typecheck passes.

**Completion criterion:** `checkSkill18` function exists, is called in the forge-skill path, and is not called in the pack-skill path. Typecheck passes.

**Human review:** no

---

### Step 2. Migrate fo-idea-implement skill

**Goal:** Replace `bindings.commands.typecheck` with `bindings.commands.validate` in code blocks of `fo-idea-implement/SKILL.md`.

**Agent actions:**

- Open `packages/forge/skills/fo/fo-idea-implement/SKILL.md`.
- Line 110: Replace `ref(forge.yaml bindings.commands.typecheck)` with `ref(forge.yaml bindings.commands.validate)`.
- Line 324: Replace `ref(forge.yaml bindings.commands.typecheck)` with `ref(forge.yaml bindings.commands.validate)`.
- Copy the modified file to `.agents/skills/fo/fo-idea-implement/SKILL.md`.

**Validation:**

- `pnpm --filter @warpgogol/forge exec forge skill.validate --json` — no SKILL-18 violations for `fo-idea-implement`.

**Completion criterion:** `fo-idea-implement` has zero SKILL-18 violations. Synced copy in `.agents/skills/` matches.

**Human review:** no

---

### Step 3. Migrate fo-doc-audit skill

**Goal:** Replace `bindings.commands.scopedBuild` with `bindings.commands.produce` in code blocks of `fo-doc-audit/SKILL.md`.

**Agent actions:**

- Open `packages/forge/skills/fo/fo-doc-audit/SKILL.md`.
- Lines 128-129: Replace `ref(forge.yaml bindings.commands.scopedBuild)` with `ref(forge.yaml bindings.commands.produce)`.
- Lines 185-186: Replace `ref(forge.yaml bindings.commands.scopedBuild)` with `ref(forge.yaml bindings.commands.produce)`.
- Lines 194-195: Replace `ref(forge.yaml bindings.commands.scopedBuild)` with `ref(forge.yaml bindings.commands.produce)`.
- Copy the modified file to `.agents/skills/fo/fo-doc-audit/SKILL.md`.

**Validation:**

- `forge skill.validate --json` — no SKILL-18 violations for `fo-doc-audit`.

**Completion criterion:** `fo-doc-audit` has zero SKILL-18 violations. Synced copy matches.

**Human review:** no

---

### Step 4. Migrate forge-bootstrap meta skill (prose reference)

**Goal:** Replace `bindings.commands.scopedBuild` with `bindings.commands.produce` in the prose of `forge-bootstrap/SKILL.md`.

**Agent actions:**

- Open `packages/forge/skills/meta/forge-bootstrap/SKILL.md`.
- Line 176: Replace `ref(forge.yaml bindings.commands.scopedBuild)` with `ref(forge.yaml bindings.commands.produce)`.
- Copy the modified file to `.agents/skills/meta/forge-bootstrap/SKILL.md`.

**Validation:**

- `forge skill.validate --json` — no SKILL-18 violations for `forge-bootstrap`.

**Completion criterion:** `forge-bootstrap` has zero SKILL-18 violations. Synced copy matches.

**Human review:** no

---

### Step 5. Add semantic binding keys to forge.yaml

**Goal:** Add `validate`, `produce`, `verify` semantic binding keys to the project's `forge.yaml` so migrated skills don't degrade.

**Agent actions:**

- Open `forge.yaml` at the repository root.
- In `bindings.commands`, add three new keys mirroring existing software-specific keys:
  - `validate: pnpm --filter {workspace} run build:check` (mirrors `typecheck`)
  - `produce: pnpm --filter {workspace} run build` (mirrors `scopedBuild`)
  - `verify: pnpm --filter {workspace} run test` (mirrors `test`)
- Keep existing `typecheck`, `scopedBuild`, `test` keys — they remain valid for software-domain usage.

**Validation:**

- `forge doctor --json` — no binding validation errors. Semantic keys resolve correctly.

**Completion criterion:** `forge.yaml` has `validate`, `produce`, `verify` keys with correct values. `forge doctor` reports no binding errors.

**Human review:** no

---

### Step 6. Audit remaining fo-* skills for SKILL-18 compliance

**Goal:** Verify all 26 fo-* skills pass SKILL-18. Add escape hatch with documentation comment to any skills that are inherently software-specific.

**Agent actions:**

- Run `forge skill.validate --json` and check for any SKILL-18 violations.
- If violations are found in skills that are inherently software-specific, add `<!-- skill-lint-disable SKILL-18 -->` to the skill file with a documentation comment explaining why.
- If violations are found in skills that should be domain-neutral, migrate the binding key reference to the semantic equivalent.
- Copy any modified files to `.agents/skills/`.
- Re-run `forge skill.validate --json` until zero SKILL-18 violations.

**Validation:**

- `forge skill.validate --json` — zero SKILL-18 violations across all skills.

**Completion criterion:** `forge skill.validate` reports zero SKILL-18 violations.

**Human review:** no

---

### Step 7. Write unit tests for SKILL-18

**Goal:** Add test coverage for SKILL-18: pass case (no violations after migration), fail case (violation detected), escape hatch (suppressed).

**Agent actions:**

- Open `packages/forge/src/tests/skill-validate.test.ts`.
- Add new `describe("RFC-0642: SKILL-18 domain-specific binding key prohibition")` block.
- Add test: "SKILL-18: real workspace has no SKILL-18 violations after migration" — run `runSkillValidate({}, { workspaceRoot: process.cwd() })`, filter for SKILL-18 violations, expect empty.
- Add test: "SKILL-18: pattern matches software-specific binding keys" — verify regex matches `bindings.commands.typecheck`, `bindings.commands.scopedBuild`, `bindings.commands.test` but not `bindings.commands.validate`, `bindings.commands.produce`, `bindings.commands.verify`.
- Add test: "SKILL-18: escape hatch suppresses violation" — create a temp skill file with `<!-- skill-lint-disable SKILL-18 -->` and a `bindings.commands.typecheck` reference in a code block, verify no SKILL-18 violation.

**Validation:**

- `pnpm --filter @warpgogol/forge run test` — all tests pass.

**Completion criterion:** All SKILL-18 tests pass.

**Human review:** no

---

### Step 8. Update packages/forge/AGENTS.md

**Goal:** Document SKILL-18 in the forge AGENTS.md.

**Agent actions:**

- Open `packages/forge/AGENTS.md`.
- In the Skills section, after the SKILL-17 description (line ~105), add SKILL-18 documentation:
  - `forge.skill.validate` enforces SKILL-18: canonical forge skill bodies must not reference software-specific binding keys (`bindings.commands.typecheck`, `bindings.commands.scopedBuild`, `bindings.commands.test`) in instruction lines (code blocks and `run:` directives). Skills must reference semantic keys (`bindings.commands.validate`, `bindings.commands.produce`, `bindings.commands.verify`) instead. Supports `<!-- skill-lint-disable SKILL-18 -->` escape hatch. Applies to forge skills only, not pack skills.

**Validation:**

- Visual check that SKILL-18 documentation is present in `packages/forge/AGENTS.md`.

**Completion criterion:** SKILL-18 is documented in `packages/forge/AGENTS.md`.

**Human review:** no

---

### Step 9. Prose terminology migration (blocked on RFC-0639)

**Goal:** Migrate "app", "service", "package" in narrative prose to `ref(bindings.terminology.artifact)` or domain-neutral phrasing. This step is blocked on RFC-0639's `resolveTerminology()` implementation.

**Agent actions:**

- Verify RFC-0639's `resolveTerminology()` is exported from `@warpgogol/forge/config`.
- Scan all 26 fo-* skill files for "app", "service", "package" in narrative prose (outside code blocks).
- Replace with `ref(bindings.terminology.artifact)` where the context refers to the project's deployable unit.
- Replace with domain-neutral phrasing ("workspace", "project component") where the context is generic.
- Copy modified files to `.agents/skills/`.
- Run `forge skill.validate --json` to verify no new violations.

**Validation:**

- `forge skill.validate --json` — zero violations.
- Manual review of prose changes for semantic accuracy.

**Completion criterion:** All prose terminology migrated. `forge skill.validate` passes.

**Human review:** yes — prose changes require human review to ensure semantic accuracy across domains. Reviewer: human:andrii-syrokomskyi.

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/forge/AGENTS.md` is updated with SKILL-18 documentation.
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `forge.skill.validate` behavior changed — check if manifest needs regeneration).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes (`git diff <merge-base-of-session>...HEAD`). Wait for the review report in `docs/reviews/code/`.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix` via the `skill` tool. Re-run `fo-review` to confirm all findings are resolved. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: <file:line>)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0642 --implementation-commit <sha>` to atomically transition `accepted → implemented`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec site-kernel run rfc.validate --id RFC-0642`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec site-kernel run forge.skill.validate --json` — zero violations.
- Review report exists in `docs/reviews/code/` for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed (findings fixed if any); all acceptance criteria are checked off with inline `(evidence: ...)` annotations; RFC is stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp` (RFC-0476). Code review is automated via `fo-review`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0642`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec site-kernel run forge.skill.validate --json` — zero violations (including SKILL-18)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0642.generated.json` — verification evidence (RFC-0330, if acceptance probes declared — this RFC has no acceptance probes, so this is not required).
- Commit messages referencing `RFC-0642` in the subject line (RFC-0265 commit hygiene).

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Skill behavior change: `validate` might be null in software projects | Step 0 verifies RFC-0639 is implemented (which adds semantic keys). Degradation contract applies: optional → step skipped with `Degraded:` line. |
| False positives: SKILL-18 flags bare words "typecheck" or "test" | Step 1 uses regex `bindings\.commands\.typecheck` (specific pattern), not bare words. Step 2 tests verify pattern specificity. |
| RFC-0639 dependency: semantic keys not available | Step 0 blocks implementation until RFC-0639 is `implemented`. |
| Prose migration semantic accuracy | Step 8 has human review for prose changes. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0642 --reason "..." --invariant "DNA-54"` instead of working around it.
- If SKILL-18 produces false positives that cannot be resolved by migration or escape hatch, escalate to the operator — the pattern list may need adjustment via an amending RFC.
