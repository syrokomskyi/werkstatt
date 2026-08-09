/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0741 rate-snapshot.resolve command — reads RatePolicy entities, resolves applicable rates, and creates RateSnapshot content files.</purpose>
<non-goals>
  <item>Does not define RatePolicy or RateSnapshot types — those are RFC-0737/RFC-0738 in @warpgogol/werkstatt-site/pbp.</item>
  <item>Does not implement the Rate Fetcher Service — that is RFC-0744. External mode delegates to it.</item>
  <item>Does not materialize derived prices — that is derived-prices.materialize (RFC-0740).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0741 — command handler for rate-snapshot.resolve.</item>
  <item>RFC-0741 review fixes: use writeFileIfChanged, top-level crypto import, site URL from config, type guards, shared helpers, remove unused snapshotsReused field, external mode as warning.</item>
  <item>RFC-0744: external mode now queries Supabase rate_observations table for latest observation and creates RateSnapshot from it.</item>
  <item>RFC-0746: add idempotency for business-fixed mode — reuse existing fresh snapshot with same value + entryKey instead of creating a new one; normalize validFrom to UTC before comparison in findApplicableScheduleEntry.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { mkdir, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { writeFileIfChanged } from "@warpgogol/werkstatt/kernel";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { compilePbpProfile } from "@warpgogol/werkstatt-site/pbp/compiler";
import type { PbpCompilerResult } from "@warpgogol/werkstatt-site/pbp/compiler";
import type { PbpRateScheduleEntry } from "@warpgogol/werkstatt-site/pbp";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import { readEntitledFeatures } from "./lib/entitlements.ts";
import { readAstroSiteUrl } from "./lib/astro-site-url.ts";
import { flagString, resolveRef, findRatePolicies, findRateSchedules } from "./lib/pbp-helpers.ts";

const RATE_SNAPSHOTS_DIR = "src/content/business-profile/rate-snapshots";

/**
 * Normalize an ISO 8601 string to UTC (Z suffix) for deterministic comparison.
 * RFC-0746: prevents timezone-fragile lexicographic ordering of validFrom values.
 */
function normalizeToUtc(isoString: string): string {
  try {
    return new Date(isoString).toISOString();
  } catch {
    return isoString;
  }
}

/**
 * Find the applicable RateSchedule entry for a given time.
 *
 * Entries are sorted by validFrom (normalized to UTC) descending. The first
 * entry with validFrom <= now (both normalized to UTC) is the applicable one.
 * RFC-0746: normalizes validFrom to UTC before comparison to prevent
 * timezone-fragile string ordering (e.g. +02:00 sorting after Z).
 */
function findApplicableScheduleEntry(
  schedule: { entries: Record<string, PbpRateScheduleEntry> },
  now: string,
): PbpRateScheduleEntry | undefined {
  const nowUtc = normalizeToUtc(now);
  const entries = Object.entries(schedule.entries).sort(([, a], [, b]) =>
    normalizeToUtc(b.validFrom).localeCompare(normalizeToUtc(a.validFrom)),
  );
  for (const [, entry] of entries) {
    if (normalizeToUtc(entry.validFrom) <= nowUtc) {
      return entry;
    }
  }
  return undefined;
}

/**
 * RFC-0746: Scan existing snapshot files for a reusable snapshot.
 *
 * A snapshot is reusable if all of the following match:
 * - Same sourceCurrency / targetCurrency pair
 * - source.kind === "business-fixed"
 * - source.rateScheduleEntryKey matches expectedEntryKey
 * - value matches expectedValue
 * - freshUntil is still in the future
 *
 * Returns the snapshot ID if a reusable snapshot is found, null otherwise.
 */
async function findReusableSnapshot(
  outputDir: string,
  sourceCurrency: string,
  targetCurrency: string,
  expectedValue: string,
  expectedEntryKey: string,
  buildTime: string,
): Promise<string | null> {
  let files: string[];
  try {
    files = await readdir(outputDir);
  } catch {
    return null;
  }

  const prefix = `${sourceCurrency}-${targetCurrency}-`;
  const nowMs = new Date(buildTime).getTime();

  for (const file of files) {
    if (!file.startsWith(prefix) || !file.endsWith(".md")) continue;
    try {
      const raw = await readFile(join(outputDir, file), "utf8");
      const fmMatch = raw.match(/^---\n([\s\S]*?)\n---/);
      if (!fmMatch) continue;
      const fm = JSON.parse(fmMatch[1]) as {
        id?: string;
        pair?: { sourceCurrency?: string; targetCurrency?: string };
        value?: string;
        source?: {
          kind?: string;
          rateScheduleEntryKey?: string;
        };
        freshUntil?: string;
      };
      if (fm.pair?.sourceCurrency !== sourceCurrency) continue;
      if (fm.pair?.targetCurrency !== targetCurrency) continue;
      if (fm.source?.kind !== "business-fixed") continue;
      if (fm.source?.rateScheduleEntryKey !== expectedEntryKey) continue;
      if (fm.value !== expectedValue) continue;
      if (!fm.freshUntil) continue;
      const freshMs = new Date(fm.freshUntil).getTime();
      if (Number.isNaN(freshMs) || freshMs <= nowMs) continue;
      return fm.id ?? null;
    } catch {
      continue;
    }
  }
  return null;
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
  let snapshotsReused = 0;
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

      const supabaseUrl = process.env.RATE_FETCHER_SUPABASE_URL;
      const supabaseKey = process.env.RATE_FETCHER_SUPABASE_KEY;
      if (!supabaseUrl || !supabaseKey) {
        warnings.push(
          `External mode for pair ${sourceCurrency}/${targetCurrency} requires RATE_FETCHER_SUPABASE_URL and RATE_FETCHER_SUPABASE_KEY env vars (RFC-0744)`,
        );
        if (policy.failure.noAcceptableRate === "block-publication") {
          errors.push(
            `No Rate Fetcher Service configured for pair ${sourceCurrency}/${targetCurrency} (external mode)`,
          );
        }
        continue;
      }

      try {
        const obsUrl = `${supabaseUrl}/rest/v1/rate_observations?source_currency=eq.${sourceCurrency}&target_currency=eq.${targetCurrency}&order=observed_at.desc&limit=1&select=value,observed_at,metadata`;
        const obsResponse = await fetch(obsUrl, {
          headers: {
            apikey: supabaseKey,
            authorization: `Bearer ${supabaseKey}`,
          },
        });
        if (!obsResponse.ok) {
          throw new Error(`Supabase query failed: ${obsResponse.status}`);
        }
        const observations = (await obsResponse.json()) as Array<{
          value: string;
          observed_at: string;
          metadata?: Record<string, unknown>;
        }>;

        if (observations.length === 0) {
          if (policy.failure.noAcceptableRate === "block-publication") {
            errors.push(
              `No rate observation found for pair ${sourceCurrency}/${targetCurrency} in Supabase`,
            );
          } else {
            warnings.push(
              `No rate observation found for pair ${sourceCurrency}/${targetCurrency} in Supabase`,
            );
          }
          continue;
        }

        const obs = observations[0];
        const observedAt = obs.observed_at;
        const digest = computeDigest(obs.value, observedAt);
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
          value: obs.value,
          source: {
            kind: "external" as const,
            sourceContractRef: policy.sources?.primary,
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
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (policy.failure.noAcceptableRate === "block-publication") {
          errors.push(`Rate fetch failed for pair ${sourceCurrency}/${targetCurrency}: ${msg}`);
        } else {
          warnings.push(`Rate fetch failed for pair ${sourceCurrency}/${targetCurrency}: ${msg}`);
        }
      }
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

    const entryKey = Object.entries(schedule.entries).find(([, e]) => e === entry)?.[0];
    const outputDir = join(appDir, RATE_SNAPSHOTS_DIR, locale);

    // RFC-0746: Idempotency check — reuse existing fresh snapshot with same value + entryKey
    const reusableId = await findReusableSnapshot(
      outputDir,
      sourceCurrency,
      targetCurrency,
      entry.value,
      entryKey ?? "",
      buildTime,
    );
    if (reusableId) {
      snapshotsCreated.push(reusableId);
      snapshotsReused++;
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
        rateScheduleEntryKey: entryKey,
      },
      observedAt,
      freshUntil,
      digest: {
        algorithm: "sha256",
        value: digest,
      },
    };

    const fileName = `${sourceCurrency}-${targetCurrency}-${observedAt.replace(/[:.]/g, "-").slice(0, 19)}.md`;
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
        snapshotsReused: 0,
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
      snapshotsReused,
      errors,
      warnings,
    },
    exitCode: 0,
    summary: `Resolved ${snapshotsCreated.length} rate snapshots for ${systemId} (${snapshotsReused} reused)`,
  };
}
