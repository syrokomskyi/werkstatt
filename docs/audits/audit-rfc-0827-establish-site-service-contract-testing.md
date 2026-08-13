---
rfcId: RFC-0827
auditId: AUDIT-RFC-0827-01
date: 2026-08-13
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0827

## Verdict: Needs revision

The RFC has a solid conceptual foundation but contains a significant architectural mismatch in its primary example (send-message/integration-route is intra-package, not site-to-service), omits a required subpath export for cross-package imports, and proposes a contract schema that duplicates the existing `IntegrationEventSchema` without acknowledging it. These findings must be resolved before implementation.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0827 --json` returns zero violations.

## Axis A — Structural completeness

- **A1: Pipeline placement is ambiguous.** The RFC says `contract.validate` is added "after `manifest.contract.validate`" and the code example shows `{ command: "contract.validate" }` with "// ... existing steps ..." around it. But `PACKAGES_CHECK_PIPELINE` (`packages/werkstatt-site/src/checks/pipelines/packages-check.ts:34-198`) has 163 steps. "After `manifest.contract.validate`" could mean position 2 (right after the first step) or anywhere in the pipeline. The RFC should specify the exact position — likely at the end of the pipeline, near the other contract validators (`props.contract.validate` at line 149, `section.contract.validate` at line 42).

- **A2: CONTRACT-05 references "contract version" but contracts have no version field.** The `contract` object pattern (RFC line 131-138) has `id`, `name`, `direction`, `request`, `response`, `description` — no `version` field. Rule CONTRACT-05 says "Both sides reference the same contract version" but there is no version to compare. Either add a `version` field to the contract pattern or remove CONTRACT-05.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-66]` is correct — DNA-66 exists in `docs/architecture-dna.md:279-281` and the RFC implements the L3 layer (site ↔ service API schema validation) as described by the invariant.

## Axis C — Ecosystem fit

- **C1: No subpath export mentioned.** The RFC proposes contract schemas in `packages/werkstatt-site/src/testing/contract/` and says service handlers import them (`services/*/src/*.ts` imports relevant contract schemas). But `packages/werkstatt-site/package.json` has no `testing/contract` subpath export. Per `packages/AGENTS.md`: "Cross-package imports of specific modules (not the barrel) require a subpath export." The RFC must mention adding a `@warpgogol/werkstatt-site/testing/contract` subpath export to `package.json`.

- **C2: No AGENTS.md update mentioned.** The contract testing convention (where contracts live, how to register them, how `contract.validate` works) should be documented in `packages/werkstatt-site/AGENTS.md` or `packages/AGENTS.md`. The RFC's file system responsibilities table doesn't list any AGENTS.md updates.

- **C3: The `send-message`/`integration-route` contract is framed as "site ↔ service" but both sides live in `packages/werkstatt-site`.** The site-side handler is `send-message-section.api.ts` (`packages/werkstatt-site/src/domain/ui/sections/send-message/`) and the delivery handler is `delivery-handler.ts` (`packages/werkstatt-site/src/domain/integration/`). Both are in the same package. The RFC's file system responsibilities table (line 206-208) lists `packages/werkstatt-site/src/domain/integration/delivery-handler.ts` as the "service-side" reference, but this is a shared package module, not a `services/*` workspace. The `lagebild-sync` service (`services/lagebild-sync/src/index.ts`) is a thin wrapper that re-exports `createLagebildSharedSyncWorker` from `@warpgogol/werkstatt-site/integration-adapter-supabase-crm/worker` — it doesn't handle the QStash callback directly. This mismatch could confuse implementers about where to add the contract import.

## Axis D — Forward-only compliance

No issues. The grace period for CONTRACT-03/04 escalates from warnings to errors (forward-only direction). No backward compatibility layers or dual-paths proposed.

## Axis E — Agent-facing policy

- **E1: No NEEDS CLARIFICATION markers.** Good.

- **E2: Implementation notes reference RFC-0224 (accepted→implemented transition) but don't mention RFC-0476** (stamp via `rfc.implement.stamp`, not manual frontmatter edits). Other RFCs in the batch have the same gap, so this is a batch-level convention rather than a unique finding.

## Axis F — Pragmatism

- **F1: `contract.list` could be a `--list` flag on `contract.validate`.** The RFC doesn't justify why listing contracts requires a separate command. `contract.validate --list` would serve the same purpose with one less command registration. If the RFC keeps `contract.list` as a separate command, it should explain why the flag approach is insufficient.

- **F2: The RFC doesn't acknowledge the existing `IntegrationEventSchema`.** `packages/werkstatt-site/src/domain/integration/orchestration.ts:275-292` already defines a Zod schema for `IntegrationEvent` that validates inbound QStash callbacks. The proposed `SendMessageRequestSchema` and `IntegrationRouteRequestSchema` overlap with this existing schema. The RFC should explain whether contract schemas reuse, wrap, or replace `IntegrationEventSchema`. Without this, implementation risks creating duplicate, divergent schemas for the same data shape.

## Axis G — Blind spots

- **G1: Performance cost not specified.** `contract.validate` scans for imports across site and service source files. The RFC doesn't estimate how many files are scanned, what the import-checking regex/AST approach is, or the expected duration. Given that `PACKAGES_CHECK_PIPELINE` already has 163 steps, adding a slow file-scan step is a concern.

- **G2: Grace period duration unspecified.** The RFC says CONTRACT-03 and CONTRACT-04 are "warnings, not errors" during a grace period but doesn't specify how long the grace period lasts. RFC-0824 specifies "2 weeks." RFC-0827 should specify a duration or escalation trigger.

- **G3: False negatives for import checking not considered.** The RFC acknowledges false positives (file imports contract for unrelated reasons) but not false negatives: a file may use the contract shape via re-export, structural typing, or inline duplication without directly importing the contract module. The RFC should acknowledge this limitation and explain why import checking is still valuable despite it.

## Questions for the author

1. Does the `send-message` contract schema reuse `IntegrationEventSchema` from `orchestration.ts:275`, or does it define a parallel schema? If parallel, how will schema drift between the two be prevented?
2. Where exactly in `PACKAGES_CHECK_PIPELINE` should `contract.validate` be inserted — after `manifest.contract.validate` (position 2), after `props.contract.validate` (near the end), or at the pipeline end?
3. What subpath export path should services use to import contract schemas — `@warpgogol/werkstatt-site/testing/contract` or something else?
