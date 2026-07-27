/*
<MODULE_CONTRACT>
<purpose>RFC-0175: build-time metadata catalog for chat adapters. Consolidates requiredOptions and
vendorOrigins per adapter id so validators (chat.config.validate, consent.activation.validate) read
from one source instead of scattered hardcoded maps. The adapter packages' own ChatWidgetAdapter
implementations declare the same values at runtime — this is the build-time validation twin.</purpose>
<non-goals>
  <item>Do not import adapter packages here — this is metadata only, Node-safe.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review: extracted from hardcoded maps in site-kernel-checks/chat.ts and consent.ts.</item>
</CHANGE_SUMMARY>
*/

import { CHAT_ADAPTER_IDS, type ChatAdapterId } from "./port.ts";

/** Build-time metadata for one chat adapter. */
export interface ChatAdapterMetadata {
  /** Groups of alternative option keys; at least one in each group must be present. */
  readonly requiredOptions?: readonly (readonly string[])[];
  /** Public origins this adapter loads from (for consent.activation.validate). */
  readonly vendorOrigins?: readonly string[];
}

/** Closed metadata catalog keyed by adapter id (RFC-0175). */
export const CHAT_ADAPTER_METADATA: Readonly<Record<ChatAdapterId, ChatAdapterMetadata>> = {
  null: {},
  uchat: {
    requiredOptions: [["widgetId", "scriptUrl"]],
    vendorOrigins: ["uchat.com.au"],
  },
};

/** Look up metadata for an adapter id (returns empty record for unknown ids). */
export function getChatAdapterMetadata(id: string): ChatAdapterMetadata {
  return (CHAT_ADAPTER_METADATA as Readonly<Record<string, ChatAdapterMetadata>>)[id] ?? {};
}

/** All known vendor origins across active adapters (for consent.activation.validate). */
export function chatAdapterVendorOrigins(id: string): readonly string[] {
  if (!CHAT_ADAPTER_IDS.includes(id as ChatAdapterId)) return [];
  return getChatAdapterMetadata(id).vendorOrigins ?? [];
}
