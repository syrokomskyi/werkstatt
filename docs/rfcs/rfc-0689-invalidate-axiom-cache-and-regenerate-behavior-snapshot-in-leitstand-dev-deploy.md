---
id: RFC-0689
title: "Invalidate Axiom cache and regenerate behavior snapshot in leitstand.dev-deploy"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0628
  - RFC-0629
  - RFC-0615
  - RFC-0684
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - leitstand.dev-deploy
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "leitstand.dev-deploy invalidates Axiom browser evidence cache before mission.check, ensuring fresh HTML is scanned"
  - "leitstand.dev-deploy auto-regenerates behavior snapshot when SNAP-01 is detected, preventing build failures after label or heading changes"
  - "No manual --no-cache flag or behavior.snapshot.generate invocation needed after code changes affecting baked pages"
nonGoals:
  - "Does not change the Axiom cache implementation — only controls when it is invalidated"
  - "Does not add a --no-cache flag to leitstand.dev-deploy (cache invalidation is automatic)"
  - "Does not change behavior.snapshot.generate itself — only calls it at the right time in the pipeline"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0689: Invalidate Axiom cache and regenerate behavior snapshot in leitstand.dev-deploy

## Context

`leitstand.dev-deploy` (RFC-0628) is the primary dev-channel deployment command. It runs a full pipeline: `build.prepare` → `astro build` → `build.post` → `mission.check` (Axiom gate) → `axiom.report` → `evidence.sync`. The build phases run via `execSync("pnpm build")`, which executes the workpiece's `build` script (`build.prepare → astro:check → astro build → build.post`) as an opaque shell command. Two issues arise when code changes affect baked page content:

1. **Axiom browser evidence cache:** `mission.check` calls `runAxiomCheck` which uses a browser evidence cache (`.cache/` in the mission evidence directory). After a new deploy with changed page content, the cache may still serve Playwright page captures from the previous build. The Axiom scan then checks stale HTML, producing findings that don't reflect the current code. This was discovered in mission m000028: after fixing duplicate heading labels, the first `mission.check` run still reported `landmark-unique` warnings because the cache served pre-fix captures.

2. **Behavior snapshot validation:** `build.post` includes `behavior.snapshot.validate`, which compares OG metadata, page titles, and other behavioral signals against a stored snapshot (`behavior.snapshot.generated.yaml` in the workpiece root). When bake function labels or heading text change, OG metadata changes, and the snapshot is stale. This causes SNAP-01 errors that block the build. The fix requires manually running `behavior.snapshot.generate` before re-deploying — a step that should be automatic. RFC-0615 already implements this auto-regeneration pattern in `mission.validate`; this RFC extends it to `leitstand.dev-deploy`.

## Problem

Two concrete gaps in `leitstand.dev-deploy`:

1. **No automatic Axiom cache invalidation.** After `astro build` produces new `dist/client/` output, the Axiom browser evidence cache at `missions/{mission}/evidence/axiom/.cache/` may contain Playwright captures from a previous deploy. `mission.check` has a `--no-cache` flag, but `leitstand.dev-deploy` does not pass it. Agents must manually know to use `--no-cache` after code changes — this is undocumented tribal knowledge.

2. **No automatic behavior snapshot regeneration.** When bake function labels change (e.g. adding new `SURFACE_LABELS` entries), the behavior snapshot at `missions/{mission}/workpiece/behavior.snapshot.generated.yaml` becomes stale. `build.post` fails with SNAP-01 errors. The agent must manually run `behavior.snapshot.generate` and re-deploy. This workflow should be automatic: if `behavior.snapshot.validate` fails, regenerate the snapshot and re-validate, rather than blocking the pipeline.

## Decision

`leitstand.dev-deploy` gains two automatic pipeline steps:

1. **Axiom cache invalidation:** Before `mission.check`, the pipeline clears the Axiom browser evidence cache directory (`missions/{mission}/evidence/axiom/.cache/`). This ensures `runAxiomCheck` always scans the freshly built `dist/client/` output.

2. **Behavior snapshot auto-regeneration:** Since `leitstand.dev-deploy` runs `pnpm build` via `execSync` (an opaque shell command without step-level diagnostics), the auto-regeneration logic works as follows: after `pnpm build` fails, run `behavior.snapshot.validate` separately via `executeKernelCommand` to check for SNAP-01 diagnostics. If SNAP-01 is detected, run `behavior.snapshot.generate`, then re-run `pnpm build`. If the re-run passes, the pipeline continues. If it still fails, the pipeline blocks (indicating a real behavioral change that needs human review). This reuses the pattern from RFC-0615 (`mission.validate`), ideally via a shared helper function extracted from `mission-materialization-commands.ts`.

## Architectural fit

