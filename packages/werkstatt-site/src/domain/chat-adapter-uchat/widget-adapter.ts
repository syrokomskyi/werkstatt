/*
<MODULE_CONTRACT>
<purpose>RFC-0175: UChat browser-side ChatWidgetAdapter. Injects the UChat web-widget script
ONLY when load() is called (i.e. after the visitor activates the launcher — click-to-load). This is
the ONLY module in the workspace where the UChat origin/script appears, so the pre-activation
guarantee (RFC-0177 consent.activation.validate) holds: nothing UChat loads in server output.</purpose>
<non-goals>
  <item>Do not load anything at import time — only inside load().</item>
  <item>Do not read secrets — the widget id is a public client token.</item>
  <item>Do not import server-side modules — this is browser-only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0175: initial implementation.</item>
  <item>Architecture review: split from index.ts into widget-adapter.ts (browser) + barrel.</item>
  <item>Architecture review: load() returns ChatWidgetLoadResult, open() returns ChatWidgetOpenResult.</item>
</CHANGE_SUMMARY>
*/

import type {
  ChatWidgetAdapter,
  ChatWidgetConfig,
  ChatWidgetLoadResult,
  ChatWidgetOpenResult,
} from "@warpgogol/werkstatt-site/chat/port";

/** UChat exposes a global once its popup widget script has booted. */
interface UChatWindow extends Window {
  // UChat popup.js loads sdk.js asynchronously, which sets window.chatbotSDK.
  chatbotSDK?: { open?: () => void; toggle?: () => void; show?: () => void };
  // Legacy globals (kept for backward compatibility).
  uchat?: { open?: () => void; toggle?: () => void };
  UChatWidget?: { open?: () => void };
}

const UCHAT_SCRIPT_ID = "uchat-widget-script";

/** Public origins the UChat adapter loads from (for consent.activation.validate). */
const UCHAT_VENDOR_ORIGINS = ["uchat.com.au", "sdk.dfktv2.com"] as const;

/**
 * Resolve the widget script URL from public options.
 *
 * Required option: `widgetId` (the public UChat web-widget id).
 * Optional override: `scriptUrl` (full URL) for non-default UChat deployments.
 * Default embed (provided by UChat): the popup widget loader
 *   https://www.uchat.com.au/js/widget/<widgetId>/popup.js
 */
function resolveScriptUrl(options: Record<string, string>): string | null {
  if (options.scriptUrl) return options.scriptUrl;
  const widgetId = options.widgetId;
  if (!widgetId) return null;
  return `https://www.uchat.com.au/js/widget/${encodeURIComponent(widgetId)}/popup.js`;
}

/**
 * Poll for window.chatbotSDK to appear (UChat popup.js loads sdk.js asynchronously).
 * Resolves after the SDK is available or after timeoutMs, whichever comes first.
 */
function waitForChatbotSDK(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve();
    const w = window as UChatWindow;
    if (w.chatbotSDK) return resolve();
    const start = Date.now();
    const interval = setInterval(() => {
      if (w.chatbotSDK || Date.now() - start >= timeoutMs) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}

let _injected = false;

const UChatWidgetAdapter: ChatWidgetAdapter = {
  id: "uchat",
  requiredOptions: [["widgetId", "scriptUrl"]],
  vendorOrigins: UCHAT_VENDOR_ORIGINS,

  async load(config: ChatWidgetConfig): Promise<ChatWidgetLoadResult> {
    if (_injected) return "cached";
    if (typeof window === "undefined" || typeof document === "undefined") return "error";

    const url = resolveScriptUrl(config.options);
    if (!url) {
      console.warn("[chat:uchat] missing required public option: widgetId");
      return "error";
    }
    if (document.getElementById(UCHAT_SCRIPT_ID)) {
      _injected = true;
      return "cached";
    }

    const ok = await new Promise<boolean>((resolve) => {
      const script = document.createElement("script");
      script.id = UCHAT_SCRIPT_ID;
      script.async = true;
      script.src = url;
      script.addEventListener("load", () => resolve(true), { once: true });
      script.addEventListener(
        "error",
        () => {
          console.warn("[chat:uchat] widget script failed to load");
          resolve(false);
        },
        { once: true },
      );
      document.body.appendChild(script);
    });
    if (!ok) return "error";
    _injected = true;
    // UChat popup.js loads sdk.js asynchronously which sets window.chatbotSDK.
    // Wait briefly for the SDK to appear so open() can use it on first click.
    await waitForChatbotSDK(3000);
    return "ready";
  },

  open(): ChatWidgetOpenResult {
    if (typeof window === "undefined") return "no-global";
    if (!_injected) return "not-ready";
    const w = window as UChatWindow;
    const sdk = w.chatbotSDK;
    const opener = sdk?.open ?? sdk?.toggle ?? sdk?.show;
    if (opener) {
      opener.call(sdk);
      return "opened";
    }
    // Legacy globals (backward compatibility)
    const legacyOpener = w.uchat?.open ?? w.uchat?.toggle ?? w.UChatWidget?.open;
    if (legacyOpener) {
      legacyOpener.call(w.uchat ?? w.UChatWidget);
      return "opened";
    }
    // SDK not yet ready — popup.js auto-mounts a launcher bubble the visitor can click.
    return "no-global";
  },
};

export default UChatWidgetAdapter;
