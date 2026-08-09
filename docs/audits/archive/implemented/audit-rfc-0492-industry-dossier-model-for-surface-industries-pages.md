---
rfcId: RFC-0492
auditId: AUDIT-RFC-0492-01
date: 2026-07-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0492

## Verdict: Needs revision

The RFC is structurally well-formed and addresses a real ecosystem gap (depth-1 industry pages as engineering dossiers). However, several design gaps must be resolved before implementation: the `SemanticModelOptions`/`SemanticPageType` plumbing for the JSON-LD correction is unspecified, the `BlueprintDossier` interface is missing, `claimRestrictions` is contradictory (per-record field vs. global closed list), `@gogol/pbp` is omitted from `packagesImpacted`, and the migrator makes content judgments (`notdienst` hardcoding) that violate the mechanical-transform principle.

## Mechanical validation (rfc.validate)

Pass — `pnpm exec werkstatt run rfc.validate RFC-0492 --json` returns `status: "pass"`, 0 violations.

## Axis A — Structural completeness

No issues. All required sections are present: Context, Problem, Decision, Architectural fit, Design (CLI surface, TypeScript contracts, file system responsibilities, output format, failure modes), Rollout, Alternatives considered, Risks, Acceptance criteria, Implementation notes for agents. Frontmatter is complete with `satisfies`, `breaksC`, `versionBump`, `commands`, `packagesImpacted`, `successSignals`, and `nonGoals`. The `related` list covers the key dependency chain (RFC-0192/0193/0207/0238/0398/0478/0480/0490).

## Axis B — DNA alignment

- **DNA-24 (Block-declarative pages)**: Aligned. The RFC maps new dossier fields to existing block types (`cardGrid`, `listCards`, `md`, `linkedCardGrid`, `ctaBlock`) without introducing new archetypes. The baker remains field-presence-driven. The output of `bakePage` is still a block-declarative `PageEntry` with `blocks[]`. Note: DNA-24 specifically applies to page content entries under `apps/*/src/content/pages/**` — the dossier fields live in axis-value content collections (`surface/industries/{lang}/*.md`), not page entries. The alignment is indirect but correct: the baker produces the block-declarative page from these fields.

- **DNA-53 (Semantic fingerprint governance)**: Weakly aligned. The RFC states `surface.duplicate-content.report` "uses the existing shingle-based similarity from RFC-0274, which operates on fingerprinted content." The existing `shingles()` function in `@/packages/os/site-kernel-checks/src/surface-quality.ts:387` uses n-gram sets and Jaccard similarity — it does not use `@gogol/fingerprint`. DNA-53 is satisfied trivially (no new hashing helpers are introduced), not actively (no fingerprint package is used). The RFC's claim that the shingle method "operates on fingerprinted content" is inaccurate and should be corrected.

## Axis C — Ecosystem fit

- **`BlueprintDossier` interface missing**: The RFC proposes a `dossier` config block on the blueprint's depth-1 level (analogous to RFC-0490's `pillar` block), but does not define the `BlueprintDossier` TypeScript interface. The `IndustryPublicationGate` interface is defined but not connected to the blueprint. What fields does the `dossier` block carry? Gate thresholds? Claim restriction list? The `BlueprintLevel` interface at `@/packages/surface/src/blueprint.ts:104` would need a `dossier?: BlueprintDossier` field, and `@/packages/surface/src/blueprint-schema.ts:121` would need a corresponding Zod schema — neither is specified.

- **`SemanticModelOptions` plumbing gap**: The RFC states the JSON-LD correction is "gated by `surfaceId === "website-local" && depth === 1`" and lives in `buildPageSemanticModel`. However, `SemanticModelOptions` at `@/packages/share/src/astro/page-handler/types.ts:25` carries only `pageId`, `semanticType`, `lang`, `url`, `fallbackFrontmatter`, `breadcrumbs`, `collectionItems` — no `surfaceId` or `depth`. The calling code in `resolve-route.ts` has access to `surfaceEntry` (which carries `surfaceId` and `depth`), but the RFC does not specify extending `SemanticModelOptions` to pass these values through.

