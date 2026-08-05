---
reviewId: REVIEW-CODE-2026-08-08-01
date: 2026-08-08
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 66f5407a...HEAD
filesReviewed:
  - packages/os/site-kernel/src/types.ts
  - packages/os/site-kernel/src/runtime/registry.ts
  - packages/os/site-kernel/src/command-manifest.ts
  - packages/os/site-kernel/src/runtime/execute-pipeline.ts
  - packages/os/site-kernel/src/tests/transitive-skip.test.ts
  - packages/os/site-kernel/AGENTS.md
  - docs/command-manifest.generated.yaml
  - docs/rfcs/rfc-0687-add-transitive-cache-skip-for-validator-chains-in-pipeline-execution.md
---

# Code Review: RFC-0687 transitive cache skip for validator chains

### Verdict: Needs revision

The implementation is clean, well-typed, and minimal. The transitive skip algorithm is correct, the safety net (`cacheable: false` validators) is preserved, and cross-pipeline persistence handles edge cases gracefully. One minor finding on Axis A (duplicated telemetry exclusion pattern) prevents an Approved verdict.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/site-kernel run build:check` exit 0; `pnpm --filter @warpgogol/site-kernel-checks run build:check` exit 0; `rfc.validate --id RFC-0687` exit 0; 253 tests pass (28 files).

### Axis A — Structural correctness

One finding:

- **Duplicated Code (minor)**: The telemetry exclusion check `!report.summary?.startsWith("Skipped: transitive-cache-skip")` is duplicated between `executePipelineForSite` (line 702) and `executePipelineForWorkspace` (line 900-903). This follows the existing pattern of duplication between the two executors (e.g., `!step.skip && !report.cached`), but the new check introduces a string-matching coupling that could break if the skip reason format changes. Consider extracting a helper like `isTransitiveSkip(report)` to reduce the coupling. Not blocking — the pattern is consistent with existing code.

### Axis B — DNA alignment

No issues.

- **DNA-35** (`app.contract.full`): The transitive skip does not weaken the canonical readiness signal. `cacheable: false` validators always run regardless of transitive skip, so `app.contract.full` still catches all issues.
- **DNA-53** (semantic fingerprint governance): No new hashing is introduced. The transitive skip explicitly avoids `reads[]` hash computation, delegating correctness to the existing cache mechanism and `cacheable: false` safety net.

### Axis C — Ecosystem fit

No issues.

- Package boundaries: no cross-boundary imports.
- `AGENTS.md` updated with § Transitive cache skip for validator chains (RFC-0687).
- Command manifest regenerated with `validatesOutputs` field.
- No new commands added or removed.

### Axis D — Forward-only compliance

No issues.

- No compatibility shims or dual-paths.
- The `validatesOutputs` field is optional and additive — existing commands without it behave identically to before.

### Axis E — Agent-facing clarity

No issues.

- `MODULE_CONTRACT` scaffolding present on the new test file (`transitive-skip.test.ts`).
- `CHANGE_SUMMARY` updated on `execute-pipeline.ts` with RFC-0687 entry.
- Variable names are clear (`runState`, `importedHits`, `cacheHitCommands`).
- No ungrounded assertions in comments or docs.

### Axis F — Pragmatism

No issues.

- The implementation is minimal — only the necessary types, functions, and integration points.
- No speculative generality — `validatesOutputs` is optional and only used when present.
- No new commands — the mechanism reuses existing pipeline executor infrastructure.

### Axis G — Blind spots

No issues.

- **Performance**: `loadImportedCacheHits` reads a small JSON file once per pipeline run — negligible cost.
- **Concurrent execution**: The RFC documents the RFC-0686 concurrent execution risk. The current implementation updates `cacheHitCommands` after each step completes, which is safe for sequential and parallel execution within a single pipeline run. Cross-pipeline race conditions on `.cache/pipeline-cache-hits.json` are possible but non-fatal (best-effort persistence).
- **Edge cases**: Missing file, corrupt JSON, stale entries — all handled with graceful fallback to empty set.

### Spec compliance

| Requirement from RFC-0687 | Status | Evidence |
| --- | --- | --- |
| `validatesOutputs` field on types | Done | `types.ts:283`, `types.ts:149` |
| Registry propagation | Done | `registry.ts:188` |
| Manifest entry | Done | `command-manifest.ts:51, 151` |
| `PipelineRunState` interface | Done | `execute-pipeline.ts:234-237` |
| `shouldTransitiveSkip` function | Done | `execute-pipeline.ts:255-262` |
| Transitive skip with `skipReason` | Done | `execute-pipeline.ts:654-655` |
| `loadImportedCacheHits` with TTL | Done | `execute-pipeline.ts:286-316` |
| `persistCacheHits` | Done | `execute-pipeline.ts:325-355` |
| `--force` clears file | Done | `execute-pipeline.ts:598-599` |
| `cacheable: false` exclusion | Done | `execute-pipeline.ts:259` |
| No validators annotated (infrastructure-only) | Done | No `validatesOutputs` on any command definition |
| Unit tests (a)-(j) | Done | `transitive-skip.test.ts`, 16 tests pass |
| `build:check` passes | Done | Both packages exit 0 |
| `rfc.validate` passes | Done | Exit 0 |
| AGENTS.md updated | Done | `AGENTS.md:100-109` |

### Questions for the author

1. The telemetry exclusion uses `report.summary?.startsWith("Skipped: transitive-cache-skip")` — would a `skipReason` field on `KernelExecutionReport` be more robust? (Out of scope for this RFC, but worth considering for a future cleanup.)
