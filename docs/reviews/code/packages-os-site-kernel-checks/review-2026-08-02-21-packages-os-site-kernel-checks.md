---
reviewId: REVIEW-CODE-2026-08-02-01
date: 2026-08-02
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: baaa142b...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/strip-html-generated-marker.ts
  - packages/os/site-kernel-checks/src/dist-generated-marker.ts
  - packages/os/site-kernel-checks/src/tests/strip-html-generated-marker.test.ts
  - packages/os/site-kernel-checks/package.json
---

# Code Review: baaa142b...HEAD (ADR-0018 implementation)

## Verdict: Needs revision

Three findings: untyped `any` for parse5 tree nodes, unhandled `parse()` throw on malformed HTML, and unused `sourceCodeLocationInfo` option adding memory overhead.

## Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` and `pnpm --filter @warpgogol/site-kernel-checks run test` (749 tests, 120 files) both pass.

## Axis A — Structural correctness

1. **`node: any` in `removeMarkerComments`** — `@/packages/os/site-kernel-checks/src/strip-html-generated-marker.ts:53`. The `node` parameter is typed `any`, bypassing TypeScript strict checking. parse5 exports `DefaultTreeAdapterMap` and `TreeAdapterTypeMap` for typed tree traversal. Use `import type { DefaultTreeNode } from "parse5"` and type the parameter accordingly, or at minimum use `TreeChild` from parse5's exported types.

2. **Unhandled `parse()` throw** — `@/packages/os/site-kernel-checks/src/strip-html-generated-marker.ts:49`. `parse5.parse()` can throw on malformed HTML. The caller in `dist-generated-marker.ts:86-88` does not wrap the `stripHtmlGeneratedMarker(content)` call in try/catch. The original regex-based `stripGeneratedMarker` cannot throw. If a malformed HTML file reaches dist/client, the entire `dist.generated-marker.strip` command will crash with an unhandled exception, breaking the build pipeline. Add a try/catch in `stripHtmlGeneratedMarker` that returns `{ changed: false, content }` on parse failure (or in the caller that logs a warning and continues).

## Axis B — DNA alignment

No issues. DNA-1 (Monorepo boundary) is respected — `parse5` is added to `site-kernel-checks` (not framework-free), not to `site-kernel` (framework-free). The ADR explicitly cites DNA-1 as related.

## Axis C — Ecosystem fit

No issues. Package boundaries are correct (`site-kernel-checks` imports from `site-kernel`). No new commands — existing `dist.generated-marker.strip` is modified internally. No AGENTS.md update needed for an internal utility.

## Axis D — Forward-only compliance

No issues. No dual code paths for the same file type — `.html` uses parse5, everything else uses regex. The regex-based `stripGeneratedMarker` in `site-kernel` is retained for legitimate non-HTML use cases (CSS, markdown, line-comments), not as a backward-compatibility shim.

## Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` present on both new files. ADR-0018 is referenced in source code (`strip-html-generated-marker.ts:4`, `dist-generated-marker.ts:16,84`). Variable and function names are clear.

## Axis F — Pragmatism

No issues. No new command — existing command extended. `isHtmlFile` helper is minimal. `stripHtmlGeneratedMarker` is lean and focused.

## Axis G — Blind spots

3. **Unused `sourceCodeLocationInfo: true`** — `@/packages/os/site-kernel-checks/src/strip-html-generated-marker.ts:49`. The `parse()` call passes `{ sourceCodeLocationInfo: true }` but the location info is never read. This adds memory overhead for every HTML file parsed (location objects on every node). Remove the option or set to `false` — the default is `false` in parse5.

## Spec compliance

| Requirement from ADR-0018 | Status | Evidence |
| --- | --- | --- |
| HTML comment stripping migrated to `site-kernel-checks` | Done | `strip-html-generated-marker.ts` created |
| Uses `parse5` for parser-based comment removal | Done | `import { parse, serialize } from "parse5"` |
| `dist.generated-marker.strip` calls new implementation for `.html` | Done | `dist-generated-marker.ts:86-88` |
| CSS comment stripping remains regex-based in `site-kernel` | Done | `stripGeneratedMarker` unchanged in `site-kernel` |
| `parse5` added as dependency of `site-kernel-checks` | Done | `package.json:94` |
| `site-kernel` remains framework-free (DNA-1) | Done | No `parse5` in `site-kernel/package.json` |

## Questions for the author

1. What happens when `parse5.parse()` encounters malformed HTML in dist/client? Should the command crash the build, or skip the file with a warning?
2. Can the `node: any` type be replaced with parse5's exported tree node types for stricter type safety?
3. Is `sourceCodeLocationInfo: true` intentionally included for future use, or is it unnecessary overhead?
