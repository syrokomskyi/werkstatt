# @gogol/pbp Agent Guide

This package contains the Public Business Profile (PBP) entity envelope, namespace constants, and URI validation utilities.

## Scope

- Established by RFC-0399 (Namespace, Entity Envelope and URI Policy).
- Spec traceability: `pbp-specification-package/RFC-PBP-001`.
- Namespace: `pbp/*@1` — frozen, additive-only within `@1`.
- This package is the single home for all PBP types, schemas, loaders, and projection contracts.

## Critical rule

**PBP is the canonical business layer (DNA-20 superseded by RFC-0471).** All sites MUST use `@gogol/pbp` for business entity types, schemas, loaders, and semantic projections. `buildPageSemanticModel` and `buildPbpSemanticProfile` are exported from `@gogol/pbp/semantic-profile`. People records now live in a standalone `people` content collection (`src/content/people/{lang}/`).

## API surface

### Foundation (RFC-0399..0402)

- `PbpEntity` — base entity envelope interface (`schema`, `id`, `type`, `status`, `name?`, `summary?`, `governance?`)
- `PbpEntityStatus` — closed enum (`draft`, `published`, `suspended`, `retired`, `superseded`)
- `PbpGovernance` — governance block (`authorityRef`, `effectiveFrom?`, `reviewedAt?`, `reviewEvery?`, `maintenanceOwnerRef?`)
- `PbpEntityRef` — cross-entity reference (`ref`, `expectedType?`)
- `PbpIdentityRelation` — identity equivalence relation types (`sameIdentityAs`, `equivalentTo`, `similarTo`, `supersedes`, `derivedFrom`)
- `pbpSchemaId(entity)` — construct a schema ID string (`pbp/{entity}@1`)
- `validateSchemaId(schema)` — parse and validate a schema ID
- `validatePbpUri(uri, options?)` — validate a PBP entity URI (HTTPS by default, locale-independent, no array indices)
- `PbpLocalizedString`, `PbpMoney`, `PbpMoneyRange`, `PbpIsoDuration`, `PbpQuantitativeDuration`, `PbpTimestamp`, `PbpQuantitativeValue`, `PbpExternalIdentifier`, `PbpControlledValue` — primitive types
- `PbpSemanticStatus` — closed enum (`not-declared`, `false`, `null`, `not-applicable`, `unavailable`, `invalid`)
- `PbpSchemaVersion`, `PbpDataRevision`, `PbpSchemaField`, `PbpSchemaDefinition`, `PbpCompatibilityViolation` — schema evolution types
- `PbpMigrationTransformation`, `PbpMigrationContract` — migration types
- `PbpLocaleProfile`, `PbpBuildConfig`, `PbpPackageManifest`, `PbpBuildRequest` — package manifest types
- `PbpSourceAdapterType`, `PbpSourceProfile` — source profile types
- `PbpLocaleFieldPolicy`, `PbpLocaleResolutionStatus`, `PbpFallbackEntry`, `PbpFallbackReport` — locale types
- `PbpReferenceClass`, `PbpExternalRefKind`, `PbpGraphErrorKind`, `PbpGraphIntegrityError`, `PbpCycleCheckType`, `PbpCycleCheckResult` — reference resolution types
- `PbpLegacySourceFile`, `PbpMigrationDecision`, `PbpUnresolvedItem`, `PbpExtractionResult` — migration extraction types

### Entities (RFC-0403..0420)

