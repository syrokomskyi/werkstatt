/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0741 rate-snapshot.resolve command — reads RatePolicy entities, resolves applicable rates, and creates RateSnapshot content files.</purpose>
<non-goals>
  <item>Does not define RatePolicy or RateSnapshot types — those are RFC-0737/RFC-0738 in @warpgogol/pbp.</item>
  <item>Does not implement the Rate Fetcher Service — that is RFC-0744. External mode delegates to it.</item>
  <item>Does not materialize derived prices — that is derived-prices.materialize (RFC-0740).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0741 — command handler for rate-snapshot.resolve.</item>
  <item>RFC-0741 review fixes: use writeFileIfChanged, top-level crypto import, site URL from config, type guards, shared helpers, remove unused snapshotsReused field, external mode as warning.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { writeFileIfChanged } from "@warpgogol/site-kernel";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import { compilePbpProfile } from "@warpgogol/pbp/compiler";
import type { PbpCompilerResult } from "@warpgogol/pbp/compiler";
import type { PbpRateScheduleEntry } from "@warpgogol/pbp";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import { readEntitledFeatures } from "./lib/entitlements.ts";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { flagString, resolveRef, findRatePolicies, findRateSchedules } from "./lib/pbp-helpers.ts";

const RATE_SNAPSHOTS_DIR = "src/content/business-profile/rate-snapshots";

/**
 * Find the applicable RateSchedule entry for a given time.
 *
 * Entries are sorted by validFrom descending. The first entry with
 * validFrom <= now is the applicable one.
 */
function findApplicableScheduleEntry(
  schedule: { entries: Record<string, PbpRateScheduleEntry> },
  now: string,
): PbpRateScheduleEntry | undefined {
  const entries = Object.entries(schedule.entries).sort(([, a], [, b]) =>
    b.validFrom.localeCompare(a.validFrom),
  );
  for (const [, entry] of entries) {
    if (entry.validFrom <= now) {
      return entry;
    }
  }
  return undefined;
}

/**
 * Generate a deterministic snapshot ID from the pair and observedAt.
 */
