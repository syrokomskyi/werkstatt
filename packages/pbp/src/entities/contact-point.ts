/**
 * PBP ContactPoint entity.
 *
 * @see pbp-specification-package/entity-model §9 (ContactPoint)
 * @see RFC-0412
 */

import type { PbpEntity } from "../envelope.js";
import { pbpSchemaId } from "../schema-id.js";

export const CONTACT_POINT_SCHEMA_ID = pbpSchemaId("contact-point");

export type PbpContactChannel = "email" | "phone" | "form" | "chat" | "postal";

export const PBP_CONTACT_CHANNELS: readonly PbpContactChannel[] = [
  "email",
  "phone",
  "form",
  "chat",
  "postal",
] as const;

export function isPbpContactChannel(value: string): value is PbpContactChannel {
  return PBP_CONTACT_CHANNELS.includes(value as PbpContactChannel);
}

export interface PbpContactPoint extends PbpEntity {
  type: "contact-point";
  name: string;
  channel: PbpContactChannel;
  value: string;
  purposes?: Record<string, { valueRef: string }>;
  preferred?: boolean;
  languages?: Record<string, string>;
}
