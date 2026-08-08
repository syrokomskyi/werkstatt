/*
<MODULE_CONTRACT>
<purpose>RFC-0356 §7: sternsystem.extract — extract an apps/<app>/ site into a Sternsystem git repo.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0356: initial sternsystem.extract command handler.</item>
  <item>RFC-0381: schema-compliant pin generation using shared pin-helpers; case-insensitive RFC regex; resolve ecosystem metadata.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { systemPinSchema, type SystemPin } from "@warpgogol/ontology/operations";
import {
  readRegistry,
  writeRegistry,
  findEntry,
  resolveMirrors,
} from "../sternsystem/registry-io.ts";
import { acquireLock, releaseLock, generateOperationId } from "../werkstatt/index.ts";
import { atomicWriteFile } from "../werkstatt/atomic.ts";
import { appendAndCommitBordbuch } from "../bordbuch/bordbuch-commit-helper.ts";
import { resolveCurrentEcosystem, resolvePlatformSemanticHash } from "../bundle-io.ts";
import { allMigratorIds } from "../migrators/registry.ts";
import { highestRfcId, snapshotCapabilities } from "./pin-helpers.ts";

export interface SternsystemExtractData {
  appId: string;
  systemId: string;
  mirrors: Array<{ path: string; storageType: string }>;
  extractedAt: string;
  pinVersion: string;
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

const EXTRACTION_DATA_PATHS = ["src/content", "public", "provenance"];

async function copyDir(src: string, dest: string): Promise<void> {
  if (!existsSync(src)) return;
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export async function runSternsystemExtract(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SternsystemExtractData>> {
  const { workspaceRoot, logger } = context;
  const siteId = flagString(input, "site");
  const mirrorsFlag = flagString(input, "mirrors");

  if (!siteId) throw new Error("[sternsystem.extract] --site is required");

  const appDir = path.join(workspaceRoot, "apps", siteId);
  if (!existsSync(appDir)) {
    throw new Error(`[sternsystem.extract] apps/${siteId}/ does not exist`);
  }

  const mirrors = mirrorsFlag
    ? mirrorsFlag.split(",").map((entry) => {
        const [pathPart, typePart] = entry.split(":");
        return { path: pathPart, storageType: typePart || "non-bare" };
      })
    : [
        { path: `../systems-cache/${siteId}`, storageType: "non-bare" },
        { path: `../systems-git/${siteId}`, storageType: "bare" },
      ];

  const operationId = generateOperationId();
  await acquireLock(workspaceRoot, "registry", operationId, "sternsystem.extract", "agent");
  await acquireLock(workspaceRoot, `system:${siteId}`, operationId, "sternsystem.extract", "agent");

  try {
    const registry = await readRegistry(workspaceRoot);
    const regEntry = findEntry(registry, siteId);
    const systemDir = regEntry
      ? resolveMirrors(workspaceRoot, regEntry).cachePath
      : path.resolve(workspaceRoot, mirrors[0].path);
    await fs.mkdir(systemDir, { recursive: true });

    // Copy data paths
    for (const dataPath of EXTRACTION_DATA_PATHS) {
      const src = path.join(appDir, dataPath);
      const dest = path.join(systemDir, dataPath);
      if (existsSync(src)) {
        await copyDir(src, dest);
        logger.info(`  Copied ${dataPath}`);
      }
    }

    // Write pin file (schema-compliant per systemPinSchema)
    const { version: pinVersion, commit } = await resolveCurrentEcosystem(workspaceRoot);
    const rfcHead = await highestRfcId(workspaceRoot);
    const platformSemanticHash = await resolvePlatformSemanticHash(workspaceRoot);
    const capabilities = await snapshotCapabilities(workspaceRoot);
    const pin: SystemPin = {
      schemaVersion: "1.0.0",
      systemId: siteId,
      cosmicStar: regEntry?.cosmicStar ?? "Vega",
      pinnedAt: new Date().toISOString(),
      platform: {
        version: pinVersion,
        commit: commit === "unknown" ? "0000000" : commit,
        rfcHead,
        platformSemanticHash,
      },
      migratorCursor: allMigratorIds(),
      capabilities,
    };
    systemPinSchema.parse(pin);
    await atomicWriteFile(
      path.join(systemDir, "system.pin.json"),
      JSON.stringify(pin, null, 2) + "\n",
    );

    // Write initial Bordbuch (RFC-0750: commit atomically)
    await appendAndCommitBordbuch(
      workspaceRoot,
      siteId,
      "pin-update",
      `Initial pin at ${pinVersion}`,
      "agent",
      {
        writerRole: "sternsystem",
        metadata: { oldVersion: null, newVersion: pinVersion },
      },
      `Bordbuch: pin-update ${siteId}`,
    );

    // Update registry
    if (regEntry) {
      regEntry.status = "active";
      regEntry.pinnedPlatform = pinVersion;
      regEntry.mirrors = mirrors as Array<{
        path: string;
        storageType: "non-bare" | "bare" | "bundle";
      }>;
      await writeRegistry(workspaceRoot, registry);
    }

    const now = new Date().toISOString();
    logger.success(`[sternsystem.extract] extracted ${siteId} to ${mirrors[0].path}`);

    return {
      data: { appId: siteId, systemId: siteId, mirrors, extractedAt: now, pinVersion },
      summary: `[sternsystem.extract] extracted ${siteId} to ${mirrors[0].path}`,
    };
  } finally {
    await releaseLock(workspaceRoot, `system:${siteId}`);
    await releaseLock(workspaceRoot, "registry");
  }
}
