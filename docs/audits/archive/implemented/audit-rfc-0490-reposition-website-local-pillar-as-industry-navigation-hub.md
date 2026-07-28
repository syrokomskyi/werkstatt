---
rfcId: RFC-0490
auditId: AUDIT-RFC-0490-01
date: 2026-07-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0490

## Verdict: Needs revision

The RFC is architecturally sound in its core proposal (blueprint-driven pillar hub, existing archetypes, CollectionPage JSON-LD) but has one serious ecosystem-fit flaw (migrator misapplied to a platform package file), one design gap (`collectionItems` flow through the callback-based semantic model is under-specified), and several minor completeness gaps. The flaws are fixable without changing the core decision.

## Mechanical validation (rfc.validate)

Could not run — `pnpm exec site-kernel run rfc.validate` fails due to an environment issue (`ERR_PNPM_IGNORED_BUILDS` for `libxmljs2@0.32.0`). The semantic audit proceeds without the mechanical floor; the operator should run `rfc.validate RFC-0490 --json` manually before architecture review.

## Axis A — Structural completeness

- **`semanticType: "collection"` missing from blueprint YAML config.** The Structured data changes section (line 255) states "The depth-0 pillar page's `semanticType` is set to `"collection"`", but the blueprint YAML configuration block (lines 132–222) does not include `semanticType: collection` in the depth-0 level. The YAML config should show this field so the migrator and implementation notes are self-consistent.

- **`collectionItems` flow under-specified.** The RFC says "The page handler (`resolve-route.ts`) populates `collectionItems` for `"collection"`-typed surface pages" (line 402), but the semantic model is built via an injected callback (`buildSemanticModel` in `resolve-route.ts:412`). The `SemanticModelOptions` interface (`packages/share/src/astro/page-handler/types.ts:25–34`) has no `collectionItems` field. The RFC does not describe how `collectionItems` flows from `resolve-route.ts` through the callback to the `SemanticPageModel`. The `SemanticModelOptions` type needs a new optional field, or the callback signature needs to change — the RFC should specify which.

- **Output format not documented.** The RFC does not document the `--json` output shape for `surface.hub.validate`. The file system responsibilities table lists the validator file but the Design section only describes the checks, not the JSON output structure.

- **Exit codes not specified.** The Failure modes section (lines 282–288) specifies fail-vs-warn behavior but does not document exit codes (0 for pass, 1 for fail, 2 for warn-only).

## Axis B — DNA alignment

- **DNA-24 (Block-declarative pages):** The RFC satisfies DNA-24 — the pillar page is a block-declarative `PageEntry` with `blocks[]` using existing archetypes (hero, markdown, audience-cards, final-cta). The architectural fit section (line 292) confirms "A generated page is an ordinary block-declarative PageEntry." Adequate.

- No new DNA invariant is established. No conflicts with existing invariants. `related[]` references are relevant and not decorative.

## Axis C — Ecosystem fit

- **Migrator architectural mismatch (serious).** The RFC proposes a migrator (RFC-0479) to update `packages/ontology/blueprints/website-local.yaml` (line 421). However, the migrator registry (`packages/os/site-kernel-handoff/src/migrators/registry.ts`) is designed for **Sternsystem data migrations** — the `Migrator.transform` signature takes `SternsystemData` and operates on files within a Sternsystem repo root (`data.rootPath`). The blueprint YAML at `packages/ontology/blueprints/website-local.yaml` is a **platform package file** in the monorepo, not Sternsystem data. Migrators run during `mission.migrate` against the materialized workpiece's authored content; they do not modify platform source files. The blueprint YAML change should be a direct platform code change in the RFC implementation, not a migrator. The `Migrator` interface (`fromVersion`/`toVersion`/`transform(SternsystemData)`) does not fit a platform YAML file edit.

- **Compass sync not mentioned.** The RFC changes shared package contracts (`@gogol/surface` `BlueprintLevel` type, `@gogol/share` `SemanticPageType`, `@gogol/ontology` blueprint schema) but does not identify which `docs/*.xml` files need synchronization. Root AGENTS.md Compass document duties require updating affected `docs/*.xml` when shared package contracts change. At minimum `docs/technology.xml` and `docs/knowledge-graph.xml` likely need updates for the new `pillar` field and `"collection"` semantic type.

- **AGENTS.md updates not identified.** The RFC does not mention whether `packages/surface/AGENTS.md` or `packages/share/AGENTS.md` need updates for the new `pillar` field and `"collection"` semantic type. The `packages/share/AGENTS.md` table lists `SemanticPageType` under `@gogol/share/semantic` — adding `"collection"` should be reflected there.

- **`surface.validate` in `commands.changed` but changes not described.** The RFC lists `surface.validate` as a changed command (line 45) but the body does not describe what changes to it. The baker changes are part of `surface.generate`'s pipeline (via `bakePage`), and `surface.hub.validate` is a new separate command. What does `surface.validate` gain or lose? If it gains `pillar` field validation, that should be stated; if not, it should be removed from `commands.changed`.

