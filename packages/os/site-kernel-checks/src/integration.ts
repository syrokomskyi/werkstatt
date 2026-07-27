/*
<MODULE_CONTRACT>
<purpose>RFC-0168 (part 2): governance for the Integration Port configuration surface in system.md.
integration.config.validate guards that every configured channel/CRM adapter id resolves to the
closed adapter catalog in @gogol/share/integration. integration.secrets.validate guards that each
configured adapter's required secret names are projected into the app's generated env schema
(src/env.schema.generated.mjs, emitted by api.routes.generate). Both no-op pass when the app
declares no `integrations:` block (channels self-enable by secret presence — back-compat).</purpose>
<non-goals>
  <item>Do not import astro:env or any channel/CRM vendor SDK — read disk only (Node-safe).</item>
  <item>Do not resolve or invoke adapters — this is a configuration guard only.</item>
  <item>Do not log or return secret VALUES — the audit reads .env for presence only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0168 part 2: initial implementation (config + secrets governance).</item>
  <item>RFC-0168 part 2 (Session C): add integration.secrets.audit — gentle live/dormant advisory.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { loadSystemManifest } from "@gogol/site-kernel-content";
import {
  CHANNEL_ADAPTER_IDS,
  CRM_ADAPTER_IDS,
  DELIVERY_REGIONS,
  DELIVERY_TIERS,
  DESTINATION_ADAPTER_SECRETS,
  DESTINATION_KINDS,
  DESTINATION_VENDORS_BY_KIND,
  EXECUTION_MODES,
  INTEGRATION_ADAPTER_SECRETS,
  auditIntegrationReadiness,
  type IntegrationSecrets,
} from "@gogol/integration";
import { passResult, resultFromViolations } from "./result-helpers.ts";

interface DestinationEntry {
  kind?: string;
  vendor?: string;
  mode?: string;
}

interface IntegrationsConfig {
  channels?: Array<{ adapter?: string; options?: Record<string, string> }>;
  crm?: { adapter?: string; options?: Record<string, string> };
  inbound?: { sources?: string[] };
  destinations?: DestinationEntry[];
  /** RFC-0179: delivery-backbone placement. */
  region?: string;
  tier?: string;
  /** RFC-0181: EU-resident delivery substrate. */
  delivery?: { provider?: string; region?: string };
}

/** The inbound webhook secret required when any inbound source is enabled (RFC-0176). */
const INBOUND_SECRET = "INTEGRATION_INBOUND_SECRET";

/** Read the `integrations:` block from system.md. Null when the app declares none. */
async function loadIntegrations(appDir: string): Promise<IntegrationsConfig | null> {
  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const integrations = (manifest as unknown as { integrations?: IntegrationsConfig }).integrations;
  return integrations ?? null;
}

/** The configured channel + CRM adapter ids (deduped), excluding undefined entries. */
function configuredAdapterIds(integrations: IntegrationsConfig): string[] {
  const ids = (integrations.channels ?? [])
    .map((channel) => channel.adapter)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  if (integrations.crm?.adapter) ids.push(integrations.crm.adapter);
  return [...new Set(ids)];
}

