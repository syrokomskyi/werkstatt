/**
 * @warpgogol/pbp — Public Business Profile (PBP) entity envelope, namespace, and URI policy.
 *
 * @see RFC-0399 (Namespace, Entity Envelope and URI Policy)
 * @see RFC-0400 (Primitive Types and Controlled Vocabularies)
 * @see RFC-0401 (Schema Evolution and Compatibility)
 * @see RFC-0402 (Package and Source Profiles)
 * @see pbp-specification-package (vendored spec, accepted, pbp/*@1)
 */

export { PBP_NAMESPACE, PBP_MAJOR_VERSION, pbpSchemaId, validateSchemaId } from "./schema-id.js";

export {
  validatePbpUri,
  type PbpUriValidationResult,
  type PbpUriValidationOk,
  type PbpUriValidationFail,
} from "./uri.js";

export {
  type PbpEntity,
  type PbpEntityStatus,
  type PbpGovernance,
  PBP_ENTITY_STATUSES,
  isPbpEntityStatus,
} from "./envelope.js";

export {
  type PbpEntityRef,
  type PbpIdentityRelation,
  PBP_IDENTITY_RELATIONS,
} from "./entity-ref.js";

export {
  type PbpLocalizedString,
  type PbpMoney,
  type PbpMoneyRange,
  type PbpIsoDuration,
  type PbpQuantitativeDuration,
  type PbpTimestamp,
  type PbpQuantitativeValue,
  type PbpExternalIdentifier,
  type PbpControlledValue,
} from "./primitives.js";

export {
  type PbpSemanticStatus,
  PBP_SEMANTIC_STATUSES,
  isPbpSemanticStatus,
} from "./semantic-status.js";

export {
  DECIMAL_RE,
  validateDecimal,
  validateMoneyRange,
  containsHtml,
  isEmptyValue,
} from "./validation.js";

export {
  type PbpSchemaVersion,
  type PbpDataRevision,
  type PbpSchemaField,
  type PbpSchemaDefinition,
  type PbpCompatibilityViolation,
  validateSchemaCompatibility,
} from "./schema-evolution.js";

export { type PbpMigrationTransformation, type PbpMigrationContract } from "./migration.js";

export {
  type PbpLocaleProfile,
  type PbpBuildConfig,
  type PbpPackageManifest,
  type PbpBuildRequest,
} from "./package-manifest.js";

export {
  type PbpSourceAdapterType,
  PBP_SOURCE_ADAPTER_TYPES,
  isPbpSourceAdapterType,
  type PbpSourceProfile,
} from "./source-profile.js";

export { type PbpBusiness, BUSINESS_SCHEMA_ID } from "./entities/business.js";

export {
  type PbpProduct,
  type PbpProductKind,
  PBP_PRODUCT_KINDS,
  isPbpProductKind,
  PRODUCT_SCHEMA_ID,
} from "./entities/product.js";

export {
  type PbpClaim,
  type PbpClaimClass,
  type PbpClaimKind,
  type PbpVerificationLevel,
  PBP_CLAIM_CLASSES,
  PBP_CLAIM_KINDS,
  PBP_VERIFICATION_LEVELS,
  CLAIM_SCHEMA_ID,
} from "./entities/claim.js";

export {
  type PbpLocaleFieldPolicy,
  type PbpLocaleResolutionStatus,
  type PbpFallbackEntry,
  type PbpFallbackReport,
} from "./locale.js";

export {
  type PbpReferenceClass,
  type PbpExternalRefKind,
  type PbpGraphErrorKind,
  type PbpGraphIntegrityError,
  type PbpCycleCheckType,
  type PbpCycleCheckResult,
} from "./reference-resolution.js";

export {
  type PbpLegacySourceFile,
  type PbpMigrationDecision,
  type PbpUnresolvedItem,
  type PbpExtractionResult,
} from "./migration-extraction.js";

export { type PbpLegalIdentity, LEGAL_IDENTITY_SCHEMA_ID } from "./entities/legal-identity.js";

export { type PbpBrand, BRAND_SCHEMA_ID } from "./entities/brand.js";

export {
  type PbpPlace,
  type PbpPlaceKind,
  PBP_PLACE_KINDS,
  isPbpPlaceKind,
  PLACE_SCHEMA_ID,
} from "./entities/place.js";

export {
  type PbpContactPoint,
  type PbpContactChannel,
  PBP_CONTACT_CHANNELS,
  isPbpContactChannel,
  CONTACT_POINT_SCHEMA_ID,
} from "./entities/contact-point.js";

