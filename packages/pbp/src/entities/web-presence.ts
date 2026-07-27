/**
 * PBP WebPresence entity.
 *
 * @see pbp-specification-package/entity-model §10 (WebPresence)
 * @see RFC-0413
 */

import type { PbpEntity } from "../envelope.js";
import type { PbpEntityRef } from "../entity-ref.js";
import { pbpSchemaId } from "../schema-id.js";

export const WEB_PRESENCE_SCHEMA_ID = pbpSchemaId("web-presence");

export type PbpWebPresenceKind = "primary-website" | "landing-page" | "social-profile";

export const PBP_WEB_PRESENCE_KINDS: readonly PbpWebPresenceKind[] = [
  "primary-website",
  "landing-page",
  "social-profile",
] as const;

export function isPbpWebPresenceKind(value: string): value is PbpWebPresenceKind {
  return PBP_WEB_PRESENCE_KINDS.includes(value as PbpWebPresenceKind);
}

export type PbpWebControlStatus = "business-controlled" | "third-party" | "verified-mirror";

export const PBP_WEB_CONTROL_STATUSES: readonly PbpWebControlStatus[] = [
  "business-controlled",
  "third-party",
  "verified-mirror",
] as const;

export function isPbpWebControlStatus(value: string): value is PbpWebControlStatus {
  return PBP_WEB_CONTROL_STATUSES.includes(value as PbpWebControlStatus);
}

export interface PbpWebPresence extends PbpEntity {
  type: "web-presence";
  name: string;
  kind: PbpWebPresenceKind;
  canonicalUrl: string;
  businessRef: PbpEntityRef;
  locales?: Record<string, string>;
  control: PbpWebControlStatus;
  sameAs?: string[];
}