export async function runIntegrationConfigValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const integrations = await loadIntegrations(appDir);
  if (!integrations) {
    return passResult(
      "integration.config.validate",
      "integration.config.validate: skipped (no integrations block — channels self-enable by secret)",
    );
  }

  const violations: string[] = [];
  for (const channel of integrations.channels ?? []) {
    if (!channel.adapter) {
      violations.push("[missing-channel-adapter] a channels[] entry has no adapter id");
    } else if (!CHANNEL_ADAPTER_IDS.includes(channel.adapter)) {
      violations.push(
        `[unknown-channel-adapter] "${channel.adapter}" is not a known channel adapter ` +
          `(catalog: ${CHANNEL_ADAPTER_IDS.join(", ")})`,
      );
    }
  }
  if (integrations.crm) {
    if (!integrations.crm.adapter) {
      violations.push("[missing-crm-adapter] integrations.crm has no adapter id");
    } else if (!CRM_ADAPTER_IDS.includes(integrations.crm.adapter)) {
      violations.push(
        `[unknown-crm-adapter] "${integrations.crm.adapter}" is not a known CRM adapter ` +
          `(catalog: ${CRM_ADAPTER_IDS.join(", ")})`,
      );
    }
  }

  // RFC-0176: destination hub — kind/vendor/mode catalog + single-active-executor + inbound secret.
  const destinations = integrations.destinations ?? [];
  const activeExecutorsByTarget = new Map<string, number>();
  for (const dest of destinations) {
    if (!dest.kind || !DESTINATION_KINDS.includes(dest.kind as never)) {
      violations.push(
        `[unknown-destination-kind] "${dest.kind ?? "(none)"}" is not a known destination kind ` +
          `(catalog: ${DESTINATION_KINDS.join(", ")})`,
      );
      continue;
    }
    const mode = dest.mode ?? "gogol-adapter";
    if (!EXECUTION_MODES.includes(mode as never)) {
      violations.push(
        `[unknown-execution-mode] "${mode}" is not a known mode (catalog: ${EXECUTION_MODES.join(", ")})`,
      );
    }
    const vendorsForKind =
      DESTINATION_VENDORS_BY_KIND[dest.kind as keyof typeof DESTINATION_VENDORS_BY_KIND];
    // vendor-native may target a vendor with no gogol-adapter implementation;
    // gogol-adapter MUST resolve to a known adapter for the kind.
    if (mode === "gogol-adapter" && (!dest.vendor || !vendorsForKind?.includes(dest.vendor))) {
      violations.push(
        `[unknown-vendor-for-kind] kind "${dest.kind}" has no gogol-adapter for vendor ` +
          `"${dest.vendor ?? "(none)"}" (available: ${(vendorsForKind ?? []).join(", ") || "none"})`,
      );
    }
    const target = `${dest.kind}:${dest.vendor}`;
    activeExecutorsByTarget.set(target, (activeExecutorsByTarget.get(target) ?? 0) + 1);
  }
  for (const [target, count] of activeExecutorsByTarget) {
    if (count > 1) {
      violations.push(
        `[multiple-active-executors] ${count} destinations target "${target}" — at most one ` +
          `active executor per (kind, vendor) is allowed (double-write guard)`,
      );
    }
  }
  if ((integrations.inbound?.sources?.length ?? 0) > 0) {
    const envKeys = await loadEnvSchemaKeys(appDir);
    if (!envKeys || !envKeys.has(INBOUND_SECRET)) {
      violations.push(
        `[inbound-source-without-secret] an inbound source is enabled but "${INBOUND_SECRET}" is ` +
          `absent from the generated env schema (declare it via the inbound route's api[].secrets)`,
      );
    }
  }

  // RFC-0179: delivery-backbone placement — region/tier ∈ closed catalogs. Both
  // default in the schema, so an explicit value out of catalog is the only failure.
  if (
    integrations.region !== undefined &&
    !DELIVERY_REGIONS.includes(integrations.region as never)
  ) {
    violations.push(
      `[unknown-delivery-region] "${integrations.region}" is not a known delivery region ` +
        `(catalog: ${DELIVERY_REGIONS.join(", ")})`,
    );
  }
  if (integrations.tier !== undefined && !DELIVERY_TIERS.includes(integrations.tier as never)) {
    violations.push(
      `[unknown-delivery-tier] "${integrations.tier}" is not a known delivery tier ` +
        `(catalog: ${DELIVERY_TIERS.join(", ")})`,
    );
  }

  // RFC-0181: EU-resident delivery substrate. Only `upstash` is supported, and lead
  // PII must stay in the EU — a non-eu delivery region is a residency violation.
  if (integrations.delivery) {
    const provider = integrations.delivery.provider ?? "upstash";
    if (provider !== "upstash") {
      violations.push(
        `[delivery-provider-unknown] "${provider}" is not a supported delivery provider (catalog: upstash)`,
      );
    }
    const deliveryRegion = integrations.delivery.region ?? "eu";
    if (deliveryRegion !== "eu") {
      violations.push(
        `[delivery-region-not-eu] delivery.region "${deliveryRegion}" breaks EU residency — ` +
          `lead PII must stay in the EU (RFC-0181)`,
      );
    }
  }

  if (violations.length === 0) {
    const count = configuredAdapterIds(integrations).length + destinations.length;
    return passResult(
      "integration.config.validate",
      `integration.config.validate: OK — ${count} configured adapter(s)/destination(s) resolve to the catalog`,
    );
  }
  return resultFromViolations("integration.config.validate", violations);
}

/** Parse the declared env secret keys from the GENERATED env schema (RFC-0149). */
async function loadEnvSchemaKeys(appDir: string): Promise<Set<string> | null> {
  const path = join(appDir, "src", "env.schema.generated.mjs");
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return null;
  }
  const keys = new Set<string>();
  // Each field is rendered as `  KEY: envField.string(...)` (api.routes.generate).
  const re = /^\s*([A-Z][A-Z0-9_]*)\s*:\s*envField\./gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) keys.add(match[1]);
  return keys;
}