export {
  type PbpWebPresence,
  type PbpWebPresenceKind,
  type PbpWebControlStatus,
  PBP_WEB_PRESENCE_KINDS,
  isPbpWebPresenceKind,
  PBP_WEB_CONTROL_STATUSES,
  isPbpWebControlStatus,
  WEB_PRESENCE_SCHEMA_ID,
} from "./entities/web-presence.js";

export { type PbpCategory, CATEGORY_SCHEMA_ID } from "./entities/category.js";

export { type PbpProductGroup, PRODUCT_GROUP_SCHEMA_ID } from "./entities/product-group.js";

export { type PbpProductVariant, PRODUCT_VARIANT_SCHEMA_ID } from "./entities/product-variant.js";

export {
  type PbpEvidenceSource,
  type PbpEvidenceKind,
  PBP_EVIDENCE_KINDS,
  isPbpEvidenceKind,
  EVIDENCE_SOURCE_SCHEMA_ID,
} from "./entities/evidence-source.js";

export {
  type PbpDisclosure,
  type PbpDisclosureKind,
  type PbpDisclosureMateriality,
  PBP_DISCLOSURE_KINDS,
  isPbpDisclosureKind,
  PBP_DISCLOSURE_MATERIALITIES,
  isPbpDisclosureMateriality,
  DISCLOSURE_SCHEMA_ID,
} from "./entities/disclosure.js";

// RFC-0706: Consent entity (Nachweisregister)
export {
  type PbpConsent,
  type PbpConsentMethod,
  type PbpConsentStatus,
  PBP_CONSENT_METHODS,
  isPbpConsentMethod,
  PBP_CONSENT_STATUSES,
  isPbpConsentStatus,
  CONSENT_SCHEMA_ID,
} from "./entities/consent.js";

export {
  type PbpCredential,
  type PbpCredentialKind,
  PBP_CREDENTIAL_KINDS,
  isPbpCredentialKind,
  CREDENTIAL_SCHEMA_ID,
} from "./entities/credential.js";

export {
  type PbpReview,
  type PbpAggregateRating,
  type PbpReviewContentMode,
  PBP_REVIEW_CONTENT_MODES,
  isPbpReviewContentMode,
  REVIEW_SCHEMA_ID,
  AGGREGATE_RATING_SCHEMA_ID,
} from "./entities/review.js";

export {
  type PbpPublicDocument,
  type PbpDocumentKind,
  PBP_DOCUMENT_KINDS,
  isPbpDocumentKind,
  PUBLIC_DOCUMENT_SCHEMA_ID,
} from "./entities/public-document.js";

export {
  type PbpRuntimeOverlay,
  type PbpOverlayStaleBehavior,
  PBP_OVERLAY_STALE_BEHAVIORS,
  isPbpOverlayStaleBehavior,
} from "./runtime-overlay.js";

export {
  type PbpValidationSeverity,
  type PbpErrorPrefix,
  type PbpValidationError,
  PBP_VALIDATION_SEVERITIES,
  isPbpValidationSeverity,
  PBP_ERROR_PREFIXES,
  isPbpErrorPrefix,
} from "./validation-errors.js";

export {
  type PbpRegistryEntry,
  type PbpRegistryKind,
  type PbpResolverResult,
  type PbpResolverStatus,
  PBP_REGISTRY_KINDS,
  isPbpRegistryKind,
} from "./registry.js";

export {
  type PbpNormalizationDecision,
  type PbpNormalizationRule,
  type PbpNormalizationResult,
  PBP_NORMALIZATION_DECISIONS,
  isPbpNormalizationDecision,
} from "./normalization.js";

// RFC-0426: Bundles and Composition
export type { PbpProductIntrinsicComposition } from "./entities/product.js";

// RFC-0427: Catalog and CatalogEntry
export {
  type PbpCatalog,
  type PbpCatalogEntry,
  type PbpCatalogEntrySource,
  type PbpCatalogEntrySourceMode,
  PBP_CATALOG_ENTRY_SOURCE_MODES,
  isPbpCatalogEntrySourceMode,
  CATALOG_SCHEMA_ID,
  CATALOG_ENTRY_SCHEMA_ID,
} from "./entities/catalog.js";

// RFC-0428: Compiler Pipeline
export {
  type PbpCompilerPhase,
  type PbpBuildStrictness,
  type PbpBuildContext,
  type PbpSourceInventoryEntry,
  type PbpSourceInventoryReport,
  PBP_COMPILER_PHASES,
  isPbpCompilerPhase,
  PBP_BUILD_STRICTNESSES,
  isPbpBuildStrictness,
} from "./compiler-pipeline.js";

