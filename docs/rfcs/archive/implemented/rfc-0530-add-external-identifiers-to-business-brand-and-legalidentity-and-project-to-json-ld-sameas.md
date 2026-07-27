---
id: RFC-0530
title: "Add external identifiers to Business, Brand, and LegalIdentity and project to JSON-LD sameAs"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-25
updatedAt: 2026-07-25
enhancedAt: 2026-07-25
implementedAt: 2026-07-25
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-16
  - RFC-0163
  - RFC-0469
  - pbp-specification-package/01-PBP-System-Specification.md
  - pbp-specification-package/06-PBP-RFC-Roadmap.md
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-16
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
breaksC: true
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/pbp"
  - "@gogol/ontology"
successSignals:
  - "Business, Brand, and LegalIdentity entities accept externalIdentifiers field with PbpExternalIdentifier entries"
  - "WebPresence entity accepts sameAs string array for social/profile URLs"
  - "JSON-LD Organization node emits sameAs array populated from Business externalIdentifiers and social-profile WebPresence sameAs"
  - "jsonld-types.yaml Layer C contract declares Organization type with sameAs in optional list"
nonGoals:
  - "No Wikidata API integration or sync command — that is a future RFC"
  - "No migration of existing content files — operators add externalIdentifiers manually"
  - "No Person entity externalIdentifiers — Person already uses sameAs: string[] and is not changed"
  - "No Product externalIdentifiers projection to JSON-LD — Product identifiers are catalog identifiers (GTIN/MPN), not entity equivalence links"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app webgogol-com"
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

# RFC-0530: Add external identifiers to Business, Brand, and LegalIdentity and project to JSON-LD sameAs

## Context

RFC-0163 established that the JSON-LD `Organization` node must emit `sameAs` for Google Knowledge Graph and LLM entity disambiguation, explicitly mentioning "social/Wikidata links they use to disambiguate the entity." The `SemanticOrganization` type (`packages/share/src/semantic/models.ts:279`) already declares `sameAs?: string[]`, and `buildOrganizationNode` (`packages/share/src/semantic/jsonld/organization.ts:93`) emits it when present.

However, the PBP entity model — the canonical business layer (DNA-20 superseded by RFC-0471, PBP established by RFC-0399) — has no field on `Business`, `Brand`, or `LegalIdentity` to store external identifiers like Wikidata QIDs. The `PbpExternalIdentifier` type (`packages/pbp/src/primitives.ts:39`) exists and is used on `Product` and `ProductVariant` for catalog identifiers (GTIN, MPN), but not on identity entities.

The PBP specification roadmap (`pbp-specification-package/06-PBP-RFC-Roadmap.md:132`) lists `sameAs` as a property of `WebPresence` (RFC-PBP-015), but the current `webPresenceSchema` (`packages/pbp/src/schemas/web-presence.ts`) does not include a `sameAs` field.

The semantic projection (`projectToSemanticSiteProfile` in `packages/pbp/src/semantic-profile.ts:133-158`) does not pass `sameAs` to `buildOrganizationProfile`, so even if external identifiers existed in PBP content, they would not reach the JSON-LD output.

The Layer C contract (`packages/ontology/src/external-surfaces/jsonld-types.yaml`) does not declare an `Organization` type — only `LocalBusiness`, `Service`, `Person`, and others. The `buildOrganizationNode` function emits `@type: ["Organization", "ProfessionalService"]`, but `Organization` is absent from the C-contract. The current `surface.contract.validate` implementation (`packages/os/site-kernel-handoff/src/surface-contract.ts:100-118`) only checks that the types list is non-empty — it does not validate individual JSON-LD node properties against the declared `optional`/`required` lists. Declaring the `Organization` type in the C-contract is still necessary for contract documentation and future per-property enforcement.

## Problem

Three gaps prevent Wikidata integration and entity disambiguation:

1. **No external identifier storage on identity entities.** `Business`, `Brand`, and `LegalIdentity` schemas (`packages/pbp/src/schemas/business.ts`, `brand.ts`, `legal-identity.ts`) have no `externalIdentifiers` field. Operators cannot store Wikidata QIDs, Crunchbase IDs, or other entity-equivalence identifiers. The existing `PbpExternalIdentifier` type is only wired into `Product` and `ProductVariant`.

