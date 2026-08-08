---
rfcId: RFC-0765
auditId: AUDIT-RFC-0765-01
date: 2026-08-08
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0765

## Verdict: Needs revision

Three findings: two V-19 warnings (amendedBy bidirectional links missing on archived RFCs), one ecosystem-fit issue (existing AGENTS.md sections that overlap with the proposed new section are not addressed). All are fixable during enhance without changing the RFC's core decision.

## Mechanical validation (rfc.validate)

Pass with 2 V-19 warnings:

- `RFC-0765.amends` includes `RFC-0529`, but `RFC-0529.amendedBy` does not include `RFC-0765`.
- `RFC-0765.amends` includes `RFC-0723`, but `RFC-0723.amendedBy` does not include `RFC-0765`.

Both amended RFCs are in `docs/rfcs/archive/implemented/`. The `amendedBy` arrays need to be updated on the archived files.

## Axis A — Structural completeness

No issues. The RFC is a documentation-only policy RFC with all required sections. Decision is clear and present-tense. File system responsibilities table names concrete paths. Alternatives section has 4 real alternatives with rejection reasons. Acceptance criteria are checkable. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. DNA-4 (canonical content in `src/content/`) is correctly referenced — all three syntaxes resolve values from `src/content/`. DNA-24 (block-declarative pages) is correctly referenced — page block props use both `=(...)` and `{price:...}` in frontmatter. No new DNA invariant is established.

## Axis C — Ecosystem fit

**Finding C-1:** Root `AGENTS.md` already has a section titled "Content references in mixed strings (RFC-0723)" at line 599. The RFC proposes adding a new "Content syntax reference" section but does not specify whether this new section replaces, supplements, or is placed adjacent to the existing RFC-0723 section. If supplementing, the RFC should specify the placement (e.g. "after the existing RFC-0723 section at line 599"). Without this, the implementing agent may create a duplicate or contradictory section.

**Finding C-2:** `packages/ui/AGENTS.md` already has a "Dynamic pricing in UI components" section (lines 382-388) that partially documents price markers — it mentions `parsePriceMarkers`, `derived-prices.generated.json`, and the distinction from content references. The RFC proposes adding a new "Price marker syntax" entry but does not specify whether it replaces or supplements the existing section. The existing section already states "Price markers `{price:offering-id:chargeRef}` are distinct from content references" which overlaps with the RFC's proposed entry.

## Axis D — Forward-only compliance

No issues. The RFC amends RFC-0529 and RFC-0723 by clarifying scope (price markers are not content references), not by adding parallel interpretations. No compatibility shim, no dual-path.

## Axis E — Agent-facing policy

No issues. Status gate is correct — "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes reference correct governance rules. No NEEDS CLARIFICATION markers. No storage or persistence concerns.

## Axis F — Pragmatism

No issues. Documentation-only RFC with minimal scope. No commands proposed. No speculative types. `packagesImpacted` correctly lists only `@warpgogol/ui`. `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

No issues. The RFC considers documentation drift (mitigation: RFC ID references). No performance, false-positive, or security concerns for a documentation-only change.

## Questions for the author

1. Should the new "Content syntax reference" section in root `AGENTS.md` replace the existing "Content references in mixed strings (RFC-0723)" section at line 599, or be placed adjacent to it? If adjacent, before or after?
2. Should the new price marker entry in `packages/ui/AGENTS.md` replace the existing "Dynamic pricing in UI components" section (lines 382-388), or be merged into it?
3. The V-19 warnings require adding `RFC-0765` to the `amendedBy` arrays of `RFC-0529` and `RFC-0723` (both archived). Should this be done during enhance or during implementation?
