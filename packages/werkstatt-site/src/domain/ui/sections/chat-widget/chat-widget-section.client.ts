/*
<MODULE_CONTRACT>
<purpose>RFC-0175: colocated client behavior for the chat-widget section. Wires the first-party
launcher to the click-to-load loader (@warpgogol/werkstatt-site/chat/client). Nothing third-party loads until the
visitor clicks — the loader injects the vendor script on first activation only.</purpose>
<non-goals>
  <item>Do not inject a vendor script here — adapters are dynamically imported on activation.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0175: initial implementation.</item>
  <item>RFC-0175 fix: own the adapter loader map here (the host) so @warpgogol/werkstatt-site/chat has no adapter
        dependency — removes the build:check workspace cycle.</item>
</CHANGE_SUMMARY>
*/

import { bindChatLauncher, type ChatAdapterLoaders } from "@warpgogol/werkstatt-site/chat/client";

// The host owns the closed adapter loader map with STATIC import() specifiers so the
// bundler code-splits each adapter into a resolvable async chunk. Keep in sync with
// CHAT_ADAPTER_IDS (@warpgogol/werkstatt-site/chat). Nothing third-party loads until a loader is invoked
// on user activation (click-to-load).
const ADAPTER_LOADERS: ChatAdapterLoaders = {
  null: () => import("@warpgogol/werkstatt-site/chat-adapter-null"),
  uchat: () => import("@warpgogol/werkstatt-site/chat-adapter-uchat"),
};

function init(): void {
  const launchers = document.querySelectorAll<HTMLElement>("[data-chat-launcher]");
  for (const launcher of launchers) {
    bindChatLauncher(launcher, ADAPTER_LOADERS);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
}
