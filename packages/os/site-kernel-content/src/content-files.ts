/*
<MODULE_CONTRACT>
<purpose>Facilitates the discovery of Markdown files within directory structures while respecting naming conventions.</purpose>
<non-goals>
  <item>Do not parse the content of Markdown files.</item>
  <item>Do not manage file system permissions or configurations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: refactored to a thin wrapper over the canonical @warpgogol/share/fs collectFiles walker.</item>
</CHANGE_SUMMARY>
*/

import { collectFiles } from "@warpgogol/share/fs";

/**
 * Recursively collects Markdown (.md) file paths under `directoryPath`,
 * skipping entries named `old-*` or `-*`.
 */
export async function collectMarkdownFiles(directoryPath: string): Promise<string[]> {
  return collectFiles(directoryPath, { extensions: [".md"] });
}
