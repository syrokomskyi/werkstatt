---
workPacket: FORGE-KNOWLEDGE-02
status: ready
dependsOn: [FORGE-KNOWLEDGE-01]
findings: [F3, F5]
concern: code-mutation
---

# Packet 02 — Crash-safe, convergent compaction

## Objective

Move compaction onto packet 01's targeted writer and the canonical atomic-write utility. A successful plan leaves archive/live converged; any failure is lossless, accurately reported, and safe to retry.

The contract is per-file atomicity plus pair convergence, not an impossible claim that two independent filesystem paths change in one atomic operation.

## Preconditions

- Packet 01 is committed.
- `ParsedKnowledgeFile` exposes exact source spans.
- `applyKnowledgeEdits` passes byte-isolation tests.
- Working tree is clean.

## Required design

### Async execution boundary

Change `executeCompaction` to return `Promise<CompactReport>` and await it from `packages/forge/os/core/handlers/knowledge-compact.ts`. Update all direct tests. Do not use a floating Promise or a synchronous fallback.

### Prospective plan

For each `CompactFilePlan`, compute everything before the first write:

1. Reparse live and reject parse issues.
2. Reparse existing archive and reject parse issues.
3. Resolve each action against a unique live entry ID. A stale plan referencing a missing/changed ID fails that file without writes.
4. Build the target live content with targeted edits:
   - archive action → remove entry;
   - mark-stale → replace only metadata fence.
5. Build the target archive content:
   - existing archive entries remain raw and untouched;
   - new archived entries append in live order;
   - `archive-expired`/`archive-l0-retention` changes status to `archived`;
   - `archive-superseded` keeps `superseded`.
6. Reparse both target strings in memory or through a testable string parser seam; reject parse issues and duplicate IDs before writes.

Do not modify parser APIs merely to avoid a temporary file. A `parseKnowledgeSource(source, virtualPath)` pure primitive may be extracted from `parseKnowledgeFile`; the filesystem wrapper then delegates to it.

### Idempotent archive merge

Archive identity is `meta.id` within the companion file.

- If the target ID is absent, append it.
- If the target ID exists and its semantic archived form is identical, treat it as already staged and do not append.
- If the target ID exists with conflicting metadata/title/body, fail closed before live mutation and report `archive-id-conflict`.
- Never deduplicate by title, normalized body, or array position.

This rule is the recovery mechanism after a crash between archive and live replacement.

### Commit protocol

Use `writeFileIfChanged`/`writeFileAtomic`; no direct `writeFileSync` is allowed in the mutation path.

1. No archive actions: atomically replace live only if changed.
2. Archive actions:
   - atomically write archive first;
   - only after archive success, atomically write live;
   - if live fails, return `fail` with `recoveryRequired: true` and leave the archive copy durable;
   - the next run sees the same ID already in archive, skips append, and retries live removal.
3. Never roll back a durable archive by deleting it after live failure; that reintroduces a loss window.

A process crash may temporarily leave one ID in both files. That is an explicitly recoverable failure residue, not a successful final state. Loss of the only copy is forbidden.

### Report contract

Extend, do not rename/remove, the existing result:

```ts
interface CompactFileResult {
  // existing fields
  written: boolean;          // derived: liveWritten || archiveWritten
  liveWritten: boolean;
  archiveWritten: boolean;
  recoveryRequired: boolean;
  outcome: "noop" | "committed" | "failed" | "recovery-required";
}
```

Rules:

- dry-run and non-dry no-op: all write flags false, `outcome: "noop"`;
- full success with changes: `outcome: "committed"`;
- failure before any write: `outcome: "failed"`;
- archive durable/live failed: `outcome: "recovery-required"`;
- totals count completed moves/status changes, not merely planned actions;
- command status is `fail` if any file fails or requires recovery.

If exact field naming conflicts with an existing command-output convention, keep the semantics and document the chosen names in the module contract. Removing `written` is out of scope.

