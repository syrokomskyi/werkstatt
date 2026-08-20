---
rfcId: RFC-0889
auditId: AUDIT-RFC-0889-01
date: 2026-08-20
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0889

## Verdict: Needs revision

RFC-0889 claims to resolve four contradictions within RFC-0886, but three of the four claimed contradictions are fabricated or misattributed. The one real contradiction (R2 path) is valid but incorrectly sourced. Most critically, Decision #1 attempts to override RFC-0886's explicit non-goal about `operational-measurement-v1` based on a factually incorrect premise that the policy "already requires `consent-granted`" — it does not.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-19 (warning)**: `RFC-0889.amends` includes `RFC-0886`, but `RFC-0886.amendedBy` does not include `RFC-0889`. The bidirectional link must be established when RFC-0889 is accepted.

## Axis A — Structural completeness

- **Fabricated contradiction #1 (gate scope)**: RFC-0889 line 94 claims RFC-0886 Design section line 218 says "The new `display-consent-consistent` condition is required for all policies (`attestation-v1`, `operational-measurement-v1`, `technical-assessment-v1`)." This is a misquote. RFC-0886 line 218 is a code comment (`// evaluateGateV2: replace consentGranted check with per-aspect logic`). The actual policy requirement is on line 226: "The new `display-consent-consistent` condition is required only for `attestation-v1` (the only policy with `consent-granted`). It is NOT required for `operational-measurement-v1` or `technical-assessment-v1`." RFC-0886 is internally consistent on this point — Design (line 226), Rollout (line 318), Acceptance criteria (line 340), and Implementation notes (line 351) all say `attestation-v1` only. There is no contradiction to resolve.

- **Contradiction #2 (R2 path) — real but misattributed**: A real contradiction exists within RFC-0886: the TypeScript contract comment (line 184: `{systemId}/screenshots/{slug}/website-screenshot.{ext}`) conflicts with the JSON output example (line 298: `nachweis/warpgogol-com/client-xyz/website-screenshot.webp`). However, RFC-0889 line 103 claims the Design section says `nachweis/{systemId}/{slug}/website-screenshot.{ext}` — this is incorrect. The Design section's TypeScript contract uses `{systemId}/screenshots/{slug}/`. The `nachweis/` prefix appears only in the JSON example. RFC-0889's Decision #2 (use `nachweis/{systemId}/{slug}/`) is a valid design choice, but the contradiction is misattributed.

- **Fabricated contradiction #3 (storage tier)**: RFC-0889 line 113 claims RFC-0886 Implementation notes line 304 says "The `storage: "private"` option allows keeping screenshots private (hash-only display) for clients who don't want public screenshots." This text does not exist in RFC-0886. RFC-0886 line 332 (Risks section) says: "Screenshots are always stored as `storage: "public"` ... The `PbpWebsiteScreenshot` schema allows `storage: "private"` for future flexibility, but the `nachweis.screenshot.upload` command always writes `"public"`." This is consistent with the Design section (line 183: `storage: "public"`). There is no contradiction — the schema (RFC-0885) permits `"private"` as a type, but the command (RFC-0886) always writes `"public"`.

- **Fabricated contradiction #4 (r2Key vs r2Path)**: RFC-0889 line 122 claims RFC-0886 Implementation notes line 324 references `r2Path`. The string `r2Path` does not appear anywhere in RFC-0886 (verified via grep). The field `r2Key` is used consistently in the TypeScript contract (line 184) and JSON output (line 298). No contradiction exists.

- **Acceptance criteria**: Items are checkable but criterion #1 (`display-consent-consistent` in `operational-measurement-v1`) enshrines the incorrect premise as a requirement.

## Axis B — DNA alignment

- **DNA-46**: Referenced and explained. The gate scope correction is framed as protecting mission lifecycle, but the actual change (adding `display-consent-consistent` to `operational-measurement-v1`) is not justified by DNA-46 — it introduces a new consent requirement on a policy that currently has none.

