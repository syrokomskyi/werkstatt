/*
<MODULE_CONTRACT>
<purpose>Load and validate the Cloudflare zone map from zones.yaml (RFC-0343).</purpose>
<non-goals>
  <item>Do not query Cloudflare or push metrics from zone-map loading.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extract zone-map loading from loop.ts into a dedicated module with schema validation.</item>
</CHANGE_SUMMARY>
*/

export interface ZoneEntry {
  siteId: string;
  zoneId: string;
  workerScripts: string[];
}

function validateZoneEntry(raw: unknown, index: number): ZoneEntry {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`[zone-map] entry ${index} is not an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.siteId !== "string" || !obj.siteId) {
    throw new Error(`[zone-map] entry ${index} missing required string field "siteId"`);
  }
  if (typeof obj.zoneId !== "string" || !obj.zoneId) {
    throw new Error(`[zone-map] entry ${index} missing required string field "zoneId"`);
  }
  if (!Array.isArray(obj.workerScripts) || obj.workerScripts.some((s) => typeof s !== "string")) {
    throw new Error(`[zone-map] entry ${index} field "workerScripts" must be a string array`);
  }
  return {
    siteId: obj.siteId,
    zoneId: obj.zoneId,
    workerScripts: obj.workerScripts as string[],
  };
}

export async function loadZoneMap(filePath?: string): Promise<ZoneEntry[]> {
  const path = await import("node:path");
  const fs = await import("node:fs/promises");
  const yaml = await import("yaml");
  const zonesPath = filePath ?? path.join(process.cwd(), "zones.yaml");
  const text = await fs.readFile(zonesPath, "utf-8");
  const parsed = yaml.parse(text);
  if (!Array.isArray(parsed)) {
    throw new Error("[zone-map] zones.yaml must contain a top-level array");
  }
  return parsed.map(validateZoneEntry);
}