### Test seam

Inject or module-wrap the atomic writer so tests can fail deterministically on:

- archive stage/write;
- archive rename;
- live stage/write;
- live rename;
- second retry after an archive-first partial success.

Production defaults must still call the canonical Forge utility. Do not export Node-internal test setters from the public package root unless the existing `__set...ForTests` convention requires it.

## Affected artifacts

- `packages/forge/src/knowledge/compact.ts`
- `packages/forge/src/knowledge/parse.ts` only if extracting `parseKnowledgeSource`
- `packages/forge/src/knowledge/index.ts`
- `packages/forge/os/core/handlers/knowledge-compact.ts`
- `packages/forge/src/tests/compact.test.ts`
- `packages/forge/src/tests/knowledge-pbt.test.ts` for cross-file byte preservation
- `packages/forge/src/utils/fs-atomic.ts` only if a missing injectable seam is proven; do not change its public semantics
- Command manifest/generated ecosystem projection only if registered metadata changes

## Implementation steps

1. Add failing characterization tests for current no-op `written: true` and direct-write partial failure.
2. Extract prospective-content construction as a pure function and test it separately.
3. Add ID-aware archive merge and conflict refusal.
4. Convert execution/handler/tests to async.
5. Replace direct writes with archive-first canonical atomic writes.
6. Add truthful result fields and compute totals from committed outcomes.
7. Add failure injection and retry-convergence tests.
8. Search the production compaction path for remaining direct writes and misleading atomicity comments.

## Mandatory failure matrix

| Scenario | Required result | Required disk invariant |
| --- | --- | --- |
| No actions | pass/noop | both files byte-identical; all write flags false |
| Mark stale only | committed | only metadata fence changed in live |
| Archive new entry | committed | ID absent in live, present once in archive |
| Existing identical archive ID | committed on retry | no second archive append; live converges |
| Existing conflicting archive ID | fail | both files unchanged |
| Archive write/rename failure | fail | live unchanged; archive unchanged/atomic |
| Live write/rename failure after archive | recovery-required | ID present in archive and still in live; no loss |
| Retry after recovery-required | committed | ID present once in archive, absent in live |
| Invalid archive parse | fail | both files byte-identical |
| Two plans, first succeeds/second fails | fail overall | first converged; second satisfies its failure invariant |

Also assert that untouched entries and all pre-existing archive entries remain byte-identical.

## Validation commands

```sh
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/compact.test.ts src/tests/knowledge-pbt.test.ts src/tests/fs-atomic.test.ts
rtk pnpm --filter @warpgogol/forge build:check
rtk pnpm exec werkstatt run command.manifest.validate
```

Regenerate `docs/command-manifest.generated.yaml` only if command metadata or output metadata is represented there and validation proves drift.

## Completion criteria

- Production compaction mutations contain no `writeFileSync`/non-atomic fallback.
- Live is never changed before an archive copy is durable.
- Retry after every injected partial failure converges without loss or duplicate append.
- No-op and failed outcomes never report a successful live write.
- Existing live/archive entry bytes pass strict equality assertions.
- Handler awaits execution and returns non-zero for recovery-required state.
- Scoped tests, full Forge tests, `build:check`, and command manifest validation pass.
- Review has no unresolved High/Medium finding for F3/F5.

## Forbidden shortcuts

- Two `writeFileAtomic` calls described as a single atomic transaction.
- Live-first ordering.
- Deleting/rewriting archive as rollback after live failure.
- Catching write errors and continuing with `written: true`.
- Counting planned actions as committed totals.
- Title-based deduplication.
- Full serialization of an existing live/archive document.

## Escalation trigger

If the operator requires zero visible duplicate even after power loss between two path replacements, stop: that requires a journaled transaction store or different storage model and is a new architectural decision. The accepted contract for this packet is lossless, observable, convergent recovery.
