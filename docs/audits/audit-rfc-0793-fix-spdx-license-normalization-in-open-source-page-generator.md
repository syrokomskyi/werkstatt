---
rfcId: RFC-0793
auditId: AUDIT-RFC-0793-01
date: 2026-08-10
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0793

## Verdict: Needs revision

The RFC is well-scoped and grounded in real bugs verified against the source code. Three findings need attention: a missing `related` entry for RFC-0599 (which also touched this generator), a `componentsTotal` count that will diverge from the actual number of components shown in the distribution, and a minor design ambiguity around the `OR` expression normalization strategy.

## Mechanical validation (rfc.validate)

Pass — zero violations, zero markers.

## Axis A — Structural completeness

No issues. All sections contain real content. Decision is a single present-tense statement. CLI surface, TypeScript contracts, file system responsibilities, output format, failure modes, rollout, alternatives, risks, and acceptance criteria are all populated and specific. Acceptance criteria are checkable and cover the four changes.

## Axis B — DNA alignment

No issues. `satisfies: []` is correct for a `kind: command` RFC (not required per RFC-0331). `related: [RFC-0489]` is relevant — RFC-0489 introduced the open-source page SBOM registry and SPDX normalization.

## Axis C — Ecosystem fit

- **Missing `related: RFC-0599`**: RFC-0599 ("Fix open-source.generate output completeness verification") also modified `open-source-page.ts` and added the fingerprint cache mechanism. The RFC's Rollout section references `.cache/open-source.fingerprint` (introduced by RFC-0599) but does not list RFC-0599 in `related`. Add it for traceability.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy code retention. The dead alias is removed, not kept behind a flag.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes reference RFC-0224 and RFC-0334 correctly. The `licenseDistribution`-only filter constraint is stated explicitly in both Design and Implementation notes.

## Axis F — Pragmatism

- **`componentsTotal` divergence**: The `summary.componentsTotal` field (line 590 of `open-source-page.ts`) counts all `publicDeps`, but after the Unknown filter, `licenseDistribution` will sum to fewer entries than `componentsTotal`. The RFC does not address whether `componentsTotal` should be adjusted or kept as-is. If `componentsTotal` stays as-is (counting all public deps including unknown), the distribution chart will show fewer total licenses than the summary count — a potential user-facing inconsistency. The RFC should state explicitly that `componentsTotal` remains the count of all public dependencies (including unknown), and the distribution chart is a subset.

## Axis G — Blind spots

- **OR expression picks first valid SPDX ID, not necessarily the most permissive**: The existing `OR` parser (line 237-245) returns the first part that resolves to a valid SPDX ID. For `(MIT OR CC0-1.0)`, it returns `MIT` (first). For `(AFL-2.1 OR BSD-3-Clause)`, it returns `AFL-2.1` (first). The RFC's Output format example (line 199-202) shows `(MIT OR CC0-1.0)` packages normalizing to `MIT`, which is correct. However, the RFC's acceptance criterion (line 243) says `(MIT OR Apache2)` normalizes to `MIT` — this is only correct because `MIT` appears first in the expression and is a valid SPDX ID. If the expression were `(Apache2 OR MIT)`, the parser would try `Apache2` first (not a valid SPDX ID), then find the alias `Apache-2.0`, and return `Apache-2.0` — not `MIT`. The RFC should clarify that the `OR` parser returns the first resolvable SPDX ID, not the most permissive one, to set correct expectations.

## Questions for the author

1. Should `related` include RFC-0599 (which introduced the fingerprint cache referenced in the Rollout section)?
2. Should `summary.componentsTotal` remain the count of all public dependencies (including unknown), or should it be adjusted to match the filtered distribution total?
3. Is the "first valid SPDX ID in OR expression" behavior acceptable, or should the parser prefer the most permissive license (e.g. MIT over CC0-1.0)?
