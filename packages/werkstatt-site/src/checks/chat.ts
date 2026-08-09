/*
<MODULE_CONTRACT>
<purpose>RFC-0175: governance for the chat widget configuration surface in system.md.
chat.config.validate guards that a configured `integrations.chat.adapter` resolves to the closed
chat adapter catalog (@warpgogol/werkstatt-site/chat) and that the adapter's required public options are present
(e.g. uchat needs widgetId or scriptUrl). No-op pass when the app declares no chat block.</purpose>
<non-goals>
  <item>Do not import a chat vendor SDK — read disk only (Node-safe).</item>
  <item>Do not treat options as secrets — they are public values.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0175: initial implementation.</item>
  <item>Architecture review: replaced hardcoded REQUIRED_OPTIONS map with getChatAdapterMetadata from @warpgogol/werkstatt-site/chat.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { CHAT_ADAPTER_IDS, isChatAdapterId, getChatAdapterMetadata } from "@warpgogol/werkstatt-site/chat";
import { passResult, resultFromViolations } from "./result-helpers.ts";

interface ChatConfig {
  adapter?: string;
  options?: Record<string, string>;
}

async function loadChat(appDir: string): Promise<ChatConfig | null> {
  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const integrations = (
    manifest as unknown as {
      integrations?: { chat?: ChatConfig };
    }
  ).integrations;
  return integrations?.chat ?? null;
}

export async function runChatConfigValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const chat = await loadChat(appDir);
  if (!chat) {
    return passResult(
      "chat.config.validate",
      "chat.config.validate: skipped (no integrations.chat block)",
    );
  }

  const violations: string[] = [];
  if (!chat.adapter) {
    violations.push("[missing-chat-adapter] integrations.chat has no adapter id");
  } else if (!isChatAdapterId(chat.adapter)) {
    violations.push(
      `[unknown-chat-adapter] "${chat.adapter}" is not a known chat adapter ` +
        `(catalog: ${CHAT_ADAPTER_IDS.join(", ")})`,
    );
  } else {
    const required = getChatAdapterMetadata(chat.adapter).requiredOptions ?? [];
    const options = chat.options ?? {};
    for (const alternatives of required) {
      if (
        !alternatives.some((key) => typeof options[key] === "string" && options[key].length > 0)
      ) {
        violations.push(
          `[missing-required-option] adapter "${chat.adapter}" requires one of: ` +
            `${alternatives.join(" | ")}`,
        );
      }
    }
  }

  return violations.length === 0
    ? passResult("chat.config.validate", `chat.config.validate: OK — adapter "${chat.adapter}"`)
    : resultFromViolations("chat.config.validate", violations);
}
