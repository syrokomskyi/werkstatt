import { parse as yamlParse, stringify as yamlStringify } from "yaml";
/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/surface/shared.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted shared helpers from surface.ts into surface/shared.ts.</item>
  <item>RFC-0602: replace volatile createdAt with null in surface state recording.</item>
</CHANGE_SUMMARY>
*/

import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { byteHash } from "@warpgogol/fingerprint";
import {
  includeInLlms,
  includeInTwins,
  pageText,
  tokenize,
  type SurfaceArtifact,
  type SurfaceCounts,
  type SurfaceManifest,
  type SurfaceState,
  type VirtualRouteEntry,
} from "@warpgogol/surface";
import { markdownTwinRelPath } from "@warpgogol/share/semantic";

export const ARTIFACT_FILE = "src/surface.generated.yaml";
export const MANIFEST_FILE = "public/.well-known/pseo-manifest.json";
export const SURFACE_STATE_DIR = "src/surface/states";
export const SURFACE_STATE_POINTER = "src/surface/states/pointer.yaml";

export type SurfaceStatePointer = {
  lastKnownGood?: string;
  shipped?: string;
  current?: string;
  previousShipped?: string;
};

export async function readEntitledFeatures(appDir: string): Promise<string[] | null> {
  try {
    const raw = await readFile(join(appDir, "src", "entitlements.generated.yaml"), "utf8");
    const parsed = yamlParse(raw) as { features?: unknown };
    return Array.isArray(parsed.features) ? parsed.features.map(String) : null;
  } catch {
    return null;
  }
}

export async function readPseoIndexBudget(appDir: string): Promise<number | undefined> {
  try {
    const raw = await readFile(join(appDir, "src", "entitlements.generated.yaml"), "utf8");
    const parsed = yamlParse(raw) as { pseo?: { indexBudget?: unknown } };
    const budget = parsed.pseo?.indexBudget;
    return typeof budget === "number" ? budget : undefined;
  } catch {
    return undefined;
  }
}

