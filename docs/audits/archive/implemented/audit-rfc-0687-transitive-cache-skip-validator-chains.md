---
rfcId: RFC-0687
auditId: AUDIT-RFC-0687-01
date: 2026-08-05
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0687

## Verdict: Needs revision

The RFC's primary use case is incompatible with its own algorithm: 4 of the 5 priority candidate validators (`generated.drift.validate`, `generated.files.validate`, `generated.stale.validate`, `ownership.sync.validate`) are declared `cacheable: false`, which means `tryCacheRead` returns `null` immediately — the validator's own `reads[]` hash is never computed or stored. Step 3 of the transitive skip algorithm ("Does the validator's own `reads[]` hash match the cache?") can never succeed for these commands, so the transitive skip will never fire for the RFC's stated priority candidates.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0687 --json` reports 0 violations.

## Axis A — Structural completeness

- **Missing propagation to `KernelRegisteredCommandInfo`**: The RFC adds `validatesOutputs` to `KernelCommandDefinition` (types.ts:243) but does not mention `KernelRegisteredCommandInfo` (types.ts:136) or the `commandInfo()` function (registry.ts:166-191) which manually copies fields from `KernelCommandDefinition` to `KernelRegisteredCommandInfo`. Without updating these, `listRegisteredKernelCommands` will not expose `validatesOutputs`, and `command.reads.validate` cannot audit it.
- **Missing command manifest entry**: `buildCommandManifest` in `command-manifest.ts:138-151` maps command fields to manifest entries. `validatesOutputs` is not listed in the file system responsibilities table and would need a manifest entry for `command.manifest.generate` to include it.
- **`PipelineRunState` location unspecified**: The RFC shows `PipelineRunState` in `execute-pipeline.ts` but the current code has no such interface. The `cacheHitCommands: Set<string>` would need to be threaded through both `executePipelineForSite` (line 278) and `executePipelineForWorkspace` (line 449), which are separate functions with no shared state object. The RFC should specify whether `PipelineRunState` is a new interface or additions to existing local variables.

## Axis B — DNA alignment

- **DNA-35 (`app.contract.full`)**: The RFC claims the transitive skip benefits the canonical readiness signal because "a skipped validator is one that would have passed." This is only true if the `reads[]` hash check is reliable — which it is not for `cacheable: false` commands (see Axis F). The DNA-35 claim is conditional on fixing the `cacheable: false` incompatibility.
- **DNA-53 (Semantic fingerprint governance)**: The RFC correctly states it reuses existing cache entries and `reads[]` hash mechanism. No new hashing is introduced. This alignment is accurate.

## Axis C — Ecosystem fit

- **Package boundaries**: Correct — changes are in `@warpgogol/site-kernel` (types, executor) and `@warpgogol/site-kernel-checks` (command definitions). No cross-boundary violations.
- **Pipeline placement**: The RFC correctly notes that `validatesOutputs` is on command definitions, not pipeline steps. No pipeline definition changes needed.
- **Compass sync**: The RFC does not identify which `docs/*.xml` files need synchronization. If `validatesOutputs` becomes a declared field on command definitions, `docs/command-manifest.generated.yaml` schema changes, which may require `docs/verification-plan.xml` updates.
- **AGENTS.md updates**: The RFC does not mention updating `packages/os/site-kernel/AGENTS.md` § Command-result cache (RFC-0390) to document the new `validatesOutputs` field and transitive skip behavior. This is a documentation gap.
- **Related RFCs**: RFC-0685 and RFC-0686 are both in `draft` status. The RFC claims independence from them but the transitive skip's value proposition depends on RFC-0685's mtime fast path making the `reads[]` hash check cheaper. Without RFC-0685, the transitive skip adds no performance benefit because step 3 still computes the full `reads[]` hash.

## Axis D — Forward-only compliance

No issues. The RFC is purely additive — new optional field, new skip reason. No backward compatibility layers, no dual paths. Validators without `validatesOutputs` are unaffected.

## Axis E — Agent-facing policy

- **Status gate**: Correct — the RFC does not contain self-authorizing language. Implementation notes properly reference RFC-0224, RFC-0334, and the status gate.
- **Implementation notes**: Thorough and explicit. The rule that `validatesOutputs` MUST only be set on `mutatesState: false` validators is clearly stated. The `reads[]` safety net is correctly emphasized as NON-NEGOTIABLE.
- **Anti-fabrication**: Not applicable — no content authoring involved.

## Axis F — Pragmatism

