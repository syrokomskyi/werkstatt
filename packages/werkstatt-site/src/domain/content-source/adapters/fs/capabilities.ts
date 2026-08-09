/*
<MODULE_CONTRACT>
<purpose>Maintains packages/content-source/src/adapters/fs/capabilities.ts as an authored content-source authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0141: filesystem adapter capabilities.</item>
</CHANGE_SUMMARY>
*/

import type { ContentSourceCapabilities } from "../../types.ts";

/** The filesystem adapter: local build-time images, no remote/live/rich-text. */
export const FS_CAPABILITIES: ContentSourceCapabilities = {
  localAssets: true,
  remoteAssets: false,
  liveFetch: false,
  richText: false,
};
