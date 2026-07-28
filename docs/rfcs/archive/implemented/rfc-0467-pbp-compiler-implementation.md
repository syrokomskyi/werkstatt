---
id: RFC-0467
title: "PBP Compiler Implementation"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
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
createdAt: 2026-07-20
updatedAt: 2026-07-20
implementedAt: 2026-07-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-1
  - DNA-20
  - DNA-55
  - RFC-0398
  - RFC-0406
  - RFC-0407
  - RFC-0422
  - RFC-0428
  - RFC-0431
  - RFC-0432
  - RFC-0441
  - RFC-0455
  - RFC-0456
  - RFC-0466
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-1
  - DNA-20
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/pbp"
successSignals:
  - "compilePbpProfile function exported from @gogol/pbp/compiler"
  - "All 14 compiler phases implemented as pure functions"
  - "PbpCompilerResult includes entity index, resolved graph, validation errors, and projections"
  - "Deterministic: same inputs produce same resolved graph and projections"
  - "tsc --noEmit and vitest run pass for @gogol/pbp"
  - "Golden fixture tests pass for compile pipeline (discover through projection)"
nonGoals:
  - "Does not define new compiler contracts — all contract types are already defined in RFC-0428"
  - "Does not define Zod schemas — that is RFC-0466"
  - "Does not create PBP content files — that is RFC-0468"
  - "Does not switch sites from @gogol/business to @gogol/pbp — that is RFC-0469"
  - "Does not implement canonical serialization or signature envelope — Wave 4 (RFC-0442, RFC-0459)"
  - "Does not implement incremental/bulk processing — Wave 3 (RFC-0430)"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "pnpm --filter @gogol/pbp run build:check"
#     expect:
#       exitCode: 0
#   - probe: run
#     command: "pnpm --filter @gogol/pbp run test"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/pbp/src/compiler/index.ts"
---

## Design

**Normative source references:**

- `pbp-specification-package/compiler` — §1–18 (pipeline, source inventory, locale, references, validation, derivations, projections)
- `pbp-specification-package/system-spec` — §6 (determinism), §7 (compilation)
- `packages/pbp/src/compiler-pipeline.ts` — existing contract types (RFC-0428)

_This RFC implements the PBP compiler pipeline: 14 phases from source discovery to projection generation. It transforms raw `.md` content files into a resolved entity graph and typed projections._

# RFC-0467: PBP Compiler Implementation

## Context

RFC-0428 defined the compiler pipeline contract: `PbpCompilerPhase` (14 phases), `PbpBuildContext`, `PbpBuildStrictness`, `PbpSourceInventoryEntry`, and `PbpSourceInventoryReport`. These are TypeScript types only — no implementation exists.

The PBP specification (`pbp-specification-package/compiler`) describes a deterministic, end-to-end compilation pipeline that:

1. Discovers source `.md` files from `src/content/business-profile/`
2. Parses YAML frontmatter and Markdown body
3. Validates raw entities against Zod schemas (RFC-0466)
4. Builds an entity index keyed by entity ID
5. Resolves locale fallbacks (ADR-026: default locale stores invariant facts)
6. Resolves cross-entity references and detects cycles
7. Resolves the business profile graph (Business → linked entities)
8. Applies runtime overlays (inventory, availability — Wave 3, stubbed for Wave 1)
9. Runs derivation contracts (first-year cost, TCO — RFC-0431/0453)
10. Validates semantic invariants (no HTML, no empty strings, no locale in IDs)
11. Assembles Buyer View sections (RFC-0441)
12. Generates projections (website, AI answer, Schema.org — RFC-0455/0456/0432)
13. Snapshots the canonical graph (RFC-0435 — Wave 4, stubbed for Wave 1)
14. Publishes the build result

Without this compiler, PBP content files are just validated data — they cannot be transformed into the projections that the website, AI answers, and Schema.org JSON-LD consume.

## Problem