- **`SemanticPageType` closed union**: Depth-1 industry pages currently default to `semanticType: "content"` (the blueprint's depth-1 level has no `semanticType` field). The `SemanticPageType` union at `@/packages/share/src/semantic/models.ts:22` does not include an industry-specific type. The RFC does not specify whether a new type (e.g. `"industry"`) should be added — which would require updating `SEMANTIC_PAGE_TYPES`, `AUDIENCE_BY_PAGE_TYPE`, `PRIORITY_BY_PAGE_TYPE`, `DOMAIN_BY_PAGE_TYPE` in `markdown-twin-provenance.ts`, `getWebPageTypes` in `webpage.ts`, and `semanticPageTypeSchema` in `@gogol/ontology`. Alternatively, the RFC could gate the JSON-LD on `fallbackFrontmatter` fields, but this is not specified.

- **`Service` JSON-LD already exists**: `buildServiceNodes` at `@/packages/share/src/semantic/jsonld/service.ts:30` already emits `Service` nodes for all pages with `organization.services`. The RFC does not account for this pre-existing emission — it may produce duplicate `Service` nodes or conflict with the existing service node builder. The RFC should clarify whether depth-1 industry pages should suppress the organization-level `Service` nodes and emit only the industry-specific one, or whether both coexist.

- **`jsonld-types.yaml` pre-existing gap**: The C-contract at `@/packages/ontology/src/external-surfaces/jsonld-types.yaml` currently declares only `LocalBusiness`, `BreadcrumbList`, `FAQPage`. `Service` is already emitted by `buildServiceNodes` but not declared in the C-contract. The RFC should note this pre-existing gap and fix it alongside the new depth-1 declaration.

- **`@gogol/pbp` missing from `packagesImpacted`**: The RFC says the JSON-LD correction lives in `buildPageSemanticModel` in `@gogol/pbp/semantic-profile`, but `@gogol/pbp` is not listed in `packagesImpacted`. This is an omission — the semantic model builder would need changes to accept and propagate industry-specific service metadata.

- **Command module location**: The file system table says new command modules go in `packages/os/site-kernel-checks/src/commands/` — this directory does not exist. The existing pattern is individual handler files (e.g. `@/packages/os/site-kernel-checks/src/surface-hub-validate.ts`) registered via `src/command-tables/`. The RFC should follow this convention.

## Axis D — Forward-only compliance

- **`versionBump: minor`**: Correct. New frontmatter fields + deprecated fields is a Breaks-B data contract change requiring a migrator.
- **`breaksC: true`**: Correct. The JSON-LD entity type change is a Layer C break.
- **Migrator pattern**: `migrator-0492` follows the RFC-0479 append-only registry pattern. 0492 > 0488 (the latest registered migrator at `@/packages/os/site-kernel-handoff/src/migrators/registry.ts:29`), so it appends at the end. Idempotency is satisfied for steps 1–3 (copy-if-absent).
- **Migrator step 4 (`notdienst` hardcoding)**: Problematic. Setting `notdienst: true` for Elektriker and `false` for Friseur based on "known trade characteristics" is a content decision, not a mechanical transform. The RFC-0479 migrator pattern (exemplified by `@/packages/os/site-kernel-handoff/src/migrators/rfc-0488.ts`) performs mechanical field renames and schema additions — it does not make industry-specific content judgments. Hardcoding industry names in a migrator is fragile (what about future industries?) and violates the principle that migrators are pure structural transforms. This step should be removed from the migrator and left to operator authoring.
- **Deprecated fields preserved as fallback**: Good. The baker falls back to `specialFocus`, `scenarioSnippets`, `painPoints`, `proofSignals`, `faqs` when new fields are absent — forward-only compatible.

## Axis E — Agent-facing policy

- **LLM-generated content prohibition**: Strong and explicit. The RFC prohibits agents from filling dossier fields with LLM-generated content and requires authored trade-specific expertise. This is the correct policy for content that represents real trade knowledge.
- **`claimRestrictions` per-record contradiction**: The RFC defines `claimRestrictions` as a per-record field (`string[]` in the frontmatter) but states `surface.industry.validate` "enforces a closed claim-restriction list" (success signals) and checks "all text fields against a closed list of prohibited phrases" (Decision section). This is contradictory: if each record carries its own `claimRestrictions`, an operator or agent could simply omit the field to bypass validation. The prohibited phrases should be a global closed list enforced by the validator (or configured in the blueprint's `dossier` block), not a per-record field. The `claimRestrictions` field should either be removed from the record or redefined as "additional record-specific restrictions on top of the global list."
- **Mechanical changes allowed**: Agents MAY implement the migrator, baker changes, validation commands, and C-contract updates. This is the correct split — mechanical code changes are agent-safe, content authoring is not.

## Axis F — Pragmatism

- **Publication gate thresholds**: 5 service categories + 3 journeys + 4 trust signals + 1 architecture + 3 modules + 5 FAQs = 21 content items per industry. This is significant but justified by the expert analysis. The 90-day grace period and warn mode mitigate the burden.
- **Duplicate-content threshold**: 0.70 similarity may flag industries that share structural language. The RFC acknowledges this and suggests calibration before making it blocking. Pragmatic.
- **Doorway-risk report**: Diagnostic (warn status) with a configurable threshold (`doorwayMaxFlaggedShare`). Pragmatic — it surfaces the risk without blocking initially.
- **Depth-1 specialization isolation**: Gated to `surfaceId === "website-local" && depth === 1`. Minimal blast radius — other surfaces and depths are unaffected. Good.
- **No new block archetypes**: The RFC correctly reuses existing block types. This avoids component surface growth.

## Axis G — Blind spots

1. **`SemanticModelOptions` extension unspecified**: The RFC does not explain how `surfaceId` and `depth` reach `buildPageSemanticModel`. `SemanticModelOptions` at `@/packages/share/src/astro/page-handler/types.ts:25` would need to be extended (e.g. with `surfaceId?: string` and `depth?: number`), and `resolve-route.ts` would need to pass them — but this is not in the design.

2. **`SemanticPageType` for industry pages**: The RFC does not specify what `semanticType` depth-1 industry pages should have. Without a new type or a gating mechanism, the JSON-LD correction cannot be triggered in the semantic model builder. This is a blocking design gap.

3. **`BlueprintDossier` interface undefined**: The `dossier` config block on the blueprint level is mentioned but not specified. What fields does it carry? How are gate thresholds configured? How does the claim restriction list connect to it?

4. **`claimRestrictions` per-record vs global**: As noted in Axis E, the per-record `claimRestrictions` field contradicts the global closed list enforcement. The RFC must resolve this.

5. **Doorway-risk fields undefined**: `surface.doorway-risk.report` checks depth-4 city pages for `localDemandContext`, `uniqueIntro`, `uniqueFaq`, `localEvidence` — but these fields are not defined in this RFC. Where do they live (demand record? city record?), what are their types, and how are they loaded?

6. **`@gogol/pbp` missing from `packagesImpacted`**: The JSON-LD correction lives in `@gogol/pbp/semantic-profile`, but `@gogol/pbp` is not listed.

7. **`Service` JSON-LD duplication risk**: `buildServiceNodes` already emits `Service` nodes for pages with `organization.services`. The RFC's industry-specific `Service` node may duplicate or conflict with this. The RFC should specify suppression or coexistence.

8. **`surface.duplicate-content.report` scope**: The existing shingle similarity in `surface-quality.ts` operates on all entries within a surface. The RFC needs to specify that the report filters to depth-1 industry pairs only (not cross-depth comparisons).

9. **`notdienst` migrator hardcoding**: Setting `notdienst` per industry name in the migrator is a content judgment. The migrator should be mechanical only — `notdienst` should be operator-authored.

10. **`content.voice.lint` and `content.references.validate`**: The acceptance criteria require these to pass after migration, but the RFC does not explain what changes these commands need (if any) to handle the new fields. Are the new fields automatically compatible, or do these validators need updates?

## Questions for the author

1. How do `surfaceId` and `depth` reach `buildPageSemanticModel`? `SemanticModelOptions` does not currently carry these values — does the RFC propose extending the interface, or is there another mechanism (e.g. `fallbackFrontmatter` fields)?
2. Should a new `SemanticPageType` value (e.g. `"industry"`) be added to the closed union, or should the JSON-LD correction be gated without a new type? If the latter, what is the gating mechanism?
3. Is `claimRestrictions` a per-record field or a global closed list enforced by the validator? The RFC defines it as per-record but describes enforcement as global. Which is correct?
4. Where do the doorway-risk fields (`localDemandContext`, `uniqueIntro`, `uniqueFaq`, `localEvidence`) live, and what are their types? Are they in the demand record, a city-specific record, or a new collection?
5. Should the migrator set `notdienst` per industry name, or should this be left to operator authoring? If the migrator sets it, how does it handle future industries not in the hardcoded list?
6. How should the pre-existing `buildServiceNodes` emission be handled for depth-1 industry pages — suppress it and emit only the industry-specific `Service` node, or let both coexist?
