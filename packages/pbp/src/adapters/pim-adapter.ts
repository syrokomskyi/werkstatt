/**
 * PBP PIM/Shopify adapter profile.
 *
 * @see pbp-specification-package/compiler — source adapters
 * @see RFC-0443
 */

export interface PbpPimEntityMapping {
  sourceType: string;
  targetSchema: string;
  fieldMappings: Record<string, string>;
  transformationRefs?: string[];
}

export interface PbpPimAdapterProfile {
  adapterType: "shopify" | "pim";
  sourceSystem: string;
  entityMappings: PbpPimEntityMapping[];
}

export interface PbpShopifyAdapterProfile extends PbpPimAdapterProfile {
  adapterType: "shopify";
  shopDomain: string;
  apiVersion: string;
  collectionMappings: Record<string, string>;
}
