---
rfcId: RFC-0517
auditId: AUDIT-RFC-0517-01
date: 2026-07-24
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0517

## Verdict: Needs revision

Three Axis C failures undermine the RFC's factual accuracy: `@gogol/ontology` is missing from `packagesImpacted` despite requiring a schema change, `content.validate` is not in `SITES_CHECK_AUTHOR_PIPELINE` contrary to the RFC's claim, and the `executeKernelCommand` mechanism attributed to `mission.validate` is not used in `site-kernel-handoff`. The `--report-only` interaction (Axis F) also needs clarification.

## Mechanical validation (rfc.validate)

Pass — no violations targeting RFC-0517.

## Axis A — Structural completeness

- **Bordbuch entry shape mismatch.** The RFC (lines 250–258) shows a Bordbuch entry with fields `eventId`, `type`, and `reason`. The actual `BordbuchEntry` schema in `@gogol/ontology/operations` (`packages/ontology/src/operations/mission.ts:63-78`) uses `id` (format `event-NNNNNN`), `kind`, `summary`, `metadata`, `previousHash`, `hash`, etc. There is no `eventId`, `type`, or `reason` field. The `appendBordbuchEntry` helper signature (`packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts:91-104`) takes `kind`, `summary`, `actor`, and `options.metadata` — not `type` or `reason`. The example must be rewritten to match the real schema.

## Axis B — DNA alignment

No issues. DNA-46 and DNA-47 are real invariants (`docs/architecture-dna.md:199-205`). The RFC body explains how each is extended (pre-edit checkpoint for DNA-46, structural validation before git for DNA-47). No conflicts with existing DNA. `related[]` references (RFC-0356, RFC-0389, RFC-0480) are relevant and correctly described.

## Axis C — Ecosystem fit

- **`@gogol/ontology` missing from `packagesImpacted`.** The RFC Risks section (line 298) states "The type is documented in this RFC and must be added to the Bordbuch event type registry in `@gogol/ontology`." The `bordbuchEntryKindSchema` (`packages/ontology/src/operations/mission.ts:44-59`) is a closed `z.enum` that must be extended with `"preflight-skipped"`. This is a code change to `@gogol/ontology`, but `@gogol/ontology` is not listed in `packagesImpacted` (lines 51-53). It must be added.

- **`content.validate` not in `SITES_CHECK_AUTHOR_PIPELINE`.** The RFC (line 168) claims "All validators already exist in `SITES_CHECK_AUTHOR_PIPELINE`." However, `content.validate` (the bare command) is not in `SITES_CHECK_AUTHOR_PIPELINE` (`packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts:15-337`). The pipeline contains `pbp.content.validate` (line 261), `content.references.validate` (line 263), `content.links.validate` (line 277), `content.filename.validate` (line 321), etc., but not `content.validate`. The command exists in the command table (`packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts:68`) and in `contract-full.ts:68`, but not in the author pipeline. Either the RFC must remove `content.validate` from the warning set, or it must acknowledge that this validator is not currently in the pipeline and explain how the preflight will invoke it.

- **`executeKernelCommand` not used in `site-kernel-handoff`.** The RFC (line 168) says "The preflight reuses them via `executeKernelCommand` with an app-scoped context pointing at the workpiece directory — the same mechanism used by `mission.validate`." However, `executeKernelCommand` is not imported or called anywhere in `packages/os/site-kernel-handoff/src/` (grep returns no results). `mission.validate` (`packages/os/site-kernel-handoff/src/mission/mission-materialization-commands.ts`) uses `runKernelWire` and pipeline runners, not `executeKernelCommand` directly. The RFC should describe the actual invocation mechanism or clarify that `executeKernelCommand` will be newly imported from `@gogol/site-kernel`.

## Axis D — Forward-only compliance

No issues. No compatibility shim, no legacy path. `--skip-preflight` is an escape hatch with audit trail, not a dual-path.

## Axis E — Agent-facing policy

No issues. Status is `draft`, no self-authorizing language. Implementation notes reference RFC-0224, RFC-0334, RFC-0330. No content authoring in acceptance criteria. No cookies or client-side persistence.

## Axis F — Pragmatism

- **`--report-only` interaction inconsistency.** The RFC (line 133, 268) states that `--report-only` mode runs the preflight for diagnostics without blocking. However, the current `runMissionMaterialize` code (`packages/os/site-kernel-handoff/src/mission/mission-materialize.ts:435-454`) returns early when `reportOnly` is true — before staging, `generateFullBoilerplate`, `atomicMoveDir`, and therefore before the preflight gate's insertion point. The RFC does not address how the preflight can run in report-only mode when the current code exits before the workpiece is assembled. The RFC must either (a) specify that report-only mode is restructured to stage + assemble + preflight but skip `git init`, or (b) clarify that `--report-only` preflight is a separate code path that doesn't share the staging logic.

## Axis G — Blind spots

- **`WRITER_ROLE_KINDS` update not specified.** The `WRITER_ROLE_KINDS` map in `bordbuch-io.ts:33-41` controls which writer-roles may append which Bordbuch entry kinds. The `mission` writer-role currently allows `["mission-open", "mission-close", "mission-abort"]`. The new `preflight-skipped` kind must be added to a writer-role — likely `mission` — but the RFC does not specify which writer-role to use. The `appendBordbuchEntry` call will fail `validateWriterRole` if the kind is not mapped.

- **Concurrent materialization.** The RFC does not mention concurrent `mission.materialize` calls for the same system. The existing `acquireLock` mechanism (lines 371-384) serializes operations, so this is handled, but the preflight report path (`evidence/preflight-report.json`) could be overwritten by a concurrent materialization of a different mission for the same system. This is low-risk since only one open mission per system is allowed (DNA-46), but worth noting.

## Questions for the author

1. Why is `@gogol/ontology` not listed in `packagesImpacted` when the `bordbuchEntryKindSchema` must be extended with `"preflight-skipped"`? Add it or justify why the schema change is not needed.
2. `content.validate` is not in `SITES_CHECK_AUTHOR_PIPELINE`. Should it be removed from the warning set, or should the RFC acknowledge that the preflight will invoke a validator not currently in the author pipeline and describe how?
3. How will the preflight gate run in `--report-only` mode when the current code returns early before the workpiece is staged? The RFC must specify the restructured control flow.
4. Which `writerRole` will the `preflight-skipped` Bordbuch entry use, and will it be added to the `mission` writer-role in `WRITER_ROLE_KINDS`?
5. Will `executeKernelCommand` be newly imported from `@gogol/site-kernel`, or will the preflight use a different invocation mechanism? The RFC should describe the actual mechanism, not one attributed to `mission.validate` that doesn't exist.
