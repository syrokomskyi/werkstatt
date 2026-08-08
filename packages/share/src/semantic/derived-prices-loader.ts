/*
<MODULE_CONTRACT>
<purpose>Node-only loader for derived-prices.generated.json (RFC-0767). Reads the file from process.cwd()/src/derived-prices.generated.json and returns null on ENOENT. NOT exported from the semantic barrel — uses node:fs and would pollute client bundles.</purpose>
<non-goals>
  <item>Does not parse or validate the JSON shape — just reads and JSON.parse.</item>
  <item>Does not cache — callers are responsible for calling once and passing the result.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0767: relocated loadDerivedPrices from packages/ui to packages/share to break circular dependency. Node-only subpath export.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DerivedPriceEntry } from "./price-marker-resolver.ts";

export function loadDerivedPrices(
  cwd: string = process.cwd(),
): Record<string, DerivedPriceEntry[]> | null {
  const filePath = join(cwd, "src", "derived-prices.generated.json");
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf-8");
  } catch (err: unknown) {
    if (err instanceof Error && (err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return JSON.parse(raw) as Record<string, DerivedPriceEntry[]>;
}
