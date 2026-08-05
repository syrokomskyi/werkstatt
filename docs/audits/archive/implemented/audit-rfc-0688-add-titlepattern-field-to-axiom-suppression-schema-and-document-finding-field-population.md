---
rfcId: RFC-0688
auditId: AUDIT-RFC-0688-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0688

## Verdict: Needs revision

The RFC correctly identifies a real gap (messagePattern/descriptionPattern are non-functional) and proposes a sound fix (titlePattern matching against the always-populated title field). However, the Finding field population table misrepresents where `message` and `description` actually live in the code, the default rules have already been fixed by other means (uncommitted changes replace messagePattern/descriptionPattern with channelNot/urlPattern, not titlePattern), and two implementation steps are missing from the Design section (ruleSignature and isBroadPattern updates for titlePattern).

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0688 --json` returned zero violations.

## Axis A — Structural completeness

1. **Finding field population table is inaccurate about `message`/`description` location.** Lines 86–95 list `message` and `description` as top-level Finding fields that are always `""`. But the current implementation in `suppressions-config.ts:132–142` reads from `finding.extension.message` and `finding.extension.description`, not from top-level `finding.message` / `finding.description`. The `extractMessage` / `extractDescription` helpers look at `extension`, which per the system-retrieved memory contains only `{ observationId, predicate }`. So `messagePattern` is non-functional for two reasons: (a) the fields are always empty, and (b) the code reads from the wrong location. The RFC should document this correctly — either the fields are top-level on `Finding` (and the helpers have a bug), or they're in `extension` (and the table is wrong).

2. **Acceptance criterion "zero warnings" is stale.** Line 218: "suppressions.validate passes on updated systems/axiom-suppressions.yaml with zero warnings". The default rules in `systems/axiom-suppressions.yaml` have already been updated (uncommitted changes in working tree) — Categories C and D no longer use `messagePattern` or `descriptionPattern`. They were replaced with `channelNot: main` and `urlPattern: "\\.css$"` respectively, not with `titlePattern`. So no default rule would trigger SUPPRESS-VAL-06. The RFC should acknowledge the current state of the default rules and clarify whether the criterion means "zero SUPPRESS-VAL-06 warnings" or "zero warnings of any kind".

## Axis B — DNA alignment

No issues. DNA-49 alignment is adequately explained — suppression rules that silently fail cause the Axiom gate to block on false positives, undermining fleet propagation. The `satisfies: [DNA-49]` entry is correct and the RFC body explains how `titlePattern` protects the invariant.

## Axis C — Ecosystem fit

1. **`ruleSignature` update not mentioned.** The `ruleSignature` function in `suppressions-validate.ts:34–44` is used for SUPPRESS-VAL-03 (conflicting rules detection). It currently includes `messagePattern` and `descriptionPattern` in the signature but not `titlePattern`. Without adding `titlePattern` to the signature, two rules that differ only in `titlePattern` would not be detected as conflicting. The RFC's Design section should mention this update.

2. **`isBroadPattern` extension to `titlePattern` not in Design section.** The Risks section (line 208) states "SUPPRESS-VAL-04 warns on broad patterns — this check applies to `titlePattern` as well." But the Design section and acceptance criteria don't include this as an implementation step. The current `isBroadPattern` check in `suppressions-validate.ts:149–167` only checks `messagePattern` and `descriptionPattern`. The RFC should add an explicit design step and acceptance criterion for broad `titlePattern` detection.

## Axis D — Forward-only compliance

No issues. The RFC keeps `messagePattern` and `descriptionPattern` in the schema for forward compatibility — this is not a compatibility shim or dual-path. The fields remain in the schema; they just receive a warning when used without `titlePattern`.

## Axis E — Agent-facing policy

No issues. Status gate is correct (draft, no self-authorizing language). Implementation notes reference RFC-0224, RFC-0334, RFC-0330 correctly. No content authoring claims that require human authoring.

## Axis F — Pragmatism

1. **`titlePattern` has no default rule consumer.** The default rules in `systems/axiom-suppressions.yaml` have already been updated to not use `messagePattern` or `descriptionPattern` — Categories C and D now use `channelNot` and `urlPattern`. No default rule uses `titlePattern`. The RFC should either: (a) add a default rule that demonstrates `titlePattern` usage, or (b) acknowledge that the default rules were already fixed by other means and `titlePattern` is primarily for per-site rules where pattern-based matching is needed.

## Axis G — Blind spots

1. **Existing unit tests not mentioned.** The RFC doesn't mention updating existing tests in `suppressions-config.test.ts` and `suppressions-validate.test.ts` to cover `titlePattern` matching and SUPPRESS-VAL-06 warnings. The acceptance criteria don't include test coverage. The existing test at `suppressions-config.test.ts:304–320` tests `messagePattern` matching via `extension: { message: "..." }` — this test should be updated or a parallel `titlePattern` test added.

2. **`extractMessage`/`extractDescription` helpers not addressed.** The RFC documents that `message` and `description` are always empty but doesn't mention that the current helpers read from `finding.extension.message` / `finding.extension.description` (lines 132–142) rather than top-level fields. If the RFC is documenting the Finding field population contract, it should address whether these helpers should be fixed to read from the correct location, or whether they should be left as-is (since the fields are empty regardless of where you read them from).

## Questions for the author

1. Are `message` and `description` top-level fields on `Finding` (always `""`), or are they inside `finding.extension`? The current `extractMessage`/`extractDescription` helpers read from `extension` — is this a bug, or is the table in the RFC wrong about where the fields live?
2. Given that the default rules in `systems/axiom-suppressions.yaml` were already updated to use `channelNot` and `urlPattern` (not `titlePattern`), should the RFC add a default rule that uses `titlePattern` to demonstrate its value, or should it acknowledge that `titlePattern` is primarily for per-site rules?
3. Should `ruleSignature` in `suppressions-validate.ts` be updated to include `titlePattern` in conflict detection (SUPPRESS-VAL-03)? Two rules that differ only in `titlePattern` would otherwise not be detected as duplicates.
4. Should the `isBroadPattern` check (SUPPRESS-VAL-04) be extended to `titlePattern`? The Risks section says yes, but the Design section and acceptance criteria don't mention it.
