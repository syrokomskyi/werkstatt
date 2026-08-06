---
rfcId: RFC-0706
auditId: AUDIT-RFC-0706-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0706

## Verdict: Needs revision

The RFC is architecturally sound — additive extensions to PBP, Bordbuch, and entitlements are the correct approach (ADR-0028). However, `satisfies[]` is empty (V-24 error), the DNA references are imprecise, the proposed content path `trust/consents/` breaks the existing flat pattern, and several file system responsibilities are missing (barrel export, loaders). These must be fixed before plan.

## Mechanical validation (rfc.validate)

Fail — 2 violations:

- **V-24 (error):** `satisfies[]` is empty. Architecture RFCs created after 2026-07-07 must declare at least one DNA invariant (RFC-0331).
- **V-30 (warning):** `@warpgogol/ontology` is in `packagesImpacted` but `breaksC` is not set. The RFC modifies `packages/ontology/src/operations/mission.ts`, not `src/external-surfaces/` — this warning is a false positive but should be addressed by clarifying in the RFC body that no C-contract surface is modified.

## Axis A — Structural completeness

1. **`satisfies[]` empty.** The RFC body (§ Architectural fit) says "Extends DNA-20 (PBP as canonical business layer) and DNA-23 (closed enum extension via RFC)" but `satisfies: []` in frontmatter. This is the V-24 violation. Fix: add the correct DNA IDs (see Axis B for which ones).

2. **Content path breaks established pattern.** The file system responsibilities table proposes `src/content/business-profile/{lang}/trust/consents/` for Consent entities. The existing PBP content pattern (per `packages/pbp/AGENTS.md` § Content location and `packages/pbp/src/astro.ts`) is flat: `business-profile/{lang}/<entity-type-plural>/<slug>.md` (e.g. `places/`, `contact-points/`, `offerings/`). There is no `trust/` grouping level. The RFC should either use `business-profile/{lang}/consent/<slug>.md` (matching the flat pattern) or explicitly justify the new nesting level and document whether claims, evidence-sources, and disclosures should also migrate under `trust/`.

3. **`commands.changed` entry lacks detail.** The RFC lists `pbp.content.validate` in `commands.changed` but doesn't describe what changes are needed. Looking at the codebase, `pbp.content.validate` dispatches via `pbpSchemaById` — new schemas registered there are automatically validated. The RFC should clarify whether code changes are needed or the command picks up new schemas automatically via the registry.

4. **`url`/`retrievedAt` optionality not in acceptance criteria.** The RFC proposes making `url` and `retrievedAt` optional in `evidenceSourceSchema` items. The acceptance criteria include "accepts `items` entries without `url` or `retrievedAt`" — good — but the RFC doesn't audit which existing consumers read `items[].url` without null-checking. The Risks section mentions this but doesn't list the specific files or code paths.

## Axis B — DNA alignment

1. **DNA-20 is superseded.** The RFC body says "Extends DNA-20" but DNA-20 is marked "SUPERSEDED by RFC-0471" in `docs/architecture-dna.md`. The RFC should reference `DNA-20` with the superseded note or cite RFC-0471 directly. PBP as canonical business layer is now established by RFC-0471, not DNA-20.

2. **DNA-23 is misidentified.** The RFC says "DNA-23 (closed enum extension via RFC)" but DNA-23 is about the Cosmic Overlay — `StarCatalog`, `PlanetCatalog`, `MoonCatalog` and manifest `cosmicName` alignment. It is not about closed enum extension. The relevant invariant for closed enum extension is **DNA-19** (Closed ontology vocabularies — `SemanticRole`, `ComponentRole`, `Industry`, `Layer`). However, `PbpEvidenceKind` and `BordbuchEntryKind` are not among the DNA-19 closed enums — they are entity-type vocabularies. The RFC should clarify which DNA invariant (if any) governs these enum extensions, or state that these are PBP/Bordbuch vocabulary extensions not constrained by DNA-19.

3. **`satisfies[]` should declare the correct invariants.** Based on the above, the RFC should declare `satisfies: [DNA-20]` (with superseded note) or reference RFC-0471, and remove the DNA-23 reference unless a clearer justification is provided. If no existing DNA invariant directly governs these extensions, the RFC should state that explicitly and explain why no `satisfies` entry is applicable (but V-24 requires at least one — so the RFC must find a relevant invariant or establish a new one).

## Axis C — Ecosystem fit

1. **Missing file system responsibility: barrel export.** The RFC doesn't list `packages/pbp/src/index.ts` (the main barrel) as a file to modify. The new `PbpConsent` type, `PbpConsentMethod`, `PbpConsentStatus`, `CONSENT_SCHEMA_ID`, and `isPbpConsentMethod`/`isPbpConsentStatus` functions need to be exported from the barrel. Existing entities are exported there (e.g. `PbpEvidenceSource`, `PbpEvidenceKind` at `@/packages/pbp/src/index.ts:164-170`).

