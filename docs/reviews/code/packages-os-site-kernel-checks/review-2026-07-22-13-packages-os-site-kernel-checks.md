---
reviewId: REVIEW-CODE-2026-07-22-01
date: 2026-07-22
reviewer:
  skill: fo-review
  model: unknown
verdict: approved
diffRange: c0b3261b4...HEAD
filesReviewed:
  - packages/os/site-kernel-checks/src/tests/compass-audit-isauditdue.test.ts
  - packages/os/site-kernel-checks/src/tests/sitemap-helpers.test.ts
  - packages/os/site-kernel-checks/src/tests/compass-audit-validate.test.ts
  - packages/os/site-kernel-checks/src/tests/schema-drift.test.ts
  - packages/os/site-kernel-checks/src/tests/need-markers.test.ts
  - packages/os/site-kernel-checks/src/tests/text-normalize.test.ts
  - packages/os/site-kernel-checks/src/tests/route-topology.test.ts
  - packages/os/site-kernel-checks/src/tests/visibility-expr.test.ts
  - packages/os/site-kernel-checks/src/tests/trust-rating.test.ts
  - packages/os/site-kernel-checks/src/tests/page-blocks-mirror.test.ts
---

# Code Review: c0b3261b4...HEAD (10 new test files, 1612 insertions)

### Verdict: Approved

The diff adds 71 tests across 10 new test files covering previously untested modules in `@warpgogol/site-kernel-checks`. All tests pass, typecheck is clean, and the tests follow existing repo conventions. Two minor findings are advisory — neither blocks merge.

### Mechanical floor

**Pass.** `tsc -p tsconfig.json --noEmit` exits 0. `vitest run` — 63 test files, 318 tests, all green (71 new tests in this diff).

### Axis A — Structural correctness

- **Duplicated Code (pre-existing, amplified).** The `logger` stub object and `makeSiteContext`/`makeContext` helper are copy-pasted across 6 new files (`schema-drift`, `need-markers`, `text-normalize`, `route-topology`, `visibility-expr`, `trust-rating`, `page-blocks-mirror`). This same pattern already exists in 30+ existing test files (e.g. `compass-audit-record.test.ts`, `pseo-governance.test.ts`, `diagnostic-shape-lint.test.ts`). No shared test helper (`src/tests/helpers.ts`) exists. The diff follows the established convention but amplifies the duplication. **Advisory:** extract `makeTestContext` and `testLogger` into a shared `src/tests/helpers.ts` in a follow-up — this is a repo-wide refactoring opportunity, not a blocker for this diff.
- **`as never` casts.** `logger: logger as never` and `io: {} as never` appear in all 8 fixture-based test files. This is the established test-only escape hatch for partial `KernelRuntimeContext` construction (same pattern in `compass-audit-record.test.ts`). Acceptable for tests.
- **`as never` on `updateStamp`** in `sitemap-helpers.test.ts:149` — `{ stamp: { date: "2026-01-15" } } as never` hides missing `pageId` and `lang` fields on `PageUpdateStampResult`. The test only checks that `<lastmod>` XML is generated from `stamp.date`, so the partial construction is intentional. Acceptable, but a comment would clarify intent.

### Axis B — DNA alignment

No issues. The diff is test-only — no production code changes, no new manifests, no new routes.

- **DNA-6** (kebab-case): All 10 new filenames are kebab-case. ✓
- **DNA-42** (Compass markup): All 10 new test files carry `MODULE_CONTRACT` blocks. ✓ (Minor: `compass-audit-isauditdue.test.ts` omits `CHANGE_SUMMARY` — inconsistent with the other 9 files, but not a DNA violation for test files.)
- **DNA-1** (monorepo boundary): No `apps/*` imports. All imports flow from `tests/` → `../<module>.ts` and `@warpgogol/*` packages. ✓

### Axis C — Ecosystem fit

No issues. Test-only diff — no new commands, no pipeline changes, no `docs/*.xml` updates needed. No `AGENTS.md` updates required (the `src/tests/` pattern is already documented by example across 50+ existing test files).

### Axis D — Forward-only compliance

No issues. No compatibility shims, no legacy paths, no dual-paths. The diff adds new test files only.

### Axis E — Agent-facing clarity

- **Compass scaffolding**: All 10 files carry `MODULE_CONTRACT` with `<purpose>` describing what each test covers. ✓
- **No ungrounded assertions**: All imports reference real exported functions (`isAuditDue`, `clusterAlternates`, `runSchemaDriftValidate`, etc.) — verified against source. ✓
- **Readable**: Test descriptions are imperative and specific ("fails with MIRROR-01 when localized is missing a block"). ✓
- **Missing `CHANGE_SUMMARY`** on `compass-audit-isauditdue.test.ts` — minor inconsistency, advisory only.

### Axis F — Pragmatism

- **Scope discipline**: The diff touches only `src/tests/` — no production code modified, no config changes, no scope creep. ✓
- **Existing patterns**: Tests follow the established `mkdtemp` + `beforeEach`/`afterEach` cleanup pattern used across the existing test suite. ✓
- **Lean contracts**: No new types or interfaces introduced. Tests reuse exported types (`PageCluster`, `SitemapUrlEntry`, `DiscoveredSiteWorkspace`). ✓

### Axis G — Blind spots

- **`git init` in fixture**: `compass-audit-validate.test.ts` runs `git init` + `git commit` in a tmpdir for each test. This is necessary because `getRevisionByPath` reads git revision numbers. Cleanup via `rm -rf` is correct. The test takes ~109ms (measured), acceptable.
- **Edge cases covered**: empty dist (`need-markers`), missing pages dir (`visibility-expr`), no localized pages (`page-blocks-mirror`), missing schemas dir (`schema-drift`), disabled normalize (`text-normalize`). ✓
- **No concurrency or interrupted-operation concerns**: Each test uses an isolated tmpdir. ✓

### Spec compliance

No formal spec available — the user's request was "audit all source modules, plan and write tests for uncovered modules with significant logic." The diff delivers exactly that: 10 test files covering the modules identified in the audit (`isAuditDue`, `sitemap-helpers`, `compass-audit.validate/baseline`, `schema-drift`, `need-markers`, `text-normalize`, `route-topology`, `visibility-expr`, `trust-rating`, `page-blocks-mirror`).

| Requirement | Status | Evidence |
| --- | --- | --- |
| Test `isAuditDue` pure function | Done | `compass-audit-isauditdue.test.ts` — 6 tests |
| Test `sitemap-helpers` pure functions | Done | `sitemap-helpers.test.ts` — 23 tests |
| Test `compass.audit.validate` + `baseline` | Done | `compass-audit-validate.test.ts` — 5 tests |
| Test `schema-drift` | Done | `schema-drift.test.ts` — 5 tests |
| Test `need-markers` | Done | `need-markers.test.ts` — 5 tests |
| Test `text-normalize` | Done | `text-normalize.test.ts` — 6 tests |
| Test `route-topology` | Done | `route-topology.test.ts` — 4 tests |
| Test `visibility-expr` | Done | `visibility-expr.test.ts` — 5 tests |
| Test `trust-rating` | Done | `trust-rating.test.ts` — 6 tests |
| Test `page-blocks-mirror` | Done | `page-blocks-mirror.test.ts` — 6 tests |

### Questions for the author

1. Should the `logger` stub and `makeSiteContext` helper be extracted into a shared `src/tests/helpers.ts` to stop the duplication growth across the test suite? (Advisory — 30+ existing files already duplicate this pattern.)
2. Should `compass-audit-isauditdue.test.ts` add a `CHANGE_SUMMARY` block for consistency with the other 9 new test files?