export async function runIntegrationSecretsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const integrations = await loadIntegrations(appDir);
  if (!integrations) {
    return passResult(
      "integration.secrets.validate",
      "integration.secrets.validate: skipped (no integrations block)",
    );
  }

  const envKeys = await loadEnvSchemaKeys(appDir);
  if (envKeys === null) {
    return resultFromViolations("integration.secrets.validate", [
      "[missing-env-schema] src/env.schema.generated.mjs not found — run api.routes.generate " +
        "before validating integration secrets",
    ]);
  }

  const violations: string[] = [];
  for (const adapter of configuredAdapterIds(integrations)) {
    const required = INTEGRATION_ADAPTER_SECRETS[adapter];
    if (!required) continue; // unknown ids are reported by integration.config.validate
    for (const secret of required) {
      if (!envKeys.has(secret)) {
        violations.push(
          `[missing-secret] adapter "${adapter}" requires "${secret}", which is absent from ` +
            `the generated env schema (the send-message section must declare it via api[].secrets)`,
        );
      }
    }
  }

  // RFC-0176: gogol-adapter destinations require their secrets; vendor-native need none.
  for (const dest of integrations.destinations ?? []) {
    if ((dest.mode ?? "gogol-adapter") !== "gogol-adapter") continue;
    const required = DESTINATION_ADAPTER_SECRETS[`${dest.kind}:${dest.vendor}`];
    if (!required) continue; // unknown (kind,vendor) reported by integration.config.validate
    for (const secret of required) {
      if (!envKeys.has(secret)) {
        violations.push(
          `[missing-secret] destination "${dest.kind}:${dest.vendor}" (gogol-adapter) requires ` +
            `"${secret}", which is absent from the generated env schema`,
        );
      }
    }
  }

  // RFC-0176: inbound source requires the webhook auth secret.
  if ((integrations.inbound?.sources?.length ?? 0) > 0 && !envKeys.has(INBOUND_SECRET)) {
    violations.push(
      `[missing-secret] inbound source enabled but "${INBOUND_SECRET}" is absent from the ` +
        `generated env schema`,
    );
  }

  if (violations.length === 0) {
    return passResult(
      "integration.secrets.validate",
      "integration.secrets.validate: OK — every configured adapter's secrets are declared",
    );
  }
  return resultFromViolations("integration.secrets.validate", violations);
}

/** Every secret name across the closed adapter catalog. */
const ALL_INTEGRATION_SECRET_KEYS: readonly string[] = [
  ...new Set(Object.values(INTEGRATION_ADAPTER_SECRETS).flat()),
];

/**
 * Parse `KEY=VALUE` lines from an app's `.env`, keeping only the integration
 * keys we audit. Values are read for presence only — never logged or returned.
 */
async function loadEnvValues(appDir: string): Promise<IntegrationSecrets | null> {
  let raw: string;
  try {
    raw = await readFile(join(appDir, ".env"), "utf-8");
  } catch {
    return null;
  }
  const wanted = new Set(ALL_INTEGRATION_SECRET_KEYS);
  const values: IntegrationSecrets = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!wanted.has(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (value) values[key] = value;
  }
  return values;
}

/**
 * RFC-0168 (part 2) — gentle, NON-FAILING advisory: reports which Integration
 * Port channels/CRM are live vs dormant for this app, reading actual values from
 * `.env` (presence only, never logged). When the app declares an `integrations:`
 * block, the audit is scoped to those intended adapters; otherwise it lists the
 * channels a wired send-message section could enable. Always passes — a dormant
 * channel is a valid configuration (the lead form falls back to a mailto link).
 */
export async function runIntegrationSecretsAudit(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;

  const envKeys = await loadEnvSchemaKeys(appDir);
  const wiresIntegration =
    envKeys !== null && ALL_INTEGRATION_SECRET_KEYS.some((key) => envKeys.has(key));
  const integrations = await loadIntegrations(appDir);
  if (!wiresIntegration && !integrations) {
    return passResult(
      "integration.secrets.audit",
      "integration.secrets.audit: skipped (no channel-backed sections wired)",
    );
  }

  const envValues = await loadEnvValues(appDir);
  if (envValues === null) {
    return passResult(
      "integration.secrets.audit",
      "integration.secrets.audit: no .env found — all channels dormant (leads fall back to " +
        "the mailto link). Copy .env.example to .env to enable delivery.",
    );
  }

  const secrets = envValues;
  const ids = integrations
    ? {
        channels: [
          ...new Set(
            (integrations.channels ?? [])
              .map((channel) => channel.adapter)
              .filter((id): id is string => typeof id === "string" && id.length > 0),
          ),
        ],
        crm: integrations.crm?.adapter ? [integrations.crm.adapter] : [],
      }
    : undefined;
  const readiness = auditIntegrationReadiness(secrets, ids).filter((a) => a.id !== "null");

  const live = readiness.filter((a) => a.ready);
  const dormant = readiness.filter((a) => !a.ready);
  const scope = integrations ? "configured" : "available";
  const dormantHint =
    dormant.length > 0
      ? ` Dormant: ${dormant.map((a) => `${a.id} (set ${a.missing.join(", ")})`).join("; ")}.`
      : "";
  return passResult(
    "integration.secrets.audit",
    `integration.secrets.audit: ${live.length} live, ${dormant.length} dormant ` +
      `(of ${readiness.length} ${scope}).${dormantHint}` +
      (dormant.length > 0
        ? " Dormant channels fall back to the mailto link — see .env.example."
        : ""),
  );
}
