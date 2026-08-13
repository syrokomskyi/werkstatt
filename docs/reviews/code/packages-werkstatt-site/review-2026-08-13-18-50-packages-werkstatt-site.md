---
reviewId: REVIEW-CODE-2026-08-13-01
date: 2026-08-13
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 676c62f2...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/csp-origins.ts
  - packages/werkstatt-site/src/checks/command-tables/31-public-surface.ts
  - packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts
  - packages/werkstatt-site/src/checks/tests/csp-origins.test.ts
  - packages/werkstatt-site/AGENTS.md
  - docs/rfcs/rfc-0831-add-csp-origins-validate-for-csp-to-script-origin-cross-validation.md
  - docs/command-manifest.generated.yaml
  - docs/COMMANDS.md
---

# Code Review: 676c62f2...HEAD (RFC-0831 csp.origins.validate)

### Verdict: Needs revision

The implementation is structurally sound and follows existing patterns (image-delivery.ts, security.ts). Two findings require attention: a duplicated DOM traversal pattern that should reuse existing helpers, and a missing `reads` scope for `dist/client/` in the command table that is declared in the RFC but not reflected in the module contract.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site run build:check` (tsc --noEmit) passes with zero errors. `pnpm --filter @warpgogol/werkstatt-site run test` passes (2451 tests, including 18 new csp-origins tests). `rfc.validate --id RFC-0831` passes with zero errors.

### Axis A — Structural correctness

1. **Duplicated DOM traversal pattern** — `csp-origins.ts` re-implements `isElementNode`, `hasChildNodes`, `getAttr`, and the `walk()` traversal pattern that already exists in `image-delivery.ts:83-219`. The `ElementNode` interface is also duplicated. Consider extracting these into a shared DOM utility module (e.g. `checks/dom-helpers.ts`) and importing from both `image-delivery.ts` and `csp-origins.ts`. This is a Fowler "Duplicated Code" smell.

2. **`getTextContent` is untyped for text nodes** — `csp-origins.ts:210` accesses `(child as { value?: string }).value` without checking `child.nodeName === "#text"`. While parse5 always uses `nodeName: "#text"` for text nodes, the cast bypasses the type system. A typed `TextNode` interface or a `isTextNode` guard would be safer.

### Axis B — DNA alignment

No issues. No DNA invariants are directly touched by this diff. The RFC correctly removed the decorative `DNA-57` reference during enhance.

### Axis C — Ecosystem fit

1. **`reads` field includes `dist/client/**/*.html`** — The command table entry at `31-public-surface.ts:361` declares `reads: ["<app>/public/_headers", "<app>/dist/client/**/*.html"]`. This matches the RFC spec. However, `image.delivery.validate` (the analogous post-build HTML scanner at `09-build-artifacts.ts:127-130`) declares `reads` with `"<app>/dist/client/**/*.html"` AND `"<app>/dist/client/**/*.{webp,png,jpeg,jpg}"`. The pattern is consistent. No issue.

2. **Pipeline placement** — `csp.origins.validate` is placed after `image.delivery.validate` in `SITES_CHECK_POSTBUILD_PIPELINE`, which is correct — it needs rendered HTML from `dist/client/` and reads `public/_headers`. The ordering after `cloudflare.assets.validate` ensures asset references are validated first. No issue.

3. **AGENTS.md updated** — `packages/werkstatt-site/AGENTS.md:76` now documents `csp.origins.validate` with rule IDs, severities, and pipeline placement. No issue.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no legacy paths, no dual-path logic. The implementation is forward-only.

### Axis E — Agent-facing clarity

1. **Compass scaffolding present** — Both `csp-origins.ts` and `csp-origins.test.ts` carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. No issue.

2. **`resolveSiteOrigin` uses `loadSystemManifest` directly** — `csp-origins.ts:321-333` loads the system manifest to extract the site origin for `'self'` matching. This duplicates logic from `loadPublicContext` in `public-surface/shared.ts:156-222`, which already extracts `domain` and `siteUrl`. Consider using `loadPublicContext` instead, which would also provide `siteUrl` directly as `app.siteUrl`. This would reduce the code and align with the pattern used by `runHeadersSecurityValidate`.

### Axis F — Pragmatism

1. **`resolveSiteOrigin` vs `loadPublicContext`** — As noted in Axis E, the `resolveSiteOrigin` function partially reimplements `loadPublicContext` from `shared.ts`. Using `loadPublicContext` would eliminate 12 lines of code and align with the established pattern. This is a minimality ladder issue — a higher rung (reuse existing context loader) was available but skipped.

### Axis G — Blind spots

1. **Performance note** — The validator scans all `.html` files in `dist/client/` with parse5, then regex-scans inline scripts. For a site with 500+ pages, this is O(pages × elements_per_page). The RFC mentions a performance note but the implementation does not log timing or page count. Consider adding a summary log with `checkedOrigins` and file count (already present in the result shape — `checkedOrigins` field). No blocking issue — the result shape already carries this data.

2. **Empty state** — Handled: missing `_headers` → skip, missing `dist/client/` → skip, empty `dist/client/` → skip, CSP not found → skip. All tested. No issue.

3. **Deduplication** — `seenGaps` Set prevents duplicate findings for the same origin across multiple files. Tested. No issue.

### Spec compliance

| Requirement from RFC-0831 | Status | Evidence |
| --- | --- | --- |
| `csp.origins.validate` command registered | Done | `31-public-surface.ts:354-364` |
| CSP-ORIGIN-01..04 rules with correct severity | Done | `csp-origins.ts:340-345` |
| CSP parser handles 'self', exact, wildcard, 'none' | Done | `csp-origins.ts:91-167` |
| Origin extraction covers script, style, image, connect | Done | `csp-origins.ts:170-317` |
| Integrated into SITES_CHECK_POSTBUILD_PIPELINE | Done | `sites-check-postbuild.ts:59-61` |
| --json output format documented and stable | Done | RFC `docs/rfcs/rfc-0831-*.md:185-218` |
| Unit tests for CSP parsing and origin matching | Done | `csp-origins.test.ts:68-130` |
| Unit tests with fixture HTML | Done | `csp-origins.test.ts:132-227` |
| AGENTS.md updated | Done | `packages/werkstatt-site/AGENTS.md:76` |
| rfc.validate passes | Done | zero errors |

### Questions for the author

1. Why was `resolveSiteOrigin` implemented as a separate function rather than reusing `loadPublicContext` from `public-surface/shared.ts`, which already extracts `siteUrl`? Is there a specific reason to avoid the full context load?
2. The `ElementNode` interface and DOM traversal helpers (`isElementNode`, `hasChildNodes`, `getAttr`, `walk`) are duplicated between `csp-origins.ts` and `image-delivery.ts`. Should these be extracted into a shared `checks/dom-helpers.ts` module to prevent future divergence?
3. The `getTextContent` function casts to `{ value?: string }` without a `isTextNode` guard. Is this safe enough for parse5's default tree adapter, or should it use a proper type guard?
