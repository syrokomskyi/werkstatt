---
reviewId: REVIEW-CODE-2026-08-20-01
date: 2026-08-20
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: approved
diffRange: fc8b3bcc...HEAD
filesReviewed:
  - packages/werkstatt-site/src/domain/ui/components/nachweis-detail/nachweis-detail-component.astro
  - packages/werkstatt-site/src/domain/ui/components/nachweis-detail/nachweis-detail-component.css
  - docs/adrs/adr-0057-nachweis-evidence-display-ui-design-decisions.md
---

# Code Review: fc8b3bcc...HEAD (ADR-0057 implementation)

### Verdict: Approved

The diff is minimal and correct: a caption text fix to match ADR-0057's design decision ("homepage capture with capture date") and two CHANGE_SUMMARY trace entries. No structural, DNA, ecosystem, or forward-only issues.

### Mechanical floor

Fail (pre-existing) — `pnpm --filter @warpgogol/werkstatt-site run build:check` reports 28 TypeScript errors in `packages/werkstatt/src/` (engine package), all about underscore-prefixed exports (`_schemaIdSchema`, `_CertificationStatus`, etc.). These are pre-existing errors in an unimpacted workspace — none are in the files touched by this diff. The `.astro` and `.css` files modified here are not type-checked by `tsc`.

### Axis A — Structural correctness

No issues. The change is a single string literal modification (`"Aufgenommen am {date}"` → `"Homepage-Aufnahme vom {date}"`) and two XML comment additions in CHANGE_SUMMARY blocks. No structural impact.

### Axis B — DNA alignment

No issues. No DNA invariants are touched by this change. The diff modifies a UI caption string and Compass scaffolding comments only.

### Axis C — Ecosystem fit

No issues. No package boundaries, pipelines, commands, or contracts are changed. The ADR-0057 trace entries in CHANGE_SUMMARY follow the existing pattern (RFC-XXXX entries already present).

### Axis D — Forward-only compliance

No issues. No legacy paths, compatibility shims, or dual-paths introduced. The old caption text is replaced, not preserved alongside the new one.

### Axis E — Agent-facing clarity

No issues. CHANGE_SUMMARY entries are properly formatted XML `<item>` elements with clear ADR-0057 references. The caption text is self-explanatory German prose matching the ADR's design decision.

### Axis F — Pragmatism

No issues. The change is minimal — a one-line caption text fix and two comment additions. No over-engineering or unnecessary abstractions.

### Axis G — Blind spots

No issues. No performance, security, privacy, or edge-case concerns for a caption text change.

### Spec compliance

| Requirement from ADR-0057 | Status | Evidence |
| --- | --- | --- |
| Screenshot caption identifies as homepage capture with capture date | Done | `nachweis-detail-component.astro:251-253` — `"Homepage-Aufnahme vom {captureDate}"` |
| ADR code-trace in affected files | Done | CHANGE_SUMMARY entries in both `.astro` and `.css` reference ADR-0057 |
| PDF section with `<object>` viewer | Done (pre-existing) | `nachweis-detail-component.astro:207-232` — implemented by RFC-0887 |
| Website screenshot with lazy/async/low priority | Done (pre-existing) | `nachweis-detail-component.astro:234-256` — implemented by RFC-0887 |
| Website link with noopener/noreferrer | Done (pre-existing) | `nachweis-detail-component.astro:258-272` — implemented by RFC-0887 |
| Section ordering: PDF → screenshot → link → sichtpass | Done (pre-existing) | Code order confirmed in template |
| Hidden elements leave no trace | Done (pre-existing) | Conditional rendering with no placeholders |

### Questions for the author

1. No questions — the diff is self-contained and complete.