function snapshotId(
  siteUrl: string,
  sourceCurrency: string,
  targetCurrency: string,
  observedAt: string,
): string {
  const datePart = observedAt.replace(/[:.]/g, "-").slice(0, 19);
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/id/rate-snapshot/${sourceCurrency}-${targetCurrency}-${datePart}`;
}

/**
 * Compute a simple digest of the rate value + observedAt.
 */
function computeDigest(value: string, observedAt: string): string {
  return createHash("sha256").update(`${value}:${observedAt}`).digest("hex");
}

/**
 * Compute freshUntil from observedAt and maximumAge.
 *
 * maximumAge is an ISO 8601 duration (e.g. "P1D", "PT12H").
 * For simplicity, we parse common patterns. If parsing fails, we default
 * to observedAt + 24h.
 */
function computeFreshUntil(observedAt: string, maximumAge: string): string {
  const observed = new Date(observedAt);
  const match = maximumAge.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (match) {
    const days = parseInt(match[1] ?? "0", 10);
    const hours = parseInt(match[2] ?? "0", 10);
    const minutes = parseInt(match[3] ?? "0", 10);
    const ms = (days * 24 * 60 + hours * 60 + minutes) * 60 * 1000;
    return new Date(observed.getTime() + ms).toISOString();
  }
  return new Date(observed.getTime() + 24 * 60 * 60 * 1000).toISOString();
}

export async function runRateSnapshotResolve(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "rate-snapshot.resolve";
  const paths = requireAstroSitePaths(context);
  const appDir = paths.appDirectory;
  const systemId = context.site?.name ?? flagString(input, "system") ?? "unknown";
  const isDev = input.flags["dev"] === true;

  const entitledFeatures = await readEntitledFeatures(appDir);
  if (entitledFeatures !== null && !entitledFeatures.includes("multi-currency")) {
    return {
      data: {
        command,
        status: "skipped",
        system: systemId,
        reason: "multi-currency entitlement not active",
      },
      exitCode: 0,
      summary: `Skipped: multi-currency entitlement not active for ${systemId}`,
    };
  }

  const siteUrl = (await readAstroSiteUrl(appDir)) ?? "https://warpgogol.com";
  const sourceDirectory = join(appDir, "src", "content", "business-profile");
  const buildTime = (input.flags["build-time"] as string | undefined) ?? new Date().toISOString();

  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const locale = defaultLanguageFromManifest(manifest);

  let compilerResult: PbpCompilerResult;
  try {
    compilerResult = await compilePbpProfile({
      sourceDirectory,
      locale,
      defaultLocale: locale,
      strictness: "production",
      buildTime,
    });
  } catch (err) {
    return {
      data: {
        command,
        status: "error",
        system: systemId,
        errors: [`Compiler failed: ${err instanceof Error ? err.message : String(err)}`],
      },
      exitCode: 1,
      summary: `${command}: compiler failed for ${systemId}`,
    };
  }

  const ratePolicies = findRatePolicies(compilerResult.entityIndex);
  const rateSchedules = findRateSchedules(compilerResult.entityIndex);

  if (ratePolicies.length === 0) {
    return {
      data: {
        command,
        status: "ok",
        system: systemId,
        snapshotsCreated: 0,
        errors: [],
      },
      exitCode: 0,
      summary: `${command}: no RatePolicies found for ${systemId}, nothing to resolve`,
    };
  }

  const snapshotsCreated: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  for (const policy of ratePolicies) {
    const sourceCurrency = policy.pair.sourceCurrency;
    const targetCurrency = policy.pair.targetCurrency;

    if (policy.mode === "external") {
      if (isDev) {
        warnings.push(
          `External mode for pair ${sourceCurrency}/${targetCurrency} skipped in dev mode`,
        );
        continue;
      }
      warnings.push(
        `External mode for pair ${sourceCurrency}/${targetCurrency} requires Rate Fetcher Service (RFC-0744) — not yet deployed`,
      );
      continue;
    }

    const scheduleRef = policy.sources?.primary ? resolveRef(policy.sources.primary) : "";
    const schedule = scheduleRef ? rateSchedules.get(scheduleRef) : undefined;

    if (!schedule) {
      if (policy.failure.noAcceptableRate === "block-publication") {
        errors.push(
          `No RateSchedule for pair ${sourceCurrency}/${targetCurrency} (business-fixed mode)`,
        );
      }
      continue;
    }

    const entry = findApplicableScheduleEntry(schedule, buildTime);
    if (!entry) {
      if (policy.failure.noAcceptableRate === "block-publication") {
        errors.push(
          `No applicable RateSchedule entry for pair ${sourceCurrency}/${targetCurrency} at ${buildTime}`,
        );
      }
      continue;
    }

    const observedAt = buildTime;
    const digest = computeDigest(entry.value, observedAt);
    const snapshotIdStr = snapshotId(siteUrl, sourceCurrency, targetCurrency, observedAt);
    const freshUntil = computeFreshUntil(observedAt, policy.freshness.maximumAge);

    const frontmatter = {
      schema: "pbp/rate-snapshot@1",
      id: snapshotIdStr,
      type: "rate-snapshot",
      status: "published",
      pair: {
        sourceCurrency,
        targetCurrency,
      },
      quotation: {
        direction: policy.quotation.direction,
      },
      value: entry.value,
      source: {
        kind: "business-fixed" as const,
        rateScheduleRef: { ref: schedule.id },
        rateScheduleEntryKey: Object.entries(schedule.entries).find(([, e]) => e === entry)?.[0],
      },
      observedAt,
      freshUntil,
      digest: {
        algorithm: "sha256",
        value: digest,
      },
    };

    const fileName = `${sourceCurrency}-${targetCurrency}-${observedAt.replace(/[:.]/g, "-").slice(0, 19)}.md`;
    const outputDir = join(appDir, RATE_SNAPSHOTS_DIR, locale);
    const outputPath = join(outputDir, fileName);
    const content = `---\n${JSON.stringify(frontmatter, null, 2)}\n---\n`;

    if (!context.dryRun) {
      await mkdir(outputDir, { recursive: true });
      await writeFileIfChanged(outputPath, content);
    }

    snapshotsCreated.push(snapshotIdStr);
  }

  if (errors.length > 0 && snapshotsCreated.length === 0) {
    return {
      data: {
        command,
        status: "fail",
        system: systemId,
        snapshotsCreated: 0,
        errors,
        warnings,
      },
      exitCode: 1,
      summary: `${command}: ${errors.length} error(s) for ${systemId}`,
    };
  }

  return {
    data: {
      command,
      status: "ok",
      system: systemId,
      snapshotsCreated: snapshotsCreated.length,
      errors,
      warnings,
    },
    exitCode: 0,
    summary: `Resolved ${snapshotsCreated.length} rate snapshots for ${systemId}`,
  };
}