- `PbpBusiness` — Business entity (RFC-0403)
- `PbpProduct`, `PbpProductKind` — Product entity with kind vocabulary (RFC-0404)
- `PbpClaim`, `PbpClaimClass`, `PbpClaimKind` — Claim entity with class/kind vocabularies (RFC-0405)
- `PbpLegalIdentity` — LegalIdentity entity with public/private boundary (RFC-0409)
- `PbpBrand` — Brand entity (RFC-0410)
- `PbpPlace`, `PbpPlaceKind` — Place entity with kind vocabulary (RFC-0411)
- `PbpContactPoint`, `PbpContactChannel` — ContactPoint entity with channel vocabulary (RFC-0412)
- `PbpWebPresence`, `PbpWebPresenceKind`, `PbpWebControlStatus` — WebPresence entity (RFC-0413)
- `PbpCategory` — Category entity for global semantic layer (RFC-0414)
- `PbpProductGroup`, `PbpProductVariant` — Product schema entities (RFC-0415)
- `PbpEvidenceSource`, `PbpEvidenceKind` — EvidenceSource entity (RFC-0416)
- `PbpDisclosure`, `PbpDisclosureKind`, `PbpDisclosureMateriality` — Disclosure entity (RFC-0417)
- `PbpCredential`, `PbpCredentialKind` — Credential entity (RFC-0418)
- `PbpReview`, `PbpAggregateRating`, `PbpReviewContentMode` — Review and AggregateRating entities (RFC-0419)
- `PbpPublicDocument`, `PbpDocumentKind` — PublicDocument entity (RFC-0420)

### Infrastructure types (RFC-0421..0424)

- `PbpRuntimeOverlay`, `PbpOverlayStaleBehavior` — runtime state overlay (RFC-0421)
- `PbpValidationSeverity`, `PbpErrorPrefix`, `PbpValidationError` — validation and error codes (RFC-0422)
- `PbpRegistryEntry`, `PbpRegistryKind`, `PbpResolverResult`, `PbpResolverStatus` — registry and resolver (RFC-0423)
- `PbpNormalizationDecision`, `PbpNormalizationRule`, `PbpNormalizationResult` — normalization contract (RFC-0424)

### Extended entities and compiler (RFC-0425..0428)

- `PbpProductIntrinsicComposition` — intrinsic composition field on Product for bundles (RFC-0426)
- `PbpCatalog`, `PbpCatalogEntry`, `PbpCatalogEntrySource`, `PbpCatalogEntrySourceMode` — Catalog and CatalogEntry entities (RFC-0427)
- `PbpCompilerPhase`, `PbpBuildContext`, `PbpBuildStrictness`, `PbpSourceInventoryEntry`, `PbpSourceInventoryReport` — compiler pipeline contract (RFC-0428)

### Offering, projections, and publication (RFC-0429..0435)

- `PbpOffering`, `PbpAvailabilityMode`, `PbpOfferingRelation`, `PbpOfferingAcquisition`, `PbpAllowance`, `PbpRelatedOffering`, `PbpPricing` — Offering entity and supporting types (RFC-0429)
- `PbpCacheKey`, `PbpDependencyInvalidationRule`, `PbpIncrementalBuildConfig`, `PbpBulkProcessingConfig` — incremental and bulk processing (RFC-0430)
- `PbpDerivationContract`, `PbpDerivationResult`, `PbpDerivationMode`, `PbpDerivationStatus`, `PbpDerivationProvenance` — derivation contract (RFC-0431)
- `PbpSchemaOrgMapping`, `PbpSchemaOrgLossReport`, `PbpSchemaOrgLossEntry` — Schema.org projection mapping (RFC-0432)
- `PbpCrmPayload`, `PbpCrmProjection` — CRM projection (RFC-0433)
- `PbpMachineUsePolicy`, `PbpMachineUsePermission`, `PbpMachineUseVerdict`, `PbpAiAccessProjection` — MachineUsePolicy entity and AI access projection (RFC-0434)
- `PbpGitRevision`, `PbpCanonicalSnapshot`, `PbpCanonicalSerializationStep`, `PbpPublicationSnapshot` — git revision and publication snapshot (RFC-0435)

### Relations, pricing, terms, policy, registry, and adapters (RFC-0436..0443)

