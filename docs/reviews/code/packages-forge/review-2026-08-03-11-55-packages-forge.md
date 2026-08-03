---
reviewId: REVIEW-CODE-2026-08-03-01
date: 2026-08-03
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: ae2a2783...HEAD
filesReviewed:
  - packages/forge/src/knowledge/schema.ts
  - packages/forge/src/knowledge/parse.ts
  - packages/forge/src/knowledge/serialize.ts
  - packages/forge/src/knowledge/index.ts
  - packages/forge/src/index.ts
  - packages/forge/src/validators/skill-validate.ts
  - packages/forge/src/onboarding/doctor.ts
  - packages/forge/src/tests/knowledge-parse.test.ts
  - packages/forge/src/tests/knowledge-pbt.test.ts
  - packages/forge/src/tests/skill-validate-knowledge.test.ts
  - packages/forge/os/core/core.module.ts
  - packages/forge/AGENTS.md
  - packages/forge/skills/shared/writing-great-skills/SKILL.md
  - packages/forge/skills/meta/skill-create/SKILL.md
  - docs/architecture-dna.md
  - packages/forge/skills/fo/fo-memory-sync/fix-patterns.md
  - packages/forge/skills/fo/fo-session-save/fix-patterns.md
  - packages/forge/skills/fo/fo-session-save/learned-principles.md
  - packages/forge/skills/shared/grilling/qa-log.md
---

# Code Review: ae2a2783...HEAD (RFC-0660 implementation)

### Verdict: Needs revision

The implementation is architecturally sound and mechanically clean (typecheck + 459 tests pass). Two findings require attention: a duplicated code pattern in the parser's layer-specific refinement logic and a missing `@warpgogol/*` import guard check in the new knowledge module barrel.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/forge run build:check` and `pnpm --filter @warpgogol/forge run test` (459 tests) both pass.

### Axis A — Structural correctness

- **Duplicated Code (schema.ts:35-67)**: The L0 and L1 refinement blocks are identical — both forbid `confirmations` and `lastConfirmedAt` with the same error messages. This is a candidate for extraction into a shared helper or a combined `if (data.layer === "L0" || data.layer === "L1")` block. The current form is correct but violates DRY.

### Axis B — DNA alignment

No issues. DNA-60 is correctly added to `docs/architecture-dna.md:255-257`. The implementation respects DNA-54 (forge bindings contract — no hardcoded project literals in skill bodies). The knowledge module in `packages/forge/src/knowledge/` is free of `@warpgogol/*` imports, respecting the forge autonomy guard.

### Axis C — Ecosystem fit

No issues. `forge.skill.validate` and `forge.doctor` are existing commands with extended behavior — no new commands added. Command description updated from SKILL-01..SKILL-13 to SKILL-01..SKILL-20. Command manifest regenerated. `packages/forge/AGENTS.md` updated with SKILL-19/SKILL-20 mention. `writing-great-skills` SKILL.md documents the entry format as the single entry contract.

### Axis D — Forward-only compliance

No issues. Legacy freeform entries are migrated to structured format — no parallel format persists. No backward compatibility shims. The parser treats legacy sections as warnings (migration window), not as an alternative format.

### Axis E — Agent-facing clarity

No issues. All new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. The `checkSkill19And20` function in `skill-validate.ts:615-723` is well-named and its logic is traceable. Variable names (`seenIds`, `entryIds`, `metaBlockStart`) are self-documenting.

### Axis F — Pragmatism

No issues. The knowledge module is minimal — schema, parser, serializer, barrel. No speculative generality. The `FIELD_ORDER` constant in `serialize.ts` ensures deterministic output without over-engineering. The `checkSkill19And20` function reuses the existing `Violation` interface without extending it unnecessarily.

### Axis G — Blind spots

- **Performance (parse.ts)**: The parser reads files synchronously via `fs.readFileSync`. This is acceptable for a validator that processes ~30 knowledge files, but the cost is not documented. The parser is O(n) in file lines — no quadratic patterns. The `ENTRY_HEADING_PATTERN` regex is simple and fast.

### Spec compliance

| Requirement from RFC-0660 | Status | Evidence |
| --- | --- | --- |
| Knowledge module exports schema, parser, serializer | Done | `packages/forge/src/knowledge/{schema,parse,serialize,index}.ts` |
| Layer-specific refinements (L0/L1/L2) | Done | `schema.ts:34-85` — Zod superRefine with L0/L1/L2 branches |
| Tolerant parser with parseIssues and line numbers | Done | `parse.ts:148-169` — try/catch around YAML parse, 1-based line numbers |
| Knowledge-adjacent file exemption | Done | `parse.ts:82-94` — isKnowledgeAdjacent flag |
| SKILL-19 validation (schema errors, legacy warnings) | Done | `skill-validate.ts:629-652` |
| SKILL-20 validation (id uniqueness, supersedes, promotedTo) | Done | `skill-validate.ts:654-720` |
| forge.doctor legacy-section counts | Done | `doctor.ts:279-340` |
| Migrate all forge knowledge files | Done | 4 files migrated, zero legacy warnings |
| writing-great-skills entry format documentation | Done | `writing-great-skills/SKILL.md:119-168` |
| DNA-60 invariant | Done | `docs/architecture-dna.md:255-257` |
| Property-based round-trip test | Done | `knowledge-pbt.test.ts:52-84` |

### Questions for the author

1. The L0 and L1 refinement blocks in `schema.ts:35-67` are identical — should they be merged into a single `if (data.layer === "L0" || data.layer === "L1")` block to reduce duplication?
2. The `formatYamlValue` function in `serialize.ts:27-36` treats `undefined` and `null` identically (both return `"null"`) — is this intentional? If so, the serializer will emit `field: null` for both `undefined` and `null` values, which means round-trip of an entry with `expiresAt: undefined` will produce `expiresAt: null` in the output. Is this acceptable?
3. The `checkSkill19And20` function in `skill-validate.ts:615` does not pass `entry.pack` to the forge skill loop (line 215) — only the pack skill loop passes it (line 392). Is this intentional? Forge skills don't have packs, so it should be fine, but confirm.
