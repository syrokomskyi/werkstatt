---
rfcId: RFC-0835
auditId: AUDIT-RFC-0835-01
date: 2026-08-14
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0835

## Verdict: Needs revision

The RFC is well-structured and correctly scoped — a contract-kind RFC that adds regression tests for two already-applied fixes (ADR-0045, ADR-0046) without changing validator behavior. Two findings on Axis A and Axis G relate to misleading setup guidance for Test 1: the RFC references an "existing pattern in `lighthouse.test.ts`" that does not support testing `runLighthouseBudgetCheck` (which requires `KernelRuntimeContext`), and the `dist/` scanning scope is broader than described.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0835 --json` returned `status: pass`, zero violations, zero markers.

## Axis A — Structural completeness

**Finding A-1 (Risks section misleading for Test 1):** The Risks section says "Follow the existing pattern in `lighthouse.test.ts` for setting up the app directory." However, the existing `lighthouse.test.ts` only tests exported helper functions directly (`detectForcedReflow`, `detectRenderBlockingCss`, `buildJsReferenceGraph`) using `tmpRoot` and `distClientDir` — it never calls `runLighthouseBudgetCheck` and does not import `makeTestSiteContext` from `./helpers.ts`. Test 1 requires calling `runLighthouseBudgetCheck`, which calls `requireAstroSitePaths(context)` and needs a `KernelRuntimeContext` with `context.site.directory`. The correct pattern to reference is the one in `image-delivery.test.ts` (`makeTestSiteContext` + `appDir` setup), not `lighthouse.test.ts`.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-67]` is a real invariant (line 283 of `docs/architecture-dna.md`). The RFC body's "Architectural fit" section explains the relationship: "Regression tests ensure the pre-deploy Lighthouse parity gate remains correct over time." This is a valid enforcement/protective connection, not decorative.

## Axis C — Ecosystem fit

No issues. Tests go in `packages/werkstatt-site/src/checks/tests/` — the correct location per package boundaries. No new commands, no pipeline changes, no AGENTS.md updates, no Compass sync needed. `commands.added/changed/removed` are all empty — correct for a test-only RFC. `packagesImpacted: [packages/werkstatt-site]` is accurate.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual-paths, no deprecation. The RFC adds tests only.

## Axis E — Agent-facing policy

No issues. Status is `draft` with no self-authorizing language. Implementation notes reference RFC-0224 (accepted→implemented transition), RFC-0330 (verification evidence), and RFC-0334 (supersede escalation) — all correct governance rules. No `NEEDS CLARIFICATION` markers found. No storage or persistence changes.

## Axis F — Pragmatism

No issues. No new commands proposed — correct for a test-only RFC. Tests extend existing test files rather than creating new ones. The "Alternatives considered" section honestly rejects a separate test file and integration testing with valid reasons. `nonGoals` are explicit: "Do not change validator behavior" and "Do not add tests for the component-level WCAG 2.5.3 validator (that is RFC-0834)."

## Axis G — Blind spots

**Finding G-1 (Test 1 setup scope incomplete):** The Test 1 setup says "Create a temp `dist/client/`" with files inside `dist/client/_astro/`. However, `runLighthouseBudgetCheck` scans the entire `dist/` directory (not just `dist/client/`) for JS files via `collectFilesByExtension(distDir, [".js", ".mjs"])` where `distDir = join(paths.appDirectory, "dist")`. The `buildJsReferenceGraph` call uses `distClientDir = join(distDir, "client")` for HTML files. The test will work as described, but the implementer should be aware that `collectFilesByExtension` scans `dist/` broadly — any JS files outside `dist/client/_astro/` (e.g. in `dist/server/`) are also scanned but excluded from the LH-10 check via `isClientBundle` filter. The setup description should mention that the `appDir` structure needs `dist/client/_astro/` for the JS bundles and `dist/client/index.html` for the HTML reference.

## Questions for the author

1. Test 1 calls `runLighthouseBudgetCheck` which requires `KernelRuntimeContext` via `makeTestSiteContext` (the `image-delivery.test.ts` pattern), not the helper-direct pattern used by existing tests in `lighthouse.test.ts`. Should the Risks section reference the correct pattern?
2. The `runLighthouseBudgetCheck` function also runs LH-10 and LH-11 checks in addition to LH-12. Test 1's setup creates JS files and HTML — will LH-10 or LH-11 produce unexpected findings that interfere with the LH-12 assertions? Should the test assert only on LH-12 findings (filtering by rule), or should the setup ensure LH-10/LH-11 produce zero findings?