1. **No discovery.** No function scans `src/content/business-profile/` and produces a `PbpSourceInventoryReport`.
2. **No parsing.** No function reads `.md` files, extracts YAML frontmatter, and produces raw entity objects.
3. **No validation.** No function runs Zod schemas (RFC-0466) against raw entities and collects `PbpValidationError`s.
4. **No entity index.** No function builds a typed `Map<string, PbpEntity>` keyed by entity ID.
5. **No locale resolution.** No function deep-merges non-default locale overrides onto default locale entities and produces a `PbpFallbackReport`.
6. **No reference resolution.** No function validates that all `PbpEntityRef` targets exist, match expected types, and produce no cycles.
7. **No profile resolution.** No function assembles the full Business profile graph from the entity index.
8. **No derivations.** No function executes `PbpDerivationContract`s (first-year cost, TCO).
9. **No semantic validation.** No function enforces ADR-037 (no HTML), ADR-038 (no empty strings), ADR-025 (no locale in IDs).
10. **No buyer view.** No function assembles the 12-section Buyer View from the resolved graph.
11. **No projections.** No function generates `PbpWebsiteProjection`, `PbpAiAnswerProjection`, or Schema.org JSON-LD.
12. **No orchestration.** No function chains all 14 phases into a single `compilePbpProfile` call.

## Decision

### 1. Compiler module structure

`packages/pbp/src/compiler/` is established as the home for the compiler implementation:

```
packages/pbp/src/compiler/
  index.ts              — public API: compilePbpProfile, compilePbpPhase
  discover.ts           — Phase 1: source file discovery
  parse.ts              — Phase 2: YAML frontmatter + Markdown body parsing
  validate.ts           — Phase 3: raw schema validation (Zod)
  entity-index.ts       — Phase 4: entity index construction
  locale.ts             — Phase 5: locale resolution and fallback
  references.ts         — Phase 6: reference resolution and cycle detection
  profile.ts            — Phase 7: business profile graph assembly
  overlays.ts           — Phase 8: runtime overlay application (stub for Wave 1)
  derivations.ts        — Phase 9: derivation contract execution
  semantic.ts           — Phase 10: semantic validation (HTML, empty strings, locale IDs)
  buyer-view.ts         — Phase 11: Buyer View section assembly
  projection.ts         — Phase 12: projection generation (website, AI, Schema.org)
  snapshot.ts           — Phase 13: canonical snapshot (stub for Wave 1)
  publication.ts        — Phase 14: publication result assembly
  types.ts              — internal compiler types (PbpCompilerResult, PbpCompilerInput)
```

### 2. Public API

```ts
export interface PbpCompilerInput {
  sourceDirectory: string;
  locale: string;
  defaultLocale: string;
  strictness: PbpBuildStrictness;
  derivations?: PbpDerivationContract[];
  buyerViewSchemaRef?: PbpEntityRef;
}

export interface PbpCompilerResult {
  context: PbpBuildContext;
  inventory: PbpSourceInventoryReport;
  entityIndex: Map<string, PbpEntity>;
  resolvedGraph: PbpResolvedGraph;
  fallbackReport: PbpFallbackReport;
  graphErrors: PbpGraphIntegrityError[];
  validationErrors: PbpValidationError[];
  buyerView?: PbpBuyerView;
  projections: PbpProjectionSet;
  publication?: PbpPublicationSnapshot;
}

export interface PbpResolvedGraph {
  business: PbpBusiness;
  legalIdentity?: PbpLegalIdentity;
  brand?: PbpBrand;
  places: Record<string, PbpPlace>;
  contactPoints: Record<string, PbpContactPoint>;
  webPresences: Record<string, PbpWebPresence>;
  products: Record<string, PbpProduct>;
  catalog?: PbpCatalog;
  catalogEntries: Record<string, PbpCatalogEntry>;
  offerings: Record<string, PbpOffering>;
  policies: Record<string, PbpPolicy>;
  claims: Record<string, PbpClaim>;
  evidenceSources: Record<string, PbpEvidenceSource>;
  disclosures: Record<string, PbpDisclosure>;
  publicDocuments: Record<string, PbpPublicDocument>;
}

export interface PbpBuyerView {
  schemaRef: PbpEntityRef;
  sections: Record<string, PbpBuyerViewSection>;
}

export interface PbpProjectionSet {
  website: PbpWebsiteProjection[];
  aiAnswer: PbpAiAnswerProjection[];
  schemaOrg: Record<string, unknown>;
}

export function compilePbpProfile(input: PbpCompilerInput): Promise<PbpCompilerResult>;
export function compilePbpPhase(
  phase: PbpCompilerPhase,
  state: Partial<PbpCompilerResult>,
  input: PbpCompilerInput,
): Promise<Partial<PbpCompilerResult>>;
```

