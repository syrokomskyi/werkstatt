/*
<MODULE_CONTRACT>
<purpose>
Re-export the derived planetImportPaths, blockTypeToCosmicName, moonImportPaths,
and roleByCosmicName maps from the canonical archetype registry index.json
(RFC-0091). Validates the JSON shape at import time so registry drift fails
fast instead of producing silently empty maps.
</purpose>
<non-goals>
  <item>Do not own the build logic that produces index.json.</item>
  <item>Do not re-derive or transform the maps.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0091: Initial creation — typed re-export of derived archetype registry maps.</item>
  <item>RFC-0263: also re-export roleByCosmicName (manifest-authored role, derived) — replaces name-keyed dispatch literals in packages/share.</item>
  <item>Architecture review 2026-07-10: validate index.json with Zod instead of unchecked cast — fail-fast on registry shape drift.</item>
</CHANGE_SUMMARY>
*/

import { z } from "zod";
import indexJson from "../archetypes/index.json" with { type: "json" };

const recordStringString = z.record(z.string(), z.string());

const archetypeRegistryIndexSchema = z.object({
  schemaVersion: z.string().min(1),
  totalCount: z.number().int().nonnegative(),
  entries: z.array(
    z.object({
      id: z.string().min(1),
      displayName: z.string().min(1),
      semanticRole: z.string().min(1),
      version: z.string().min(1),
      layoutHint: z.string().min(1),
      acceptedCosmicNames: z.array(z.string().min(1)),
      sourceFile: z.string().min(1),
      layer: z.enum(["section", "component"]),
    }),
  ),
  sectionRoles: z.array(z.string().min(1)),
  componentRoles: z.array(z.string().min(1)),
  planetImportPaths: recordStringString,
  blockTypeToCosmicName: recordStringString,
  moonImportPaths: recordStringString.optional().default({}),
  roleByCosmicName: recordStringString.optional().default({}),
});

const _parsed = archetypeRegistryIndexSchema.safeParse(indexJson);
if (!_parsed.success) {
  const issues = _parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(
    `archetype-registry: archetypes/index.yaml failed validation — ${issues}. Regenerate with the archetype registry build command.`,
  );
}
const registry = _parsed.data;

export const planetImportPaths: Record<string, string> = registry.planetImportPaths;
export const blockTypeToCosmicName: Record<string, string> = registry.blockTypeToCosmicName;
export const moonImportPaths: Record<string, string> = registry.moonImportPaths;
export const roleByCosmicName: Record<string, string> = registry.roleByCosmicName;