- **DNA-59**: Referenced and explained. R2 path correction is a valid evidence-preservation concern.

## Axis C — Ecosystem fit

- **Contradicts RFC-0886 nonGoals**: RFC-0886 line 74 explicitly states: "Does not add `display-consent-consistent` to `technical-assessment-v1` or `operational-measurement-v1` policies — only `attestation-v1` requires consent." RFC-0889 Decision #1 directly contradicts this non-goal. An amend RFC should not override an explicit non-goal without justifying why the non-goal was wrong.

- **False premise**: RFC-0889 line 99 says `display-consent-consistent` is added to "policies that already require `consent-granted`". This is factually incorrect for `operational-measurement-v1`. The current code (`REQUIRED_CONDITIONS` in `packages/werkstatt/src/nachweis/nachweis-io.ts:162-169`) does NOT include `consent-granted` for `operational-measurement-v1`. Only `attestation-v1` has `consent-granted` (line 154-161).

- **Compass sync not mentioned**: RFC-0889 changes gate condition placement but does not mention Compass sync for `docs/verification-plan.xml`. RFC-0886 line 127 explicitly lists this file in its Compass sync section. An amend that changes gate scope should update the same Compass doc.

- **AGENTS.md not mentioned**: RFC-0886 line 128 says `packages/werkstatt/AGENTS.md` needs a rule about display↔consent coupling. RFC-0889 doesn't mention whether this AGENTS.md rule needs updating for the `operational-measurement-v1` scope change.

## Axis D — Forward-only compliance

No issues. The RFC amends RFC-0886 directly without introducing compatibility layers.

## Axis E — Agent-facing policy

- **Status gate**: Correctly states agents may implement only when status is accepted or implemented.

- **No NEEDS CLARIFICATION markers**: Clean.

- **Factually incorrect claims**: The RFC contains multiple claims about RFC-0886's content (line numbers, quotes) that do not match the actual RFC-0886 file. An implementing agent would be confused trying to find the "contradictions" in RFC-0886.

## Axis F — Pragmatism

- **Unnecessary scope expansion**: Decision #1 expands `display-consent-consistent` to `operational-measurement-v1`, which is not needed to resolve any real contradiction. If the only real contradiction is the R2 path (#2), the RFC could be much simpler.

- **`packagesImpacted`**: Lists only `werkstatt`. This is correct for the gate condition and screenshot upload changes.

## Axis G — Blind spots

- **Consent entity absence for operational-measurement-v1**: Adding `display-consent-consistent` to `operational-measurement-v1` assumes that `operational-measurement-v1` records always have corresponding consent entities with `consentScope`. But the current gate does not require `consent-granted` for this policy, meaning consent data may be absent. The `display-consent-consistent` evaluator would need to handle absent consent gracefully (skip or fail). If it fails, every `operational-measurement-v1` record without a consent entity would be blocked from publication. If it skips, the condition is meaningless. This is not addressed.

- **`display` field on operational-evidence**: RFC-0885 makes `display` required for all Nachweis evidence kinds (including `operational-evidence` which maps to `operational-measurement-v1`). But if `display.document = "visible"` for an operational-evidence record, and there's no consent entity, the gate would block publication. This coupling is not discussed.

## Questions for the author

1. Why does Decision #1 add `display-consent-consistent` to `operational-measurement-v1` when RFC-0886 explicitly excludes it (nonGoals line 74, Design line 226, Rollout line 318, Implementation notes line 351) and `operational-measurement-v1` does not require `consent-granted` in the current code?

2. If `display-consent-consistent` is added to `operational-measurement-v1`, what happens when an `operational-evidence` record has `display.document = "visible"` but no consent entity exists? Does the gate block publication (breaking existing workflows) or skip the check (making the condition meaningless)?

3. For contradictions #3 and #4, the cited RFC-0886 lines and quotes do not exist in the actual file. Were these contradictions verified against the current RFC-0886 text, or against an earlier draft?