export async function readPseoRegionalUnlocked(appDir: string): Promise<boolean> {
  try {
    const raw = await readFile(join(appDir, "src", "entitlements.generated.yaml"), "utf8");
    const parsed = yamlParse(raw) as { pseo?: { regionalUnlocked?: unknown } };
    return parsed.pseo?.regionalUnlocked === true;
  } catch {
    return false;
  }
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

const HASH_PREFIX = "sha" + "256:";

export function digestHex(value: string): string {
  return byteHash(value).slice(HASH_PREFIX.length);
}

export async function recordSurfaceState(
  appDir: string,
  siteName: string,
  artifact: SurfaceArtifact,
  manifest: SurfaceManifest,
): Promise<void> {
  // RFC-0345: exclude volatile generatedAt from hash — content identity only.
  const { generatedAt: _ag, ...artifactContent } = artifact;
  const { generatedAt: _mg, ...manifestContent } = manifest;
  const artifactHash = byteHash(JSON.stringify(artifactContent));
  const manifestHash = byteHash(JSON.stringify(manifestContent));
  const id = `surface-${digestHex(`${artifactHash}\n${manifestHash}`).slice(0, 24)}`;

  const stateDir = join(appDir, SURFACE_STATE_DIR);
  const statePath = join(stateDir, `${id}.state.yaml`);

  // RFC-0345: only write the state file if it does not already exist.
  // This preserves the original createdAt of the first occurrence.
  if (!existsSync(statePath)) {
    const state: SurfaceState = {
      id,
      site: siteName,
      createdAt: null,
      status: "shipped",
      pageCount: artifact.entries.length,
      indexableCount: artifact.entries.filter((entry) => entry.indexable && !entry.noindex).length,
      artifactHash,
      manifestHash,
    };
    await mkdir(stateDir, { recursive: true });
    await writeFile(statePath, `${yamlStringify(state)}`, "utf8");
  }

  // RFC-0345: build the new pointer and only write if content changed.
  const pointerPath = join(appDir, SURFACE_STATE_POINTER);
  let previous: SurfaceStatePointer | null = null;
  try {
    previous = yamlParse(await readFile(pointerPath, "utf8")) as SurfaceStatePointer;
  } catch {
    previous = null;
  }
  const newPointer = {
    current: id,
    shipped: id,
    lastKnownGood: previous?.lastKnownGood ?? id,
    previousShipped: previous?.shipped ?? previous?.current,
    updatedAt: null as string | null,
  };
  const newPointerJson = `${yamlStringify(newPointer)}`;

  let existingPointer = "";
  try {
    existingPointer = await readFile(pointerPath, "utf8");
  } catch {
    // File does not exist yet.
  }
  if (newPointerJson !== existingPointer) {
    await mkdir(stateDir, { recursive: true });
    await writeFile(pointerPath, newPointerJson, "utf8");
  }

  // RFC-0345: cleanup — delete unreferenced state files.
  // A state file is referenced if its id appears in the new pointer's
  // current, shipped, lastKnownGood, or previousShipped fields.
  const referencedIds = new Set(
    [
      newPointer.current,
      newPointer.shipped,
      newPointer.lastKnownGood,
      newPointer.previousShipped,
    ].filter((v): v is string => typeof v === "string"),
  );
  try {
    const files = await readdir(stateDir);
    for (const file of files) {
      if (!file.startsWith("surface-") || !file.endsWith(".state.yaml")) continue;
      const fileId = file.slice(0, -".state.yaml".length);
      if (!referencedIds.has(fileId)) {
        await unlink(join(stateDir, file));
      }
    }
  } catch {
    // State directory does not exist or is not readable — skip cleanup.
  }
}

export async function cleanupOldTwins(
  appDir: string,
  oldArtifact: SurfaceArtifact,
  defaultLang: string,
  supportedLangs: string[],
): Promise<void> {
  const paths: string[] = [];
  for (const entry of oldArtifact.entries) {
    for (const [lang, slug] of Object.entries(entry.routes)) {
      const prefix = lang === defaultLang ? "" : `${lang}/`;
      paths.push(
        join(appDir, "public", markdownTwinRelPath(`/${prefix}${slug}`, { supportedLangs })),
      );
      paths.push(join(appDir, "public", `${prefix}${slug}`, "index.md"));
    }
  }
  await Promise.all(
    paths.map(async (p) => {
      try {
        await rm(p, { force: true });
      } catch {
        /* ignore missing / permission errors */
      }
    }),
  );
}

export function countFor(surfaceId: string, entries: VirtualRouteEntry[]): SurfaceCounts {
  let indexable = 0;
  let noindex = 0;
  let redirected = 0;
  let thin = 0;
  const scores: number[] = [];
  const uniqueShares: number[] = [];
  const textEntries = entries.filter((entry) => entry.indexable && entry.page);
  const docTokens = textEntries.map((entry) => tokenize(pageText(entry.page!)));
  const docFreq = new Map<string, number>();
  for (const tokens of docTokens) {
    for (const token of new Set(tokens)) docFreq.set(token, (docFreq.get(token) ?? 0) + 1);
  }
  const shareByPageId = new Map<string, number>();
  const uniqueThreshold = Math.max(1, Math.ceil(textEntries.length * 0.5));
  for (let index = 0; index < textEntries.length; index += 1) {
    const entry = textEntries[index]!;
    const tokens = docTokens[index] ?? [];
    const unique = tokens.filter((token) => (docFreq.get(token) ?? 0) <= uniqueThreshold).length;
    shareByPageId.set(entry.pageId, tokens.length === 0 ? 0 : unique / tokens.length);
  }
  for (const entry of entries) {
    if (!entry.indexable) redirected += 1;
    else if (entry.noindex) noindex += 1;
    else indexable += 1;
    if (entry.decision?.reason === "thin") thin += 1;
    if (typeof entry.decision?.substanceScore === "number")
      scores.push(entry.decision.substanceScore);
    const uniqueShare = shareByPageId.get(entry.pageId);
    if (uniqueShare !== undefined) uniqueShares.push(uniqueShare);
  }
  const uniqueTokenShareBands = {
    lt030: uniqueShares.filter((share) => share < 0.3).length,
    gte030lt050: uniqueShares.filter((share) => share >= 0.3 && share < 0.5).length,
    gte050: uniqueShares.filter((share) => share >= 0.5).length,
  };
  return {
    surfaceId,
    generated: entries.length,
    indexable,
    noindex,
    redirected,
    thin,
    medianSubstance: Number(median(uniqueShares).toFixed(3)),
    legacyMedianSubstanceScore: Math.round(median(scores)),
    uniqueTokenShareBands,
    twins: entries.filter((e) => includeInTwins(e)).length,
    inLlms: entries.filter((e) => includeInLlms(e)).length,
  };
}

export function pageIdToFile(pageId: string): string {
  return pageId.replace(/[^a-z0-9_-]/gi, "__");
}

export async function readLangs(
  appDir: string,
): Promise<{ defaultLang: string; supportedLangs: string[] }> {
  const { loadSystemManifest } = await import("@warpgogol/site-kernel-content");
  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const i18n = (
    manifest as unknown as { i18n?: { default?: string; supported?: Record<string, unknown> } }
  ).i18n;
  if (!i18n?.default) {
    throw new Error("[surface] src/content/system.md must declare i18n.default.");
  }
  const defaultLang = i18n.default;
  const supportedLangs = i18n.supported ? Object.keys(i18n.supported) : [defaultLang];
  return { defaultLang, supportedLangs };
}

export async function loadAuthoredRoutes(
  appDir: string,
): Promise<{ pageIds: Set<string>; slugs: Set<string> }> {
  const pageIds = new Set<string>();
  const slugs = new Set<string>();
  try {
    const { loadSystemManifest } = await import("@warpgogol/site-kernel-content");
    const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
    const pages = (
      manifest as unknown as {
        pages?: Array<{ pageId?: string; routes?: Record<string, string> }>;
      }
    ).pages;
    for (const page of pages ?? []) {
      if (page.pageId) pageIds.add(page.pageId);
      for (const slug of Object.values(page.routes ?? {})) slugs.add(slug);
    }
  } catch {
    /* fail-open: no authored routes available */
  }
  return { pageIds, slugs };
}
