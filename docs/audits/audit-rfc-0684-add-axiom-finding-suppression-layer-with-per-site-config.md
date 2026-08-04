---
rfcId: RFC-0684
auditId: AUDIT-RFC-0684-01
date: 2026-08-04
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0684

## Verdict: Needs revision

The RFC correctly identifies a real and recurring problem (790 false positives across all client sites) and proposes a sound architectural boundary (suppressions in Werkstatt, not in Axiom). However, the Design section contains a factual error about how `leitstand.propagate` works, the `suppressionSummary.byCategory` output field has no corresponding config field, the `SuppressionMatch` interface is dead code, and the migration path for pre-suppression evidence is unaddressed.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0684 --json` returned zero violations.

## Axis A — Structural completeness

1. **`Finding` interface uses placeholder comment.** Line 201: `// ... existing fields ...` is not valid TypeScript. The RFC should either import the existing `Finding` type from `@syrokomskyi/axiom-factory-app` or list only the new fields being added (`suppressed`, `suppressedBy`) without the placeholder comment.

2. **`SuppressionMatch` interface is dead code.** Lines 186–190: the `SuppressionMatch` interface is exported but never referenced by any function signature in the RFC. `applySuppressions` returns `Finding[]`, not `SuppressionMatch[]`. Remove it or use it.

## Axis B — DNA alignment

1. **DNA-49 `--channel` claim is misleading.** The RFC CLI surface (line 149) states "leitstand.propagate passes --channel alt or --channel main to mission.check". But `leitstand.propagate` does NOT call `mission.check` — it reads `study-run.json` directly (verified at `leitstand-commands.ts:1232-1255`). The `--channel` flag is only meaningful for `mission.check` (which marks findings) and `leitstand.dev-deploy` (which calls `mission.check`). `leitstand.propagate` needs a different change: skip findings already marked `suppressed: true` in `study-run.json` when evaluating `isBlockingFinding`. The RFC should clarify this distinction.

2. **DNA-49 and DNA-59 satisfies claims are adequate.** The RFC body explains how each invariant is protected (lines 124–125). No issues with the satisfies relationship.

## Axis C — Ecosystem fit

1. **`leitstand.propagate` change is mischaracterized.** As noted in Axis B, the RFC says `leitstand.propagate` "passes `--channel` to `mission.check`" but it doesn't call `mission.check`. The actual change is: filter out `suppressed: true` findings in the `isBlockingFinding` loop at `leitstand-commands.ts:1279-1287`. The `commands.changed` listing is correct (the command does change), but the Design section's description of how it changes is wrong.

2. **`leitstand.dev-deploy` is not listed in `commands.changed`.** The RFC says `leitstand.dev-deploy` passes `--channel dev` to `mission.check` (line 148, 363). This means `leitstand.dev-deploy` is also changed. But it's not in `commands.changed` (line 51–55). Add it.

3. **Package boundaries are correct.** `suppressions-config.ts` and `suppressions-validate.ts` belong in `@warpgogol/site-kernel-checks` alongside `methodologies-config.ts`. `leitstand-commands.ts` is in `@warpgogol/site-kernel-handoff`. No boundary violations.

4. **`command.manifest.generate` is in acceptance criteria.** Line 365. Correct — the RFC adds a new command and changes existing ones.

## Axis D — Forward-only compliance

No issues. The RFC does not propose a compatibility shim or dual-path. The `--channel` default of `main` is not a legacy path — it's the correct production value. Suppressions are additive, not a bridge.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Status gate is correct (draft, awaiting review). Implementation notes reference RFC-0224, RFC-0334, RFC-0330, RFC-CMD-02 correctly. No content authoring claims that require human authoring.

## Axis F — Pragmatism

1. **`descriptionPattern: "preload"` is a broad pattern.** Line 312: the default rule for render-blocking CSS uses `descriptionPattern: "preload"`. "preload" is a common word that could match many finding descriptions beyond the Astro CSS preload pattern. The RFC itself warns about broad patterns in Risks (line 347). The default rule should use a more specific pattern (e.g. the full CSS preload description text from the actual Axiom findings).

2. **`suppressions.validate` ruleId validation source is unspecified.** Line 348: the RFC says `suppressions.validate` "checks that each ruleId in the config matches at least one known Axiom rule ID". But where does the list of known Axiom rule IDs come from? Axiom is an external tool (`@syrokomskyi/axiom-factory-app`). The RFC should specify whether the rule ID list is hardcoded, sourced from Axiom's exports, or derived from past evidence files.

3. **`SuppressionMatch` is speculative generality.** See Axis A item 2. The RFC should not export types without at least one consumer.

## Axis G — Blind spots

1. **Pre-suppression evidence migration path is unaddressed.** Existing `study-run.json` files (produced before this RFC is implemented) will not have `suppressed: true` flags. When `leitstand.propagate` reads old evidence, it will see all findings as active and block on false positives. The RFC should specify: does `leitstand.propagate` re-apply suppressions to old evidence, or does it require a re-run of `mission.check` (via `leitstand.dev-deploy`) to produce suppressed evidence? This is a real migration issue for releases in flight.

2. **`suppressionSummary.byCategory` has no corresponding config field.** Lines 258–265: the output format includes `byCategory` with named categories (`channel-mismatch`, `non-html-resource`, etc.), but the suppression rules in the config don't have a `category` field. How are these categories derived? Are they hardcoded by ruleId? Does the config need a `category` field? The RFC should either add a `category` field to `SuppressionRule` or remove `byCategory` from the output format.

3. **Per-site override semantics are contradictory.** Line 322: "Per-site rules can narrow but not widen workshop suppressions (a per-site rule cannot un-suppress what the workshop suppresses)." But line 385: "A per-site rule with different conditions can only suppress additional findings." Suppressing additional findings IS widening the suppression set, not narrowing it. The RFC should clarify: per-site rules can ADD new suppressions (for ruleIds or conditions not covered by workshop rules) but cannot REMOVE workshop-level suppressions. The word "narrow" is misleading.

4. **`axiom.report` rendering change is unspecified.** Line 362: the acceptance criterion says "axiom.report renders suppressed findings separately from active findings". But the RFC doesn't describe HOW — visually (greyed out? separate section?), structurally (different JSON key?), or just filtered out? The Design section should specify the rendering contract.

## Questions for the author

1. How does `leitstand.propagate` handle pre-suppression evidence (old `study-run.json` without `suppressed: true` flags)? Does it re-apply suppressions, or require a re-run of `leitstand.dev-deploy`?
2. Where does `suppressions.validate` get the list of known Axiom rule IDs to validate against? Is it hardcoded, exported by `@syrokomskyi/axiom-factory-app`, or derived from past evidence?
3. How is `suppressionSummary.byCategory` populated when the suppression config has no `category` field? Should `SuppressionRule` include a `category` field?
4. What is the exact rendering contract for `axiom.report` — how are suppressed findings visually or structurally distinguished from active findings?
