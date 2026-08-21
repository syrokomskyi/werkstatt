---
id: RFC-0900
title: "Add client-testimonial PBP entity and gratitude-section for client gratitude display on Nachweise page"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-21
updatedAt: 2026-08-21
enhancedAt: 2026-08-21
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-5
  - DNA-17
  - RFC-0706
  - RFC-0708
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-5
  - DNA-17
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - werkstatt-site
successSignals:
  - Gratitude section renders on /nachweise page with client testimonial cards
  - PBP client-testimonial entities validate against schema
  - Section manifest registered in uni registry
nonGoals:
  - No new kernel commands or validators
  - No changes to evidence-source schema or Nachweis detail pages
  - No photo upload or media management for testimonials
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0900: Add client-testimonial PBP entity and gratitude-section for client gratitude display on Nachweise page

## Context

The Nachweise page (`/nachweise`) currently displays a trust-strip intro followed by two nachweis-list blocks (attestation and technical-assessment). There is no section for client gratitude — short testimonials or thank-you notes from clients that complement the cryptographic evidence with human, emotional trust signals.

The PBP (business-profile) content collection already hosts trust-domain entities: `evidence-source`, `claim`, `consent`. Client testimonials belong to the same trust domain but are conceptually distinct from evidence: they are text-only quotes without SHA-256 hashes, PDFs, or screenshots. Storing them as PBP entities (rather than static page props) maintains architectural consistency with the existing trust-entity model.

## Problem

1. **No PBP entity for client testimonials.** The trust domain lacks a dedicated entity type for client gratitude. Testimonials cannot be authored as content files, validated against a schema, or loaded dynamically from the content collection.
2. **No UI section for displaying testimonials.** The section catalog has no archetype for gratitude/testimonial cards. The `social-proof` section (cosmicName: Enceladus) uses paragraphs body kind — it cannot render structured quote cards with author metadata.
3. **No archetype for gratitude cards.** The section catalog has no archetype with a `semanticRole` for client gratitude. A new archetype file is needed to register the semantic role and bind it to a cosmic name.

## Decision

The PBP trust domain gains a new `client-testimonial` entity type, and the UI section catalog gains a new `gratitude-section` archetype (cosmicName: Gonggong, semanticRole: client-gratitude) that loads published client-testimonial entities from the business-profile content collection and renders them as quote cards on the Nachweise page.

## Architectural fit

- **DNA-5 (Mirror Quintet):** The new `gratitude-section` ships with all five artifacts: `.astro` component, `manifest.yaml`, content schema (via props.types.generate), `.css`, and content `.md` template.
- **DNA-17 (Uni manifest contract):** The section manifest declares `id`, `cosmicName: Gonggong`, `layer: section`, `semanticId: client-gratitude`, `role`, `version`, `intent[]`, `industryFit[]`, and `contentSchemaKey`.
- **RFC-0706 / RFC-0708:** The `client-testimonial` entity follows the same PBP content collection pattern as `evidence-source` entities: frontmatter-validated, id-keyed, locale-mirrored, loaded via `getCollection("business-profile")`.
- **SemanticRole (RFC-0084):** `SemanticRole` is an open string type (`type SemanticRole = string`), with the archetype catalog as the authoritative source of valid values. Adding a new archetype with `semanticRole: client-gratitude` is the normal extension mechanism — no closed-vocabulary extension is needed.
- **Scaling Playbook:** The section is opt-in per site via page block configuration (DNA-9). Sites without testimonials simply omit the block.

## Design

### PBP entity: client-testimonial

New Zod schema in `packages/werkstatt-site/src/domain/pbp/schemas/client-testimonial.ts`:

```ts
export const clientTestimonialSchema = pbpEntitySchema.extend({
  type: z.literal("client-testimonial"),
  name: nonEmptyString,
  quote: nonEmptyString,
  authorName: nonEmptyString,
  authorRole: nonEmptyString.optional(),
  authorOrganization: nonEmptyString.optional(),
  evidenceRef: nonEmptyString.optional(),
}).strict();
```

The `status` field is inherited from `pbpEntitySchema` (`pbpEntityStatusSchema`: `draft`, `published`, `suspended`, `retired`, `superseded`) — no narrowing is needed. Testimonials follow the same lifecycle as other PBP entities.

The `evidenceRef` field is an opaque string (an evidence-source entity ID). It is not validated as a hard reference — if the referenced evidence-source is deleted, the link renders as a broken anchor but does not crash the build.