// RFC-0429: Offering Core
export {
  type PbpOffering,
  type PbpAvailabilityMode,
  type PbpOfferingRelation,
  type PbpOfferingAcquisition,
  type PbpAllowance,
  type PbpRelatedOffering,
  type PbpPricing,
  PBP_AVAILABILITY_MODES,
  isPbpAvailabilityMode,
  PBP_OFFERING_RELATIONS,
  isPbpOfferingRelation,
  PBP_OFFERING_ACQUISITIONS,
  isPbpOfferingAcquisition,
  OFFERING_SCHEMA_ID,
} from "./entities/offering.js";

// RFC-0430: Incremental and Bulk Processing
export {
  type PbpCacheKey,
  type PbpDependencyInvalidationRule,
  type PbpDependencyGraph,
  type PbpIncrementalBuildConfig,
  type PbpBulkProcessingConfig,
  PBP_DEPENDENCY_INVALIDATION_RULES,
  isPbpDependencyInvalidationRule,
} from "./incremental-processing.js";

// RFC-0431: Derivation Contract
export {
  type PbpDerivationStatus,
  type PbpDerivationMode,
  type PbpDerivationProvenance,
  type PbpDerivationContract,
  type PbpDerivationResult,
  PBP_DERIVATION_STATUSES,
  isPbpDerivationStatus,
  PBP_DERIVATION_MODES,
  isPbpDerivationMode,
} from "./derivation.js";

// RFC-0432: Schema.org Mapping
export {
  type PbpSchemaOrgMappingRef,
  type PbpSchemaOrgMapping,
  type PbpSchemaOrgLossEntry,
  type PbpSchemaOrgLossReport,
} from "./projections/schema-org.js";

// RFC-0433: CRM Projection
export { type PbpCrmPayload, type PbpCrmProjection } from "./projections/crm.js";

// RFC-0434: MachineUsePolicy and AI Access Projections
export {
  type PbpMachineUsePolicy,
  type PbpMachineUsePermission,
  type PbpMachineUseVerdict,
  PBP_MACHINE_USE_PERMISSIONS,
  isPbpMachineUsePermission,
  PBP_MACHINE_USE_VERDICTS,
  isPbpMachineUseVerdict,
  MACHINE_USE_POLICY_SCHEMA_ID,
} from "./entities/machine-use-policy.js";

export { type PbpAiAccessProjection } from "./projections/ai-access.js";

// RFC-0435: Git Revision and Publication Snapshot
export {
  type PbpGitRevision,
  type PbpCanonicalSerializationStep,
  type PbpCanonicalSerialization,
  type PbpCanonicalSnapshotIncluded,
  type PbpCanonicalSnapshotExcluded,
  type PbpCanonicalSnapshot,
  type PbpPublicationSnapshot,
  PBP_CANONICAL_SERIALIZATION_STEPS,
  isPbpCanonicalSerializationStep,
} from "./publication.js";

// RFC-0436: Offering Relations — no new types (already in RFC-0429)

// RFC-0437: Pricing Core: Charge, Plan, Adjustment
export {
  type PbpChargeType,
  type PbpAmountModel,
  type PbpTierMethod,
  type PbpChargeAmount,
  type PbpCharge,
  type PbpPlan,
  type PbpAdjustmentType,
  type PbpAdjustment,
  PBP_CHARGE_TYPES,
  isPbpChargeType,
  PBP_AMOUNT_MODELS,
  isPbpAmountModel,
  PBP_TIER_METHODS,
  PBP_ADJUSTMENT_TYPES,
  isPbpAdjustmentType,
} from "./entities/pricing.js";

// RFC-0438: Terms and Commercial Lifecycle
export {
  type PbpRenewalMode,
  type PbpTerms,
  PBP_RENEWAL_MODES,
  isPbpRenewalMode,
} from "./entities/terms.js";

// RFC-0439: Policy Base and Scope
export {
  type PbpPolicy,
  type PbpPolicyKind,
  PBP_POLICY_KINDS,
  isPbpPolicyKind,
  POLICY_SCHEMA_ID,
} from "./entities/policy.js";

// RFC-0440: ComparisonProfile
export {
  type PbpComparisonProfile,
  type PbpComparisonDimension,
  type PbpComparisonValueType,
  PBP_COMPARISON_VALUE_TYPES,
  isPbpComparisonValueType,
  COMPARISON_PROFILE_SCHEMA_ID,
} from "./entities/comparison-profile.js";