- `PbpOfferingRelation`, `PbpOfferingAcquisition`, `PbpRelatedOffering` — already exported from RFC-0429 (RFC-0436)
- `PbpCharge`, `PbpChargeAmount`, `PbpChargeType`, `PbpAmountModel`, `PbpPlan`, `PbpAdjustment`, `PbpAdjustmentType` — pricing core (RFC-0437)
- `PbpTerms`, `PbpRenewalMode` — terms and commercial lifecycle (RFC-0438)
- `PbpPolicy`, `PbpPolicyKind` — policy base and scope (RFC-0439)
- `PbpComparisonProfile`, `PbpComparisonDimension`, `PbpComparisonValueType` — ComparisonProfile entity (RFC-0440)
- `PbpBuyerViewSchema`, `PbpBuyerViewSection` — BuyerViewSchema entity (RFC-0441)
- `PbpJcsCanonicalization` — JCS canonicalization contract (RFC-0442)
- `PbpPimAdapterProfile`, `PbpShopifyAdapterProfile`, `PbpPimEntityMapping` — Shopify/PIM adapter profile (RFC-0443)

### Specialized policies, tax, and fulfillment (RFC-0444..0451)

- Usage/range/tiered pricing — already in RFC-0437 (RFC-0444)
- Allowances/overage/deposits — already in RFC-0429/0437 (RFC-0445)
- `PbpTax`, `PbpTaxTreatment`, `PbpTaxJurisdiction` — tax and buyer presentation (RFC-0446)
- `PbpServiceLevelPolicy`, `PbpSlaObjective`, `PbpSlaRemedy` — SLA policy (RFC-0447)
- `PbpGuaranteePolicy`, `PbpGuaranteeCondition`, `PbpGuaranteeRemedy`, `PbpGuaranteeOperator` — guarantee policy (RFC-0448)
- `PbpOwnershipPolicy`, `PbpOwnershipAsset`, `PbpAssetHolder` — ownership policy (RFC-0449)
- `PbpExitPolicy`, `PbpExitPackage` — exit and data package (RFC-0450)
- `PbpFulfillment`, `PbpFulfillmentMode`, `PbpCustomerResponsibility` — fulfillment (RFC-0451)

### Retention, derivations, projections, and signature (RFC-0452..0459)

- `PbpDataRetentionPolicy`, `PbpRetentionPeriod` — data retention and deletion (RFC-0452)
- `PbpFirstYearCostDerivation`, `PbpTcoDerivation` — first-year cost and TCO (RFC-0453)
- `PbpComparisonProjection`, `PbpComparisonResult`, `PbpComparisonStatus` — comparison projection (RFC-0454)
- `PbpWebsiteProjection` — website projection (RFC-0455)
- `PbpAiAnswerProjection` — AI answer projection (RFC-0456)
- `PbpQuoteInput`, `PbpContractInput` — quote and contract inputs (RFC-0457)
- `PbpInvoiceInput` — invoice input (RFC-0458)
- `PbpSignatureEnvelope`, `PbpSignatureAlgorithm` — signature envelope (RFC-0459)

### Sichtpass, legacy migration, and cutover (RFC-0460..0462)

- `PbpSichtpassMapping`, `PbpVerifiableCredentialMapping` — Sichtpass / VC mapping (RFC-0460)
- `PbpMigrationMapping`, `PbpLegacyToPbpFieldMap` — Webgogol legacy migration (RFC-0461)
- `PbpMigrationCoverageReport`, `PbpCutoverChecklist` — migration coverage and cutover (RFC-0462)

## Runtime layer (RFC-0466)

### Export paths

