---
rfcId: RFC-0619
auditId: AUDIT-RFC-0619-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0619

## Verdict: Needs revision

RFC-0619 is a well-scoped one-line fix that correctly uses the existing `force` flag from RFC-0390 to bypass stale cache entries during mission materialization. The design, alternatives, and failure modes are thorough. One structural finding: the `amends` frontmatter field is empty despite the body explicitly stating "This RFC amends RFC-0597's materialization flow."

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0619` reports zero violations.

## Axis A — Structural completeness

**Finding A-1: `amends` field mismatch with body.** The frontmatter has `amends: []` (line 22), but the RFC body at line 110 states: "This RFC amends RFC-0597's materialization flow by adding `force: true` to the `executeKernelPipeline` call that RFC-0597 introduced." The `amends` field should include `RFC-0597` to match the body's claim. RFC-0597 is currently listed only in `related[]` (line 27), but an amendment is a stronger relationship than "related" — it changes the amended RFC's contract.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-47]` is correct — DNA-47 (Materialization) requires that the Werkstück is materialized with runtime scaffolding generated from the pinned platform. The RFC body at lines 89 and 108 explains how stale cache hits violate this invariant and how `force: true` protects it. No conflicts with other DNA invariants.

## Axis C — Ecosystem fit

**Finding C-1: Same as A-1.** The `amends` vs `related` distinction affects RFC lifecycle metadata. `rfc.validate` checks `amends`/`amendedBy` referential integrity — if RFC-0597 is listed in `amends`, the validator will verify the relationship is consistent. Currently the amendment relationship is undocumented in machine-readable frontmatter.

## Axis D — Forward-only compliance

No issues. The RFC adds `force: true` unconditionally — no compatibility shim, no dual-path, no flag-gated legacy behavior. The fix is transparent and applies to all materialization invocations.

## Axis E — Agent-facing policy

No issues. The RFC is in `draft` status and does not contain self-authorizing language. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." The note about the already-applied hotfix (line 188) is factual documentation, not retroactive authorization. Forward-only rule is explicit: "Agents MUST NOT remove `force: true`... without a new RFC that supersedes this one."

## Axis F — Pragmatism

No issues. The change is a single-line addition using an existing flag for its intended purpose. No new commands, no new types, no speculative generality. `packagesImpacted` lists only `@warpgogol/site-kernel-handoff`. `nonGoals` are explicit and meaningful (RFC-0620 cross-reference for data-path copy filtering).

## Axis G — Blind spots

No issues. Performance cost is documented (~5-10 seconds for 42 steps, line 171). Three failure modes cover empty states (first materialization, cache unavailable) and the fix target (re-materialization with stale cache). Concurrent execution is safe — each materialization gets its own workpiece and `force: true` ensures independent execution. The regression risk (future refactor removing `force: true`) is mitigated by the regression test acceptance criterion.

## Questions for the author

1. Should RFC-0597 be listed in `amends: [RFC-0597]` instead of only `related[]`? The body says "amends" but the frontmatter says `amends: []`.
