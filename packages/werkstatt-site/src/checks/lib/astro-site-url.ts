/*
<MODULE_CONTRACT>
<purpose>Best-effort helper to read the canonical site URL from an app's astro.config.mjs.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added Compass scaffolding.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Read canonical site URL from astro.config.mjs.
 * Best-effort regex — no AST parsing needed.
 * Handles JS expressions like `site: process.env.X || "https://example.com"`.
 */
export async function readAstroSiteUrl(appDir: string): Promise<string | undefined> {
  const configPath = join(appDir, "astro.config.mjs");
  try {
    const text = await readFile(configPath, "utf-8");
    const match = text.match(/site:.*?["'](https?:\/\/[^"']+)["']/);
    return match?.[1];
  } catch {
    return undefined;
  }
}
