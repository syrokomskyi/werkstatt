/*
<MODULE_CONTRACT>
<purpose>RFC-0175: the null ChatWidgetAdapter. A no-op binding ("no chat") that loads nothing
third-party. The safe default for CI/dev and unentitled sites.</purpose>
<non-goals>
  <item>Do not inject any script, network, or storage.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0175: initial implementation.</item>
  <item>Architecture review: load() returns ChatWidgetLoadResult, open() returns ChatWidgetOpenResult.</item>
</CHANGE_SUMMARY>
*/

import type { ChatWidgetAdapter } from "@warpgogol/werkstatt-site/chat/port";
import type { ChatWidgetLoadResult, ChatWidgetOpenResult } from "@warpgogol/werkstatt-site/chat/port";

const NullChatAdapter: ChatWidgetAdapter = {
  id: "null",
  async load(): Promise<ChatWidgetLoadResult> {
    // Intentionally does nothing — "no chat configured".
    return "ready";
  },
  open(): ChatWidgetOpenResult {
    // No panel to open.
    return "opened";
  },
};

export default NullChatAdapter;
