---
rfcId: RFC-0659
auditId: AUDIT-RFC-0659-01
date: 2026-08-03
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0659

## Verdict: Needs revision

The RFC contains a factual error in its CLI surface section: it claims `--force` already exists on `mission.materialize`, but no such flag is parsed — `force: true` is hardcoded in the `executeKernelPipeline` call. This affects the CLI surface description, acceptance criteria, and implementation notes. Additional blind spots around cache directory gitignore and concurrent materialization need addressing.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0659 --json` reports 0 violations.

## Axis A — Structural completeness

- **A-1: Factual error — `--force` flag does not exist on `mission.materialize`.** The RFC states (line 148): "The `--force` flag already exists and is already passed to `executeKernelPipeline` for `build.prepare.dev`." This is false. `runMissionMaterialize` in `mission-materialize.ts` parses `--mission`, `--report-only`, and `--skip-preflight` — there is no `--force` flag parsing. The `force: true` at line 913 is hardcoded, not conditional on a flag. The RFC must introduce `--force` as a new flag, not "extend its semantics." This affects:
  - CLI surface section (line 148) — incorrect claim
  - Acceptance criterion (line 277) — "`--force` flag bypasses cache read" assumes the flag exists
  - Implementation notes (line 300) — "The `--force` flag bypasses both the artifact cache (this RFC) and the command-result cache for `build.prepare.dev` (RFC-0619)" — this conflation is based on a false premise. The hardcoded `force: true` in `executeKernelPipeline` is always active; it is not controlled by a `--force` flag.

- **A-2: `--skip-preflight` flag omitted from CLI surface.** The CLI surface section (lines 137-146) shows `--mission`, `--force`, and `--report-only` but omits the existing `--skip-preflight` flag. While this RFC does not change `--skip-preflight`, the CLI surface should be complete for the command it modifies.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-47]` is correct — the RFC optimizes materialization without changing its contract. The RFC body (lines 123-124) explains how the cache produces byte-identical results while preserving the DNA-47 contract. No conflicts with other DNA invariants.

## Axis C — Ecosystem fit

No issues. Package boundary (`@warpgogol/site-kernel-handoff`) is correct. The artifact cache is internal to `mission.materialize` — no new pipeline step. `commands.changed: [mission.materialize]` is correct. The RFC correctly identifies independence from RFC-0597 (preflight skip), RFC-0635 (distribution reuse), RFC-0653 (dev-deploy build-skip), and RFC-0619 (command-result cache bypass).

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual-paths. The cache is a pure performance optimization. On cache miss, the existing flow runs unchanged. No legacy code paths are maintained behind a flag.

## Axis E — Agent-facing policy

No issues. The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 290). No self-authorizing language. Implementation notes reference the correct governance rules (RFC-0224, RFC-0330, RFC-0334).

## Axis F — Pragmatism

No issues. No new commands — `mission.materialize` is enhanced. `MaterializationCacheState` and `ArtifactCacheFields` are minimal type signatures. The RFC reuses existing primitives (`resolvePlatformSemanticHash`, `resolveCurrentEcosystem`, `byteHash`, `atomicMoveDir`). `packagesImpacted` and `appsImpacted` are correctly scoped. Alternatives section is honest — four real alternatives with rejection reasons.

## Axis G — Blind spots

- **G-1: `.cache/materialization/` inside cache clone — gitignore not addressed.** The cache directory lives at `systems/<id>/.cache/materialization/<hash>/`, which resolves to inside the cache clone (a non-bare git repo). The RFC does not mention whether `.cache/` needs to be added to the cache clone's `.gitignore`. Without gitignoring, `sternsystem.validate`'s Bordbuch-vs-git-log consistency check or dirty-file detection could flag the cache directory as untracked external edits.

- **G-2: Concurrent materialization not addressed.** The RFC does not mention what happens if two `mission.materialize` calls run concurrently for the same system. The existing lock (`system:<id>` + `mission:<id>`) prevents concurrent materialization for the same mission, but two different missions for the same system could race on the cache directory. The RFC should document that the system lock serializes cache access, or describe the expected behavior.

- **G-3: Cache invalidation on `mission.reconcile` not explicitly documented.** `mission.reconcile` transfers commits from the workpiece to the cache clone via `git merge --no-ff`, changing the cache clone HEAD. The cache key uses `cacheCloneHead`, so the next materialization after reconcile is a cache miss. This is correct behavior, but the RFC should explicitly document it — operators need to know that reconciling a mission invalidates the artifact cache for the next materialization.

- **G-4: Cache size estimation missing.** The risks section (line 263) mentions "Cache directory grows large" but provides no size estimate. For systems with large video content (e.g. warpgogol-com), the cache snapshot includes `.cache/video/` and `.cache/video-live/` which could be several GB. The RFC should estimate the cache size for a typical system and note the disk space implication of keeping the latest entry.

## Questions for the author

1. The RFC claims `--force` already exists on `mission.materialize`. It does not — `force: true` is hardcoded in `executeKernelPipeline` at `mission-materialize.ts:913`, not driven by a flag. Should `--force` be introduced as a new flag? If so, should the hardcoded `force: true` become conditional on `--force`, or should `force: true` remain always-true (preserving current codegen behavior) and `--force` only controls the artifact cache bypass?

2. The cache directory `systems/<id>/.cache/materialization/<hash>/` lives inside the cache clone (a non-bare git repo). Will `.cache/` be gitignored in the cache clone? If not, how does `sternsystem.validate` avoid flagging it as untracked external edits?

3. What is the estimated cache size for a typical system (e.g. warpgogol-com with video content)? Is there a risk of disk exhaustion when keeping the latest cache entry, and should the RFC document a cleanup or size-limit mechanism?