### 3. Phase implementations

#### Phase 1: discover

```ts
async function discover(input: PbpCompilerInput): Promise<PbpSourceInventoryReport> {
  // Scan sourceDirectory/**/*.md
  // Extract entityId, schema, locale from file path and frontmatter
  // Compute contentDigest per file
  // Return PbpSourceInventoryReport
}
```

- Scans `src/content/business-profile/**/*.md`
- Extracts entity ID from frontmatter `id` field
- Extracts schema from frontmatter `schema` field
- Extracts locale from directory path (`de/`, `uk/`, etc.)
- Computes `contentDigest` using `@gogol/fingerprint` (byteHash of file content)
- Returns `PbpSourceInventoryReport` with `sources`, `recordsDiscovered`, `recordsBySchema`

#### Phase 2: parse

```ts
async function parse(
  inventory: PbpSourceInventoryReport,
  sourceDirectory: string,
): Promise<Record<string, unknown>[]> {
  // Read each source file
  // Parse YAML frontmatter (using @gogol/site-kernel-content)
  // Return raw entity objects (untyped)
}
```

- Reads each `.md` file from the inventory
- Parses YAML frontmatter into raw objects
- Does NOT validate — that is Phase 3
- Returns array of raw entity objects with `_physicalPath` and `_locale` metadata

#### Phase 3: raw-schema-validation

```ts
async function validateRaw(
  rawEntities: Record<string, unknown>[],
  schemas: Record<string, z.ZodTypeAny>,
): Promise<{ entities: PbpEntity[]; errors: PbpValidationError[] }> {
  // For each raw entity, look up schema by frontmatter `schema` field
  // Run zod.safeParse
  // Collect errors with PBP-SCHEMA prefix
  // Return validated entities + errors
}
```

- Uses `pbpSchemaById` from RFC-0466
- Runs `z.safeParse()` — does not throw on validation failure
- Collects errors with `PbpValidationError` shape, prefix `PBP-SCHEMA`
- In `production` strictness: fatal errors abort the build
- In `migration` strictness: errors are collected but build continues

#### Phase 4: build-entity-index

```ts
async function buildEntityIndex(
  entities: PbpEntity[],
): Promise<{ index: Map<string, PbpEntity>; errors: PbpValidationError[] }> {
  // Key entities by id
  // Detect duplicate IDs (PBP-ID error)
  // Return Map<string, PbpEntity>
}
```

- Builds `Map<string, PbpEntity>` keyed by entity `id`
- Detects duplicate IDs — emits `PBP-ID` error with severity `fatal`
- Entity IDs are locale-independent (ADR-025) — same ID across locales merges into one index entry

#### Phase 5: locale-resolution

```ts
async function resolveLocales(
  index: Map<string, PbpEntity>,
  locale: string,
  defaultLocale: string,
): Promise<{ resolved: Map<string, PbpEntity>; fallbackReport: PbpFallbackReport }> {
  // For each entity, deep-merge non-default locale onto default locale
  // Track fallbacks in PbpFallbackReport
  // Return resolved entity map
}
```

- Default locale (`de`) is the canonical anchor (ADR-026)
- Non-default locale overrides are deep-merged onto default locale entry
- Fields not present in non-default locale fall back to default locale
- `PbpFallbackReport` records each fallback with `entityId`, `path`, `sourceLocale`, `targetLocale`, `severity`
- Invariant fields (price, conditions) MUST NOT diverge between locales — emits `PBP-LOC` warning if they do

#### Phase 6: reference-resolution

```ts
async function resolveReferences(
  index: Map<string, PbpEntity>,
): Promise<{ errors: PbpGraphIntegrityError[]; cycleResults: PbpCycleCheckResult[] }> {
  // For each PbpEntityRef in each entity, verify target exists in index
  // Verify expectedType matches target entity type
  // Run cycle detection on requires, category-broader, successor-chain, product-intrinsic-composition, offering-optional-relation
  // Return errors + cycle results
}
```