2. **No `sameAs` on WebPresence.** The PBP spec requires `sameAs` links on `WebPresence` (RFC-PBP-015), but `webPresenceSchema` does not include the field. Social-profile web presences (LinkedIn company pages, GitHub orgs) cannot carry their canonical URLs for `sameAs` projection.

3. **Broken projection chain.** `projectToSemanticSiteProfile` (`packages/pbp/src/semantic-profile.ts:133-158`) never passes `sameAs` to `buildOrganizationProfile`. Even if fields existed, the JSON-LD Organization node would remain faceless — the exact problem RFC-0163 was meant to solve.

4. **Layer C contract gap.** `jsonld-types.yaml` does not declare `Organization` as a type. The `buildOrganizationNode` function emits it, but the type is undeclared in the C-contract. Adding `sameAs` to the Organization output without declaring it in the C-contract would be an unguarded Layer C change. Declaring the type now ensures the contract accurately reflects the emitted types and enables future per-property validation.

## Decision

The PBP `Business`, `Brand`, and `LegalIdentity` entity schemas gain an optional `externalIdentifiers` field using the existing `PbpExternalIdentifier` type. The `WebPresence` schema gains an optional `sameAs: string[]` field. The semantic projection (`projectToSemanticSiteProfile`) extracts all `externalIdentifiers` from `Business` and all `sameAs` URLs from `social-profile` WebPresence entities, concatenates them, and passes the result as `sameAs` to `buildOrganizationProfile`. The Layer C contract (`jsonld-types.yaml`) declares the `Organization` type with `sameAs` in its optional properties list.

## Architectural fit

- **DNA-16 (Semantic layer shares topology):** This RFC strengthens the semantic layer by ensuring JSON-LD `sameAs` is derived from the same PBP entity graph that drives all other semantic outputs. The projection chain becomes: PBP content → compiler → `projectToSemanticSiteProfile` → `buildOrganizationProfile` → `buildOrganizationNode` → JSON-LD `sameAs`.
- **RFC-0163 (Organization identity nodes):** This RFC completes the work RFC-0163 started. RFC-0163 added `sameAs` support to `buildOrganizationNode` and `SemanticOrganization`, but the PBP projection never populated it. This RFC closes that gap.
- **RFC-0469 (PBP semantic profile adapter):** This RFC extends `projectToSemanticSiteProfile` — the PBP-to-semantic adapter established by RFC-0469 — with `sameAs` projection.
- **PBP namespace `pbp/*@1` (RFC-0399):** Adding optional fields to existing entity schemas is additive-only within the frozen `@1` namespace. No key renames, no semantic changes, no optional→required promotions. `versionBump: patch` is correct.
- **Layer C protection (RFC-0480):** Adding `Organization` type to `jsonld-types.yaml` is a Layer C change. This RFC declares `breaksC: true` and includes `@gogol/ontology` in `packagesImpacted`. The current `surface.contract.validate` implementation validates the structural integrity of the C-contract (types list non-empty, surfacePolicy overlap checks) but does not yet validate individual rendered JSON-LD node properties against the declared `optional`/`required` lists. Declaring the `Organization` type now ensures the contract is accurate for future per-property enforcement and documents the intended schema.
- **PBP spec alignment:** The `WebPresence.sameAs` field fulfills `pbp-specification-package/06-PBP-RFC-Roadmap.md` RFC-PBP-015 which lists `sameAs` as a WebPresence property.

## Design

### CLI surface

No new CLI commands. This RFC changes schemas and projection logic only. The existing `surface.contract.validate` command (in `build.check`) validates the structural integrity of the updated `jsonld-types.yaml` contract (types declared, surfacePolicy overlap checks). Per-property validation of rendered JSON-LD nodes against the declared `optional`/`required` lists is a future enhancement — this RFC ensures the declarative contract is accurate for that future enforcement.

### TypeScript contracts

**PBP entity schema changes** (additive optional fields):

```ts
// packages/pbp/src/schemas/business.ts — add to businessSchema.extend({})
externalIdentifiers: z.record(z.string(), pbpExternalIdentifierSchema).optional(),

// packages/pbp/src/schemas/brand.ts — add to brandSchema.extend({})
externalIdentifiers: z.record(z.string(), pbpExternalIdentifierSchema).optional(),

// packages/pbp/src/schemas/legal-identity.ts — add to legalIdentitySchema.extend({})
externalIdentifiers: z.record(z.string(), pbpExternalIdentifierSchema).optional(),

// packages/pbp/src/schemas/web-presence.ts — add to webPresenceSchema.extend({})
sameAs: z.array(nonEmptyString).optional(),
```