| Entry point | Module | What it provides |
| --- | --- | --- |
| `@gogol/pbp/schemas` | `src/schemas/index.ts` | Zod schemas for all Wave 1 entities + `pbpSchemaById` registry + `pbpEntityDiscriminatedUnion` |
| `@gogol/pbp/loaders` | `src/loaders.ts` | Typed, locale-aware loader functions (`getPbpBusiness`, `getPbpOfferings`, etc.) with deep-merge language fallback (RFC-0008) |
| `@gogol/pbp/astro` | `src/astro.ts` | `pbpCollections` — Astro content collection definitions for `business-profile` |
| `@gogol/pbp/compiler` | `src/compiler/index.ts` | `compilePbpProfile` — 14-phase compiler pipeline (discover → parse → validate → index → locale → references → profile → overlays → derivations → semantic → buyer-view → projection → snapshot → publication) |
| `@gogol/pbp/semantic-profile` | `src/semantic-profile.ts` | `buildPbpSemanticProfile` — maps PBP compiler output to `SemanticSiteProfile` (RFC-0469). Also re-exports `buildPageSemanticModel` (RFC-0470). |
| `@gogol/pbp/semantic-model` | `src/semantic-model.ts` | `buildPageSemanticModel` — builds a `SemanticPageModel` for a single page from page/prose/site collections via `astro:content` (RFC-0470). RFC-0492: accepts optional `surfaceId`/`depth` params; for depth-1 `website-local` pages, sets `model.industryService` so `buildServiceNodes` emits an industry-specific Service node instead of org-level Service nodes. |
| `@gogol/pbp/cutover-check` | `src/cutover-check.ts` | `runCutoverCheck` — verifies PBP content coverage and test preconditions (RFC-0462). |

### How to use in a site (after RFC-0469 cutover)

1. Wire collections in `content.config.ts`:

```typescript
import { pbpCollections } from "@gogol/pbp/astro";
export const collections = { ...pbpCollections };
```

2. Query data at build time:

```typescript
import { getPbpBusiness, getPbpOfferings } from "@gogol/pbp/loaders";
const business = await getPbpBusiness("de");
const offerings = await getPbpOfferings("de");
```

### Content location

PBP content files live under `src/content/business-profile/{lang}/`:

- `business.md`, `legal-identity.md`, `brand.md`, `catalog.md` — singletons
- `places/<slug>.md`, `contact-points/<slug>.md`, `products/<slug>.md`, `offerings/<slug>.md`, etc. — repeatables

### Validation

```sh
pnpm --filter @gogol/pbp build:check
pnpm --filter @gogol/pbp test
```

## Presentation fields (RFC-0482)

Five entity schemas (`offering`, `legal-identity`, `web-presence`, `public-document`, `business`) carry an optional `presentation: z.record(z.string(), z.unknown())` field. This field holds site-specific display-formatted strings for content reference resolution (RFC-0045) — e.g. `presentation.price.monthly: "70 € / Monat"`.

- The field is intentionally loose-typed (`z.record(z.string(), z.unknown())`). Structural validation belongs in the PBP spec, not in presentation.
- The field is optional — entities without `presentation` validate unchanged.
- `null` is rejected; omit the field entirely if no presentation data exists.
- Locale overlay: `resolveLocales` deep-merges presentation fields. Each locale should author its own `presentation` block. The fallback report flags inherited presentation paths.

## Downstream RFC rules

- Downstream entity RFCs (RFC-PBP-010+) extend `PbpEntity` with `interface PbpXxx extends PbpEntity { ... }`.
- Downstream RFCs MUST NOT redefine `schema`, `id`, `type`, `status`, or `governance` on their entity interfaces.
- Individual entity Zod schemas live in `src/schemas/` (established by RFC-0466), not in downstream RFCs.

## External identifiers and sameAs projection (RFC-0530)

`PbpBusiness`, `PbpBrand`, and `PbpLegalIdentity` carry an optional `externalIdentifiers: Record<string, PbpExternalIdentifier>` field for entity-equivalence links (Wikidata QIDs, Crunchbase IDs, etc.). `PbpWebPresence` carries an optional `sameAs: string[]` field for social-profile canonical URLs.

- Only `Business.externalIdentifiers` are projected to JSON-LD `sameAs` on the Organization node. `Brand` and `LegalIdentity` `externalIdentifiers` are stored but not projected — they are available for future per-entity JSON-LD nodes.
- Social-profile `WebPresence.sameAs` URLs are also projected to the Organization node's `sameAs`.
- Product `externalIdentifiers` are catalog identifiers (GTIN/MPN) and are NOT projected to `sameAs` — Product entities do not produce Organization nodes.
- The projection concatenates `schemeRef + value` verbatim to construct `sameAs` URLs.
