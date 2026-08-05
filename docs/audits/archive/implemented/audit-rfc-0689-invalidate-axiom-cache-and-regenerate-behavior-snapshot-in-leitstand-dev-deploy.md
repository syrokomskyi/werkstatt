---
rfcId: RFC-0689
auditId: AUDIT-RFC-0689-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0689

## Verdict: Needs revision

The RFC identifies real pain points (stale Axiom cache, manual snapshot regeneration), but its proposed implementation is architecturally unworkable as written: `leitstand.dev-deploy` runs `pnpm build` via `execSync` — an opaque shell command — and cannot inspect `build.post` step-level diagnostics to detect SNAP-01 failures. The existing RFC-0615 auto-regeneration pattern in `mission.validate` is not referenced, despite being the exact same logic. An internal contradiction between `nonGoals` and `failure modes` about the `--no-cache` flag, plus incorrect file paths and API signatures, further require revision.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0689 --json` returned zero violations.

## Axis A — Structural completeness

1. **TypeScript contracts use wrong API signatures.** The proposed code calls `executeKernelCommand({ command: "behavior.snapshot.generate", args: { site: siteId } }, context)`. The actual API (visible in `@/packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:463-467`) is `executeKernelCommand({ workspaceRoot, commandName: "behavior.snapshot.generate", siteName: manifest.systemId })` — a single options object, with `commandName` (not `command`), `siteName` (not `args.site`), and no `context` parameter.

2. **Wrong diagnostic field name.** The proposed code checks `d.id === "SNAP-01"` but the actual diagnostic field is `ruleId` (see `@/packages/os/site-kernel-checks/src/behavior-snapshot.ts:338` and the existing pattern at `@/packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:458`).

3. **Wrong behavior snapshot path.** The RFC states `missions/{mission}/workpiece/.cache/behavior-snapshot.json` (line 95, line 170). The actual path is `missions/{mission}/workpiece/behavior.snapshot.generated.yaml` — a YAML file in the workpiece root, not a JSON file in `.cache/`. See `snapshotPath(appDirectory)` in `@/packages/os/site-kernel-checks/src/behavior-snapshot.ts:310-316`.

4. **Internal contradiction on `--no-cache` flag.** `nonGoals` (line 59) says "Does not add a --no-cache flag to leitstand.dev-deploy (cache invalidation is automatic)". But `failure modes` (line 176) says "Cache clearing fails (permissions): Non-fatal warning. mission.check proceeds — the --no-cache flag is passed as a fallback." These are contradictory — either the flag is added or it isn't.

5. **`commands.changed` includes `behavior.snapshot.generate`** (line 46) but the RFC explicitly says "Does not change behavior.snapshot.generate itself — only calls it at the right time in the pipeline" (line 60). If the command itself isn't modified, it should not be in `changed`.

## Axis B — DNA alignment

No issues. `satisfies: []` is acceptable for a `command` kind RFC (RFC-0331 only requires `--satisfies` for `architecture` and `contract` kinds).

## Axis C — Ecosystem fit

1. **Fundamental architectural mismatch.** The RFC proposes adding SNAP-01 detection "In the build.post pipeline section of leitstand.dev-deploy" (line 136). But `leitstand.dev-deploy` does not run `build.post` step-by-step — it runs `execSync("pnpm build", { cwd: workpiecePath })` at `@/packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:747`, which is an opaque shell command. The workpiece's `pnpm build` script (`build.prepare → astro:check → astro build → build.post`) runs as a single atomic process. `leitstand.dev-deploy` has no step-level visibility into `build.post` and cannot inspect `behavior.snapshot.validate` diagnostics. The existing RFC-0615 auto-regeneration in `mission.validate` works because `mission.validate` runs `build.post` via `executeKernelPipeline` (line 426-432 of `mission-materialization-commands.ts`), which returns step-level diagnostics. The RFC must either: (a) propose replacing `execSync("pnpm build")` with direct pipeline execution, or (b) propose running `behavior.snapshot.validate` separately after `pnpm build` completes.

2. **Does not reference RFC-0615.** `mission.validate` already implements the exact same SNAP-01 auto-regeneration pattern (RFC-0615, implemented at `@/packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts:445-499`). The RFC should reference this existing implementation and either extract a shared helper or explain why a separate implementation is needed.

3. **`packagesImpacted` includes `@warpgogol/site-kernel-checks`** (line 52) but no file in that package is modified. The RFC only modifies `leitstand-commands.ts` in `site-kernel-handoff`. The `behavior.snapshot.generate` and `behavior.snapshot.validate` commands are called, not changed.

4. **Build-skip cache interaction not addressed.** `leitstand.dev-deploy` implements a build-skip cache (RFC-0653, lines 676-709 of `leitstand-commands.ts`). When `buildSkipped` is true, `pnpm build` (and therefore `build.post`) doesn't run, so `behavior.snapshot.validate` never executes. The RFC doesn't address whether snapshot auto-regeneration should fire when the build was skipped but the snapshot is stale.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers or dual-paths proposed.

## Axis E — Agent-facing policy

No issues. The RFC properly gates implementation on `accepted` status and references the correct governance rules (RFC-0224, RFC-0330, RFC-0334).

## Axis F — Pragmatism

1. **Alternatives section omits the existing RFC-0615 pattern.** Alternative 2 proposes "Add behavior.snapshot.generate as a build.post step before behavior.snapshot.validate" but doesn't mention that `mission.validate` already does auto-regeneration on SNAP-01 failure (RFC-0615). The RFC should discuss why the same pattern can't be reused.

2. **Axiom cache clearing is simple and correct.** The `rm -rf` approach for `missions/{mission}/evidence/axiom/.cache/` is pragmatic and matches the existing `--cache-dir` default path. This part of the design is sound.

## Axis G — Blind spots

1. **"HTTP cache" terminology is misleading.** The RFC calls the Axiom cache an "HTTP cache" (lines 85, 93, 101). The actual implementation is a browser evidence cache (Playwright capture cache) — see the `--cache-dir` flag description: "Override browser evidence cache directory" and `--no-cache`: "Bypass browser evidence cache entirely (force full re-capture)." The cache stores Playwright page captures, not HTTP responses.

2. **Step counts are unverified.** The RFC states "build.prepare (63 steps)" and "build.post (41 steps)" as facts (line 83). These numbers are not verified and may be inaccurate. If wrong, they undermine the RFC's factual credibility.

3. **Cache clearing I/O cost is correctly assessed** — the cache directory is small (Playwright captures for ~100 pages) and the cost is negligible vs. the 40-second Axiom scan. No issue here.

4. **Concurrent execution not addressed.** If two `leitstand.dev-deploy` runs target the same mission simultaneously, cache clearing by one run could delete captures being written by the other. This is an edge case but should be mentioned.

## Questions for the author

1. How will `leitstand.dev-deploy` detect SNAP-01 failures when `pnpm build` is run via `execSync` (an opaque shell command with no step-level diagnostics)? Will you replace `execSync("pnpm build")` with direct pipeline execution, or run `behavior.snapshot.validate` separately after the build?

2. Why not extract the existing RFC-0615 SNAP-01 auto-regeneration logic from `mission.validate` into a shared helper, rather than proposing a new implementation with a different (incorrect) API signature?

3. What happens when `buildSkipped` is true (RFC-0653 build-skip cache hit) but the behavior snapshot is stale? Should `behavior.snapshot.validate` run independently of `build.post` in that case?
