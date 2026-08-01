---
reviewId: REVIEW-CODE-2026-08-01-01
date: 2026-08-01
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 264b702...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/public-surface/icons.ts
  - packages/os/site-kernel-checks/src/tests/icons-source-svg.test.ts
  - packages/os/site-kernel-checks/src/command-tables/31-public-surface.ts
  - docs/authoring/site-composition.md
  - docs/rfcs/rfc-0632-auto-wrap-maskable-icons-with-android-safe-zone-when-no-explicit-maskable-source.md
---

# Code Review: 264b702...HEAD (RFC-0632 implementation)

### Verdict: Needs revision

One minor finding on Axis G — the regex-based rect matcher does not handle non-self-closing `<rect>` tags, which could leave orphaned `</rect>` in the wrapped output. The implementation is otherwise clean, well-typed, and aligned with the RFC and DNA invariants.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` and `vitest run src/tests/icons-source-svg.test.ts` (17 tests) both pass. `rfc.validate --id RFC-0632` passes with 0 warnings.

### Axis A — Structural correctness

No issues. `wrapMaskableSvg` is a pure function with clear typing. No `any` types, no dead code, no magic numbers. The regexes are named constants with clear purposes. Error handling is appropriate — fallback to original SVG when parse fails, fallback to `#ffffff` when no background rect is found. `resolveIconSvg` is simplified (fewer branches than before).

### Axis B — DNA alignment

No issues. DNA-4 (Canonical content in `src/content/`) — the change keeps the favicon source in `src/content/favicon.svg` and derives the maskable variant automatically. No conflict with any other DNA invariant.

### Axis C — Ecosystem fit

No issues. `icons.ts` is in the correct package (`packages/os/site-kernel-checks/src/public-surface/`). Command-tables `reads` fields are updated to remove `favicon-maskable.svg`. `public.icons.validate` is part of `build.check`; ICON-SRC-04 (warning) surfaces there without failing the build. `docs/authoring/site-composition.md` is updated. The DOMParser rule in `packages/os/site-kernel-checks/AGENTS.md` already covers the relevant constraint.

### Axis D — Forward-only compliance

No issues. `favicon-maskable.svg` support is completely removed — no dual path, no flag, no grace period. `ICON-SRC-03` is removed and replaced by `ICON-SRC-04`. The old `resolveIconSvg` maskable branch (reading `favicon-maskable.svg`) is deleted, not maintained behind a flag.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` are updated in both `icons.ts` and `icons-source-svg.test.ts`. `wrapMaskableSvg` is a descriptive name. No ungrounded assertions. The RFC-0632 reference in `CHANGE_SUMMARY` provides traceability.

### Axis F — Pragmatism

No issues. `wrapMaskableSvg` is a minimal pure function — no over-engineering. No new commands. `resolveIconSvg` is simplified (one `readTextIfExists` call instead of two). The change touches only what's necessary.

### Axis G — Blind spots

**Finding G1 (minor):** `RECT_RE` (`/<rect\b[^>]*>/gi`) matches the opening tag of `<rect>` elements, including self-closing tags (`<rect .../>`). However, for non-self-closing rects (`<rect ...></rect>`), it matches only the opening tag (`<rect ...>`), leaving the closing `</rect>` behind when `innerContent.replace(rect, "")` is called. This would produce an orphaned `</rect>` inside the wrapped `<g>`, creating invalid SVG output. In practice, SVG `<rect>` elements are almost always self-closing, and the RFC documents regex-based parsing limitations. The ICON-SRC-04 warning prompts visual verification. Consider adding a comment noting this limitation or handling the non-self-closing case.

### Spec compliance

| Requirement from RFC-0632 | Status | Evidence |
| --- | --- | --- |
| `wrapMaskableSvg` helper with 80% safe-zone | Done | `icons.ts:168-194` |
| `resolveIconSvg` auto-wraps from `favicon.svg` | Done | `icons.ts:196-207` |
| ICON-SRC-04 warning diagnostic | Done | `icons.ts:394-407` |
| ICON-SRC-03 removed | Done | `icons.ts:386-407` — no ICON-SRC-03 reference |
| `favicon-maskable.svg` no longer read | Done | `icons.ts:196-207`, command-tables `reads` updated |
| `buildIconSvg` fallback preserved | Done | `icons.ts:201-206` |
| `docs/authoring/site-composition.md` updated | Done | `site-composition.md:455-459` |
| Tests updated | Done | `icons-source-svg.test.ts:182-271` — 17 tests pass |

### Questions for the author

1. Should `wrapMaskableSvg` handle non-self-closing `<rect>` tags (e.g., `<rect width="512" height="512"></rect>`), or is this an acceptable limitation of regex-based parsing given the RFC's documented constraints?
