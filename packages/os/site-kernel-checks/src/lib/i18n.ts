/*
<MODULE_CONTRACT>
<purpose>
  Shared i18n helpers for Site OS validators. Reads an app's default language
  from `src/content/system.md` / loaded system manifests without platform-level
  language fallbacks.
</purpose>
<non-goals>
  <item>Do not infer language from repository conventions or app ids.</item>
  <item>Do not validate the full i18n manifest shape.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Remove hardcoded validator language fallbacks by centralizing explicit i18n.default lookup.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";

export async function readDefaultLanguageCode(contentRoot: string): Promise<string> {
  const systemPath = join(contentRoot, "system.md");
  const raw = await readFile(systemPath, "utf-8");
  const { data } = parseMarkdownFrontmatter(raw);
  const i18n = (data as Record<string, unknown>).i18n as { default?: unknown } | undefined;
  if (typeof i18n?.default === "string" && i18n.default.trim() !== "") {
    return i18n.default.trim();
  }
  throw new Error("[i18n] src/content/system.md must declare i18n.default.");
}

export function defaultLanguageFromManifest(manifest: { i18n?: unknown }): string {
  const i18n = manifest.i18n as { default?: unknown } | undefined;
  const defaultLanguage = i18n?.default;
  if (typeof defaultLanguage === "string" && defaultLanguage.trim() !== "") {
    return defaultLanguage.trim();
  }
  throw new Error("[i18n] system manifest must declare i18n.default.");
}