// RFC-0441: Buyer View Schema
export {
  type PbpBuyerViewSchema,
  type PbpBuyerViewSection,
  BUYER_VIEW_SCHEMA_ID,
} from "./entities/buyer-view-schema.js";

// RFC-0442: Canonical Serialization — PbpJcsCanonicalization (core types in RFC-0435)
export { type PbpJcsCanonicalization } from "./publication.js";

// RFC-0443: Shopify/PIM Adapter Profile
export {
  type PbpPimAdapterProfile,
  type PbpPimEntityMapping,
  type PbpShopifyAdapterProfile,
} from "./adapters/pim-adapter.js";

// RFC-0444: Usage, Range and Tiered Pricing — no new types (already in RFC-0437)

// RFC-0445: Allowances, Overage and Deposits — no new types (already in RFC-0429/0437)

// RFC-0446: Tax and Buyer Presentation
export {
  type PbpTax,
  type PbpTaxTreatment,
  type PbpTaxJurisdiction,
  PBP_TAX_TREATMENTS,
  isPbpTaxTreatment,
} from "./entities/tax.js";

// RFC-0447: Service Level Policy
export {
  type PbpServiceLevelPolicy,
  type PbpSlaObjective,
  type PbpSlaRemedy,
  type PbpSlaOperator,
  type PbpSlaRemedyType,
  PBP_SLA_OPERATORS,
  isPbpSlaOperator,
  PBP_SLA_REMEDY_TYPES,
  isPbpSlaRemedyType,
} from "./entities/sla-policy.js";

// RFC-0448: Guarantee and Remedy
export {
  type PbpGuaranteePolicy,
  type PbpGuaranteeCondition,
  type PbpGuaranteeRemedy,
  type PbpGuaranteeRemedyType,
  type PbpGuaranteeOperator,
  PBP_GUARANTEE_OPERATORS,
  isPbpGuaranteeOperator,
  PBP_GUARANTEE_REMEDY_TYPES,
  isPbpGuaranteeRemedyType,
} from "./entities/guarantee-policy.js";

// RFC-0449: Ownership, License and Portability
export {
  type PbpOwnershipPolicy,
  type PbpOwnershipAsset,
  type PbpAssetHolder,
  PBP_ASSET_HOLDERS,
  isPbpAssetHolder,
} from "./entities/ownership-policy.js";

// RFC-0450: Exit and Data Package
export { type PbpExitPolicy, type PbpExitPackage } from "./entities/exit-policy.js";

// RFC-0451: Fulfillment, Shipping, Pickup and Return
export {
  type PbpFulfillment,
  type PbpFulfillmentMode,
  type PbpCustomerResponsibility,
  PBP_FULFILLMENT_MODES,
  isPbpFulfillmentMode,
} from "./entities/fulfillment.js";

// RFC-0452: Data Retention and Deletion
export {
  type PbpDataRetentionPolicy,
  type PbpRetentionPeriod,
} from "./entities/data-retention-policy.js";

// RFC-0453: First-Year Cost and TCO
export {
  type PbpFirstYearCostDerivation,
  type PbpTcoDerivation,
} from "./derivations/first-year-cost.js";

// RFC-0454: Comparison Projection
export {
  type PbpComparisonProjection,
  type PbpComparisonResult,
  type PbpComparisonStatus,
  PBP_COMPARISON_STATUSES,
  isPbpComparisonStatus,
} from "./projections/comparison.js";

// RFC-0455: Website Projection Contract
export { type PbpWebsiteProjection } from "./projections/website.js";

// RFC-0456: AI Answer Projection
export { type PbpAiAnswerProjection } from "./projections/ai-answer.js";

// RFC-0457: Quote and Contract Inputs
export { type PbpQuoteInput, type PbpContractInput } from "./projections/quote-contract.js";

// RFC-0458: Invoice Input
export { type PbpInvoiceInput } from "./projections/invoice.js";

// RFC-0459: Signature Envelope
export {
  type PbpSignatureEnvelope,
  type PbpSignatureAlgorithm,
  PBP_SIGNATURE_ALGORITHMS,
  isPbpSignatureAlgorithm,
} from "./signature.js";

// RFC-0460: Sichtpass / Verifiable Credential Mapping
export { type PbpSichtpassMapping, type PbpVerifiableCredentialMapping } from "./sichtpass.js";

// RFC-0461: Warpgogol Legacy Migration
export {
  type PbpMigrationMapping,
  type PbpLegacyToPbpFieldMap,
} from "./migration/migration-mapping.js";

// RFC-0462: Migration Coverage and Cutover
export { type PbpMigrationCoverageReport, type PbpCutoverChecklist } from "./migration/cutover.js";