New TypeScript interface file at `packages/werkstatt-site/src/domain/pbp/entities/client-testimonial.ts` exports `PbpClientTestimonial` and `CLIENT_TESTIMONIAL_SCHEMA_ID` (following the pattern of `entities/evidence-source.ts`, `entities/claim.ts`).

Registered in `packages/werkstatt-site/src/domain/pbp/schemas/index.ts` in both `pbpSchemaById` and the `pbpEntityDiscriminatedUnion` array (collection-level validation).

Content files live at `src/content/business-profile/{lang}/trust/testimonials/{id}.md`.

### UI section: gratitude-section

New section at `packages/werkstatt-site/src/domain/ui/sections/gratitude/`:

- `gratitude-section.astro` — renders quote cards in a 2-column grid
- `gratitude-section.manifest.yaml` — cosmicName: Gonggong, semanticRole: client-gratitude
- `gratitude-section.css` — card styles using `--ds-*` tokens
- `gratitude-section.types.generated.ts` — generated from manifest propsSchema

The section loads published `client-testimonial` entities via `getCollection("business-profile")`, filters by `type === "client-testimonial"` and `status === "published"`, and renders each as a card with:

- Decorative quote mark
- Quote text (italic)
- Author name (bold)
- Author role + organization (small, only if filled)
- Optional link "Zum Nachweis →" to `/{lang}/nachweise/{evidenceRef}` when `evidenceRef` is set

### Ontology extension

`packages/werkstatt-shared/src/ontology/cosmic/planet-catalog.ts` — `Gonggong` is already in PlanetCatalog and unused by any existing section archetype.

`packages/werkstatt-site/src/domain/ontology/archetypes/sections/gratitude.yaml` — new archetype file with `semanticRole: client-gratitude`, `acceptedCosmicNames: [Gonggong]`.

`SemanticRole` is an open string type (RFC-0084) — no changes to `packages/werkstatt-shared/src/ontology/enums.ts` are needed. The new `client-gratitude` role is derived from the archetype's `semanticRole` field at registry build time.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/domain/pbp/entities/client-testimonial.ts` | New TypeScript interface and schema ID constant |
| `packages/werkstatt-site/src/domain/pbp/schemas/client-testimonial.ts` | New Zod schema for client-testimonial entity |
| `packages/werkstatt-site/src/domain/pbp/schemas/index.ts` | Register schema in `pbpSchemaById` and `pbpEntityDiscriminatedUnion` |
| `packages/werkstatt-site/src/domain/ui/sections/gratitude/gratitude-section.astro` | New section component |
| `packages/werkstatt-site/src/domain/ui/sections/gratitude/gratitude-section.manifest.yaml` | Section manifest (cosmicName: Gonggong) |
| `packages/werkstatt-site/src/domain/ui/sections/gratitude/gratitude-section.css` | Section styles |
| `packages/werkstatt-site/src/domain/ontology/archetypes/sections/gratitude.yaml` | New archetype definition (semanticRole: client-gratitude, acceptedCosmicNames: [Gonggong]) |
| `missions/*/workpiece/src/content/business-profile/{lang}/trust/testimonials/{id}.md` | Content entity files |
| `missions/*/workpiece/src/content/pages/{lang}/nachweise.md` | Add gratitude block after nachweis-intro |
| `docs/requirements.xml` | Add client-testimonial entity and gratitude-section to PBP and UI ontology requirements |
| `docs/technology.xml` | Add gratitude-section to section catalog technology inventory |

## CLI surface

```sh
# Generate section type definitions
pnpm exec werkstatt run props.types.generate --app warpgogol-com

# Rebuild the uni registry (includes new archetype)
pnpm exec werkstatt run uni.registry.build --app warpgogol-com

# Validate PBP content (includes new client-testimonial entities)
pnpm exec werkstatt run pbp.content.validate --app warpgogol-com
```

All commands are scope `app`, exit 0 on success, exit 1 on validation failure. No `--json` output is needed — these are codegen and validation commands with standard text output.

## Failure modes

- **PBP-SCHEMA-01:** `client-testimonial` entity fails Zod validation → `pbp.content.validate` emits error with field path. Fix: correct the frontmatter.
- **COSMIC-NAME-DUPLICATE:** If `Gonggong` is already assigned to another section → `uni.registry.build` fails. Fix: select a different unused planet name.
- **Empty collection:** If no published testimonials exist for the active locale → section is hidden (not rendered in DOM). No error is emitted.
- **Missing locale:** If a testimonial exists in DE but not UK → section renders on `/de/nachweise`, hidden on `/uk/nachweise`. `mirroring.validate` emits a warning.

## Rollout