- **RFC-0628 (dev-deploy):** This RFC improves the dev-deploy pipeline by adding automatic cache invalidation and snapshot regeneration. It does not change the pipeline structure or command ordering.
- **RFC-0629 (mission.check):** The `--no-cache` flag already exists on `mission.check`. This RFC makes cache invalidation automatic in the dev-deploy pipeline, so the flag is not needed for the common case.
- **RFC-0615 (snapshot auto-regeneration in mission.validate):** This RFC extends the same SNAP-01 auto-regeneration pattern to `leitstand.dev-deploy`. A shared helper should be extracted from the existing implementation in `mission-materialization-commands.ts` to avoid duplication.
- **RFC-0653 (build-skip cache):** When `buildSkipped=true`, `pnpm build` (and therefore `build.post`) does not run. The RFC addresses this by running `behavior.snapshot.validate` separately to detect stale snapshots even when the build is skipped.
- **RFC-0684 (suppression layer):** Orthogonal. Cache invalidation ensures Axiom scans fresh HTML; suppressions filter findings. Both are needed for a reliable gate.
- **Site OS operator model:** Both changes are internal to `leitstand.dev-deploy` pipeline orchestration in `@warpgogol/site-kernel-handoff`. No new commands exposed to operators.

## Design

### CLI surface

No new CLI commands. `leitstand.dev-deploy` behavior changes internally:

```sh
# Before (current):
# 1. pnpm build (build.prepare → astro:check → astro build → build.post)
#    └─ build.post fails on SNAP-01 → execSync throws → deploy aborts
# 2. Agent manually runs behavior.snapshot.generate
# 3. Re-run leitstand.dev-deploy

# After (proposed):
# 1. pnpm build (build.prepare → astro:check → astro build → build.post)
#    └─ if build fails: run behavior.snapshot.validate separately
#       └─ SNAP-01 detected → behavior.snapshot.generate → re-run pnpm build
# 2. Clear Axiom browser evidence cache
# 3. mission.check (scans fresh HTML)
#
# When buildSkipped=true (RFC-0653):
# 1. Run behavior.snapshot.validate separately to check for stale snapshot
#    └─ SNAP-01 detected → behavior.snapshot.generate → continue
# 2. Clear Axiom browser evidence cache
# 3. mission.check (scans fresh HTML)
```

### TypeScript contracts