**Entity interface changes** (additive optional fields):

```ts
// packages/pbp/src/entities/business.ts — add to PbpBusiness
externalIdentifiers?: Record<string, PbpExternalIdentifier>;

// packages/pbp/src/entities/brand.ts — add to PbpBrand
externalIdentifiers?: Record<string, PbpExternalIdentifier>;

// packages/pbp/src/entities/legal-identity.ts — add to PbpLegalIdentity
externalIdentifiers?: Record<string, PbpExternalIdentifier>;

// packages/pbp/src/entities/web-presence.ts — add to PbpWebPresence
sameAs?: string[];
```

**Projection change** in `projectToSemanticSiteProfile`:

```ts
// packages/pbp/src/semantic-profile.ts
// Extract externalIdentifiers from Business and convert to sameAs URLs
const businessExternalIds = (business.externalIdentifiers ?? {}) as Record<string, { schemeRef: string; value: string }>
const businessSameAs = Object.values(businessExternalIds).map((id) => `${id.schemeRef}${id.value}`)

// Extract sameAs from social-profile WebPresence entities
const webPresenceSameAs = Object.values(graph.webPresences)
  .filter((wp) => (wp as Record<string, unknown>).kind === "social-profile")
  .flatMap((wp) => ((wp as Record<string, unknown>).sameAs as string[]) ?? [])

const sameAs = [...businessSameAs, ...webPresenceSameAs]

// Pass to buildOrganizationProfile
return buildOrganizationProfile({
  // ...existing fields...
  ...(sameAs.length ? { sameAs } : {}),
})
```

**Layer C contract change** in `jsonld-types.yaml`:

```yaml
# packages/ontology/src/external-surfaces/jsonld-types.yaml — add to types list
- "@type": Organization
  required: [name, url]
  optional: [legalName, description, foundingDate, email, address, sameAs, logo, image, contactPoint, identifier, founder, member, areaServed, employee, makesOffer]
```

The `optional` list includes all properties that `buildOrganizationNode` (`packages/share/src/semantic/jsonld/organization.ts`) currently emits: `identifier` (from `registration`), `founder`, `member`, `areaServed`, `employee`, `makesOffer`, plus the existing `legalName`, `description`, `foundingDate` (as `foundingDate`), `email`, `address`, `contactPoint`, `logo`, `image`, and the new `sameAs`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/pbp/src/schemas/business.ts` | Add `externalIdentifiers` field to `businessSchema` |
| `packages/pbp/src/schemas/brand.ts` | Add `externalIdentifiers` field to `brandSchema` |
| `packages/pbp/src/schemas/legal-identity.ts` | Add `externalIdentifiers` field to `legalIdentitySchema` |
| `packages/pbp/src/schemas/web-presence.ts` | Add `sameAs` field to `webPresenceSchema` |
| `packages/pbp/src/entities/business.ts` | Add `externalIdentifiers` to `PbpBusiness` interface |
| `packages/pbp/src/entities/brand.ts` | Add `externalIdentifiers` to `PbpBrand` interface |
| `packages/pbp/src/entities/legal-identity.ts` | Add `externalIdentifiers` to `PbpLegalIdentity` interface |
| `packages/pbp/src/entities/web-presence.ts` | Add `sameAs` to `PbpWebPresence` interface |
| `packages/pbp/src/semantic-profile.ts` | Add sameAs projection in `projectToSemanticSiteProfile` |
| `packages/ontology/src/external-surfaces/jsonld-types.yaml` | Add `Organization` type with `sameAs` in optional |

### Output format

No new command output. The observable output change is in the rendered JSON-LD `Organization` node:

```json
{
  "@type": ["Organization", "ProfessionalService"],
  "@id": "https://webgogol.com/#organization",
  "name": "Webgogol",
  "sameAs": [
    "https://www.wikidata.org/wiki/Q123456",
    "https://linkedin.com/company/webgogol",
    "https://github.com/webgogol"
  ]
}
```

### Failure modes

- **Empty `externalIdentifiers` or `sameAs`:** Projection omits `sameAs` from the Organization node entirely (existing behavior — no regression).
- **Malformed `schemeRef` (not a URL prefix):** The projection concatenates `schemeRef + value` verbatim. If `schemeRef` is not a valid URL prefix, the resulting `sameAs` entry will be malformed. This is a content authoring error, not a projection error — validators should check URL validity in a future `wikidata.validate` command (RFC-0531).
- **`surface.contract.validate` structural failure:** The current `surface.contract.validate` checks that the types list is non-empty and that `surfacePolicy` has no required/prohibited overlap. Adding the `Organization` type declaration ensures the contract is structurally valid. Per-property validation of rendered JSON-LD nodes against the declared `optional`/`required` lists is not yet implemented — a future RFC may add this enforcement. The declarative contract serves as documentation and enables future enforcement.

## Rollout

1. **Schema changes are additive optional fields.** Existing PBP content files validate unchanged — no migration needed. `versionBump: patch` reflects this.
2. **Layer C contract change is declared via `breaksC: true`.** The `surface.contract.validate` command in `build.check` validates the structural integrity of the updated `jsonld-types.yaml` contract. The `Organization` type declaration ensures the C-contract accurately reflects the types emitted by `buildOrganizationNode`. Per-property validation of rendered JSON-LD nodes is a future enhancement — this RFC prepares the declarative contract for that enforcement.
3. **Projection change is transparent.** Sites without `externalIdentifiers` or `sameAs` in their PBP content see no change in JSON-LD output. Sites that add these fields get `sameAs` in their Organization node automatically.
4. **No migrator required.** All fields are optional and additive — no existing content is broken.
5. **Adoption:** Operators add `externalIdentifiers` to `business.md`, `brand.md`, `legal-identity.md` and `sameAs` to social-profile `web-presence` entries manually. The projection picks them up automatically from `Business.externalIdentifiers` and social-profile `WebPresence.sameAs`. `Brand` and `LegalIdentity` `externalIdentifiers` are stored but not projected in this RFC — they are available for future per-entity JSON-LD nodes (e.g., Brand-specific or LegalIdentity-specific nodes in future RFCs).

## Alternatives considered

- **Use `sameAs: string[]` on Business/Brand/LegalIdentity instead of `externalIdentifiers`.** Rejected — `externalIdentifiers` with structured `PbpExternalIdentifier` (schemeRef + value) preserves the scheme metadata (e.g. `https://www.wikidata.org/wiki/` + `Q123456`), enabling future validators to check scheme validity and distinguish Wikidata from Crunchbase. A flat `string[]` loses this structure. Consistency with Product (which already uses `externalIdentifiers`) is also a factor.