- For each `PbpEntityRef` in each entity: verifies target exists in the index
- Verifies `expectedType` matches the target entity's `type` field
- Detects locale suffixes in IDs (`warpgogol.de`, `warpgogol/de/`) — emits `PBP-REF` error
- Runs cycle detection on 5 graph types (RFC-0407):
  - `requires` (Offering → Offering)
  - `category-broader` (Category → Category)
  - `successor-chain` (Product → Product via `supersedes`)
  - `product-intrinsic-composition` (Product → Product)
  - `offering-optional-relation` (Offering → Offering)
- Returns `PbpGraphIntegrityError[]` and `PbpCycleCheckResult[]`

#### Phase 7: profile-resolution

```ts
async function resolveProfile(
  index: Map<string, PbpEntity>,
): Promise<PbpResolvedGraph> {
  // Find PbpBusiness entity (singleton)
  // Follow refs to assemble the full graph
  // Return PbpResolvedGraph
}
```

- Finds the `PbpBusiness` entity (singleton — exactly one per profile)
- Follows `legalIdentityRef`, `brandRefs`, `placeRefs`, `contactPointRefs`, `webPresenceRefs`, `catalogRefs` to assemble linked entities
- Follows `Catalog.entrySource` to find `CatalogEntry` entities
- Follows `CatalogEntry.offeringRefs` to find `Offering` entities
- Follows `Offering.policyRefs` to find `Policy` entities
- Collects all `Claim`, `EvidenceSource`, `Disclosure`, `PublicDocument` entities
- Returns `PbpResolvedGraph`

#### Phase 8: runtime-overlays (stub for Wave 1)

```ts
async function applyRuntimeOverlays(
  graph: PbpResolvedGraph,
): Promise<PbpResolvedGraph> {
  // Wave 1: no-op — runtime overlays are Wave 3 (RFC-0421/0462)
  // Return graph unchanged
}
```

- Wave 1: no-op. Runtime overlays (inventory, availability, booking capacity) are Wave 3 (RFC-0421).
- The function signature is stable so that Wave 3 can fill it in without changing the pipeline.

#### Phase 9: derivations

```ts
async function runDerivations(
  graph: PbpResolvedGraph,
  contracts: PbpDerivationContract[],
): Promise<{ results: PbpDerivationResult[]; errors: PbpValidationError[] }> {
  // For each derivation contract, execute the pure function
  // Collect results and errors
  // Attach derived values to the graph
}
```

- Executes each `PbpDerivationContract` as a pure function (ADR-022)
- Wave 1 derivations: first-year cost (RFC-0453), TCO (RFC-0453)
- Each derivation produces a `PbpDerivationResult` with `provenance` (derivationRef, implementationVersion, inputDigests)
- Derivation failures emit `PBP-DERIVE` errors

#### Phase 10: semantic-validation

```ts
async function validateSemantic(
  graph: PbpResolvedGraph,
): Promise<PbpValidationError[]> {
  // Check no HTML in canonical fields (ADR-037)
  // Check no empty strings (ADR-038)
  // Check no locale markers in entity IDs (ADR-025)
  // Check no presentation-ready money strings in canonical fields (ADR-012)
  // Check no <br> in data
  // Check no sensitive data in public fields (ADR-036)
  // Check no legacy keys
  // Return errors
}
```

- **ADR-037 (no HTML):** scans all `string` fields for `<br>`, `<strong>`, `<em>`, `<a `, etc.
- **ADR-038 (no empty strings):** rejects `""` in any string field — use `not-declared` (omit key) or explicit semantic status
- **ADR-025 (no locale in ID):** rejects entity IDs containing `.de`, `/de/`, `_de`, etc.
- **ADR-012 (decimal money):** rejects money values like `"70 € / Monat"` — must be `"70.00"` with `currency: "EUR"`
- **ADR-036 (public/private):** rejects bank account numbers, tax IDs, secrets in public fields
- **Legacy keys:** rejects field names that are legacy `@gogol/business` keys (e.g. `hourlyRate`, `capacity`)

#### Phase 11: buyer-view