2. **Missing file system responsibility: loaders.** The RFC doesn't mention `packages/pbp/src/loaders.ts`. If a typed loader like `getPbpConsents(lang)` is needed (parallel to `getPbpOfferings`, `getPbpBusiness`), it should be listed. If the generic collection loader suffices, the RFC should state that.

3. **V-30 `breaksC` warning.** The RFC modifies `packages/ontology/src/operations/mission.ts` (adding enum values to `bordbuchEntryKindSchema`), not `packages/ontology/src/external-surfaces/`. The V-30 warning is a false positive. The RFC should add a note clarifying that no C-contract surface (`external-surfaces/`) is modified, so `breaksC` is not required.

4. **`pbpCollections` not impacted.** The RFC correctly doesn't list `packages/pbp/src/astro.ts` — the collection uses a permissive schema (`z.object({}).catchall(z.any())`) and defers validation to loaders via `pbpSchemaById`. This should be explicitly noted as "not impacted" to avoid confusion during implementation.

5. **Package boundaries.** Imports flow correctly: `packages/share/src/entitlement.ts` for entitlements, `packages/ontology/src/operations/mission.ts` for Bordbuch kinds, `packages/os/site-kernel-handoff/src/bordbuch/bordbuch-io.ts` for writer-role mapping. No boundary violations.

## Axis D — Forward-only compliance

No issues. All changes are additive — new enum values, new optional fields, new entity type. No backward compatibility layers, shims, or dual-paths. The RFC correctly notes that making `url`/`retrievedAt` optional is a schema relaxation, not a breaking change within `pbp/*@1`.

## Axis E — Agent-facing policy

1. **Status gate is correct.** The RFC says "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" — this is the correct governance rule.

2. **Implementation notes reference RFC-0224** for accepted→implemented transition — correct. The RFC also mentions `rfc.supersede.propose` for invariant conflicts — correct.

3. **Anti-fabrication.** Acceptance criteria are all code changes an agent can make (schema extensions, enum additions, registry updates). No content authoring is claimed as auto-generated. OK.

## Axis F — Pragmatism

1. **`PbpConsent` entity has 10+ fields.** The RFC should justify which fields are needed at MVP vs. which could be deferred. `withdrawalContact` is optional — could it be deferred? `textVersion` introduces a versioning scheme — is this needed for MVP or can it be deferred?

2. **`method` enum includes `qes`.** The RFC doesn't explain what `qes` (Qualified Electronic Signature) means in this context. This is a legal concept (eIDAS regulation) that may need more justification or a reference. If it's not needed for MVP, consider deferring.

3. **`qualityStatus` enum has 5 values.** The RFC doesn't explain why these specific values were chosen or whether all are needed at MVP. The value `verified_with_quality_issue` is quite specific — is this needed for the initial implementation?

4. **No new commands proposed.** Only schema extensions — minimal command surface. Good.

5. **`packagesImpacted` is accurate.** `@warpgogol/pbp`, `@warpgogol/ontology`, `@warpgogol/share`, `@warpgogol/site-kernel-handoff` — all are genuinely impacted. `appsImpacted: ["warpgogol-com"]` is correct for pilot adoption.

## Axis G — Blind spots

1. **`evidenceRef` format unspecified.** `PbpConsent.evidenceRef` is `string | null` described as "Bordbuch entry ID or R2 path". The RFC doesn't specify the format for either. Bordbuch entry IDs follow `event-\d{6}` (per `packages/ontology/src/operations/mission.ts:22`). R2 paths are not documented. The RFC should specify the format or declare it as an open reference to be resolved by RFC-0707.

2. **`purposes` and `dataElements` are open `string[]`.** The RFC doesn't propose a closed vocabulary or validation for these. This could lead to inconsistent authoring. Should `purposes` be validated against a known set (e.g. `studio_reference_publication`, `website_testimonial`, etc.)?

3. **`channels` is open `string[]`.** E.g. `["warpgogol.com"]`. Should this be validated against known site channels or the system's `i18n.supported` domains?

4. **`textVersion` versioning scheme.** E.g. `"NR-CONSENT-DE-0.1"`. The RFC doesn't explain how versions are managed, what happens when a consent text version changes, or whether old consents remain valid under a new text version. This is a lifecycle concern that may need clarification.

5. **`url`/`retrievedAt` consumer audit.** The Risks section mentions that "existing code that reads `items[].url` without null-checking may break" but doesn't list the specific consumers. The implementation should audit all `items` consumers before merging — this should be an explicit acceptance criterion or implementation step.

## Questions for the author

1. Which DNA invariant(s) does this RFC satisfy? DNA-20 is superseded by RFC-0471, and DNA-23 is about cosmic overlay (not closed enum extension). Should the RFC reference RFC-0471 directly, or should it establish a new DNA invariant for PBP/Bordbuch vocabulary extension governance?

2. Why does the proposed content path use `trust/consents/` nesting instead of the established flat `consent/` pattern? Should claims, evidence-sources, and disclosures also migrate under `trust/`, or should Consent use the flat pattern?

3. What format does `evidenceRef` take — is it a Bordbuch event ID (`event-\d{6}`), an R2 path, or a URI? How is the reference resolved, and which package owns the resolver?
