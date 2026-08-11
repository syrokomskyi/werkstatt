---
reviewId: REVIEW-CODE-2026-08-12-01
date: 2026-08-12
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 35982774~1...HEAD
filesReviewed:
  - packages/werkstatt/src/kernel/types.ts
  - packages/werkstatt/src/kernel/cli/index.ts
  - packages/werkstatt/src/kernel/runtime/execute-pipeline.ts
  - packages/werkstatt/src/mission/mission.module.ts
  - packages/werkstatt/src/mission/mission-materialization-commands.ts
  - packages/werkstatt/src/kernel/tests/execute-pipeline-collect-errors.test.ts
---

# Code Review: RFC-0809 collect-errors mode (35982774~1...HEAD)

### Verdict: Needs revision

One finding on Axis A (duplicated code). The implementation is architecturally sound, follows existing patterns, and passes all mechanical checks. The finding is minor but requires action before merge.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt run build:check` succeeds. 4 unit tests pass. `rfc.validate --id RFC-0809` passes.

### Axis A — Structural correctness

**Finding A-1: Duplicated Code (Fowler).** The collect-errors post-processing block is duplicated between `executePipelineForSite` and `executePipelineForWorkspace`. Both blocks follow the same pattern: call `aggregateCollectErrors`, iterate `collected.failedSteps`, find report by `commandName`, print `[FAIL]` progress line, print summary progress line, return `KernelPipelineReport` with `failedSteps`. The only differences are the `siteName` field and the progress line prefix (`[${site.name}]` vs `[workspace]`).

Evidence:
- `execute-pipeline.ts:801-821` (site variant)
- `execute-pipeline.ts:1043-1062` (workspace variant)

This follows the existing `if (failed)` pattern which is also duplicated, but the new code adds another ~20 lines of duplication. Consider extracting a helper that accepts the prefix and optional `siteName`:

```ts
function buildCollectErrorsReport(
  collected: { failedSteps: string[]; exitCode: number; ok: false },
  reports: KernelExecutionReport[],
  options: ExecuteKernelPipelineOptions,
  timing: KernelPipelineTimingSummary,
  prefix: string,
  siteName?: string,
): KernelPipelineReport {
  for (const name of collected.failedSteps) {
    const failedReport = reports.find((r) => r.commandName === name);
    progressLine(`  [FAIL] ${name}: ${failedReport?.summary ?? "failed"}`);
  }
  progressLine(
    `${prefix} pipeline ${options.pipelineName} — FAILED (${collected.failedSteps.length} step(s) failed, ${formatDuration(timing.totalDurationMs)})`,
  );
  return {
    ...(siteName ? { siteName } : {}),
    pipelineName: options.pipelineName,
    exitCode: collected.exitCode,
    ok: false,
    steps: reports,
    timing,
    filesModified: aggregateFilesModified(reports),
    failedSteps: collected.failedSteps,
  };
}
```

### Axis B — DNA alignment

No issues. No DNA invariants are directly touched. DNA-64 (stack-agnostic) is maintained — no `@warpgogol/*` imports added to `packages/werkstatt/src/**`.

### Axis C — Ecosystem fit

No issues. Package boundaries respected. `mission.validate` command registration updated with new flag. CLI subcommand updated. No new commands introduced — `--collect-errors` is a flag on existing commands.

### Axis D — Forward-only compliance

No issues. No backward compatibility layers. The `collectErrors` flag is opt-in with default `false` (existing fail-fast behavior). No shims or dual-paths.

### Axis E — Agent-facing clarity

No issues. New test file carries `MODULE_CONTRACT`. `CHANGE_SUMMARY` in `execute-pipeline.ts` updated with RFC-0809 entry. JSDoc on new type fields. Variable names are clear (`collectErrors`, `failedSteps`, `collected`, `sortedResults`).

### Axis F — Pragmatism

No issues. Pure function extraction (`aggregateCollectErrors`) is the right testing strategy. The `...(collectErrors ? { collectErrors: true } : {})` pattern is consistent with existing code (same as `concurrency` and `flags`). Minimal type extensions — only two optional fields added.

### Axis G — Blind spots

No issues. Performance impact (longer pipeline runs in collect-errors mode) is documented in the RFC. Edge cases handled: empty results, no failures, all failures, dependency-skipped exclusion. The `failedResults[0]!` non-null assertion is safe due to the `length === 0` guard above it.

### Spec compliance

| Requirement from RFC-0809 | Status | Evidence |
| --- | --- | --- |
| `collectErrors` field on `ExecuteKernelPipelineOptions` | Done | `types.ts:436-437` |
| `failedSteps` field on `KernelPipelineReport` | Done | `types.ts:366-370` |
| `--collect-errors` flag on `pipeline` CLI subcommand | Done | `cli/index.ts:113-116,299,319` |
| `--collect-errors` flag on `mission.validate` | Done | `mission.module.ts:239-243` |
| Flag propagated to all 4 `executeKernelPipeline` calls | Done | `mission-materialization-commands.ts:433,499,588,628` |
| `aggregateCollectErrors` pure function | Done | `execute-pipeline.ts:84-98` |
| Post-processing in both pipeline functions | Done | `execute-pipeline.ts:801-821,1043-1062` |
| `EXECUTE_KERNEL_PIPELINE_OPTION_KEYS` updated | Done | `execute-pipeline.ts:1107` |
| Unit tests (4 cases) | Done | `execute-pipeline-collect-errors.test.ts` |
| Default fail-fast behavior unchanged | Done | `execute-pipeline.ts:88` — returns `undefined` when `collectErrors` is false |
| `concurrency=1` is a no-op | Done | No scheduler modification; post-processing runs after scheduler completes |

### Questions for the author

1. The duplicated post-processing block between `executePipelineForSite` and `executePipelineForWorkspace` (Finding A-1) — is there a reason not to extract a shared helper, or is this acceptable following the existing `if (failed)` duplication pattern?