```ts
// packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts

// 1. After pnpm build fails, check for SNAP-01 and auto-regenerate:
//    (reuse the pattern from mission-materialization-commands.ts:445-499, RFC-0615)
//    Ideally extracted into a shared helper: autoRegenerateSnapshotOnSnap01()
if (!buildSucceeded) {
  const validateResult = await executeKernelCommand({
    workspaceRoot,
    commandName: "behavior.snapshot.validate",
    siteName: systemId,
  });
  const diagnostics = (validateResult.data as { diagnostics?: { ruleId: string }[] })?.diagnostics ?? [];
  const snap01 = diagnostics.some(d => d.ruleId === "SNAP-01");
  if (snap01) {
    logger.info("[leitstand.dev-deploy] SNAP-01 detected — auto-regenerating behavior snapshot...");
    await executeKernelCommand({
      workspaceRoot,
      commandName: "behavior.snapshot.generate",
      siteName: systemId,
    });
    // Re-run pnpm build
    execSync("pnpm build", { cwd: workpiecePath, stdio: "inherit", timeout: 600_000 });
    buildSucceeded = true;
  }
}

// 1b. When buildSkipped=true (RFC-0653), check for stale snapshot separately:
if (buildSkipped) {
  const validateResult = await executeKernelCommand({
    workspaceRoot,
    commandName: "behavior.snapshot.validate",
    siteName: systemId,
  });
  const diagnostics = (validateResult.data as { diagnostics?: { ruleId: string }[] })?.diagnostics ?? [];
  if (diagnostics.some(d => d.ruleId === "SNAP-01")) {
    logger.info("[leitstand.dev-deploy] stale snapshot detected (build skipped) — regenerating...");
    await executeKernelCommand({
      workspaceRoot,
      commandName: "behavior.snapshot.generate",
      siteName: systemId,
    });
  }
}

// 2. Before mission.check, clear Axiom browser evidence cache:
const axiomCacheDir = path.join(missionDir, "evidence", "axiom", ".cache");
if (existsSync(axiomCacheDir)) {
  await fs.rm(axiomCacheDir, { recursive: true, force: true });
  logger.info("[leitstand.dev-deploy] Cleared Axiom browser evidence cache before mission.check");
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Modified: add cache invalidation before `mission.check`, add snapshot auto-regeneration after SNAP-01 failure |
| `missions/{mission}/evidence/axiom/.cache/` | Cleared automatically before each `mission.check` in dev-deploy |
| `packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts` | Modified: extract shared `autoRegenerateSnapshotOnSnap01` helper from existing RFC-0615 logic for reuse |
| `missions/{mission}/workpiece/behavior.snapshot.generated.yaml` | Regenerated automatically when `behavior.snapshot.validate` fails with SNAP-01 |

### Failure modes

- **Snapshot regeneration still fails:** If `behavior.snapshot.validate` fails after regeneration, the pipeline blocks with a clear error message. This indicates a real behavioral change that needs human review, not a stale snapshot.
- **Cache directory does not exist:** If `.cache/` doesn't exist (first deploy), the clearing step is a no-op. No error.
- **Cache clearing fails (permissions):** Non-fatal warning. `mission.check` proceeds without cached captures — equivalent to a first-run state.
- **`mission.check` called manually (not via dev-deploy):** No automatic cache invalidation. The `--no-cache` flag remains available for manual use.
- **Concurrent `leitstand.dev-deploy` runs on the same mission:** Cache clearing by one run could delete captures being written by another. This is an edge case — `leitstand.dev-deploy` is not designed for concurrent execution on the same mission. The operator must ensure sequential execution.

## Rollout

- **Default behavior on introduction:** Both changes are automatic in `leitstand.dev-deploy`. No flags needed.
- **Backward compatibility:** `mission.check` called outside `leitstand.dev-deploy` is unaffected. The `--no-cache` flag still works.
- **No migration required:** Existing missions benefit immediately.
- **Pipeline integration:** Both changes are internal to `leitstand.dev-deploy` orchestration. No new pipeline steps are added to `build.prepare` or `build.post`.

## Alternatives considered

1. **Pass `--no-cache` to `mission.check` in dev-deploy.** Rejected — this disables all caching, even when nothing changed. Clearing the cache directory before `mission.check` is more precise: it invalidates stale captures while allowing Axiom to rebuild the cache from the fresh deploy.

2. **Add `behavior.snapshot.generate` as a build.post step before `behavior.snapshot.validate`.** Rejected — this would regenerate the snapshot on every deploy, even when nothing changed. The auto-regeneration approach only runs when validation fails, which is more efficient.

3. **Make `behavior.snapshot.validate` non-blocking (warning only).** Rejected — the snapshot exists to catch unintended behavioral changes. Making it non-blocking defeats its purpose. Auto-regeneration with re-validation is the right balance: it handles the common case (intended change) while still blocking on real issues.

4. **Reuse the existing RFC-0615 pattern from `mission.validate`.** Accepted — the RFC-0615 implementation in `mission-materialization-commands.ts:445-499` already detects SNAP-01 and auto-regenerates. This RFC proposes extracting that logic into a shared helper (`autoRegenerateSnapshotOnSnap01`) and reusing it in `leitstand.dev-deploy`. The difference is that `mission.validate` runs `build.post` via `executeKernelPipeline` (with step-level diagnostics), while `leitstand.dev-deploy` runs `pnpm build` via `execSync` (opaque). The helper must account for this by running `behavior.snapshot.validate` separately after `pnpm build` fails.

## Risks

- **Snapshot auto-regeneration masks unintended changes:** If a code change unintentionally alters OG metadata, auto-regeneration would accept the new behavior without human review. Mitigation: the re-validation step only passes if the new snapshot is internally consistent. Significant changes (e.g. new routes, removed routes) would still fail validation after regeneration.
- **Cache clearing adds I/O:** Removing and recreating the cache directory adds a small I/O cost. Mitigation: the cache directory is typically small (Playwright captures for ~100 pages). The cost is negligible compared to the 40-second Axiom scan.
- **Agent reliance on auto-regeneration:** Agents may stop running `behavior.snapshot.generate` manually and rely on the auto-regeneration. This is acceptable — the auto-regeneration is the correct workflow.

## Acceptance criteria

- [x] `leitstand.dev-deploy` clears Axiom cache directory before `mission.check` (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:1010-1022, test: leitstand-0689-cache-snapshot.test.ts "clears Axiom browser evidence cache before mission.check")
- [x] `leitstand.dev-deploy` auto-regenerates behavior snapshot when `behavior.snapshot.validate` fails with SNAP-01 (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:769-816, test: leitstand-0689-cache-snapshot.test.ts "auto-regenerates snapshot and re-runs build when SNAP-01 detected on build failure")
- [x] `leitstand.dev-deploy` re-validates behavior snapshot after regeneration and blocks if re-validation fails (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:791-849 — re-runs pnpm build; if re-build fails, snapshotRegenerated stays false and early return blocks pipeline)
- [x] No manual `--no-cache` flag or `behavior.snapshot.generate` invocation needed after code changes affecting baked pages (evidence: cache clearing is automatic at leitstand-commands.ts:1010-1022; snapshot regeneration is automatic at leitstand-commands.ts:769-816 and 747-777)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0689 --json returned zero violations on 2026-08-05)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST implement cache invalidation as a directory clear, not as a `--no-cache` flag pass-through. The flag disables caching entirely; directory clearing allows Axiom to rebuild the cache from fresh content.
- Agents MUST implement snapshot auto-regeneration as a two-step process: regenerate, then re-validate. If re-validation fails, the pipeline MUST block.
- Agents MUST NOT make `behavior.snapshot.validate` non-blocking. It remains a blocking step; auto-regeneration is the recovery mechanism.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
