---
id: ADR-0011
title: "Require regression tests for validator bug fixes"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: proposed
scope: package
decider: architecture
createdAt: 2026-07-30
updatedAt: 2026-07-30
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0612
  - RFC-0613
  - RFC-0614
  - RFC-0615
reviewers: []
---

# ADR-0011: Require regression tests for validator bug fixes

## Context

During mission `warpgogol-com-m000022` (2026-07-30), multiple validator bugs were discovered and fixed in `packages/os/site-kernel-checks` and `packages/share`:

1. **Placeholder expansion gap** in `generated-stale-validate.ts` and `generated-files-validate.ts` — `{route}`, `{lang}`, `{slug}`, `{id}`, `{category}` placeholders were not expanded to `*` before glob matching.
2. **Preview image glob leak** in `generated-stale-validate.ts` — `PREVIEW_DIR` entries from `GENERATOR_OWNERSHIP_MAP` were included in `expectedPaths`, bypassing the content-aware preview resolver.
3. **YAML null parsing bug** in `parseMarkdownTwinFrontmatter` (`packages/share/src/semantic/markdown-twin-provenance.ts`) — YAML `null` was parsed as string `"null"` instead of JS `null`.
4. **MDMETA-04 false positive** in `page.markdown.validate` — `lastModified: null` (per RFC-0602 determinism) was rejected as an invalid date.
5. **Bordbuch conflict auto-resolution gap** in `mission.reconcile` — `public/.well-known/bordbuch*` paths were not covered by the auto-resolution logic.

None of these bugs had regression tests. Each was discovered through a multi-step debugging session that could have been avoided with a test that verified the specific behavior.

## Decision

Every validator bug fix in `packages/os/site-kernel-checks`, `packages/share`, and `packages/os/site-kernel-handoff` MUST include a regression test that reproduces the original failure before the fix and passes after the fix.

- The regression test MUST be committed in the same commit as the fix, not in a follow-up commit.
- The test name MUST reference the diagnostic code or behavior being fixed (e.g., `"STALE-01: expands {category} placeholder before glob matching"`).
- For placeholder expansion bugs, the test MUST verify that each known placeholder (`{system}`, `{app}`, `{lang}`, `{route}`, `{slug}`, `{id}`, `{category}`) is correctly expanded.

## Justification

Five bugs were discovered in a single mission, none covered by regression tests. Each bug required manual debugging (reading source code, running validators, inspecting output) that cost significant agent and operator time. The cost of writing a regression test at fix time is minimal compared to the cost of re-discovering the same bug after a regression.

Alternatives considered:

- **Rely on existing integration tests**: Rejected because integration tests (e.g., `mission.validate` end-to-end) are too coarse — they catch that something is wrong but not which specific validator or diagnostic code is at fault.
- **Add a lint rule that checks for test files**: Rejected because lint cannot verify test quality or that the test reproduces the original failure.

## Consequences

- **Positive**: Validator bugs are caught at fix time, preventing regressions. Future agents can confidently refactor validators knowing that tests guard the behavior. The test names serve as documentation of known failure modes.
- **Negative**: Slightly more time per bug fix (writing the regression test). Test suites grow over time, increasing test runtime.
- **Technical debt**: Existing validator fixes from mission `warpgogol-com-m000022` that were applied without regression tests remain untested. A follow-up effort should backfill tests for those fixes.

## Evolution

This decision applies to all validator bug fixes going forward. If the test suite becomes too slow, consider splitting tests into fast (unit) and slow (integration) tiers. If a validator is refactored to the point where its diagnostic codes change, update the regression tests in the same commit.

The existing untested fixes from `warpgogol-com-m000022` (placeholder expansion, preview image glob leak, YAML null parsing, MDMETA-04 null acceptance, bordbuch auto-resolution) should have regression tests backfilled as part of the implementation of RFC-0612, RFC-0613, RFC-0614, and RFC-0615.