- **CRITICAL: `cacheable: false` incompatibility**: The RFC's 5 priority candidates are:
  - `generated.drift.validate` — `cacheable: false` (command-tables/01-codegen.ts:638)
  - `generated.files.validate` — `cacheable: false` (line 599)
  - `generated.stale.validate` — `cacheable: false` (line 612)
  - `ownership.sync.validate` — `cacheable: false` (line 625)
  - `mirror.quintet.validate` — cacheable (has `reads`, no `cacheable: false`) — this is the only compatible candidate

  For `cacheable: false` commands, `tryCacheRead` (execute-pipeline.ts:222) returns `null` immediately because `isCommandCacheable` returns `false`. The validator's `reads[]` hash is never computed, never stored in the cache, and never available for step 3's check. The transitive skip algorithm cannot fire for these commands. The RFC must either: (a) require `validatesOutputs` validators to re-enable caching with proper `reads[]`, (b) compute the `reads[]` hash directly (bypassing the cache layer) for the transitive skip check, or (c) remove the `reads[]` hash check for transitive skip and rely solely on the upstream cache-hit signal (weaker safety net).

- **`generated.drift.validate` re-executes generators**: This validator (generated-drift-validate.ts:160-166) calls `executeKernelCommand` with `dryRun: true` for each generator. Even if the transitive skip could fire, the `reads[]` hash only covers files the validator reads directly — it does not capture the cost of re-executing generators in dryRun mode. The transitive skip's benefit for this specific validator is larger than the RFC implies (it avoids N generator re-executions, not just file reads), but only if the `cacheable: false` issue is resolved.

- **No performance benefit without RFC-0685**: The transitive skip algorithm still computes the validator's `reads[]` hash (step 3). Without RFC-0685's mtime fast path, this computation is the same cost as a normal cache check. The transitive skip adds the `cacheHitCommands` set lookup (O(1)) before the expensive hash computation, but only when all upstream commands are in the set — and when they are, the hash computation would have produced a cache hit anyway. The net performance benefit is zero without RFC-0685.

- **Lean contracts**: The `validatesOutputs?: string[]` field is minimal and well-typed. The `shouldTransitiveSkip` function is simple. No speculative generality.

## Axis G — Blind spots

- **`moduleSrcDir` hardcoding**: Both `executePipelineForSite` (line 335-341) and `executePipelineForWorkspace` (line 510-516) hardcode `moduleSrcDir` to `packages/os/site-kernel-checks/src`. This means ALL commands' module hashes are computed from the same directory, regardless of which package the command actually lives in. The transitive skip doesn't address this, but it's a pre-existing issue that affects cache accuracy for commands in other packages (e.g., `@warpgogol/site-kernel-codegen`).
- **Cross-pipeline `cacheHitCommands`**: The `cacheHitCommands` set is per-pipeline-run. But `build.prepare` and `build.check` are separate pipeline runs. The RFC's problem statement says "validators in `build.check` validate outputs produced by generators in `build.prepare`" — but if `cacheHitCommands` is reset between pipeline runs, the transitive skip cannot fire across pipeline boundaries. The RFC must specify whether `cacheHitCommands` persists across pipeline runs or is per-run only.
- **Concurrent execution (RFC-0686)**: If RFC-0686 is implemented and steps run in parallel, the `cacheHitCommands` set must be thread-safe (or at least updated after all parallel steps complete). The RFC does not address concurrent access to `cacheHitCommands`.
- **Empty state**: A new app with no generated files — validators with `validatesOutputs` would have no upstream cache hits (generators produce nothing), so the transitive skip would not fire. This is correct behavior but should be documented.

## Questions for the author

1. How does the transitive skip algorithm work for `cacheable: false` validators? Step 3 requires a `reads[]` hash match against the cache, but `cacheable: false` commands never write to or read from the cache. The 4 priority candidates are all `cacheable: false` — does the RFC require removing `cacheable: false` and adding `reads[]` to these validators, or does it propose a different hash-check path that bypasses the cache layer?
2. Is `cacheHitCommands` per-pipeline-run or does it persist across `build.prepare` → `build.check`? The problem statement describes cross-pipeline optimization (validators in `build.check` skip because generators in `build.prepare` were cached), but the `PipelineRunState` is shown as per-pipeline. If per-pipeline, the cross-pipeline benefit cannot materialize.
3. What performance benefit does the transitive skip provide over the existing RFC-0390 per-command cache, given that step 3 still computes the full `reads[]` hash? The only added value appears to be a different `skipReason` label. If the intent is to avoid the hash computation when all upstream commands are cached, step 3 must be conditional (skip hash check when upstream is cached), but that removes the safety net the RFC calls NON-NEGOTIABLE.