- **Opt-in per site:** The gratitude section is added to a page via block configuration in `nachweise.md`. Sites without testimonials simply omit the block — no flag day.
- **Empty state:** When zero published testimonials exist for the active locale, the section is not rendered at all (no DOM element, no placeholder). This is per-locale: if DE has 3 testimonials and UK has 0, the section is visible on `/de/nachweise` and hidden on `/uk/nachweise`.
- **Content authoring:** Client-testimonial entities are created as `.md` files in `src/content/business-profile/{lang}/trust/testimonials/`. The `pbp.content.validate` command validates them against the new schema automatically. Content authoring (real client quotes) requires human authoring — agents MUST NOT fabricate testimonials.
- **Generated files:** Run `props.types.generate` to generate `gratitude-section.types.generated.ts`. Run `uni.registry.build` to include the new section in the registry.
- **No migration:** Existing sites are unaffected — no existing entity types or sections change.

## Alternatives considered

1. **Static props in page block (no PBP entity).** Rejected — testimonials stored as static YAML in `nachweise.md` would break the PBP content model where trust-domain entities are first-class content files. The operator specifically requested PBP integration for architectural consistency.

2. **Extend evidence-source with kind `client-gratitude`.** Rejected — gratitude is not cryptographic evidence. It has no SHA-256 hash, no PDF, no screenshot. Mixing it into evidence-source would conflate two distinct concepts and complicate the Nachweis detail page rendering.

3. **Reuse social-proof section (cosmicName: Enceladus).** Rejected — social-proof uses `bodyKind: paragraphs`, which renders free-form text blocks. It cannot render structured quote cards with author metadata, optional organization, and evidence links. A dedicated section provides the right content schema and visual treatment.

## Risks

- **Agent misinterpretation:** Agents might confuse `client-testimonial` with `evidence-source` and try to render testimonials on Nachweis detail pages. The RFC explicitly scopes testimonials to the Nachweise listing page only.
- **Content maintenance:** Testimonials are locale-mirrored (DNA-11). Each testimonial should exist in all supported languages. The `mirroring.validate` command enforces this automatically. Partial locale coverage is handled per-locale (section hidden for locales with zero testimonials).
- **Performance:** The section loads all published testimonials via `getCollection`. For sites with many testimonials, this is O(n) at build time — acceptable for static generation.
- **Anti-fabrication:** Agents MUST NOT fabricate client testimonials. Content authoring requires real quotes from real clients — this is a human-authored content task, not an agent task.

## Acceptance criteria

- [ ] `client-testimonial` Zod schema defined in `packages/werkstatt-site/src/domain/pbp/schemas/client-testimonial.ts` and registered in `pbpSchemaById` and `pbpEntityDiscriminatedUnion`
- [ ] `PbpClientTestimonial` interface and `CLIENT_TESTIMONIAL_SCHEMA_ID` exported from `packages/werkstatt-site/src/domain/pbp/entities/client-testimonial.ts`
- [ ] `gratitude-section.astro` component renders quote cards with author metadata (cards contain elements with class `gratitude-card`)
- [ ] `gratitude-section.manifest.yaml` declares cosmicName `Gonggong` and semanticRole `client-gratitude`
- [ ] `gratitude.yaml` archetype created in `packages/werkstatt-site/src/domain/ontology/archetypes/sections/` with `acceptedCosmicNames: [Gonggong]`
- [ ] `props.types.generate --app warpgogol-com` produces `gratitude-section.types.generated.ts` without errors
- [ ] `uni.registry.build --app warpgogol-com` includes gratitude-section in the registry
- [ ] Gratitude block added to `nachweise.md` (DE + UK) after `nachweis-intro`, before `nachweis-attestation-list`
- [ ] At least one `client-testimonial` content entity created per locale (DE + UK) — **requires human authoring** (real client quotes, not agent-fabricated)
- [ ] `/de/nachweise` page renders the gratitude section with testimonial cards on dev server
- [ ] Section is hidden on `/uk/nachweise` when no UK testimonials exist (empty state)
- [ ] `rfc.validate --id RFC-0900` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0900 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The `client-testimonial` entity is NOT an evidence-source. Agents MUST NOT render testimonials on Nachweis detail pages or mix them with evidence-source lists.
- The `gratitude-section` loads entities via `getCollection("business-profile")` at build time — no client-side fetching.
- Content files for testimonials MUST be placed in `src/content/business-profile/{lang}/trust/testimonials/{id}.md`, not in the `evidence/` subdirectory.
- Agents MUST NOT fabricate client testimonials. Content authoring requires real quotes from real clients — this is a human-authored content task.
