---
reviewId: REVIEW-CODE-2026-07-26-01
date: 2026-07-26
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: d8a83afa4...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/audit/validators/wikidata.ts
  - packages/os/site-kernel-checks/src/tests/wikidata-validate.test.ts
  - packages/os/site-kernel-checks/src/command-tables/05-seo-audit.ts
  - packages/os/site-kernel-checks/AGENTS.md
  - docs/COMMANDS.md
  - docs/rfcs/rfc-0535-extend-wikidata-validate-with-claim-and-evidencesource-coverage-checks.md
---

# Code Review: d8a83afa4...HEAD (RFC-0535 implementation)

### Verdict: Approved

The implementation is clean, follows existing patterns in the validator, and all mechanical checks pass. Two minor findings on axis A and G are noted but do not block approval.

### Mechanical floor

Pass — `tsc --noEmit` exit 0, 548 tests pass (94 test files), `rfc.validate` passes.

### Axis A — Structural correctness

- **Minor: `as any` cast in test** — `wikidata-validate.test.ts:326` uses `as any` to simulate an EvidenceSourceItem without `url`. This is acceptable in test code but could use a typed helper. Not blocking.
- **Duplicated Code (baseline)** — `validateQidPresence` has two identical `finding()` blocks for the empty-ids and no-wikidata-id cases (lines 123-131 and 133-141). This is pre-existing, not introduced by this diff.
- No other issues. The four new pure functions are minimal, well-typed, and follow the same pattern as existing validators.

### Axis B — DNA alignment

No issues. No new files created (existing file extended). DNA-42 (Compass markup) updated in both `wikidata.ts` and the test file. No DNA invariant conflicts.

### Axis C — Ecosystem fit

No issues. Command table updated with correct description and reads. AGENTS.md and COMMANDS.md regenerated. No pipeline placement change (remains standalone, matching RFC-0531).

### Axis D — Forward-only compliance

No issues. `escalateMissingQidWarnings` renamed to `escalateStrictWarnings` — old name removed, no dual-path. `STRICT_ESCALATION_RULES` replaces the inline `startsWith/endsWith` pattern with an explicit list.

### Axis E — Agent-facing clarity

No issues. MODULE_CONTRACT and CHANGE_SUMMARY updated with RFC-0535 references. New interfaces (`ClaimRecord`, `EvidenceSourceItem`, `EvidenceSourceRecord`) are clearly named. Constants (`NOTABILITY_EVIDENCE_KINDS`, `STRICT_ESCALATION_RULES`) are named descriptively.

### Axis F — Pragmatism

No issues. Four new pure functions each earn their existence (distinct validation rules). `readPbpRepeatables` is a minimal I/O helper following the existing `readPbpEntity` pattern. No speculative generality.

### Axis G — Blind spots

- **Minor: `readPbpRepeatables` silently skips unreadable files** (line 359-361, bare `catch`). This matches the existing `readPbpEntity` pattern (line 330-332) which also silently returns null on read failure. Consistent with existing codebase — not blocking, but worth noting that a corrupt `claims/*.md` file would be silently ignored rather than reported.
- **Edge case: empty claims/evidence-sources directories** — handled correctly: `readPbpRepeatables` returns `{}`, `toClaimRecords`/`toEvidenceSourceRecords` return `[]`, and all validators return `[]` or `null` for empty inputs. Tested.
- **Performance**: additional I/O is proportional to claim/evidence-source file count (typically 10-30 files). Negligible. Documented in RFC risks section.

### Spec compliance

| Requirement from RFC-0535 | Status | Evidence |
| --- | --- | --- |
| `validateNotabilityEvidence` pure function | Done | wikidata.ts:215-233 |
| `validateClaimEvidenceCoverage` pure function | Done | wikidata.ts:235-258 |
| `validateEvidenceReferences` pure function | Done | wikidata.ts:260-284 |
| `validateEvidenceSourceUrls` pure function | Done | wikidata.ts:286-309 |
| `readPbpRepeatables` I/O helper | Done | wikidata.ts:342-364 |
| QID-gated wiring in `runWikidataValidate` | Done | wikidata.ts:493-523 |
| Command table updated | Done | 05-seo-audit.ts:195-211 |
| `escalateStrictWarnings` rename + extension | Done | wikidata.ts:311-321, STRICT_ESCALATION_RULES:62-68 |
| Unit tests for all new functions | Done | 16 new test cases, all pass |
| Existing tests unchanged | Done | 548 tests pass, no existing test modified |
| `build:check` passes | Done | tsc --noEmit exit 0 |
| `rfc.validate` passes | Done | status: pass, 0 violations |

### Questions for the author

1. Should `readPbpRepeatables` log a warning when a `.md` file fails to parse, rather than silently skipping it? The existing `readPbpEntity` has the same pattern, so this is a pre-existing design choice — but for claims/evidence-sources, a silently skipped file could mask a real content issue.
2. The `STRICT_ESCALATION_RULES` array duplicates the three `*-missing-qid` rule IDs that were previously matched by `endsWith("-missing-qid")`. If a new `*-missing-qid` rule is added in the future, it must be manually added to this array. Is this intentional (explicit > implicit), or should the pattern match be retained for the qid rules?
