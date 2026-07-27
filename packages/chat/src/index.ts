/*
<MODULE_CONTRACT>
<purpose>RFC-0175: server/build-time surface of @gogol/chat. Re-exports the port contract, the
config schema, and the closed adapter catalog. The client loader is imported from "@gogol/chat/client".</purpose>
<non-goals>
  <item>Do not export the client loader here — import "@gogol/chat/client" on the client.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0175: initial implementation.</item>
</CHANGE_SUMMARY>
*/

export type {
  ChatWidgetAdapter,
  ChatAdapterId,
  ChatWidgetLoadResult,
  ChatWidgetOpenResult,
  ChatWidgetConfig,
} from "./port.ts";
export {
  CHAT_ADAPTER_IDS,
  isChatAdapterId,
  ChatWidgetConfigSchema,
  CHAT_CONFIG_SCRIPT_ID,
} from "./port.ts";
export {
  CHAT_ADAPTER_METADATA,
  getChatAdapterMetadata,
  chatAdapterVendorOrigins,
} from "./adapter-metadata.ts";
export type { ChatAdapterMetadata } from "./adapter-metadata.ts";
