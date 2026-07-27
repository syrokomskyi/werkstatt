/*
<MODULE_CONTRACT>
<purpose>RFC-0354: Shared registry IO helpers for reading and writing systems/registry.yaml.</purpose>
<non-goals>
  <item>Do not implement command logic — that lives in the individual command files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0354: initial registry IO helpers.</item>
</CHANGE_SUMMARY>
*/

import { readFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  fleetRegistrySchema,
  type FleetRegistry,
  type FleetRegistryEntry,
} from "@gogol/ontology/operations";
import { atomicWriteFile } from "../werkstatt/atomic.ts";

const REGISTRY_PATH = path.join("systems", "registry.yaml");

export function resolveRegistryPath(workspaceRoot: string): string {
  return path.join(workspaceRoot, REGISTRY_PATH);
}

export async function readRegistry(workspaceRoot: string): Promise<FleetRegistry> {
  const filePath = resolveRegistryPath(workspaceRoot);
  const raw = await readFile(filePath, "utf8");
  const parsed = parseYaml(raw);
  return fleetRegistrySchema.parse(parsed);
}

export async function writeRegistry(workspaceRoot: string, registry: FleetRegistry): Promise<void> {
  const filePath = resolveRegistryPath(workspaceRoot);
  await mkdir(path.dirname(filePath), { recursive: true });
  const yaml = stringifyYaml(registry);
  await atomicWriteFile(filePath, yaml + "\n");
}

export async function registryExists(workspaceRoot: string): Promise<boolean> {
  try {
    await readFile(resolveRegistryPath(workspaceRoot), "utf8");
    return true;
  } catch {
    return false;
  }
}

export function findEntry(registry: FleetRegistry, id: string): FleetRegistryEntry | undefined {
  return registry.systems.find((s) => s.id === id);
}

export function findEntryByStar(
  registry: FleetRegistry,
  cosmicStar: string,
  excludeStatus?: FleetRegistryEntry["status"],
): FleetRegistryEntry | undefined {
  return registry.systems.find(
    (s) => s.cosmicStar === cosmicStar && (!excludeStatus || s.status !== excludeStatus),
  );
}

export function hasAppsCollision(workspaceRoot: string, id: string): boolean {
  const appsDir = path.join(workspaceRoot, "apps", id);
  return existsSync(appsDir);
}