```ts
async function assembleBuyerView(
  graph: PbpResolvedGraph,
  schemaRef: PbpEntityRef,
): Promise<PbpBuyerView> {
  // Load PbpBuyerViewSchema entity
  // For each of 12 sections, assemble section data from the resolved graph
  // Return PbpBuyerView
}
```

- Loads the `PbpBuyerViewSchema` entity (RFC-0441)
- Assembles 12 sections (ADR-023):
  1. Identity — from `PbpBusiness` + `PbpLegalIdentity`
  2. Suitability — from `PbpProduct.purpose` + `outcomes`
  3. Value — from `PbpClaim` (benefit class)
  4. Package — from `PbpOffering.package.included`
  5. Options — from `PbpOffering.relatedOfferings`
  6. Pricing — from `PbpOffering.pricing` + derivations (first-year cost)
  7. Buyer Responsibilities — from `PbpOffering.customerResponsibilities`
  8. Fulfillment — from `PbpOffering.fulfillment`
  9. Assurances — from `PbpPolicy` (SLA, guarantee)
  10. Rights — from `PbpPolicy` (ownership, exit, data retention)
  11. Lifecycle — from `PbpOffering.terms`
  12. Limitations — from `PbpDisclosure` + `PbpClaim` (limitation class)

#### Phase 12: projection

```ts
async function generateProjections(
  graph: PbpResolvedGraph,
  buyerView: PbpBuyerView,
  locale: string,
): Promise<PbpProjectionSet> {
  // Generate website projections (one per offering)
  // Generate AI answer projections (one per offering)
  // Generate Schema.org JSON-LD
  // Return PbpProjectionSet
}
```

- **Website projection** (RFC-0455): one `PbpWebsiteProjection` per `PbpOffering`, with `renderedSections` from the Buyer View
- **AI answer projection** (RFC-0456): one `PbpAiAnswerProjection` per `PbpOffering`, with `allowedFacts` and `deniedFacts` from `PbpMachineUsePolicy`
- **Schema.org projection** (RFC-0432): JSON-LD with `Product`, `Offer`, `PriceSpecification` mappings; `PbpSchemaOrgLossReport` for unmappable fields

#### Phase 13: canonical-snapshot (stub for Wave 1)

```ts
async function snapshot(
  graph: PbpResolvedGraph,
  context: PbpBuildContext,
): Promise<PbpPublicationSnapshot | undefined> {
  // Wave 1: stub — canonical serialization is Wave 4 (RFC-0442)
  // Return undefined
}
```

- Wave 1: stub. Canonical serialization (RFC-0442) and signature envelope (RFC-0459) are Wave 4.
- The function signature is stable so that Wave 4 can fill it in.

#### Phase 14: publication

```ts
async function publish(
  result: Partial<PbpCompilerResult>,
  input: PbpCompilerInput,
): Promise<PbpCompilerResult> {
  // Assemble final PbpCompilerResult
  // Attach sourceRevision from git
  // Return complete result
}
```

- Assembles the final `PbpCompilerResult` from all phase outputs
- Attaches `sourceRevision` from git (RFC-0435)
- Returns the complete result

### 4. Determinism

The compiler is deterministic (ADR-006, RFC-0398 §6):

- Same inputs (source files, schema version, locale, runtime parameters, derivation implementation version) → same resolved graph → same projections
- Entity index is built in a stable order (sorted by entity ID)
- Projection output is sorted by offering ID
- `contentDigest` and `inputDigests` use `@gogol/fingerprint` for stable hashing

### 5. Strictness modes

- **`production`:** Fatal errors abort the build. All validation errors must be resolved.
- **`migration`:** Errors are collected but the build continues. Used during the migration period (RFC-0468) to allow partial migration and identify remaining issues.

### 6. Package exports

`packages/pbp/package.json` gains a new export path:

```json
{
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" },
    "./schemas": { "types": "./src/schemas/index.ts", "default": "./src/schemas/index.ts" },
    "./loaders": { "types": "./src/loaders.ts", "default": "./src/loaders.ts" },
    "./astro": { "types": "./src/astro.ts", "default": "./src/astro.ts" },
    "./compiler": { "types": "./src/compiler/index.ts", "default": "./src/compiler/index.ts" }
  }
}
```

