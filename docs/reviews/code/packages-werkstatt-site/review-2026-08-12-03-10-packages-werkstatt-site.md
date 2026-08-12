---
reviewId: REVIEW-CODE-2026-08-12-01
date: 2026-08-12
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: e1b611e7...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/ownership-pattern-match.ts
  - packages/werkstatt-site/src/checks/generated-file-lookup.ts
  - packages/werkstatt-site/src/checks/generated-edit-guard.ts
  - packages/werkstatt-site/src/checks/gitattributes.ts
  - packages/werkstatt-site/src/checks/page-markdown.ts
  - packages/werkstatt-site/src/checks/tests/page-markdown.test.ts
  - docs/rfcs/rfc-0811-switch-page-markdown-validate-from-blacklist-to-whitelist.md
---

# Code Review: e1b611e7...HEAD (RFC-0811)

### Verdict: Needs revision

Two findings: stale MODULE_CONTRACT non-goal in ownership-pattern-match.ts contradicts the new isFileOwnedByCommand function, and RFC implementation notes are stale after the implementation deviated from them.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site build:check` exits 0, 9/9 unit tests pass, `rfc.validate --id RFC-0811` passes.

### Axis A — Structural correctness

No issues. The `isFileOwnedByCommand` function correctly short-circuits when a non-matching command entry claims the file (returns `false` immediately). The `matchOwnershipEntry` function remains for existing consumers. Dead code (`isGeneratedMarkdownTwin`) was correctly removed.

### Axis B — DNA alignment

No issues. No DNA invariants are directly touched by this diff. DNA-58 (generated-file content determinism) is not affected — the diff changes validation logic, not generation.

### Axis C — Ecosystem fit

No issues. Package boundaries respected (all imports within `@warpgogol/werkstatt-site`). No new commands or pipeline changes. The new file `ownership-pattern-match.ts` is internal to the checks module, not a new public export.

### Axis D — Forward-only compliance

No issues. The blacklist `ignore` callback and `isGeneratedMarkdownTwin` were fully removed — no dual code paths or compatibility shims.

### Axis E — Agent-facing clarity

**Finding E-1**: `ownership-pattern-match.ts` MODULE_CONTRACT non-goal states "Do not add new matching logic — this module is a pure extraction of existing utilities." This contradicts the `isFileOwnedByCommand` function added in step 4, which is new matching logic. The non-goal and purpose should be updated to reflect that the module also owns command-scoped ownership queries.

**Finding E-2**: `ownership-pattern-match.ts` CHANGE_SUMMARY only mentions "initial extraction" but should also mention `isFileOwnedByCommand` addition.

### Axis F — Pragmatism

No issues. The `isFileOwnedByCommand` function was the minimal correct solution — `matchOwnershipEntry` returns the first match, which doesn't work for whitelist filtering when multiple entries match the same path with different commands. The implementation correctly identified this and added a focused helper rather than modifying `matchOwnershipEntry`'s contract.

### Axis G — Blind spots

No issues. The whitelist scan iterates `GENERATOR_OWNERSHIP_MAP` (a small constant array) for each `.md` file in `public/`. Performance is O(files × entries) with both factors in the low tens — negligible.

### Spec compliance

| Requirement from RFC-0811 | Status | Evidence |
| --- | --- | --- |
| Whitelist via ownership map | Done | `page-markdown.ts:540-543` |
| auth.md excluded via whitelist | Done | Test at `page-markdown.test.ts:244-257` |
| Existing twins pass | Done | 5 RFC-0613 tests pass |
| MDMETA-01 fires for missing frontmatter | Done | Test at `page-markdown.test.ts:260-273` |
| Unit tests for whitelist | Done | 4 new tests added |
| rfc.validate passes | Done | Zero errors |

### Questions for the author

1. The RFC implementation notes say "Reuse matchOwnershipEntry from generated-file-lookup.ts" and "The isGeneratedMarkdownTwin function does not need to change" — both of these were deviated from. Should the RFC notes be updated to reflect the actual approach (isFileOwnedByCommand + dead code removal)?
2. The MODULE_CONTRACT non-goal in ownership-pattern-match.ts says "Do not add new matching logic" but isFileOwnedByCommand is new matching logic. Should the non-goal be amended?
