/*
<MODULE_CONTRACT>
<purpose>Barrel export for all PBP Zod schemas and the pbpSchemaById registry (RFC-0466).</purpose>
<non-goals>
  <item>Does not export pricing/terms schemas individually — they are embedded in offering.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0466 — barrel export for all PBP Zod schemas.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";

// Primitives
export {
  pbpLocalizedStringSchema,
  pbpMoneySchema,
  pbpMoneyRangeSchema,
  pbpIsoDurationSchema,
  pbpQuantitativeDurationSchema,
  pbpTimestampSchema,
  pbpQuantitativeValueSchema,
  pbpExternalIdentifierSchema,
  pbpControlledValueSchema,
  nonEmptyString,
  noHtmlString,
  decimalString,
} from "./primitives.js";

// Envelope
export {
  pbpEntityStatusSchema,
  pbpGovernanceSchema,
  pbpEntitySchema,
  entityIdSchema,
  schemaIdSchema,
} from "./envelope.js";

// EntityRef
export { pbpEntityRefSchema } from "./entity-ref.js";

// Entity schemas
export { businessSchema } from "./business.js";
export { legalIdentitySchema } from "./legal-identity.js";
export { brandSchema } from "./brand.js";
export { placeSchema } from "./place.js";
export { contactPointSchema } from "./contact-point.js";
export { webPresenceSchema } from "./web-presence.js";
export { categorySchema } from "./category.js";
export { productSchema } from "./product.js";
export { productGroupSchema } from "./product-group.js";
export { productVariantSchema } from "./product-variant.js";
export { catalogSchema, catalogEntrySchema } from "./catalog.js";
export { offeringSchema } from "./offering.js";
export { policySchema, pbpPolicyKindSchema } from "./policy.js";
export { slaPolicySchema } from "./sla-policy.js";
export { guaranteePolicySchema } from "./guarantee-policy.js";
export { ownershipPolicySchema } from "./ownership-policy.js";
export { exitPolicySchema } from "./exit-policy.js";
export { dataRetentionPolicySchema } from "./data-retention-policy.js";
export { claimSchema } from "./claim.js";
export { evidenceSourceSchema } from "./evidence-source.js";
export { disclosureSchema } from "./disclosure.js";
export { consentSchema } from "./consent.js";
export { publicDocumentSchema } from "./public-document.js";
export {
  pbpCurrencyPricingPolicySchema,
  pbpCurrentUsesSchema,
  pbpCurrencyStrategySchema,
  pbpCurrencyTargetSchema,
} from "./currency-pricing-policy.js";

// ---------------------------------------------------------------------------
// pbpSchemaById registry — maps schema ID strings to their Zod schemas
// ---------------------------------------------------------------------------

import { businessSchema as _business } from "./business.js";
import { legalIdentitySchema as _legalIdentity } from "./legal-identity.js";
import { brandSchema as _brand } from "./brand.js";
import { placeSchema as _place } from "./place.js";
import { contactPointSchema as _contactPoint } from "./contact-point.js";
import { webPresenceSchema as _webPresence } from "./web-presence.js";
import { categorySchema as _category } from "./category.js";
import { productSchema as _product } from "./product.js";
import { productGroupSchema as _productGroup } from "./product-group.js";
import { productVariantSchema as _productVariant } from "./product-variant.js";
import { catalogSchema as _catalog, catalogEntrySchema as _catalogEntry } from "./catalog.js";
import { offeringSchema as _offering } from "./offering.js";
import { policySchema as _policy } from "./policy.js";
import { slaPolicySchema as _slaPolicy } from "./sla-policy.js";
import { guaranteePolicySchema as _guaranteePolicy } from "./guarantee-policy.js";
import { ownershipPolicySchema as _ownershipPolicy } from "./ownership-policy.js";
import { exitPolicySchema as _exitPolicy } from "./exit-policy.js";
import { dataRetentionPolicySchema as _dataRetentionPolicy } from "./data-retention-policy.js";
import { claimSchema as _claim } from "./claim.js";
import { evidenceSourceSchema as _evidenceSource } from "./evidence-source.js";
import { disclosureSchema as _disclosure } from "./disclosure.js";
import { consentSchema as _consent } from "./consent.js";
import { publicDocumentSchema as _publicDocument } from "./public-document.js";
import { pbpCurrencyPricingPolicySchema as _currencyPricingPolicy } from "./currency-pricing-policy.js";

import { pbpSchemaId } from "../schema-id.js";

export const pbpSchemaById: Record<string, z.ZodType> = {
  [pbpSchemaId("business")]: _business,
  [pbpSchemaId("legal-identity")]: _legalIdentity,
  [pbpSchemaId("brand")]: _brand,
  [pbpSchemaId("place")]: _place,
  [pbpSchemaId("contact-point")]: _contactPoint,
  [pbpSchemaId("web-presence")]: _webPresence,
  [pbpSchemaId("category")]: _category,
  [pbpSchemaId("product")]: _product,
  [pbpSchemaId("product-group")]: _productGroup,
  [pbpSchemaId("product-variant")]: _productVariant,
  [pbpSchemaId("catalog")]: _catalog,
  [pbpSchemaId("catalog-entry")]: _catalogEntry,
  [pbpSchemaId("offering")]: _offering,
  [pbpSchemaId("policy")]: _policy,
  [pbpSchemaId("sla-policy")]: _slaPolicy,
  [pbpSchemaId("guarantee-policy")]: _guaranteePolicy,
  [pbpSchemaId("ownership-policy")]: _ownershipPolicy,
  [pbpSchemaId("exit-policy")]: _exitPolicy,
  [pbpSchemaId("data-retention-policy")]: _dataRetentionPolicy,
  [pbpSchemaId("claim")]: _claim,
  [pbpSchemaId("evidence-source")]: _evidenceSource,
  [pbpSchemaId("disclosure")]: _disclosure,
  [pbpSchemaId("consent")]: _consent,
  [pbpSchemaId("public-document")]: _publicDocument,
  [pbpSchemaId("currency-pricing-policy")]: _currencyPricingPolicy,
};

// ---------------------------------------------------------------------------
// Discriminated union on the `schema` field for collection-level validation
// ---------------------------------------------------------------------------

export const pbpEntityDiscriminatedUnion = z.discriminatedUnion("schema", [
  _business,
  _legalIdentity,
  _brand,
  _place,
  _contactPoint,
  _webPresence,
  _category,
  _product,
  _productGroup,
  _productVariant,
  _catalog,
  _catalogEntry,
  _offering,
  _policy,
  _slaPolicy,
  _guaranteePolicy,
  _ownershipPolicy,
  _exitPolicy,
  _dataRetentionPolicy,
  _claim,
  _evidenceSource,
  _disclosure,
  _consent,
  _publicDocument,
  _currencyPricingPolicy,
]);
