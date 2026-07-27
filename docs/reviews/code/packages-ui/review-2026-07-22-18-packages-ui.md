---
reviewId: REVIEW-CODE-2026-07-22-01
date: 2026-07-22
reviewer:
  skill: fo-review
  model: Cascade
verdict: approved
diffRange: 0a5354bbb...HEAD
filesReviewed:
  - packages/ui/src/components/layout/layout-component.astro
  - docs/rfcs/rfc-0485-remove-stale-font-preload-path.md
---

# Code Review: 0a5354bbb...HEAD (RFC-0485)

### Verdict: Approved

The diff is a minimal, forward-only removal of a stale `<link rel="preload">` tag that caused a 404 for `/fonts/inter-400.woff2`. The tag was left behind when RFC-0371 migrated fonts to Fontsource CSS imports with Vite-bundled `/_astro/*.woff2` assets. No new code, no shims, no compatibility layers — pure deletion with accurate Compass markup updates.

### Mechanical floor

Pass — `pnpm --filter @gogol/ui run build:check` (tsc --noEmit) exits 0. `rfc.validate RFC-0485 --json` status: pass.

### Axis A — Structural correctness

No issues. The diff removes 7 lines and adds 2 (CHANGE_SUMMARY entry + MODULE_CONTRACT fix). No new abstractions, no dead code introduced. The `globalStylesheetUrl` preload (line 131) is correctly left untouched — it is a separate, valid preload for the CSS stylesheet.

### Axis B — DNA alignment

No issues. No DNA invariants are touched by this removal. The `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding (DNA-42) is correctly updated with the RFC-0485 entry. The `MODULE_CONTRACT` purpose text is updated to remove the stale "Google Fonts" reference, reflecting the current Fontsource-based font pipeline (RFC-0371).

### Axis C — Ecosystem fit

No issues. The removal aligns with RFC-0371's Fontsource CSS import model — `@font-face` declarations in `fonts.imports.css` (imported via `global.css`) are the canonical font loading mechanism. No package boundaries, pipelines, or command lifecycles are affected.

### Axis D — Forward-only compliance

No issues. The stale preload link is deleted, not maintained behind a flag. The RFC-0164 comment block referencing the old `fonts.generated.css` pipeline is also removed. No dual-path or compatibility shim.

### Axis E — Agent-facing clarity

No issues. The `CHANGE_SUMMARY` entry is clear: "RFC-0485: remove stale font preload for /fonts/inter-400.woff2 (404 fix)." The `MODULE_CONTRACT` purpose text is updated to remove the inaccurate "Google Fonts" reference. No ungrounded assertions.

### Axis F — Pragmatism

No issues. The diff touches only what is necessary — one `<link>` tag, one comment block, two Compass markup updates. No scope creep.

### Axis G — Blind spots

No issues. The RFC's Risks section documents the negligible font paint delay. No performance, false-positive, edge case, or security concerns for a removal of a dead preload link.

### Spec compliance

| Requirement from RFC-0485 | Status | Evidence |
| --- | --- | --- |
| Remove `<link rel="preload" href="/fonts/inter-400.woff2">` | Done | layout-component.astro, preload link deleted |
| Remove accompanying RFC-0164 comment block | Done | layout-component.astro, comment block deleted |
| Update CHANGE_SUMMARY | Done | layout-component.astro:19, RFC-0485 entry added |
| No replacement preload | Done | No new preload tag added |
| build:check passes | Done | tsc --noEmit exit 0 |

### Questions for the author

No questions — the diff is clean and complete.
