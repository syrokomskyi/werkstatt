/**
 * PBP Exit Policy specialized schema.
 *
 * @see pbp-specification-package/entity-model §23.2 (Portability / Exit)
 * @see RFC-0450
 */

import type { PbpPolicy } from "./policy.js";

export interface PbpExitPackage {
  domain?: { included: boolean };
  customerContent?: { included: boolean };
  builtWebsite?: { included: boolean };
}

export interface PbpExitPolicy extends PbpPolicy {
  kind: "exit";
  trigger: { event: string };
  deliveryTarget: { duration: string };
  package: PbpExitPackage;
  formats?: {
    deployableFiles?: { valueRef: string };
  };
}
