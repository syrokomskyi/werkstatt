---
rfcId: RFC-0473
auditId: AUDIT-RFC-0473-01
date: 2026-07-20
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0473

## Verdict: Needs revision

The RFC correctly identifies the dual-schema problem and proposes a sound unification direction. However, it omits the DNA-46 prose update, does not address Compass XML synchronization, and leaves a pipeline scope mismatch that will block implementation.

## Mechanical validation (rfc.validate)

Pass (with 1 warning). V-12: `supersedes` includes RFC-0276, but RFC-0276's `supersededBy` is empty. This is expected for a draft — the back-link is set when the RFC transitions to `accepted`, not during draft.

## Axis A — Structural completeness

No issues. All required sections are present with real content. Decision is in present tense. CLI surface shows exact invocations. TypeScript contracts are minimal. File system responsibilities table names concrete paths. Failure modes specify behavior. Rollout describes default behavior and adoption path. Six alternatives with honest rejection reasons. Acceptance criteria are checkable. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

**Finding B-1: DNA-46 prose update not mentioned.** The RFC `satisfies: [DNA-46]` and states it "strengthens DNA-46 by making the Bordbuch the single immutable record for all Sternsystem events — lifecycle and runtime." However, DNA-46's prose in `docs/architecture-dna.md:201` says: "Every mission is recorded in the Sternsystem's Bordbuch." The RFC extends the Bordbuch beyond mission events to runtime events (PSEO, IndexNow, breaker). DNA-46's prose must be updated to reflect that the Bordbuch records both lifecycle and runtime operational events. The RFC does not list `docs/architecture-dna.md` in its file system responsibilities table and does not mention the DNA-46 prose update in its acceptance criteria. Compare with RFC-0472 which explicitly updated DNA-45 prose.

## Axis C — Ecosystem fit

**Finding C-1: Compass XML synchronization not mentioned.** The root AGENTS.md states: "Update the affected `docs/*.xml` files in the same change whenever a task changes repository-wide requirements, shared package contracts, app-package relationships, or verification policy." This RFC changes shared package contracts (deleting `@gogol/surface/bordbuch.ts`, extending `@gogol/ontology/operations` enums) and verification policy (replacing `site.bordbuch.validate` with `bordbuch.validate` in pipelines). The RFC should identify which Compass files need synchronization — at minimum `docs/requirements.xml` (verification policy change) and `docs/source-markup.xml` (module ownership change for deleted files).

**Finding C-2: AGENTS.md updates not mentioned.** `packages/AGENTS.md` describes `@gogol/surface` as: "governance/index.ts groups pure Zod schema bags (bordbuch, breaker, evidence-records, fleet, governance, visibility, module-context)." After deleting `bordbuch.ts` and removing bordbuch re-exports from `governance/index.ts`, this description must be updated to remove "bordbuch" from the schema bag list. The RFC's file system responsibilities table does not include `packages/AGENTS.md`. Additionally, `packages/os/site-kernel-checks/AGENTS.md` references `site-bordbuch.ts` implicitly through its command table — the `site.bordbuch.*` command rows must be removed.

**Finding C-3: Pipeline scope mismatch.** The RFC states `bordbuch.validate` is a workspace-scope command (requiring `--system` flag). The `sites-check-author` pipeline at `pipelines/sites-check-author.ts:106` currently runs `site.bordbuch.validate` as an app-scoped step. The RFC says this step is replaced with `bordbuch.validate` but does not explain how a workspace-scope command receives the `--system` flag in an app-scoped pipeline context. The pipeline runner would need to resolve the current system id from the app context and pass it as `--system`. The RFC should document this resolution mechanism or propose moving the validation step to a workspace-scope pipeline.

## Axis D — Forward-only compliance

No issues. The RFC deletes legacy code paths (`site-bordbuch.ts`, `surface/bordbuch.ts`) in the same wave. No compatibility shims, no dual-paths, no flags. `site.bordbuch.*` commands are removed, not deprecated-then-removed. The `deploy` → `deployment` kind mapping is a direct rename, not a parallel kind.

## Axis E — Agent-facing policy

No issues. Status gate is correct: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes reference RFC-0224 (accepted→implemented) and RFC-0334 (supersede escalation). No self-authorizing language. No content authoring claims. No storage policy violations.

## Axis F — Pragmatism

**Finding F-1: `commands.changed` entries may not need code changes.** The RFC lists `bordbuch.append` and `bordbuch.validate` under `commands.changed`. However, examining `bordbuch.module.ts`, both commands already accept any `kind` from the `bordbuchEntryKindSchema` enum and any `writer-role` string. Extending the enum and `WRITER_ROLE_KINDS` map in `bordbuch-io.ts` automatically extends the commands' accepted input sets without changing command code. The commands are "changed" semantically (new accepted kinds) but not structurally. This is a minor classification issue — the commands could be omitted from `changed` or the RFC could note that the change is schema-level, not command-level.

## Axis G — Blind spots

**Finding G-1: Orphaned `status.generated.yaml` files not addressed.** The RFC says "This eliminates the `status.generated.yaml` intermediate file" but does not address what happens to existing `status.generated.yaml` files in `apps/` (orphaned by RFC-0381) or any that might exist under `systems/`. The acceptance criteria should include removing or ignoring these orphaned files to prevent confusion.

**Finding G-2: `fleet-leitstand.ts` path resolution.** The RFC's caller migration table says `fleet-leitstand.ts` reads from `readBordbuch(workspaceRoot, systemId)`. The current code at `fleet-leitstand.ts:191-196` uses `ref.path` to construct the app directory and reads `src/bordbuch/status.generated.yaml`. In the post-RFC-0381 topology, `ref.path` points to `systems/<id>/`, but the code reads `join(ref.path, "src", "bordbuch", "status.generated.yaml")` which would be `systems/<id>/src/bordbuch/status.generated.yaml` — a path that does not exist. The RFC should note that `fleet-leitstand.ts` must resolve the system id from the fleet ref and call `readBordbuch(workspaceRoot, ref.site)` (or equivalent), and that the `FleetSiteRef` type may need a `systemId` field if `ref.site` is not already the system id.

## Questions for the author

1. How does the workspace-scope `bordbuch.validate --system <id>` run inside the app-scoped `sites-check-author` pipeline? Does the pipeline runner inject `--system` from the app context, or should the validation step move to a workspace-scope pipeline?
2. Which Compass XML files (`docs/requirements.xml`, `docs/technology.xml`, `docs/source-markup.xml`) need synchronization when `site.bordbuch.*` commands are removed and `bordbuch.status` is added?
3. What happens to existing `src/bordbuch/status.generated.yaml` and `src/bordbuch/events.ndjson` files left in orphaned `apps/` directories — are they cleaned up, ignored, or documented as orphaned?
