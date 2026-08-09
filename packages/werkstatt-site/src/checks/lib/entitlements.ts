import { parse as yamlParse } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>Helper to read resolved entitlement features from the generated entitlements file.</purpose>
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
 * RFC-0167/0169: resolved entitlement features, or null when unknown (fail open).
 */
export async function readEntitledFeatures(appDir: string): Promise<string[] | null> {
  try {
    const raw = await readFile(join(appDir, "src", "entitlements.generated.yaml"), "utf-8");
    const parsed = yamlParse(raw) as { features?: unknown };
    return Array.isArray(parsed.features) ? parsed.features.map(String) : null;
  } catch {
    return null;
  }
}
