---
rfcId: RFC-0661
planId: PLAN-RFC-0661-01
status: draft
owner: architecture
createdAt: 2026-08-03
updatedAt:
scope:
  apps: []
  packages:
    - forge
  services: []
  docs:
    - packages/forge/AGENTS.md
    - packages/forge/skills/shared/writing-great-skills/SKILL.md
---

# Implementation Plan: RFC-0661

## 1. Objectives

- [ ] O1 — Extend `forgeBindingsSchema` with optional `knowledge.budgets` field — maps to acceptance criterion "forge.doctor validates `bindings.knowledge.budgets` override shape"
- [ ] O2 — Create `packages/forge/src/knowledge/budgets.ts` with `computeLayerBudgets` and `resolveKnowledgeBudgets` — maps to acceptance criterion "packages/forge/src/knowledge/budgets.ts exports computeLayerBudgets and resolveKnowledgeBudgets"
- [ ] O3 — Add SKILL-21 warnings to `forge.skill.validate` (hot 4096, warm 8192, warnings only) — maps to acceptance criterion "forge.skill.validate enforces SKILL-21 as warnings"
- [ ] O4 — Add `warnings` field to `SkillValidateResult` and optional `file`/`fixHint` to `Violation` — maps to acceptance criterion "warnings never change the exit code"
- [ ] O5 — Extend `forge.doctor` with knowledge-budget summary table and override shape validation — maps to acceptance criterion "forge.doctor validates bindings.knowledge.budgets override shape and prints the knowledge-budget summary table"
- [ ] O6 — Document hot/warm/cold reading discipline in `writing-great-skills` — maps to acceptance criterion "writing-great-skills documents the hot/warm/cold reading discipline"
- [ ] O7 — Add one-line read-discipline statements to knowledge-adopting forge skills — maps to acceptance criterion "Knowledge-adopting forge skills state the read discipline in one line"
- [ ] O8 — Unit tests for budget resolution, active-only counting, warning content, skip-on-parse-failure — maps to acceptance criterion "Unit tests cover: budget override resolution, active-only counting, warning content, and skip-on-parse-failure"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/config/forge-config.ts` — extend `forgeBindingsSchema` with optional `knowledge: { budgets: { hot: number, warm: number } }` field; update `ForgeBindings` interface
- `packages/forge/src/knowledge/budgets.ts` — **new file**: `computeLayerBudgets`, `resolveKnowledgeBudgets`, `KnowledgeBudgets`, `LayerBudgetReport` types
- `packages/forge/src/validators/skill-validate.ts` — add `warnings: Warning[]` to `SkillValidateResult`; add optional `file`, `fixHint` to `Violation`; add SKILL-21 rule; update module contract purpose line to `SKILL-01..SKILL-21`
- `packages/forge/src/onboarding/doctor.ts` — add knowledge-budget summary check; add `bindings.knowledge.budgets` override shape validation
- `packages/forge/src/tests/budgets.test.ts` — **new file**: unit tests for `computeLayerBudgets` and `resolveKnowledgeBudgets`
- `packages/forge/src/tests/skill-validate.test.ts` — add SKILL-21 test cases

### 2.2 Configuration and data

- `forge.yaml` (this monorepo) — no change needed (defaults apply; no override required for introduction)
- `forge.yaml` (consumer projects) — optional `bindings.knowledge.budgets` override (documented, not scaffolded)

### 2.3 Documentation and specs

- `packages/forge/skills/shared/writing-great-skills/SKILL.md` — add hot/warm/cold reading discipline subsection under "Cumulative knowledge pattern"
- `packages/forge/skills/shared/grilling/SKILL.md` — update read instruction to one-line discipline statement
- `packages/forge/skills/fo/fo-memory-sync/SKILL.md` — update "Read L1 and L2 at the start of each run" to discipline statement
- `packages/forge/skills/fo/fo-session-save/SKILL.md` — add discipline statement if knowledge files are read
- `packages/forge/AGENTS.md` — update `SKILL-01..SKILL-18` references to `SKILL-01..SKILL-21`; note SKILL-21 as warnings-only
- `.agents/skills/` — sync updated skill files (grilling, fo-memory-sync, fo-session-save, writing-great-skills)

### 2.4 Validation and pipelines

- No pipeline integration — SKILL-21 runs inside `forge.skill.validate` only (operator-invoked)
- No CI workflow changes
- No `docs/*.xml` Compass file changes (no repository-wide semantics changed)

## 3. Step sequence

### Step 1. Extend `forgeBindingsSchema` with `knowledge.budgets`

**Goal:** Add the optional `knowledge.budgets` field to the forge bindings schema so `resolveKnowledgeBudgets` can read it.

**Agent actions:**

- Add `knowledge: z.object({ budgets: z.object({ hot: z.number().positive(), warm: z.number().positive() }).optional() }).optional()` to `forgeBindingsSchema` in `packages/forge/src/config/forge-config.ts`
- Update `ForgeBindings` interface to include the new `knowledge` field
- Update `forgeBindingsSchema` version comment if needed (still `forge/bindings@1` — additive, no breaking change)

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Existing `bindings-schema.test.ts` still passes

**Completion criterion:** `forgeBindingsSchema` accepts `knowledge.budgets` with `hot` and `warm` positive integers; `ForgeBindings` type includes the field; build passes.

**Human review:** no

---

### Step 2. Create `packages/forge/src/knowledge/budgets.ts`

**Goal:** Implement the pure budget computation and resolution functions.

**Agent actions:**

- Create `packages/forge/src/knowledge/budgets.ts` (the `knowledge/` directory already exists from RFC-0660)
- Implement `KnowledgeBudgets` interface (`hot: number`, `warm: number`)
- Implement `LayerBudgetReport` interface (`skill`, `file`, `layer`, `activeChars`, `budget`, `exceededBy`)
- Implement `computeLayerBudgets(files: ParsedKnowledgeFile[], budgets: KnowledgeBudgets): LayerBudgetReport[]` — pure function; counts only `status: active` entries; uses `ParsedKnowledgeFile.layer` field (from RFC-0660 parser) to determine hot vs warm; skips files with undeterminable layer
- Implement `resolveKnowledgeBudgets(workspaceRoot: string): KnowledgeBudgets` — reads `forge.yaml` `bindings.knowledge.budgets`; falls back to defaults (hot: 4096, warm: 8192)
- Export from `packages/forge/src/knowledge/index.ts` (barrel)

**Note:** RFC-0660 is already implemented — `packages/forge/src/knowledge/` exists with `parseKnowledgeFile`, `ParsedKnowledgeFile`, `KnowledgeLayer`, and related types. This step imports from `../knowledge/index.ts` and extends the module with `budgets.ts`.

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Unit tests in Step 6 pass

**Completion criterion:** `budgets.ts` exports `computeLayerBudgets`, `resolveKnowledgeBudgets`, `KnowledgeBudgets`, `LayerBudgetReport`; build passes; pure functions have no filesystem side effects (except `resolveKnowledgeBudgets` which reads `forge.yaml`).

**Human review:** no

---

### Step 3. Refactor warning handling: add `warnings` array and fix status check

**Goal:** Introduce a separate `warnings` array in `SkillValidateResult`, move existing SKILL-19 legacy-section warnings from `violations` to `warnings`, and fix the status check so warnings never cause `status: "fail"`.

**Context:** RFC-0660 (already implemented) added SKILL-19 legacy-section warnings inside `violations` with `severity: "warning"`, but the status check (`violations.length === 0 ? "pass" : "fail"`) doesn't filter by severity — meaning any warning would incorrectly cause `status: "fail"`. This is a latent bug in RFC-0660's implementation (currently masked because all knowledge files are `isKnowledgeAdjacent` and exempt from SKILL-19). RFC-0661 fixes this as part of its output-shape coordination.

**Agent actions:**

- Add `warnings: Warning[]` to `SkillValidateResult` interface in `skill-validate.ts`
- Define `Warning` interface: `{ skill: string; rule: string; file?: string; layer?: string; severity: "warning"; message: string; fixHint?: string; pack?: string }`
- The `Violation` interface already has `file`, `line`, `severity` (added by RFC-0660) — add `fixHint?: string` to it
- Initialize `warnings: []` in `runSkillValidate`
- **Refactor `checkSkill19And20`**: split its return into errors (push to `violations`) and warnings (push to `warnings`). SKILL-19 legacy-section warnings (`severity: "warning"`) go to `warnings`; SKILL-19 schema errors and SKILL-20 errors stay in `violations`
- **Fix status check**: `status: violations.length === 0 ? "pass" : "fail"` — now correct because `violations` contains only errors, `warnings` contains only warnings
- Update both validation loops (forge skills + pack skills) to push warnings to `warnings` instead of `violations`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- Existing `skill-validate.test.ts` passes (warnings array is empty when no warnings trigger; violations contains only errors)
- Run `forge.skill.validate --all` and verify `status: "pass"` with `warnings: []` (no legacy sections currently)

**Completion criterion:** `SkillValidateResult` has `warnings: Warning[]`; SKILL-19 legacy-section warnings are in `warnings` (not `violations`); `status` is `"fail"` only when `violations` (errors only) is non-empty; build and existing tests pass; `forge.skill.validate --all` returns `status: "pass"`.

**Human review:** no

---

### Step 4. Implement SKILL-21 rule in `forge.skill.validate`

**Goal:** Add the budget enforcement rule as a warning-only check.

**Agent actions:**

- In the forge skill validation loop (after SKILL-13), for each declared knowledge file:
  - Parse the file via `parseKnowledgeFile` (from `packages/forge/src/knowledge/`)
  - Skip if `parseIssues` contain errors (SKILL-19 reports those; no double-reporting)
  - Determine layer from `ParsedKnowledgeFile.layer` — skip if undeterminable or L0 (cold, no budget)
  - Compute active-entry character count (sum of heading + metadata block + body for `status: active` entries)
  - Compare against effective budget (hot: 4096, warm: 8192, or override from `resolveKnowledgeBudgets`)
  - If exceeded, push to `warnings` (not `violations`): `{ skill, rule: "SKILL-21", file, layer, severity: "warning", message: "<Layer> layer exceeds budget: <actual> of <budget> characters (<pct>% over)", fixHint: "Run the knowledge compaction command (RFC-0662) to archive stale entries, or promote duplicated principles to the shared layer (RFC-0663)" }`
- Repeat for pack skills validation loop
- Update module contract purpose line: `SKILL-01..SKILL-21`
- Add CHANGE_SUMMARY entry: `RFC-0661: added SKILL-21 — knowledge layer token budget enforcement (warnings only).`

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- `pnpm exec werkstatt run forge.skill.validate --all` returns `status: "pass"` with `warnings: []` for current forge skills (all within default budgets)

**Completion criterion:** SKILL-21 warnings appear in `warnings` array when a hot/warm knowledge file exceeds its budget; `status` remains `"pass"` when only warnings are present; all current forge skills validate within default budgets (zero warnings at introduction).

**Human review:** no

---

### Step 5. Extend `forge.doctor` with budget summary and override validation

**Goal:** Add knowledge-budget health reporting to the doctor command.

**Agent actions:**

- In `packages/forge/src/onboarding/doctor.ts`, add a new check `knowledge-budgets`:
  - Call `resolveKnowledgeBudgets(workspaceRoot)` to get effective budgets
  - Validate override shape: if `bindings.knowledge.budgets` exists, check `hot` and `warm` are positive integers; if invalid, add a `warn` check naming the bad key and fall back to defaults
  - For each skill with knowledge files, compute active-entry sizes via `parseKnowledgeFile` and `computeLayerBudgets`
  - Report as a `pass` check with a summary table (skill → layer → size/budget → headroom %)
- Add the check to the doctor's check list and JSON output

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` passes
- `pnpm exec werkstatt run forge.doctor --json` includes `knowledge-budgets` check in output

**Completion criterion:** `forge.doctor` reports knowledge-budget summary with per-skill, per-layer size/budget/headroom; invalid override shapes produce warnings with defaults applied; valid state produces a pass check.

**Human review:** no

---

### Step 6. Write unit tests

**Goal:** Cover budget resolution, active-only counting, warning content, and skip-on-parse-failure.

**Agent actions:**

- Create `packages/forge/src/tests/budgets.test.ts`:
  - Test `resolveKnowledgeBudgets`: defaults when no override; override applied when present; invalid override falls back to defaults
  - Test `computeLayerBudgets`: active entries counted; stale/superseded/archived excluded; undeterminable layer skipped; empty file produces zero-size report
  - Test warning content: message format includes layer, actual size, budget, percentage; fixHint references RFC-0662 and RFC-0663
  - Test skip-on-parse-failure: file with parse issues is skipped (no warning, no crash)
- Add SKILL-21 test cases to `packages/forge/src/tests/skill-validate.test.ts`:
  - SKILL-21 warning appears when a hot file exceeds budget (mock or fixture with over-budget content)
  - SKILL-21 does not affect `status` (remains `"pass"`)
  - SKILL-21 does not appear for files within budget

**Validation:**

- `pnpm --filter @warpgogol/forge run test` passes
- All new test cases pass

**Completion criterion:** All test cases pass; coverage includes the four scenarios from acceptance criterion (override resolution, active-only counting, warning content, skip-on-parse-failure).

**Human review:** no

---

### Step 7. Document hot/warm/cold discipline in `writing-great-skills`

**Goal:** Add the canonical reading discipline documentation.

**Agent actions:**

- In `packages/forge/skills/shared/writing-great-skills/SKILL.md`, under "Cumulative knowledge pattern", add a new subsection "Reading discipline and budgets" with:
  - The hot/warm/cold table (layer, file, when loaded, budget default)
  - One-line discipline statement example
  - Budget semantics (active entries only, character proxy, overridable via `forge.yaml`)
  - SKILL-21 enforcement (warnings only, never errors)
  - Pointer to RFC-0661 for full specification
- Sync the updated file to `.agents/skills/writing-great-skills/SKILL.md`

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --all` passes (SKILL-17 check — no platform RFC ids in skill body; reference RFC-0661 only in comments, not in instruction lines)

**Completion criterion:** `writing-great-skills` contains the hot/warm/cold discipline table and budget semantics; synced to `.agents/skills/`; skill validation passes.

**Human review:** no

---

### Step 8. Add read-discipline one-liners to knowledge-adopting skills

**Goal:** Replace vague "read the knowledge files" instructions with explicit layer discipline statements.

**Agent actions:**

- `packages/forge/skills/shared/grilling/SKILL.md`: replace "Read `learned-principles.md` (L2) at the start of each session" with "Read `learned-principles.md` (hot, L2) at start; never read `qa-log.md` (cold, L0) wholesale — append only"
- `packages/forge/skills/fo/fo-memory-sync/SKILL.md`: replace "Read L1 and L2 at the start of each run" with "Read `learned-principles.md` (hot, L2) and `fix-patterns.md` (warm, L1) at start; consult `fix-patterns.md` only when step 4 matches; never read `qa-log.md` (cold, L0) wholesale — append only"
- `packages/forge/skills/fo/fo-session-save/SKILL.md`: add discipline statement if the skill reads knowledge files
- Sync all updated files to `.agents/skills/`

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --all` passes
- `pnpm exec werkstatt run forge.doctor` reports no stale skill copies

**Completion criterion:** All knowledge-adopting forge skills (`grilling`, `fo-memory-sync`, `fo-session-save`) have one-line read-discipline statements; synced to `.agents/skills/`; no stale copies.

**Human review:** no

---

### Step 9. Update `packages/forge/AGENTS.md`

**Goal:** Update the forge agent guide to reference SKILL-21.

**Agent actions:**

- In `packages/forge/AGENTS.md`, update the SKILL rules reference from `SKILL-01..SKILL-18` to `SKILL-01..SKILL-21`
- Add a note about SKILL-21: "SKILL-21 enforces knowledge layer token budgets as warnings (never errors, never build gates). Budgets count only `status: active` entries, are overridable via `forge.yaml` `bindings.knowledge.budgets`, and default to hot 4096 / warm 8192 characters."

**Validation:**

- `pnpm exec werkstatt run forge.skill.validate --all` passes

**Completion criterion:** `packages/forge/AGENTS.md` references SKILL-21 and describes it as warnings-only.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize all documentation artifacts, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify every file listed in `scope.docs` is updated — check each path against `git diff`; if a scope doc was not modified, document why.
- Run `pnpm exec werkstatt run ecosystem.manifest.generate` if command surfaces changed (no new commands, but `forge.skill.validate` and `forge.doctor` behavior extended — check if manifest needs regeneration).
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes. Wait for the review report.
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review` to confirm. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code. Mark `[x]` for verified criteria with inline `(evidence: ...)` annotations.
- **Stamp the RFC as implemented:** run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0661 --implementation-commit <sha>`.

**Validation:**

- `git status` — no uncommitted changes from the current session.
- `pnpm exec werkstatt run rfc.validate --id RFC-0661`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0661` (RFC-0330)
- Every file in `scope.docs` is either updated or documented as not-applicable.
- Review report exists for this session.

**Completion criterion:** All documentation artifacts in scope are updated; code review passed; all acceptance criteria checked off with evidence annotations; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0661`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`
- `pnpm exec werkstatt run forge.skill.validate --all` (zero violations, zero warnings at introduction)
- `pnpm exec werkstatt run forge.doctor --json` (knowledge-budgets check present)
- `pnpm exec werkstatt run rfc.verification.emit --id RFC-0661` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0661.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0661` in the subject line (RFC-0265)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Warning fatigue — defaults too tight | Step 4 verifies all current forge skills pass with zero warnings at introduction; Step 5 doctor summary shows headroom % so calibration is data-driven |
| Agents ignoring warm-layer discipline | Step 8 replaces vague instructions with explicit one-line discipline statements in skill bodies the agent executes |
| False precision — character budgets feel arbitrary | Step 7 documents character count as a deterministic proxy with explicit rejection of tokenizer accuracy; overrides documented |
| Agent misinterpretation — treating warnings as errors | Step 4 ensures `status` remains `"pass"` for warnings-only; Step 9 documents SKILL-21 as warnings-only in AGENTS.md; RFC implementation notes repeat it |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-N, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0661 --reason "..." --invariant "DNA-N"` instead of working around it.
- If RFC-0660's `parseKnowledgeFile` is not yet implemented when this plan executes, create a minimal type stub in `packages/forge/src/knowledge/` and coordinate with RFC-0660's implementation to replace it. The stub must not diverge from RFC-0660's specified interface.
- If the `SkillValidateResult` output shape change (adding `warnings`) breaks downstream consumers, check `docs/command-manifest.generated.yaml` and `ecosystem.manifest.generate` — the change is additive (new field), not breaking.