- **Add a boolean `sameAs` flag to `PbpExternalIdentifier` to control projection.** Rejected — adds schema complexity for a distinction that is already encoded by entity type. Product `externalIdentifiers` are catalog identifiers (GTIN/MPN) and are not projected to JSON-LD `sameAs` because Product entities do not produce Organization nodes. Business/Brand/LegalIdentity `externalIdentifiers` are entity-equivalence links and are projected because they produce the Organization node. The entity type already determines projection behavior.

- **Add `sameAs` to `LocalBusiness` in `jsonld-types.yaml` instead of declaring `Organization` type.** Rejected — `buildOrganizationNode` emits `@type: ["Organization", "ProfessionalService"]`, not `LocalBusiness`. The C-contract must match the actual emitted types. Adding `sameAs` to `LocalBusiness` would not validate the `Organization` node.

## Risks

- **Layer C declarative accuracy.** Adding `Organization` to `jsonld-types.yaml` ensures the C-contract accurately reflects the types emitted by `buildOrganizationNode`. The `optional` list is comprehensive (`legalName, description, foundingDate, email, address, sameAs, logo, image, contactPoint, identifier, founder, member, areaServed, employee, makesOffer`) and covers all properties `buildOrganizationNode` currently emits. The current `surface.contract.validate` does not validate individual rendered node properties — per-property enforcement is a future enhancement.
- **Projection URL construction.** The projection concatenates `schemeRef + value` verbatim. If operators store `schemeRef: "https://www.wikidata.org/wiki/"` and `value: "Q123456"`, the result is correct. If they store `schemeRef: "wikidata"` and `value: "Q123456"`, the result is `wikidataQ123456` — a malformed URL. Mitigation: RFC-0531 (`wikidata.validate`) will check URL validity. Content review should catch this.
- **Agent misinterpretation.** Agents might add `externalIdentifiers` to Product entities expecting them to appear in JSON-LD `sameAs`. This RFC does not change Product projection — Product `externalIdentifiers` remain catalog-only. The non-goals section and implementation notes make this explicit.
- **PBP namespace freeze.** Adding fields to `pbp/*@1` entity schemas is additive-only and allowed within the frozen namespace. No key renames or semantic changes. Risk is low — the PBP AGENTS.md confirms additive optional fields are permitted.

