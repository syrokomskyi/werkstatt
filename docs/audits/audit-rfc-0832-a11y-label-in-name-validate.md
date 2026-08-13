---
rfcId: RFC-0832
auditId: AUDIT-RFC-0832-01
date: 2026-08-13
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0832

## Verdict: Needs revision

RFC-0832 is structurally sound and follows the established `surface.heading-uniqueness.validate` pattern correctly. Three findings prevent Approved: unspecified scan scope (all HTML vs surface-only), unquantified migration impact with zero grace period, and ambiguous AGENTS.md target.

## Mechanical validation (rfc.validate)

Pass — zero violations, zero markers.

## Axis A — Structural completeness

No issues. All required sections contain real content. Decision is present tense ("The kernel gains…"). CLI surface shows exact invocations with `--app` and `--all` flags. TypeScript contracts are minimal. File system responsibilities table names concrete paths. Output format documents `--json` shape. Failure modes specify exit codes. Rollout describes default behavior, adoption path, and new-app compliance. Alternatives section has 4 real alternatives with rejection reasons. Risks include agent confusion and false-positive rate. Acceptance criteria are checkable. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: []` is correct for `kind: command`. The RFC does not establish a new DNA invariant — it enforces WCAG 2.5.3 (Level A) via a build-time validator, following the existing post-build HTML scanning pattern. `related: [RFC-0690, RFC-0696]` are relevant pattern references.

## Axis C — Ecosystem fit

**Finding C-1: Ambiguous AGENTS.md target.** Acceptance criterion says "AGENTS.md updated with label-in-name contract" but does not specify which AGENTS.md. The `packages/werkstatt-site/AGENTS.md` "Check commands" section lists notable validators (RFC-0690's `surface.heading-uniqueness.validate` is not listed there but is registered in the command table). The RFC should clarify: root `AGENTS.md`, `packages/werkstatt-site/AGENTS.md`, or both.

Package boundaries, pipeline placement, cosmic naming, and command lifecycle buckets are all correct.

## Axis D — Forward-only compliance

No issues. The RFC is purely additive — one new command, no compatibility shims, no dual-paths, no deprecation of existing commands.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes reference RFC-0224 (accepted→implemented), `rfc.verification.emit`, `rfc.supersede.propose`. No content authoring claims. No persistence touched. No NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

No issues. One new command with a distinct WCAG concern — not duplicable as a flag on `surface.heading-uniqueness.validate` (different rule, different check logic). TypeScript types are minimal. Alternatives section explains why extending existing validators was insufficient. Scope discipline is tight: `packagesImpacted: [werkstatt-site]`, `appsImpacted: []`.

## Axis G — Blind spots

**Finding G-1: Scan scope not explicit.** The RFC says "scans rendered HTML in `dist/client/` for elements with `aria-label`" but does not clarify whether it scans ALL `.html` files or only surface pages (following `surface.heading-uniqueness.validate`, which filters by `surfaceRoutePaths` from the surface artifact). WCAG 2.5.3 applies to all pages, so scanning all HTML may be intentional — but the RFC should state this explicitly and address whether non-surface HTML pages (404, special pages) are in scope.

**Finding G-2: Migration impact unquantified.** The RFC says "Grace period: None. WCAG 2.5.3 is a Level A requirement. `error` from day one." but does not estimate how many existing violations are on `warpgogol.com` or other sites. The Context section identifies one violation (the CTA link), but if there are more, `error` from day one will block builds immediately after merge. The RFC should either (a) quantify the expected violation count on `warpgogol.com` or (b) acknowledge that the first `mission.validate` after merge will fail until all mismatches are fixed, and that this is intentional.

**Finding G-3: Performance cost not estimated.** The RFC does not specify the cost of scanning all `dist/client/**/*.html` files for elements with `aria-label`. `surface.heading-uniqueness.validate` scans the same files but only checks surface pages. If this validator scans ALL HTML, the cost is higher. Should estimate file count and scan time (e.g., "~N HTML files, <1s per site").

## Questions for the author

1. Should the validator scan all HTML in `dist/client/` or only surface pages (following `surface.heading-uniqueness.validate`'s surface artifact filtering)? If all HTML, how many non-surface HTML pages exist on `warpgogol.com`?
2. How many `aria-label`/visible-text mismatches currently exist on `warpgogol.com` beyond the one CTA link identified in Context? If >5, is "no grace period" still the right call, or should there be a single-cycle fix window?
3. Which AGENTS.md file(s) should be updated with the label-in-name contract — root, `packages/werkstatt-site`, or both?
