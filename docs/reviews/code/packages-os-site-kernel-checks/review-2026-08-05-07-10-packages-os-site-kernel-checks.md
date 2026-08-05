---
reviewId: REVIEW-CODE-2026-08-05-01
date: 2026-08-05
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: 373bf604...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/surface-heading-uniqueness.ts
  - packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts
  - packages/os/site-kernel-checks/src/command-tables/09b-build-artifacts-part2.ts
  - packages/os/site-kernel-checks/src/pipelines/sites-check-postbuild.ts
  - packages/os/site-kernel-checks/src/tests/surface-heading-uniqueness.test.ts
  - packages/os/site-kernel-checks/AGENTS.md
  - docs/rfcs/rfc-0690-add-build-time-duplicate-section-heading-check-for-surface-pages.md
  - docs/command-manifest.generated.yaml
  - docs/COMMANDS.md
---

# Code Review: 373bf604...HEAD (RFC-0690 implementation)

### Verdict: Approved

Implementation correctly follows existing surface validator patterns (surface-media-leakage-validate.ts), uses canonical helpers (collectFiles from @warpgogol/share/fs, diagnosticsResult from result-helpers.ts, ARTIFACT_FILE from surface/shared.ts), registers the diagnostic rule in the correct domain module, and wires the command into the correct pipeline. One self-identified issue (local collectHtmlFiles walker) was fixed during the review session before this report was written.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel-checks run build:check` passes, `vitest run src/tests/surface-heading-uniqueness.test.ts` (17 tests) passes, `rfc.validate --id RFC-0690` passes.

### Axis A — Structural correctness

No issues. Strict typing throughout — parse5 tree nodes are typed via `DefaultTreeAdapterMap`, type guards (`isElementNode`, `hasChildNodes`, `isTextNode`) are used instead of `any` casts. No magic numbers. Error handling follows the established try/catch-per-file pattern. No dead code. The `extractSectionHeadings` pure helper is exported for unit testing, keeping the handler thin.

### Axis B — DNA alignment

No issues. The diff does not touch any DNA invariant's scope. The command is a read-only validator in `packages/os/site-kernel-checks` — it does not modify content, routes, or manifests. DNA-1 (monorepo boundary) respected: no cross-site imports. DNA-6 (kebab-case filenames) respected: `surface-heading-uniqueness.ts`.

### Axis C — Ecosystem fit

No issues. Package boundaries correct — imports flow from `@warpgogol/share/fs`, `@warpgogol/site-kernel`, `@warpgogol/surface`, all valid package-to-package dependencies. Pipeline placement correct — added to `SITES_CHECK_POSTBUILD_PIPELINE` after `surface.media-leakage.validate`, which is spread into `SITES_BUILD_POST_PIPELINE`. Command registered in the correct command table (`09b-build-artifacts-part2.ts`) alongside other surface validators. AGENTS.md module table updated. Command manifest and COMMANDS.md regenerated.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy code retained. The command is new — there is nothing to deprecate.

### Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding present on the new file. Comments reference real files (`surface-media-leakage-validate.ts`, `strip-html-generated-marker.ts`, `bake-helpers.ts`). Variable names are descriptive (`headingCounts`, `surfaceRoutePaths`, `normalized`). The `fixHint` in diagnostics points agents to `SURFACE_LABELS in bake-helpers.ts` — the actual root cause location.

### Axis F — Pragmatism

No issues. The command earns its existence — it catches a real class of bugs (bake function label reuse) that was previously only caught 10 minutes later at the Axiom gate. The implementation reuses `collectFiles` from `@warpgogol/share/fs` rather than duplicating a walker. The `extractSectionHeadings` helper is minimal and testable. Scope is tight — only surface pages are checked, not all dist HTML.

### Axis G — Blind spots

No issues. Performance is addressed in the RFC (~150 files, ~2-3 seconds with parse5). False positives are mitigated by only checking the first h2/h3 descendant of section elements on surface pages (identified by surface artifact). Edge cases are tested: sections without headings, empty HTML, nested sections, whitespace normalization, case normalization. The no-op pass when dist/client or surface artifact is missing handles empty states.

### Spec compliance

| Requirement from RFC-0690 | Status | Evidence |
| --- | --- | --- |
| Register HEADING-UNIQ-01 diagnostic rule | Done | content-surface.ts:541-546 |
| Implement surface.heading-uniqueness.validate handler | Done | surface-heading-uniqueness.ts:151-230 |
| Use parse5 for HTML parsing | Done | surface-heading-uniqueness.ts:27, 127 |
| Use surface artifact for route identification | Done | surface-heading-uniqueness.ts:172-185 |
| Register command in build-artifacts command table | Done | 09b-build-artifacts-part2.ts:176-185 |
| Add to SITES_CHECK_POSTBUILD_PIPELINE | Done | sites-check-postbuild.ts:74-75 |
| Emit Diagnostic[] via diagnosticsResult | Done | surface-heading-uniqueness.ts:232 |
| No-op pass when no surface artifact | Done | surface-heading-uniqueness.ts:166-170 |
| No-op pass when no dist/client | Done | surface-heading-uniqueness.ts:202-206 |
| Unit tests with pass and fail fixtures | Done | surface-heading-uniqueness.test.ts (17 tests) |
| Update AGENTS.md module table | Done | AGENTS.md:36 |
| Move command to commands.added | Done | RFC frontmatter line 44-45 |
| Regenerate command manifest | Done | command.manifest.generate wrote 1259 commands |

### Questions for the author

None — the implementation is complete and follows established patterns.