## Acceptance criteria

- [x] `businessSchema` includes optional `externalIdentifiers` field using `pbpExternalIdentifierSchema` (evidence: packages/pbp/src/schemas/business.ts:42, `pnpm --filter @gogol/pbp run build:check` pass)
- [x] `brandSchema` includes optional `externalIdentifiers` field using `pbpExternalIdentifierSchema` (evidence: packages/pbp/src/schemas/brand.ts:21, `pnpm --filter @gogol/pbp run build:check` pass)
- [x] `legalIdentitySchema` includes optional `externalIdentifiers` field using `pbpExternalIdentifierSchema` (evidence: packages/pbp/src/schemas/legal-identity.ts:44, `pnpm --filter @gogol/pbp run build:check` pass)
- [x] `webPresenceSchema` includes optional `sameAs: z.array(nonEmptyString)` field (evidence: packages/pbp/src/schemas/web-presence.ts:28, `pnpm --filter @gogol/pbp run build:check` pass)
- [x] `PbpBusiness`, `PbpBrand`, `PbpLegalIdentity` interfaces include `externalIdentifiers?: Record<string, PbpExternalIdentifier>` (evidence: packages/pbp/src/entities/business.ts:31, brand.ts:20, legal-identity.ts:24)
- [x] `PbpWebPresence` interface includes `sameAs?: string[]` (evidence: packages/pbp/src/entities/web-presence.ts:46)
- [x] `projectToSemanticSiteProfile` passes `sameAs` array to `buildOrganizationProfile` when Business has `externalIdentifiers` or any social-profile WebPresence has `sameAs` (evidence: packages/pbp/src/semantic-profile.ts:75-89,176, packages/pbp/tests/semantic-profile.test.ts 5/5 pass)
- [x] `jsonld-types.yaml` declares `Organization` type with `sameAs` in optional properties (evidence: packages/ontology/src/external-surfaces/jsonld-types.yaml:27-30, `pnpm --filter @gogol/ontology run build:check` pass)
- [x] `surface.contract.validate` passes on a site with Organization JSON-LD nodes after contract update (evidence: `pnpm --filter @gogol/ontology run build:check` pass, surface.contract.validate structural check passes with Organization type declared)
- [x] `rfc.validate` passes on this RFC file (evidence: `pnpm exec site-kernel run rfc.validate RFC-0530 --json` exitCode 0, 0 violations)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT project Product `externalIdentifiers` to JSON-LD `sameAs` — Product identifiers are catalog identifiers (GTIN/MPN), not entity-equivalence links. Only Business, Brand, and LegalIdentity `externalIdentifiers` are projected.
- Agents MUST NOT add `externalIdentifiers` to `Person` entities — Person already uses `sameAs: string[]` and is not changed by this RFC.
- The `schemeRef + value` URL construction is verbatim concatenation. Agents authoring PBP content should ensure `schemeRef` is a full URL prefix (e.g. `https://www.wikidata.org/wiki/`) and `value` is the identifier (e.g. `Q123456`).
- The `Organization` type in `jsonld-types.yaml` must list all properties that `buildOrganizationNode` emits in its `optional` list — `legalName, description, foundingDate, email, address, sameAs, logo, image, contactPoint, identifier, founder, member, areaServed, employee, makesOffer`. This ensures the declarative contract is accurate for future per-property enforcement.
- `Brand` and `LegalIdentity` `externalIdentifiers` are stored in the schema but not projected to JSON-LD in this RFC. They are available for future per-entity JSON-LD nodes. Only `Business.externalIdentifiers` are projected to the Organization node's `sameAs`.
- A new test file (e.g., `packages/pbp/src/__tests__/semantic-profile.test.ts`) must be created to verify the `sameAs` projection. There are no existing tests for `projectToSemanticSiteProfile`.
- Update `packages/pbp/AGENTS.md` to document the new `externalIdentifiers` field on `PbpBusiness`, `PbpBrand`, `PbpLegalIdentity` and the `sameAs` field on `PbpWebPresence` in the entity field listings.
- Synchronize `docs/requirements.xml` and `docs/technology.xml` if they track PBP schema fields or C-contract types (Compass document duties per root AGENTS.md).
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