- **`surface.generate` in `commands.changed` but change is implicit.** The baker changes (`bakePage` depth-0 pillar specialization) are called by `surface.generate`'s expansion pipeline. The RFC should explicitly state that `surface.generate`'s output changes for depth-0 pillar pages (new block layout) so the command lifecycle is clear.

## Axis D — Forward-only compliance

No issues. The `pillar` field is an optional extension on `BlueprintLevel` — surfaces without it are unaffected. No compatibility shim, no dual-path, no legacy code behind a flag. The `semanticType: "collection"` is additive (new type in a union, new branch in a switch). Deprecation is not needed.

## Axis E — Agent-facing policy

- **Status gate:** The RFC has `status: draft` and explicitly states "Agents MAY implement code changes only when this RFC has status `accepted`" (line 492). No self-authorizing language. ✓

- **Implementation notes** do not reference RFC-0224 (accepted→implemented transition) or RFC-0330 (verification evidence for probe-bearing RFCs). The RFC has acceptance criteria with verification commands (`surface.hub.validate --site warpgogol-com`, `content.references.validate --site warpgogol-com`, dev build) — RFC-0224 governs the transition. Minor — the notes are explicit behavioral rules but could cite the governance RFCs.

- **Anti-fabrication:** The acceptance criteria distinguish between code changes (type extensions, baker logic, validator) and content (blueprint YAML content via migrator). The blueprint content (hero headings, adaptation dimensions, CTAs) is authored content in the RFC itself, not claimed to be auto-generated. ✓

- **Storage policy:** No persistence changes. ✓

## Axis F — Pragmatism

- **`@gogol/ui` in `packagesImpacted` but no changes described.** The RFC lists `@gogol/ui` in `packagesImpacted` (line 54) but no `@gogol/ui` file appears in the file system responsibilities table (lines 267–278), and no changes to `@gogol/ui` are described in the body. The `anchorId` is a universal block prop (`packages/os/site-kernel-checks/src/page-block.ts:52`) and `linkedCardGrid` is in `bake-blocks.ts` (site-kernel-checks). Either remove `@gogol/ui` from `packagesImpacted` or describe what changes in `@gogol/ui`.

- **`surface.hub.validate` vs. extending `surface.validate`.** The RFC does not explain why a separate command is needed instead of extending the existing `surface.validate` with hub-specific checks. `surface.validate` already validates surface configuration; adding pillar-specific rules as a section within it would reduce command surface. The alternatives section should justify the separate command.

- **Scope discipline:** `appsImpacted` lists only `warpgogol-com` — correct, as `website-local` is only deployed there. `nonGoals` are explicit and meaningful (7 items covering URL changes, search, schema changes, cross-page edits). ✓

## Axis G — Blind spots

- **False-positive rate not estimated.** The `pillar-commercial-promise` check scans industry `metaDescription` values for known unfulfillable promise phrases (line 246–250). The RFC says "This is a safety net" but does not estimate the false-positive rate or describe how to suppress noise if a legitimate description contains one of the phrases (e.g. in a quote or negation).

- **Edge cases partially covered.** The RFC considers empty catalog (`pillar-no-published-industries`, fail) and orphan industries (`pillar-orphan-industry`, warn). ✓ It does not consider what happens when the `pillar.productPrice.priceRef` PBP reference cannot be resolved at render time (the Risks section mentions this but the failure mode is not in the validator's failure modes list).

- **Performance:** `surface.hub.validate` scans 2–15 industries and checks `metaDescription` strings — trivial cost. Not a bottleneck. ✓

- **Migration path:** Covered by the migrator proposal (which is architecturally mismatched — see Axis C). If the blueprint YAML is updated as a direct platform code change instead, the migration path is simply "update the YAML in the implementation commit."

## Questions for the author

1. **Migrator vs. platform code change:** The migrator registry (RFC-0479) operates on `SternsystemData` (authored content in a Sternsystem repo). `packages/ontology/blueprints/website-local.yaml` is a platform package file. Should the blueprint YAML update be a direct platform code change in the implementation commit rather than a migrator? If a migrator is truly needed, what Sternsystem data does it transform?

2. **`collectionItems` flow:** The semantic model is built via an injected `buildSemanticModel` callback in `resolve-route.ts`. `SemanticModelOptions` has no `collectionItems` field. Should `SemanticModelOptions` gain a `collectionItems` field, or should the callback be extended, or should `resolve-route.ts` set `collectionItems` on the returned `SemanticPageModel` after the callback returns?

3. **`surface.validate` changes:** The RFC lists `surface.validate` in `commands.changed`. What specific changes does `surface.validate` gain? If it validates the new `pillar` field on the blueprint, that should be stated. If not, should it be removed from `commands.changed`?
