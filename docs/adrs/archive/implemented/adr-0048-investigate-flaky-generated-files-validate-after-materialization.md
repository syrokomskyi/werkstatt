---
id: ADR-0048
title: "Investigate and fix flaky generated.files.validate on first mission.validate run after materialization"
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-16
updatedAt: 2026-08-16
implementedAt: 2026-08-16
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0615
reviewers: []
---

# ADR-0048: Investigate and fix flaky generated.files.validate on first mission.validate run after materialization

## Context

During the m000060 pipeline test (2026-08-16), the first `mission.validate` run failed at step `generated.files.validate` (build.prepare pipeline, step 71/75) with "FAILED at step generated.files.validate (59s)". The second run, executed immediately after, passed with "0 error(s), 0 warning(s)" for the same step and completed all 205 steps successfully.

This is not an isolated incident — it suggests a race condition or stale-cache issue in the `generated.files.validate` step that runs immediately after `mission.materialize`.

## Decision

Investigate the root cause of the flaky `generated.files.validate` failure on first run after materialization and fix it so that the first `mission.validate` after materialization passes reliably.

- The investigation should focus on the `generated.files.validate` step in the build.prepare pipeline and its interaction with freshly materialized workpieces.
- Likely cause: generated files from `mission.materialize` are in a partially-stale state that `generated.files.validate` detects as drift on first run, but the first run's own `build.prepare` generation steps update them, making the second run pass.

## Root cause (investigated)

The original hypothesis (content drift in regenerated files) was incorrect. `generated.files.validate` (RFC-0375) only checks **file existence**, not content drift — that is the domain of `generated.drift.validate` (RFC-0601) which runs in `build.check`, not `build.prepare`.

The actual root cause is a **pipeline mismatch** in `GENERATOR_OWNERSHIP_MAP`:

1. `behavior.snapshot.generated.yaml` is declared in `GENERATOR_OWNERSHIP_MAP` **without** `conditional: true`.
2. Its owning generator (`behavior.snapshot.generate`) only runs in `build.post` (after the Astro build), NOT in `build.prepare`.
3. `generated.files.validate` runs in `build.prepare` and checks all non-conditional ownership entries — including `behavior.snapshot.generated.yaml`.
4. The file is NOT in `STERNSYSTEM_DATA_PATHS` (`src/content`, `public`, `provenance`), so it is not copied from the cache clone during materialization.
5. The file is removed during materialize cleanup (non-data-path file in the git clone working tree).
6. Result: `generated.files.validate` reports `GEN-FILES-01` for `behavior.snapshot.generated.yaml` because the file does not exist during `build.prepare`.

The flakiness: on a second `mission.validate` run (after the first run completed `build.post` which created the file), the file exists and the check passes.

## Fix

Mark `behavior.snapshot.generated.yaml` as `conditional: true` in `GENERATOR_OWNERSHIP_MAP`. The `conditional` flag means "skip absence checks, not coverage checks" (RFC-0636) — `generated.files.validate` will skip the absence check for this file, while `ownership.sync.validate` and `generated.stale.validate` still include it in their expected-path sets.

This is correct because:

- `behavior.snapshot.generated.yaml` is only relevant after `build.post` (it projects the built `dist/client/` output).
- `behavior.snapshot.validate` (in `build.post`'s postbuild pipeline) checks the snapshot content.
- The file should not be expected to exist during `build.prepare`.

## Consequences

- If unfixed, agents must run `mission.validate` twice after materialization — a confusing and wasteful pattern.
- The fix should make the first `mission.validate` after materialization pass reliably without requiring a pre-commit or double-run.
