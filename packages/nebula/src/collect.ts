/*
<MODULE_CONTRACT>
<purpose>Collects Nebula Score inputs from CI artifact files (Lighthouse, axe, content checks, DNA checks) into a single NebulaInputs object.</purpose>
<non-goals>
  <item>Do not compute scores — that is compute.ts.</item>
  <item>Do not validate artifact schemas beyond shallow field extraction.</item>
  <item>Do not orchestrate CI jobs or manage artifact lifecycles.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation: centralizes input collection from 4 CI artifact types.</item>
</CHANGE_SUMMARY>
*/

/**
 * @gogol/nebula — Input collector
 *
 * DNA-33 / RFC-0028
 *
 * Reads CI artifact files from an app directory and assembles NebulaInputs.
 * Falls back to stub values for any missing artifact, so the collector always
 * returns a complete NebulaInputs object.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  NebulaInputs,
  LighthouseResult,
  AxeResult,
  ContentCheckReport,
  DnaCheckReport,
} from "./types.ts";
import { createStubNebulaInputs } from "./compute.ts";

/** Options for collecting Nebula inputs from CI artifacts. */
export interface CollectNebulaInputsOptions {
  /** Absolute path to the app directory (contains .lighthouse-results.json, etc.) */
  appDirectory: string;
  /** Override the lighthouse artifact filename (default: .lighthouse-results.json) */
  lighthouseFilename?: string;
  /** Override the axe artifact filename (default: .axe-results.json) */
  axeFilename?: string;
  /** Override the content-check artifact filename (default: .content-checks.json) */
  contentChecksFilename?: string;
  /** Override the DNA-check artifact filename (default: .dna-checks.json) */
  dnaChecksFilename?: string;
}

/**
 * Collect NebulaInputs from CI artifact files in the app directory.
 *
 * Reads the following files (relative to appDirectory):
 *   .lighthouse-results.json — { performanceScore, accessibilityScore, routes? }
 *   .axe-results.json        — { totalViolations, criticalViolations? }
 *   .content-checks.json     — { totalChecks, passingChecks, failures? }
 *   .dna-checks.json         — { totalCommands, passingCommands, failingCommands? }
 *
 * Missing files fall back to stub values. Malformed files are logged and ignored.
 */
export async function collectNebulaInputs(
  options: CollectNebulaInputsOptions,
): Promise<NebulaInputs> {
  const { appDirectory } = options;
  const stub = createStubNebulaInputs();

  const lighthouse = await readJsonSafe<LighthouseResult>(
    join(appDirectory, options.lighthouseFilename ?? ".lighthouse-results.json"),
    stub.lighthouse,
    "lighthouse",
  );

  const axe = await readJsonSafe<AxeResult>(
    join(appDirectory, options.axeFilename ?? ".axe-results.json"),
    stub.axe,
    "axe",
  );

  const contentChecks = await readJsonSafe<ContentCheckReport>(
    join(appDirectory, options.contentChecksFilename ?? ".content-checks.json"),
    stub.contentChecks,
    "content-checks",
  );

  const dnaChecks = await readJsonSafe<DnaCheckReport>(
    join(appDirectory, options.dnaChecksFilename ?? ".dna-checks.json"),
    stub.dnaChecks,
    "dna-checks",
  );

  return { lighthouse, axe, contentChecks, dnaChecks };
}

async function readJsonSafe<T>(filePath: string, fallback: T, label: string): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<T>;
    return { ...fallback, ...parsed };
  } catch {
    console.warn(`[nebula] ${label} artifact not found or malformed — using stub`);
    return fallback;
  }
}
