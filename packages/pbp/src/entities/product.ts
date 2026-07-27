/**
 * PBP Product entity and product kind vocabulary.
 *
 * @see pbp-specification-package/entity-model §11 (Product)
 * @see pbp-specification-package/system-spec §3.4 (Federated identity)
 * @see RFC-0404
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import type { PbpExternalIdentifier } from "../primitives.js";
import { pbpSchemaId } from "../schema-id.js";

export const PRODUCT_SCHEMA_ID = pbpSchemaId("product");

export type PbpProductKind =
  | "physical-good"
  | "digital-good"
  | "service"
  | "composite-service"
  | "subscription-access"
  | "license"
  | "rental"
  | "insurance-product"
  | "bundle"
  | "right"
  | "data-product"
  | "experience"
  | "custom-made-good";

export const PBP_PRODUCT_KINDS: readonly PbpProductKind[] = [
  "physical-good",
  "digital-good",
  "service",
  "composite-service",
  "subscription-access",
  "license",
  "rental",
  "insurance-product",
  "bundle",
  "right",
  "data-product",
  "experience",
  "custom-made-good",
] as const;

export function isPbpProductKind(value: string): value is PbpProductKind {
  return PBP_PRODUCT_KINDS.includes(value as PbpProductKind);
}

export interface PbpProduct extends PbpEntity {
  type: "product";
  kind: PbpProductKind;
  name: string;
  summary?: string;
  authorityRef?: PbpEntityRef;
  classification?: {
    categoryRef?: PbpEntityRef;
    comparisonProfileRefs?: Record<string, PbpEntityRef>;
  };
  purpose?: { statement: string };
  outcomes?: Record<string, { name: string; description?: string }>;
  deliverables?: Record<string, { kind: string; name: string }>;
  capabilities?: Record<string, { value: string | boolean }>;
  externalIdentifiers?: Record<string, PbpExternalIdentifier>;
  intrinsicComposition?: PbpProductIntrinsicComposition;
}

export interface PbpProductIntrinsicComposition {
  [componentName: string]: {
    productRef: PbpEntityRef;
    quantity?: number;
  };
}
