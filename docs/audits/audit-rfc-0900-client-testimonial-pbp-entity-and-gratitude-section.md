---
rfcId: RFC-0900
auditId: AUDIT-RFC-0900-01
date: 2026-08-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0900

## Verdict: Needs revision

The RFC contains a critical factual error: `Prometheus` is already assigned to the `changelog` section (not unused as claimed), so the cosmic name must be changed. Additionally, `SemanticRole` was retired as a closed enum by RFC-0084 — it is now `type string`, making the DNA-19 extension claim and `werkstatt-shared` package impact incorrect.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0900` reports zero violations.

## Axis A — Structural completeness

- **No CLI surface section.** The RFC does not show exact command invocations with flags and scope. The Rollout section mentions `props.types.generate` and `uni.registry.build` but does not show the full command syntax.
- **No failure modes section.** The RFC does not specify exit codes or warn-vs-fail behavior for testimonial validation.
- **No output format section.** The RFC does not document the `--json` shape for any command output.
- **Acceptance criterion "renders glass-effect quote cards"** is subjective and not machine-checkable. Consider replacing with a concrete check (e.g. "section HTML contains elements with class `gratitude-card`").
- **Acceptance criterion "at least one `client-testimonial` content entity created per locale"** requires human-authored content (real client testimonials). The RFC must distinguish between code changes an agent can make and content that requires human authoring. An agent cannot fabricate client testimonials.

## Axis B — DNA alignment

- **DNA-19 claim is factually wrong.** The RFC states "DNA-19 (Closed ontology vocabularies): This RFC extends the `SemanticRole` enum with `client-gratitude` — permitted only via superseding RFC." However, RFC-0084 retired the closed `SemanticRoleValues` enum. `SemanticRole` is now `type SemanticRole = string` (open, archetype-derived) in `packages/werkstatt-shared/src/ontology/enums.ts:59`. The authoritative source of valid section roles is the archetype catalog — each archetype's `semanticRole` field contributes one valid value. Adding a new archetype with a new `semanticRole` is the normal extension mechanism, not a closed-vocabulary extension. `satisfies: [DNA-19]` should be removed.
- **DNA-5 and DNA-17 are correctly referenced.** The new section ships all five Mirror Quintet artifacts and declares a manifest with the required fields.

## Axis C — Ecosystem fit

- **CRITICAL: `Prometheus` cosmic name is already in use.** The RFC claims "Prometheus is already in PlanetCatalog (unused)" (line 150). This is factually wrong. `Prometheus` is already mapped to the `changelog` section:
  - `planetImportPaths`: `Prometheus: "@warpgogol/werkstatt-site/ui/sections/changelog"` (`index.yaml:592`)
  - `blockTypeToCosmicName`: `changelog: Prometheus` (`index.yaml:668`)
  - `roleByCosmicName`: `Prometheus: changelog-history` (`index.yaml:747`)
  
  The RFC must select a different unused planet name from `PlanetCatalog`. `cosmic.name.unique` (DNA-17) will fail on duplicate cosmic names.

- **`werkstatt-shared` should be removed from `packagesImpacted`.** Since `SemanticRole` is already `string` (RFC-0084), no changes to `packages/werkstatt-shared/src/ontology/enums.ts` are needed. The archetype file goes in `werkstatt-site`. The only package impacted is `werkstatt-site`.

- **Missing `pbpEntityDiscriminatedUnion` registration.** The RFC mentions registering in `pbpSchemaById` but does not mention adding `clientTestimonialSchema` to the `pbpEntityDiscriminatedUnion` array in `schemas/index.ts:162-192`. Both registrations are needed for collection-level validation.

- **Missing entity type file.** The RFC does not mention creating `packages/werkstatt-site/src/domain/pbp/entities/client-testimonial.ts` (following the pattern of `entities/evidence-source.ts`, `entities/claim.ts`, `entities/consent.ts`). These files export the TypeScript interface (`PbpClientTestimonial`) and `CLIENT_TESTIMONIAL_SCHEMA_ID`.

- **Missing Compass sync.** The RFC does not identify which `docs/*.xml` files need synchronization. Adding a new PBP entity type and UI section likely requires updates to `docs/requirements.xml` and `docs/technology.xml`.

- **Missing AGENTS.md updates.** The RFC does not identify which `AGENTS.md` files need rule updates.

## Axis D — Forward-only compliance

No issues. The RFC is purely additive — no compatibility shims, no dual paths, no legacy code maintained behind a flag.

## Axis E — Agent-facing policy

- **Status gate is correct.** The RFC states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language.
- **Implementation notes reference correct governance rules** (RFC-0224, RFC-0334).
- **Anti-fabrication gap.** The acceptance criterion "at least one `client-testimonial` content entity created per locale" does not distinguish between code changes an agent can make and content that requires human authoring. Client testimonials are real quotes from real clients — an agent cannot fabricate them. The RFC should mark this criterion as requiring human authoring.
- **No `NEEDS CLARIFICATION` markers found.**

## Axis F — Pragmatism

- **Schema field conflict with base envelope.** The proposed schema redefines `status: z.enum(["published", "draft"])` but `pbpEntitySchema` already defines `status: pbpEntityStatusSchema` which is `z.enum(["draft", "published", "suspended", "retired", "superseded"])`. The narrower enum is valid Zod (extend overrides), but the RFC should explain why `suspended`, `retired`, and `superseded` are excluded. If testimonials can be retired or suspended, the full status enum should be used.
- **`name` field is already in the base schema** as optional. The RFC redefines it as required (`nonEmptyString`) — this is fine via `.extend()` but should be noted.
- **No new commands proposed.** The `nonGoals` correctly state "No new kernel commands or validators." The `commands` buckets are all empty — internally consistent.

## Axis G — Blind spots

- **Empty state not considered.** The RFC does not describe what the gratitude section renders when there are zero published testimonials. Should the section be hidden entirely? Should it show a placeholder? This is an edge case that will occur on sites that add the block before authoring content.
- **Locale mirroring enforcement.** The Risks section mentions `mirroring.validate` but does not describe what happens when a testimonial exists in DE but not UK. The section should handle missing translations gracefully (omit the card for the missing locale, not crash the build).
- **Performance claim is adequate.** "O(n) at build time — acceptable for static generation" is reasonable for a bounded collection.

## Questions for the author

1. Which unused planet name from `PlanetCatalog` will replace `Prometheus`? (Verify the replacement is not already in `planetImportPaths` in `index.yaml`.)
2. Why does the `status` field narrow the base `pbpEntityStatusSchema` to only `["published", "draft"]`? Should testimonials support `suspended` and `retired` states like other PBP entities?
3. What does the gratitude section render when there are zero published testimonials for the active locale?
