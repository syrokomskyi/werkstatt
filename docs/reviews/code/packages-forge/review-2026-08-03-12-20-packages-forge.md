---
reviewId: REVIEW-CODE-2026-08-03-01
date: 2026-08-03
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: bc892eb3...HEAD
filesReviewed:
  - packages/forge/src/config/forge-config.ts
  - packages/forge/src/knowledge/budgets.ts
  - packages/forge/src/knowledge/index.ts
  - packages/forge/src/validators/skill-validate.ts
  - packages/forge/src/onboarding/doctor.ts
  - packages/forge/src/tests/budgets.test.ts
  - packages/forge/src/tests/skill-validate.test.ts
  - packages/forge/skills/shared/writing-great-skills/SKILL.md
  - packages/forge/skills/fo/fo-memory-sync/SKILL.md
  - packages/forge/skills/fo/fo-session-save/SKILL.md
  - packages/forge/skills/shared/grilling/SKILL.md
  - packages/forge/AGENTS.md
---

# Code Review: RFC-0661 implementation (bc892eb3...HEAD)

## Verdict: Needs revision

The implementation is architecturally sound and all 476 tests pass, but there are two duplicated code blocks and a minor structural issue in the doctor's budget check that should be cleaned up before merging.

## Mechanical floor

Pass — `pnpm --filter @warpgogol/forge run build:check` and `vitest run` (476 tests) both pass clean.

## Axis A — Structural correctness

- **Duplicated code (SKILL-21 block)** — the SKILL-21 budget check block is duplicated verbatim in both the forge skills loop (`skill-validate.ts:248-268`) and the pack skills loop (`skill-validate.ts:457-478`). The only difference is the `pack` field on the warning. This is a Fowler Duplicated Code smell — extract a helper function `checkSkill21Budgets(parsedFiles, budgets, skillName, pack?)` and call it from both sites.
- **Duplicated code (parsedFiles collection)** — the pattern of collecting `parsedFiles`, building `skillNames` map, and calling `computeLayerBudgets` is also duplicated between forge and pack skill loops. The helper should encapsulate the full flow.
- **`serializeMetaAsYaml` approximation** — `budgets.ts:170-192` manually serializes metadata as YAML for character counting. This is an approximation of the actual file content (no quotes, no array brackets, etc.). The approximation is documented in the RFC as acceptable (character proxy, not tokenizer), but the function name `serializeMetaAsYaml` could mislead readers into thinking it produces exact YAML. Consider renaming to `approximateMetaCharCount` or adding a comment clarifying it's an approximation for budget purposes only.

## Axis B — DNA alignment

No issues. The implementation aligns with DNA invariants — `packages/forge/src/` remains portable (no kernel imports), the new module follows the existing `MODULE_CONTRACT` + `CHANGE_SUMMARY` scaffolding pattern, and the `Warning` type extends the existing validation result shape without breaking consumers.

## Axis C — Ecosystem fit

No issues. `forge.skill.validate` correctly extends to SKILL-21 without changing the command surface. `forge.doctor` adds a new check without modifying existing checks. The `bindings.knowledge.budgets` extension to `forgeBindingsSchema` follows the existing schema extension pattern. `packages/forge/AGENTS.md` is updated with the SKILL-21 reference.

## Axis D — Forward-only compliance

No issues. The refactor from `Violation[]` to `{ errors, warnings }` in `checkSkill19And20` is a clean break — no compatibility shim, no dual-path. The `warnings` array on `SkillValidateResult` is additive (new field), not a replacement of existing behavior. Legacy section warnings are moved from violations to warnings without keeping a parallel path.

## Axis E — Agent-facing clarity

No issues. New files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`. The `Warning` interface is clearly typed with `severity: "warning"` (not optional like `Violation`). The `fixHint` field on both `Violation` and `Warning` provides actionable guidance. Skill documentation changes are clear and concise.

## Axis F — Pragmatism

- **`checkKnowledgeBudgets` in doctor.ts duplicates `resolveKnowledgeBudgets` logic** — `doctor.ts:363-379` re-reads `forge.yaml` and re-parses the `bindings.knowledge.budgets` override to validate its shape, while `resolveKnowledgeBudgets` already reads and validates the same data. The doctor function could call `resolveKnowledgeBudgets` for the effective budgets and only separately validate the raw override shape for the warning messages. Currently the override validation is done twice (once in `resolveKnowledgeBudgets` silently, once in `checkKnowledgeBudgets` for warnings). This is acceptable — the doctor needs to report specific validation messages that `resolveKnowledgeBudgets` doesn't expose — but the raw YAML re-parsing could be extracted to a shared `validateBudgetOverride` function.

## Axis G — Blind spots

- **Performance**: `computeLayerBudgets` iterates all entries in all knowledge files for every skill. For the current 33 skills with ~3 knowledge files each, this is negligible (<100ms). No concern.
- **False positives**: SKILL-21 only fires for structured knowledge files (not knowledge-adjacent), and only for `status: active` entries. The skip-on-parse-failure and skip-on-null-layer rules prevent false positives on partially-migrated files. No concern.
- **Edge case — empty knowledge file**: An empty L2 file (0 active entries) produces a report with `activeChars: 0` and `exceededBy: 0` — correctly within budget. Test covers this.
- **Edge case — `exceededBy` when budget is 0**: If someone overrides `hot: 0`, `exceededBy` would be `activeChars - 0 = activeChars` for any active entry. But `resolveKnowledgeBudgets` rejects `hot: 0` (non-positive), so this can't happen. No concern.

## Spec compliance

| Requirement from RFC-0661 | Status | Evidence |
| --- | --- | --- |
| `budgets.ts` exports `computeLayerBudgets` and `resolveKnowledgeBudgets` | Done | `packages/forge/src/knowledge/budgets.ts:62,140` |
| Sizes count only `status: active` entries | Done | `budgets.ts:97-99` |
| SKILL-21 as warnings, never exit code | Done | `skill-validate.ts:258-266`, `skill-validate.ts:528-533` |
| Defaults: hot=4096, warm=8192 | Done | `budgets.ts:43-46` |
| Override in `forge.yaml` under `bindings.knowledge.budgets` | Done | `forge-config.ts:11-31` |
| `forge.doctor` validates override shape | Done | `doctor.ts:363-379` |
| `forge.doctor` prints budget summary | Done | `doctor.ts:430-456` |
| `writing-great-skills` documents reading discipline | Done | `writing-great-skills/SKILL.md:172-178` |
| Knowledge-adopting skills state read discipline | Done | 3 skills updated |
| All current skills within default budgets | Done | Test confirms zero SKILL-21 warnings |
| Unit tests cover budget resolution, active-only, warning content, skip-on-parse-failure | Done | 13+4 tests |

## Questions for the author

1. The SKILL-21 budget check block is duplicated between forge skills and pack skills loops — should this be extracted into a shared helper to reduce maintenance burden?
2. `serializeMetaAsYaml` produces an approximation of the YAML for character counting — is the approximation documented enough, or should it be renamed to clarify it's not exact YAML?
3. `checkKnowledgeBudgets` in doctor.ts re-parses `forge.yaml` to validate the override shape — should the raw override validation be extracted from `resolveKnowledgeBudgets` to avoid the double-parse?
