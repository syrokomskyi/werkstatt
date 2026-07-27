/*
<MODULE_CONTRACT>
<purpose>RFC-0175: the click-to-load loader. Runs in the browser. Reads the chat config from the DOM
and, ONLY when the visitor activates the launcher, dynamically imports the configured adapter and
calls load()+open(). Nothing third-party loads, networks, or touches storage before activation —
this is the mechanism RFC-0177's consent.activation.validate guards.</purpose>
<non-goals>
  <item>Do not inject any vendor script at import/hydration — only inside the activation handler.</item>
  <item>Do not import a vendor SDK here — the HOST injects the adapter-loader map (keeps the
        port package free of any adapter dependency, so there is no workspace cycle).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0175: initial implementation.</item>
  <item>RFC-0175 fix: invert the adapter dependency — the host injects the loader map so
        @gogol/chat does not depend on the adapter packages (removes the build:check cycle).</item>
</CHANGE_SUMMARY>
*/

import { ChatWidgetConfigSchema, CHAT_CONFIG_SCRIPT_ID } from "./port.ts";
import type { ChatWidgetConfig } from "./port.ts";
import type { ChatWidgetAdapter, ChatAdapterId, ChatWidgetLoadResult } from "./port.ts";

/** The global window key where the active adapter is cached after first load. */
const CHAT_ADAPTER_KEY = "__webgogol_chat_adapter__";

/**
 * Host-supplied adapter loader map: adapter id → a thunk that dynamically imports
 * the adapter package and returns its default export. The HOST (e.g. the chat-widget
 * section client in @gogol/ui) owns this map with STATIC `import()` specifiers so the
 * bundler code-splits each adapter into a resolvable async chunk. Keeping it here (in
 * the host, not the port) avoids @gogol/chat depending on the adapter packages — which
 * would form a workspace cycle (adapters already depend on @gogol/chat).
 */
export type ChatAdapterLoaders = Record<
  ChatAdapterId,
  () => Promise<{ default: ChatWidgetAdapter }>
>;

// @ai-invariant: bindChatLauncher is the consent gate (RFC-0177). Nothing
// third-party loads, networks, or touches storage before user activation.
// The adapter is dynamically imported only on first click — never at
// import/hydration time. Subsequent clicks call open() only.

/**
 * Wire a first-party launcher element to click-to-load behaviour.
 *
 * On the FIRST activation: parse the config, dynamically import the configured
 * adapter via `loaders`, `await load()`, then `open()`. On every later activation:
 * `open()` only. Until the visitor clicks, no vendor script/network/storage exists.
 *
 * @param launcher the first-party button rendered by the chat-widget section.
 * @param loaders  host-supplied adapter id → import() map (static specifiers).
 */
export function bindChatLauncher(launcher: HTMLElement, loaders: ChatAdapterLoaders): void {
  let loading: Promise<ChatWidgetAdapter | null> | null = null;

  const activate = async (): Promise<void> => {
    if (!loading) {
      const config = _readConfig();
      if (!config) {
        console.warn("[chat] config not found or invalid — launcher inactive.");
        return;
      }
      loading = _loadAndInit(config, loaders);
    }
    const adapter = await loading;
    if (adapter) {
      const result = adapter.open();
      if (result === "not-ready") {
        console.warn("[chat] widget not ready — script may still be loading.");
      } else if (result === "no-global") {
        console.warn("[chat] widget loaded but vendor global not found — API may have changed.");
      }
    }
  };

  launcher.addEventListener("click", () => {
    void activate();
  });
}

async function _loadAndInit(
  config: ChatWidgetConfig,
  loaders: ChatAdapterLoaders,
): Promise<ChatWidgetAdapter | null> {
  const adapter = await _loadAdapter(config.adapter, loaders);
  if (!adapter) {
    console.warn(`[chat] adapter "${config.adapter}" could not be loaded — chat inactive.`);
    return null;
  }
  try {
    const result: ChatWidgetLoadResult = await adapter.load(config);
    if (result === "error") {
      console.warn("[chat] adapter.load() reported error — chat inactive.");
      return null;
    }
  } catch (err) {
    console.warn("[chat] adapter.load() threw:", err);
    return null;
  }
  (window as unknown as Record<string, unknown>)[CHAT_ADAPTER_KEY] = adapter;
  return adapter;
}

function _readConfig(): ChatWidgetConfig | null {
  const el = document.getElementById(CHAT_CONFIG_SCRIPT_ID);
  if (!el) return null;
  try {
    const raw = JSON.parse(el.textContent ?? "{}");
    return ChatWidgetConfigSchema.parse(raw);
  } catch (err) {
    console.warn("[chat] Failed to parse ChatWidgetConfig:", err);
    return null;
  }
}

/**
 * Resolve the adapter by id from the host-supplied loader map (enum-dispatch).
 * Unknown ids warn and return null (the launcher then no-ops). The vendor module —
 * and therefore its script/origin — is reached ONLY here, after activation.
 */
async function _loadAdapter(
  adapterId: ChatAdapterId,
  loaders: ChatAdapterLoaders,
): Promise<ChatWidgetAdapter | null> {
  const loader = loaders[adapterId];
  if (!loader) {
    console.warn(
      `[chat] Unknown adapter id "${adapterId}". Add it to the host's adapter loader map.`,
    );
    return null;
  }

  try {
    const mod = await loader();
    return mod.default;
  } catch (err) {
    console.warn(`[chat] Failed to import adapter "${adapterId}":`, err);
    return null;
  }
}
