---
reviewId: REVIEW-CODE-2026-08-13-01
date: 2026-08-13
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: daa8ffc6...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/image-delivery.ts
  - packages/werkstatt-site/src/checks/command-tables/09-build-artifacts.ts
  - packages/werkstatt-site/src/checks/pipelines/sites-check-postbuild.ts
  - packages/werkstatt-site/src/checks/tests/image-delivery.test.ts
  - packages/werkstatt-site/AGENTS.md
  - docs/COMMANDS.md
  - docs/rfcs/rfc-0830-add-image-delivery-validate-for-responsive-srcset-and-compression-enforcement.md
---

# Code Review: daa8ffc6...HEAD (RFC-0830 image.delivery.validate)

### Verdict: Needs revision

The implementation is architecturally sound — correct pipeline placement, proper command registration, comprehensive test coverage, and clean separation of concerns. Three minor findings: `any` types bypass type safety for parse5 tree nodes, the `reads` metadata is too narrow for the actual file access pattern, and a cosmetic bracket inconsistency in MODULE_CONTRACT.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site run build:check` and `pnpm --filter @warpgogol/werkstatt-site run test` both pass (2410 tests, 0 failures).

### Axis A — Structural correctness

- **`any` types for parse5 tree nodes** — `image-delivery.ts:37-39` uses `type TreeNode = any`, `type TreeParentNode = any`, `type TreeElementNode = any` with an `eslint-disable` comment. The reference file `strip-html-generated-marker.ts` successfully uses `DefaultTreeAdapterMap["node"]` and `DefaultTreeAdapterMap["parentNode"]`. The root cause is that `DefaultTreeAdapterMap` has no `"elementNode"` key (it uses `"element"`), and the parse5 `Element` type conflicts with the DOM lib's global `Element` type. A better approach: use `DefaultTreeAdapterMap["node"]` for the base type and a local `ElementNode` interface with a type guard that narrows from `DefaultTreeAdapterMap["node"]`, avoiding the DOM lib conflict by not using the global `Element` name.

### Axis B — DNA alignment

No issues. No DNA invariant changes. Compass scaffolding (MODULE_CONTRACT, CHANGE_SUMMARY) present on new files.

### Axis C — Ecosystem fit

No issues. Pipeline placement is correct — after `cloudflare.assets.validate` (needs dist/client assets confirmed) and before `dist.generated-marker.validate`. Command registered in the correct table (`09-build-artifacts.ts`). AGENTS.md and COMMANDS.md updated. Command manifest regenerated.

### Axis D — Forward-only compliance

No issues. New command, no legacy paths, no compatibility shims.

### Axis E — Agent-facing clarity

- **`[RFC-0830]` brackets in MODULE_CONTRACT** — `image-delivery.ts:4` uses `[RFC-0830]` in the purpose text, while the convention in other files (e.g. `strip-html-generated-marker.ts:4`, `image-format.ts`) uses `RFC-XXXX:` without brackets. Minor inconsistency.

### Axis F — Pragmatism

- **`reads` field too narrow** — `09-build-artifacts.ts:127-129` declares `reads: ["<app>/dist/client/**/*.html", "<app>/dist/client/_img/**/*.webp", "<app>/src/image-delivery.config.yaml"]`. However, `resolveSrcToFile` in `image-delivery.ts:222-229` resolves any `src` attribute to a file path in `distDir`, meaning it can read images from any subdirectory and any format (PNG, JPEG, WebP). The `reads` field should be `<app>/dist/client/**/*.{webp,png,jpeg,jpg}` to match the actual file access pattern. The `_img/**/*.webp` pattern misses PNG and JPEG files that the validator can encounter.

### Axis G — Blind spots

No issues. Performance cost documented in RFC risks (~2-5s per site). False positives mitigated by escape hatch. Edge cases handled: skip-on-missing-dist, SVG exceptions, small icon exceptions, lazy image exceptions. Migration path documented in RFC rollout section.

### Spec compliance

| Requirement from RFC-0830 | Status | Evidence |
| --- | --- | --- |
| `image.delivery.validate` command registered | Done | `09-build-artifacts.ts:118-133` |
| IMG-DELIVERY-01 (srcset) | Done | `image-delivery.ts:283-304` |
| IMG-DELIVERY-02 (compression budget) | Done | `image-delivery.ts:307-365` |
| IMG-DELIVERY-04 (LCP attributes) | Done | `image-delivery.ts:367-394` |
| `image-delivery.config.yaml` escape hatch | Done | `image-delivery.ts:106-196` |
| Pipeline integration | Done | `sites-check-postbuild.ts:57-58` |
| Unit tests | Done | `image-delivery.test.ts` (15 tests) |
| `--json` output | Done | `image-delivery.ts:65-70`, tested |
| AGENTS.md updated | Done | `packages/werkstatt-site/AGENTS.md:75` |
| warpgogol.com site fix | Deferred | Follow-up RFC |

### Questions for the author

1. Can the `any` types be replaced with `DefaultTreeAdapterMap["node"]` + a local `ElementNode` interface that avoids the DOM lib `Element` conflict?
2. Should the `reads` field be broadened to `dist/client/**/*.{webp,png,jpeg,jpg}` to match the actual file access pattern in `resolveSrcToFile`?
3. The `warpgogol.com` acceptance criterion is deferred — when will the follow-up RFC be created?
