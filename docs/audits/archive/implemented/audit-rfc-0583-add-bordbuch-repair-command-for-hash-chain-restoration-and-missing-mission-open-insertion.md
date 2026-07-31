---
rfcId: RFC-0583
auditId: AUDIT-RFC-0583-01
date: 2026-07-29
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0583

## Verdict: Needs revision

The RFC proposes a well-scoped repair command for the most common bordbuch corruption scenario, but it has a critical unresolved conflict with RFC-0355 §3.4 (append-only invariant: "no command may rewrite or renumber historical events"). The repair algorithm explicitly recomputes all `id`, `previousHash`, and `hash` fields — modifying existing entries — yet the RFC neither supersedes nor amends RFC-0355, nor acknowledges this tension. Several type inconsistencies and missing ecosystem-fit details also need resolution.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **`BordbuchRepairResult` missing `orphans` field for dry-run.** The dry-run output section (line 210) states "The `data.orphans` array shows planned insertions with derived metadata," but `BordbuchRepairResult` (lines 153–159) has no `orphans` field. The `BordbuchRepairPlan` type has `orphans`, but the result type does not. Either the result type needs an optional `orphans` field for dry-run mode, or the dry-run output should reference the plan type.

2. **`runBordbuchRepair` signature inconsistent with ecosystem pattern.** The function takes `(workspaceRoot: string, systemId: string, options?: {...})` (lines 161–173), but every existing bordbuch command handler follows the `(input: KernelCommandInput, context: KernelRuntimeContext) => Promise<KernelCommandResult<T>>` pattern (see `bordbuch-validate.ts:31–34`). The RFC's signature would require a wrapper adapter at registration time. The contract should match the existing pattern.

3. **`--json` listed as a flag.** Line 133 lists `--json` as a command-specific flag, but `--json` is handled by the kernel CLI framework automatically and is not declared in any existing bordbuch command registration (see `bordbuch.module.ts`). Remove it from the flag list.

## Axis B — DNA alignment

1. **Critical: unresolved conflict with RFC-0355 §3.4 append-only invariant.** RFC-0355 (archived/implemented) states: "Entries may only be added; existing entries MUST NOT be modified, reordered, or removed" and "Corrections are append-only `erratum` entries; no command may rewrite or renumber historical events." The repair algorithm (step 5, line 182) recomputes all `id`, `previousHash`, and `hash` fields — which means modifying every entry after the insertion point. The RFC's `amends: []` and `related: [RFC-0355]` do not properly address this relationship. Per AGENTS.md: "If it changes a DNA invariant, it must `supersede` the establishing RFC — not amend it." The RFC must either: (a) `amends: [RFC-0355]` with an explicit exception clause for repair, (b) `supersedes: [RFC-0355]` (disproportionate for a repair command), or (c) explicitly position `bordbuch.repair` as a meta-level disaster-recovery tool that operates outside the bordbuch's own append-only protocol (analogous to `fsck` for a filesystem), and state this in the Architectural fit section.

2. **DNA-51 satisfaction is incomplete.** DNA-51 requires "shared lock, idempotency, and atomic staging primitives." The RFC mentions atomic writes (step 7) and lock failure (failure modes), but does not mention idempotency. If an operator runs `bordbuch.repair` twice, the second run should be a no-op (or the RFC should document that repeated repair is safe because the second `validateBordbuch` would find no violations). The RFC should explicitly address idempotency behavior.

## Axis C — Ecosystem fit

1. **Module registration location is ambiguous.** The RFC says "registered in the `handoff` module" (line 243), but bordbuch commands are registered in `createBordbuchModule()` in `bordbuch.module.ts` (and re-exported via `bordbuch/index.ts`). The RFC should specify `bordbuch.module.ts` as the registration location and mention that `runBordbuchRepair` should be exported from `bordbuch/index.ts` alongside the other handlers.

2. **`computeEntryHash` is not exported.** The repair algorithm needs to recompute hashes, but `computeEntryHash` in `bordbuch-io.ts:69` is a private function. The RFC must mention that it will be exported (or that a new public hashing helper will be added) for the repair module to use.

3. **Missing command registration details.** Existing bordbuch commands declare `mutatesState: true`, `writes`, `reads`, `cacheable: false`, and `supportsAllSites: false` in their registrations (see `bordbuch.module.ts`). The RFC doesn't mention these registration metadata fields. The implementation will need them, and the RFC should at least note `mutatesState: true` and the `writes`/`reads` paths.

