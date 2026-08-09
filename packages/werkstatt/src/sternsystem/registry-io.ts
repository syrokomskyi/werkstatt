/*
<MODULE_CONTRACT>
<purpose>RFC-0354: Shared registry IO helpers for reading and writing systems/registry.yaml. RFC-0574: mirror path resolution helpers. RFC-0751: findServiceEntry helper.</purpose>
<non-goals>
  <item>Do not implement command logic — that lives in the individual command files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0354: initial registry IO helpers.</item>
  <item>RFC-0574: add resolveMirrors() and resolveCachePath() for parameterized mirror topology.</item>
  <item>RFC-0751: add findServiceEntry() helper for service registry lookups.</item>
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
  type MirrorEntry,
  type ServiceEntry,
} from "@warpgogol/werkstatt/schemas";
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

export function findServiceEntry(registry: FleetRegistry, id: string): ServiceEntry | undefined {
  return registry.services?.find((s) => s.id === id);
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

// --- RFC-0574: Mirror path resolution ---

export type MirrorProtocol = "file" | "ssh" | "https" | "ftp" | "s3" | "rsync";

const GIT_PROTOCOLS: MirrorProtocol[] = ["file", "ssh", "https"];

export function inferMirrorProtocol(mirrorPath: string): MirrorProtocol {
  if (mirrorPath.startsWith("git@") || mirrorPath.startsWith("ssh://")) return "ssh";
  if (mirrorPath.startsWith("https://") || mirrorPath.startsWith("http://")) return "https";
  if (mirrorPath.startsWith("ftp://") || mirrorPath.startsWith("sftp://")) return "ftp";
  if (mirrorPath.startsWith("s3://")) return "s3";
  if (mirrorPath.startsWith("rsync://")) return "rsync";
  return "file";
}

export function isGitAccessible(mirrorPath: string): boolean {
  return GIT_PROTOCOLS.includes(inferMirrorProtocol(mirrorPath));
}

export function resolveMirrorPath(workspaceRoot: string, mirrorPath: string): string {
  if (mirrorPath.startsWith("file://")) {
    return path.resolve(workspaceRoot, mirrorPath.slice("file://".length));
  }
  if (mirrorPath.startsWith("./") || mirrorPath.startsWith("../") || mirrorPath.startsWith("/")) {
    return path.resolve(workspaceRoot, mirrorPath);
  }
  return mirrorPath;
}

export interface MirrorResolution {
  cachePath: string;
  gitMirrors: MirrorEntry[];
  backupMirrors: MirrorEntry[];
}

export function resolveMirrors(workspaceRoot: string, entry: FleetRegistryEntry): MirrorResolution {
  const cacheMirror = entry.mirrors[0];
  const cachePath = resolveMirrorPath(workspaceRoot, cacheMirror.path);
  const gitMirrors: MirrorEntry[] = [];
  const backupMirrors: MirrorEntry[] = [];

  for (let i = 1; i < entry.mirrors.length; i++) {
    const m = entry.mirrors[i];
    if (m.storageType === "bundle") {
      backupMirrors.push(m);
    } else if (isGitAccessible(m.path)) {
      gitMirrors.push(m);
    }
  }

  return { cachePath, gitMirrors, backupMirrors };
}

export async function resolveCachePath(workspaceRoot: string, systemId: string): Promise<string> {
  const registry = await readRegistry(workspaceRoot);
  const entry = findEntry(registry, systemId);
  if (!entry) {
    throw new Error(`[resolveCachePath] system '${systemId}' not found in registry`);
  }
  return resolveMirrors(workspaceRoot, entry).cachePath;
}
