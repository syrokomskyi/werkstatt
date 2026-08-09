/*
<MODULE_CONTRACT>
<purpose>RFC-0169: entitlements.resolve reads the app's billing config (Stripe customer id or an
offline override), resolves the paid-feature set (Stripe Entitlements API is the source of truth),
and writes src/entitlements.generated.yaml. entitlements.validate checks the resolved file against
the closed feature catalog. Fail-closed: a configured paying customer must never ship unresolved.</purpose>
<non-goals>
  <item>Do not build a custom entitlements store — Stripe is the source of truth.</item>
  <item>Do not read Pipedrive — it stays the CRM, never the entitlement source.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0169: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  writeFileIfChanged,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { parse as yamlParse, stringify as yamlStringify } from "yaml";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import {
  resolveEntitlements,
  isValidFeature,
  resolvePseoBudget,
  STRIPE_FEATURE_LOOKUP_MAP,
  type EntitledFeature,
} from "@warpgogol/share/entitlement";
import { failResult } from "./result-helpers.ts";

const GENERATED_FILE = "src/entitlements.generated.yaml";

async function fetchStripeEntitlements(
  customerId: string,
  key: string,
): Promise<{ features: string[]; lookupKeys: string[] }> {
  const url =
    `https://api.stripe.com/v1/entitlements/active_entitlements` +
    `?customer=${encodeURIComponent(customerId)}&limit=100`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) {
    throw new Error(`Stripe entitlements API responded ${res.status}`);
  }
  const json = (await res.json()) as { data?: Array<{ lookup_key?: string }> };
  const lookupKeys = (json.data ?? [])
    .map((entry) => entry.lookup_key)
    .filter((k): k is string => Boolean(k));
  const features = lookupKeys
    .map((k) => STRIPE_FEATURE_LOOKUP_MAP[k])
    .filter((feature): feature is EntitledFeature => Boolean(feature));
  return { features, lookupKeys };
}

export async function runEntitlementsResolve(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "entitlements.resolve must run inside an app context." };
  }
  const { manifest } = await loadSystemManifest(join(app.directory, "src", "content"));
  const manifestRecord = manifest as unknown as {
    billing?: {
      stripeCustomerId?: string;
      pseoIndexBudget?: number;
      pseoRegionalUnlocked?: boolean;
    };
    entitlementsOverride?: string[];
  };
  const customerId = manifestRecord.billing?.stripeCustomerId ?? null;
  const override = manifestRecord.entitlementsOverride;

  let stripeFeatures: string[] | undefined;
  let stripeLookupKeys: string[] | undefined;
  // RFC-0196: the Programmatic Surface index budget — from the offline billing field (override/dev)
  // or, with Stripe, derived from the active tier lookup-key.
  let pseoIndexBudget: number | undefined = manifestRecord.billing?.pseoIndexBudget;
  // RFC-0240: the regional-hub-or-higher unlock — explicit in offline/override mode, derived from
  // the Stripe tier lookup-key otherwise.
  const pseoRegionalUnlocked = manifestRecord.billing?.pseoRegionalUnlocked;
  const hasOverride = Array.isArray(override) && override.length > 0;
  if (!hasOverride && customerId) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
      // Fail-closed: a configured paying customer must not silently ship without resolution.
      return failResult("entitlements.resolve", [
        `billing.stripeCustomerId is set ("${customerId}") but STRIPE_SECRET_KEY is absent and ` +
          `no entitlementsOverride is provided. Supply the key (live) or an override (dev/CI).`,
      ]);
    }
    try {
      const { features, lookupKeys } = await fetchStripeEntitlements(customerId, key);
      stripeFeatures = features;
      stripeLookupKeys = lookupKeys;
      pseoIndexBudget = resolvePseoBudget(lookupKeys) ?? pseoIndexBudget;
    } catch (err) {
      return failResult("entitlements.resolve", [
        `Stripe resolution failed: ${err instanceof Error ? err.message : String(err)}`,
      ]);
    }
  }

  const resolved = resolveEntitlements({
    customerId,
    override,
    stripeFeatures,
    pseoIndexBudget,
    pseoRegionalUnlocked,
    stripeLookupKeys,
  });
  const payload = {
    ...resolved,
  };
  if (!context.dryRun) {
    await writeFileIfChanged(join(app.directory, GENERATED_FILE), `${yamlStringify(payload)}`);
  }
  return {
    exitCode: 0,
    summary: `entitlements.resolve: ${resolved.features.length} feature(s) [${resolved.source}]`,
    data: resolved,
  };
}

export async function runEntitlementsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const app = context.site;
  if (!app) {
    return { exitCode: 1, summary: "entitlements.validate must run inside an app context." };
  }
  const path = join(app.directory, GENERATED_FILE);
  if (!existsSync(path)) {
    return {
      exitCode: 0,
      summary: "entitlements.validate: skipped (no resolved file; run entitlements.resolve)",
    };
  }
  let parsed: Record<string, unknown>;
  try {
    parsed = yamlParse(await readFile(path, "utf8")) as Record<string, unknown>;
  } catch {
    return failResult("entitlements.validate", [`${GENERATED_FILE} is not valid JSON`]);
  }

  const violations: string[] = [];
  const features = Array.isArray(parsed.features) ? (parsed.features as string[]) : null;
  if (!features) {
    violations.push(`${GENERATED_FILE}: missing features[] array`);
  } else {
    for (const feature of features) {
      if (!isValidFeature(feature)) {
        violations.push(`${GENERATED_FILE}: "${feature}" is not in the EntitledFeature catalog`);
      }
    }
  }
  if (!["stripe", "override", "none"].includes(parsed.source as string)) {
    violations.push(`${GENERATED_FILE}: invalid source "${String(parsed.source)}"`);
  }

  if (violations.length > 0) {
    return failResult("entitlements.validate", violations);
  }
  return {
    exitCode: 0,
    summary: `entitlements.validate: ok (${features?.length ?? 0} feature(s))`,
  };
}