4. **AGENTS.md update not mentioned.** `packages/os/site-kernel-handoff/AGENTS.md` documents bordbuch commands (append, validate, status, generate) and the git synchronization behavior. Adding `bordbuch.repair` requires updating this AGENTS.md. The RFC should list it as a documentation surface to update.

5. **Writer-role surface bypass not addressed.** RFC-0355 §3.3 establishes a writer-role validation surface — `bordbuch.append` validates `--writer-role` against allowed kinds. The repair command directly writes to the file, bypassing this surface. The RFC should acknowledge this bypass and explain why it is acceptable (the `mission` writer-role is implied for inserted `mission-open` events, but the validation is skipped because the repair command is a disaster-recovery tool, not a normal append path).

## Axis D — Forward-only compliance

No issues. The RFC does not propose backward compatibility layers, dual-paths, or legacy maintenance behind a flag.

## Axis E — Agent-facing policy

1. **Status gate is correct.** Line 255: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." This is proper status-gate language.

2. **Anti-fabrication guard is good.** Lines 257–259 explicitly prohibit proactive use and fabrication of events that did not occur.

3. **Missing RFC references in implementation notes.** The implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation), but do not reference RFC-0476 (stamp command) or RFC-0362 (consistency primitives for lock/idempotency). The RFC should reference RFC-0362 since it uses DNA-51 primitives.

## Axis F — Pragmatism

1. **`BordbuchRepairPlan` has unused informational fields.** `hashChainBroken` and `eventIdGaps` (lines 149–150) are informational but not used by the repair algorithm — the algorithm always recomputes all hashes and event-ids regardless. These fields could be useful for dry-run diagnostics, but the RFC doesn't show them in the output format. Either include them in the dry-run output or remove them from the type.

2. **`--mission` flag semantics are unclear.** If multiple orphans exist, repairing only one leaves the bordbuch still invalid (the post-repair `validateBordbuch` would fail on the remaining orphans). The RFC should clarify: does `--mission` repair only that one orphan and then fail if others remain? Or does it filter which orphan to repair while still requiring all orphans to be resolved? The current description ("Repair only the specified mission id") is ambiguous.

## Axis G — Blind spots

1. **`occurredAt` ordering not addressed.** RFC-0355 §3.4 specifies "occurredAt values are non-decreasing." The current validator (`bordbuch-io.ts:163–264`) does not enforce this, but it is an established invariant. When inserting a `mission-open` event before a `mission-close`, the `occurredAt` of the inserted event must be ≤ the `occurredAt` of the `mission-close`. The RFC says metadata is "auto-derived from the corresponding mission-close event" (line 132) but does not specify how `occurredAt` is derived. If derived from the close event's `occurredAt`, this is safe. If set to `new Date().toISOString()`, it could violate ordering. The RFC should specify the derivation rule for `occurredAt`.

2. **Multiple orphans insertion order.** The algorithm handles multiple orphans (step 3 says "for each orphan-mission-close"), but doesn't specify insertion order. If two orphans exist at different positions in the log, inserting both `mission-open` events and then resequencing could produce unexpected `occurredAt` ordering. The RFC should specify that orphans are processed in log order and that each `mission-open` is inserted immediately before its corresponding `mission-close`/`mission-abort`.

3. **Concurrent execution not addressed.** Two operators running `bordbuch.repair` simultaneously could produce conflicting writes. The RFC mentions "Lock failure" as a failure mode but doesn't specify the lock scope or mechanism. Existing bordbuch commands do not explicitly acquire locks in their handlers — the RFC should clarify whether the repair command needs an explicit `system:<id>` lock (per DNA-51 / RFC-0362) and how it interacts with concurrent `bordbuch.append` or `mission.open`/`mission.close` operations.

4. **`status` field for inserted events.** The RFC doesn't specify the `status` field for inserted `mission-open` events. Existing `mission-open` entries use `status: "done"`. The repair command should explicitly set `status: "done"` for inserted events.

## Questions for the author

1. How does `bordbuch.repair` reconcile with RFC-0355 §3.4's "no command may rewrite or renumber historical events"? Should the RFC `amends: [RFC-0355]` with an explicit exception, or should it position the repair command as a meta-level tool outside the bordbuch's own protocol?

2. What is the `occurredAt` derivation rule for auto-derived `mission-open` events? Should it be copied from the corresponding `mission-close` event, or derived another way?

3. What happens when `--mission` is specified but other orphans remain? Does the command repair only the specified orphan and fail the post-repair validation, or does it refuse to run until all orphans are addressable?
