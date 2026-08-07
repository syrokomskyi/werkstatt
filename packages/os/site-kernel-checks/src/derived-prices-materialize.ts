/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0740 derived-prices.materialize command — compiles PBP profile, materializes derived prices, writes generated JSON.</purpose>
<non-goals>
  <item>Does not implement materialization logic — that is in @warpgogol/pbp/compiler/materialize.ts.</item>
  <item>Does not integrate into the build pipeline — that is RFC-0741.</item>
  <item>Does not define entitlement gating — that is RFC-0741.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0740 — command handler for derived-prices.materialize.</item>
</CHANGE_SUMMARY>
*/

import { join, dirname } from "node:path";
import { mkdir } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { writeFileIfChanged } from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import { compilePbpProfile } from "@warpgogol/pbp/compiler";
import { materializeDerivedPrices } from "@warpgogol/pbp/compiler";
import type { PbpCurrencyPricingPolicy } from "@warpgogol/pbp";
import type { PbpEntity } from "@warpgogol/pbp";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import { readEntitledFeatures } from "./lib/entitlements.ts";

const DERIVED_PRICES_FILE = "src/derived-prices.generated.json";

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function findCurrencyPricingPolicy(
  entityIndex: Map<string, PbpEntity>,
): PbpCurrencyPricingPolicy | undefined {
  for (const entity of entityIndex.values()) {
    if (entity.type === "currency-pricing-policy") {
      return entity as unknown as PbpCurrencyPricingPolicy;
    }
  }
  return undefined;
}

export async function runDerivedPricesMaterialize(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "derived-prices.materialize";
  const paths = requireAstroSitePaths(context);
  const appDir = paths.appDirectory;
  const systemId = context.site?.name ?? flagString(input, "system") ?? "unknown";

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

  const sourceDirectory = join(appDir, "src", "content", "business-profile");
  const buildTime = (input.flags["build-time"] as string | undefined) ?? new Date().toISOString();

  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const locale = defaultLanguageFromManifest(manifest);

  let compilerResult;
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

  const policy = findCurrencyPricingPolicy(compilerResult.entityIndex);
  if (!policy) {
    return {
      data: {
        command,
        status: "error",
        system: systemId,
        errors: [`No CurrencyPricingPolicy found for business`],
      },
      exitCode: 1,
      summary: `${command}: no CurrencyPricingPolicy for ${systemId}`,
    };
  }

  const { prices, errors } = materializeDerivedPrices(
    compilerResult.resolvedGraph,
    policy,
    buildTime,
  );

  if (errors.length > 0) {
    return {
      data: {
        command,
        status: "fail",
        system: systemId,
        materializedCount: Object.values(prices).reduce((sum, arr) => sum + arr.length, 0),
        offerings: Object.keys(prices).length,
        targetCurrencies: [
          ...new Set(
            Object.values(prices)
              .flat()
              .map((p) => p.targetCurrency),
          ),
        ],
        errors: errors.map((e) => `[${e.code}] ${e.message}`),
      },
      exitCode: 1,
      summary: `${command}: ${errors.length} validation error(s) for ${systemId}`,
    };
  }

  const materializedCount = Object.values(prices).reduce((sum, arr) => sum + arr.length, 0);
  const targetCurrencies = [
    ...new Set(
      Object.values(prices)
        .flat()
        .map((p) => p.targetCurrency),
    ),
  ];

  const outputPath = join(appDir, DERIVED_PRICES_FILE);
  const outputContent = JSON.stringify(prices, null, 2) + "\n";

  if (!context.dryRun) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFileIfChanged(outputPath, outputContent);
  }

  return {
    data: {
      command,
      status: "ok",
      system: systemId,
      materializedCount,
      offerings: Object.keys(prices).length,
      targetCurrencies,
      errors: [],
    },
    exitCode: 0,
    summary: `Materialized ${materializedCount} derived prices across ${Object.keys(prices).length} offerings for currencies: ${targetCurrencies.join(", ") || "none"}`,
  };
}
