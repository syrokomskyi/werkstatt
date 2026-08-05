---
id: ADR-0023
title: "Optimize pipeline executor I/O and object reuse across steps"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-04
updatedAt: 2026-08-04
implementedAt: 2026-08-04
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0390
  - RFC-0685
  - RFC-0686
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0023: Optimize pipeline executor I/O and object reuse across steps

## Context

The pipeline executor in `packages/os/site-kernel/src/runtime/execute-pipeline.ts` creates fresh objects for each step: a new `KernelRuntimeContext`, a new I/O adapter, and separate telemetry log entries. The cache layer (`cache-layer.ts`) is opened and closed per command rather than reused. The `moduleHashCache` is a `Map` that is already shared within a pipeline run, but the `CacheLayer` (SQLite connection) is not.

Additionally, `executeRegisteredCommand` in `execute-command.ts` creates a new I/O adapter (read-only, recording, or default) for each command invocation. The adapter selection logic runs every time even though the adapter type is determined by the pipeline phase (read-only for validators, default for generators).

## Decision

The pipeline executor reuses the `CacheLayer` SQLite connection, the `KernelRuntimeContext` base object, and the I/O adapter across all steps within a single pipeline run, and batches telemetry writes to a single append at pipeline completion.

- The `CacheLayer` is opened once per pipeline run and closed after the last step, instead of per-command.
- The `KernelRuntimeContext` is created once with shared `workspaceRoot`, `logger`, and `io` fields; per-step fields (`commandName`, `args`) are set as properties on the shared object.
- The I/O adapter is selected once per pipeline phase (read-only for `build.check`, default for `build.prepare` and `build.post`) instead of per-command.
- Telemetry entries are collected in an in-memory array and written to the telemetry log in a single batch at pipeline completion.

## Justification

Each `CacheLayer` open/close cycle involves SQLite connection setup and teardown (~5–10ms). With ~40 steps in `build.prepare`, this is ~200–400ms of pure connection overhead. Reusing the connection saves this entirely.

Creating a new `KernelRuntimeContext` per step involves object allocation and property initialization. While individually cheap (~0.1ms), across 75 steps (40+15+20) it adds ~7.5ms — negligible individually but part of a broader pattern of per-step object churn.

I/O adapter selection involves checking `--read-only` and `--record-io` flags per command. In a pipeline context, these flags are constant across all steps in a phase — selecting once per phase eliminates redundant checks.

Batching telemetry writes reduces I/O syscalls. Currently, each step appends a line to the telemetry log — 75 file appends per full build. Batching to a single append reduces this to 3 (one per phase).

Alternatives considered:

- **Object pool**: pre-allocate a pool of context objects and rent/return them. Rejected as over-engineering — the objects are small and GC handles them efficiently. Reuse via mutation is simpler.
- **No telemetry batching**: keep per-step writes for real-time monitoring. Rejected because the telemetry log is not monitored in real-time — it's consumed post-hoc by `rfc.verification.emit` and audit tools. Batching is transparent to consumers.

## Consequences

- **Positive**: ~200–400ms saved per pipeline run from SQLite connection reuse. Reduced GC pressure from fewer object allocations. Reduced I/O syscalls from telemetry batching.
- **Positive**: The shared `CacheLayer` connection also benefits RFC-0685's mtime fast path — the `inputsMetadata` sidecar reads/writes use the same connection without reconnection overhead.
- **Negative**: If a step corrupts the shared `KernelRuntimeContext` (e.g. by mutating `workspaceRoot`), all subsequent steps see the corruption. Mitigation: per-step fields (`commandName`, `args`) are set before each step and cleared after; shared fields (`workspaceRoot`, `logger`, `io`) are read-only by convention.
- **Negative**: A crash mid-pipeline leaves the telemetry batch unwritten. This is acceptable because the pipeline report (returned to the caller) contains the same information and is the primary consumer.
- **Technical debt**: The I/O adapter selection is per-phase, not per-command. If a future pipeline mixes read-only and mutating steps in the same phase, the adapter type would need to be per-step again. This is not the case in any current pipeline.

## Evolution

If telemetry consumers evolve to need real-time streaming (e.g. a progress dashboard), the batching strategy would need to be revisited. A flush-on-interval or flush-on-N-entries approach would replace the single-batch-at-completion approach.

If RFC-0686's parallel execution is implemented, the shared `KernelRuntimeContext` cannot be mutated per-step (race condition). Each parallel step would need its own context object with shared `workspaceRoot`, `logger`, `io`, and `cacheLayer` fields. The per-step fields would be set on the per-step object, not the shared base.