## Architectural fit

- **DNA-1 (Monorepo boundary).** Compiler lives in `packages/pbp/src/compiler/`. No site-local compiler code.
- **DNA-20 (Business layer).** The compiler replaces the implicit "load and merge" logic in `@gogol/business/src/loaders.ts` with an explicit, phased, deterministic pipeline.
- **DNA-55 (Spec vendoring).** Phase structure and behavior reference `pbp-specification-package/compiler` sections.
- **RFC-0428 (Compiler Pipeline contract).** This RFC implements the contract types defined in RFC-0428.
- **RFC-0466 (PBP Runtime).** This RFC depends on Zod schemas from RFC-0466 for Phase 3 (raw-schema-validation).
- **RFC-0468 (Content Creation).** This RFC is the engine that validates and compiles the content created by RFC-0468.
- **RFC-0469 (Site Cutover).** This RFC provides the projections that RFC-0469 switches the site to consume.

## Implementation details

### CLI surface

No CLI command. Library-only. The compiler is called from Astro build-time code.

### TypeScript contracts

See §2 (Public API) above.

### File system responsibilities

| Path                                        | Role                                               |
| ------------------------------------------- | -------------------------------------------------- |
| `packages/pbp/src/compiler/index.ts`        | Public API: `compilePbpProfile`, `compilePbpPhase` |
| `packages/pbp/src/compiler/discover.ts`     | Phase 1: source discovery                          |
| `packages/pbp/src/compiler/parse.ts`        | Phase 2: YAML frontmatter parsing                  |
| `packages/pbp/src/compiler/validate.ts`     | Phase 3: Zod schema validation                     |
| `packages/pbp/src/compiler/entity-index.ts` | Phase 4: entity index construction                 |
| `packages/pbp/src/compiler/locale.ts`       | Phase 5: locale resolution and fallback            |
| `packages/pbp/src/compiler/references.ts`   | Phase 6: reference resolution and cycle detection  |
| `packages/pbp/src/compiler/profile.ts`      | Phase 7: business profile graph assembly           |
| `packages/pbp/src/compiler/overlays.ts`     | Phase 8: runtime overlays (stub)                   |
| `packages/pbp/src/compiler/derivations.ts`  | Phase 9: derivation execution                      |
| `packages/pbp/src/compiler/semantic.ts`     | Phase 10: semantic validation                      |
| `packages/pbp/src/compiler/buyer-view.ts`   | Phase 11: Buyer View assembly                      |
| `packages/pbp/src/compiler/projection.ts`   | Phase 12: projection generation                    |
| `packages/pbp/src/compiler/snapshot.ts`     | Phase 13: canonical snapshot (stub)                |
| `packages/pbp/src/compiler/publication.ts`  | Phase 14: publication result                       |
| `packages/pbp/src/compiler/types.ts`        | Internal compiler types                            |
| `packages/pbp/src/compiler/__tests__/`      | Golden fixture tests                               |

### Output format

N/A — library-only. The compiler returns `PbpCompilerResult` to the caller.

### Failure modes

- **Fatal validation errors** (production mode): compiler throws, build aborts.
- **Validation errors** (migration mode): compiler collects errors, build continues, errors are available in `PbpCompilerResult.validationErrors`.
- **Graph integrity errors**: missing refs, type mismatches, cycles — collected in `PbpCompilerResult.graphErrors`.
- **Missing business singleton**: if no `PbpBusiness` entity is found, Phase 7 fails with `PBP-REF` fatal error.
- **Duplicate entity IDs**: Phase 4 fails with `PBP-ID` fatal error.

## Rollout

- **Immediate:** Upon acceptance, the compiler is implemented in `packages/pbp/src/compiler/`.
- **No site impact:** The compiler is not yet called by any site. Sites still use `@gogol/business` loaders until RFC-0469.
- **Golden fixtures:** Each phase ships with golden fixture tests. Fixtures are derived from the Warpgogol target manifest blueprint (`pbp-specification-package/target-blueprint`).
- **Dependency chain:** Depends on RFC-0466 (Zod schemas). Required by RFC-0468 (Content) and RFC-0469 (Cutover).

## Alternatives considered

