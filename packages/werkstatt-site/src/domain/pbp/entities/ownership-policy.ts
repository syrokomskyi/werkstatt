/**
 * PBP Ownership Policy specialized schema.
 *
 * @see pbp-specification-package/entity-model §23.1 (Ownership)
 * @see RFC-0449
 */

import type { PbpPolicy } from "./policy.js";

export type PbpAssetHolder = "customer" | "third-party" | "provider";

export const PBP_ASSET_HOLDERS: readonly PbpAssetHolder[] = [
  "customer",
  "third-party",
  "provider",
] as const;

export function isPbpAssetHolder(value: string): value is PbpAssetHolder {
  return PBP_ASSET_HOLDERS.includes(value as PbpAssetHolder);
}

export interface PbpOwnershipAsset {
  holder: PbpAssetHolder;
  timing?: string;
  usageBasis?: string;
}

export interface PbpOwnershipPolicy extends PbpPolicy {
  kind: "ownership";
  assets: {
    domain?: PbpOwnershipAsset;
    customerContent?: PbpOwnershipAsset;
    builtWebsite?: PbpOwnershipAsset;
    sourceCode?: PbpOwnershipAsset;
    thirdPartyComponents?: PbpOwnershipAsset;
  };
}
