/*
<MODULE_CONTRACT>
<purpose>Implements RFC-0741 currency-pricing.compile command — reads and validates the CurrencyPricingPolicy for the business.</purpose>
<non-goals>
  <item>Does not define CurrencyPricingPolicy type — that is RFC-0736 in @warpgogol/pbp.</item>
  <item>Does not materialize derived prices — that is derived-prices.materialize (RFC-0740).</item>
  <item>Does not duplicate RFC-0740 compiler validation rules — those are enforced during derived-prices.materialize.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0741 — command handler for currency-pricing.compile.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import { compilePbpProfile } from "@warpgogol/pbp/compiler";
import type { PbpCurrencyPricingPolicy, PbpEntity } from "@warpgogol/pbp";
import { defaultLanguageFromManifest } from "./lib/i18n.ts";
import { readEntitledFeatures } from "./lib/entitlements.ts";

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

function resolveRef(ref: unknown): string {
  if (typeof ref === "string") return ref;
  if (ref && typeof ref === "object" && "ref" in ref) {
    return (ref as { ref: string }).ref;
  }
  return "";
}

export async function runCurrencyPricingCompile(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "currency-pricing.compile";
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
        errors: ["No CurrencyPricingPolicy found for business"],
      },
      exitCode: 1,
      summary: `${command}: no CurrencyPricingPolicy for ${systemId}`,
    };
  }

  const errors: string[] = [];
  const targetCurrencies: string[] = [];
  const entityIndex = compilerResult.entityIndex;

  for (const [targetKey, target] of Object.entries(policy.targetCurrencies)) {
    const targetCurrency = target.currency;
    targetCurrencies.push(targetCurrency);

    if (targetCurrency === policy.baseCurrency) {
      errors.push(
        `Target currency ${targetCurrency} (key: ${targetKey}) is the same as base currency`,
      );
    }

    if (target.strategy === "derived") {
      if (!target.ratePolicyRef) {
        errors.push(
          `Target currency ${targetCurrency} (key: ${targetKey}): strategy=derived but no ratePolicyRef`,
        );
      } else {
        const ratePolicyId = resolveRef(target.ratePolicyRef);
        const ratePolicyEntity = entityIndex.get(ratePolicyId);
        if (!ratePolicyEntity || ratePolicyEntity.type !== "rate-policy") {
          errors.push(
            `Target currency ${targetCurrency} (key: ${targetKey}): ratePolicyRef ${ratePolicyId} does not resolve to a RatePolicy`,
          );
        }
      }

      if (target.derivationContractRef) {
        const derivationRef = resolveRef(target.derivationContractRef);
        const derivationEntity = entityIndex.get(derivationRef);
        if (!derivationEntity) {
          errors.push(
            `Target currency ${targetCurrency} (key: ${targetKey}): derivationContractRef ${derivationRef} does not resolve`,
          );
        }
      }
    }

    const uses = target.currentUses;
    if (uses.invoice || uses.settlement || uses.contract || uses.quote) {
      errors.push(
        `Target currency ${targetCurrency} (key: ${targetKey}): transactional currentUses must be false in the current phase (invoice, settlement, contract, quote)`,
      );
    }
  }

  if (errors.length > 0) {
    return {
      data: {
        command,
        status: "fail",
        system: systemId,
        policyId: policy.id,
        targetCurrencies,
        errors,
      },
      exitCode: 1,
      summary: `${command}: ${errors.length} validation error(s) for ${systemId}`,
    };
  }

  return {
    data: {
      command,
      status: "ok",
      system: systemId,
      policyId: policy.id,
      targetCurrencies,
      errors: [],
    },
    exitCode: 0,
    summary: `Compiled currency pricing policy for ${systemId}: ${targetCurrencies.length} target currencies (${targetCurrencies.join(", ")})`,
  };
}