- **Astro content collections as the compiler.** Rejected: Astro content collections validate frontmatter but do not provide multi-phase compilation, reference resolution, cycle detection, derivation, or projection generation. The compiler is a separate concern.
- **Implement compiler in site-kernel.** Rejected: the compiler is PBP-specific, not a general-purpose kernel feature. It belongs in `@gogol/pbp`.
- **Use an existing headless CMS compiler.** Rejected: PBP has specific requirements (determinism, locale fallback, graph integrity, Buyer View) that no off-the-shelf compiler satisfies.
- **Skip the compiler, use loaders directly.** Rejected: loaders (RFC-0466) provide raw entity access. The compiler provides the resolved graph, validated references, derivations, and projections — all required for a working site.

## Risks

- **Performance.** The 14-phase pipeline may be slow for large catalogs. Mitigation: Wave 1 is scoped to Warpgogol (~30 entities). Incremental processing (RFC-0430) is Wave 3.
- **Determinism violations.** If any phase uses non-deterministic operations (e.g. `Object.keys()` order, `Date.now()`), reproducible builds break. Mitigation: all phases use sorted iteration; `buildTime` is injected from the caller, not `new Date()`.
- **Schema drift.** If Zod schemas (RFC-0466) diverge from the compiler's expectations, validation may pass but projections may fail. Mitigation: golden fixture tests validate the full pipeline end-to-end.
- **Migration strictness.** The `migration` strictness mode allows errors to pass, which may mask real issues. Mitigation: the migration plan (RFC-0468) requires all errors to be resolved before cutover (RFC-0469).

## Acceptance criteria

- [x] `packages/pbp/src/compiler/` directory created with 14 phase modules (evidence: discover, parse, validate, entity-index, locale, references, profile, overlays, derivations, semantic, buyer-view, projection, snapshot, publication — 2026-07-20)
- [x] `packages/pbp/src/compiler/index.ts` exports `compilePbpProfile` (evidence: packages/pbp/src/compiler/index.ts — 2026-07-20). Note: `compilePbpPhase` not exported as separate function; phases are internal to the pipeline.
- [x] `packages/pbp/src/compiler/types.ts` exports `PbpCompilerInput`, `PbpCompilerResult`, `PbpResolvedGraph`, `PbpBuyerView`, `PbpProjectionSet` (evidence: packages/pbp/src/compiler/types.ts:43,53,72,77,83 — 2026-07-20)
- [x] `packages/pbp/package.json` has `./compiler` export path (evidence: package.json — 2026-07-20)
- [x] All 14 phases implemented as pure functions (evidence: 14 phase modules in src/compiler/ — 2026-07-20)
- [x] Determinism: same inputs produce same `PbpCompilerResult` (golden fixture test) (evidence: compiler-pipeline.test.ts — 2026-07-20)
- [x] `production` strictness aborts on fatal errors (evidence: validate.ts strictness check — 2026-07-20)
- [x] `migration` strictness collects errors and continues (evidence: validate.ts:55-56 — 2026-07-20)
- [x] Golden fixture tests pass for the full pipeline (discover through projection) (evidence: compiler-pipeline.test.ts — 2026-07-20)
- [x] `tsc --noEmit` passes for `packages/pbp/` (evidence: pnpm --filter @gogol/pbp build:check — 2026-07-20)
- [x] `vitest run` passes for `packages/pbp/` (evidence: 12 files, 169 tests passed — 2026-07-20)
- [x] `rfc.validate` passes on this file before merging (RFC status: implemented) (evidence: pnpm exec site-kernel run rfc.validate RFC-0467, 2026-07-20)
- [x] No site imports from `@gogol/pbp/compiler` until RFC-0469 (cutover) (evidence: cutover completed in RFC-0469, 2026-07-20)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Each phase module MUST reference the corresponding spec section in its header comment.
- Phases MUST be independently testable — each phase function accepts the output of the previous phase and returns its own output.
- The compiler MUST be deterministic: no `Date.now()`, no `Math.random()`, no `Object.keys()` without sorting.
- Phase 8 (runtime-overlays) and Phase 13 (canonical-snapshot) are stubs for Wave 1 — they MUST be no-ops with stable signatures so Wave 3/4 can fill them in.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0467 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
