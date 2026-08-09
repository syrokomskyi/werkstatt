/*
<MODULE_CONTRACT>
<purpose>RFC-0191: static governance for the Stripe billing wiring. billing.config.validate asserts
that when Stripe is a funnel source, the inbound webhook source and a CRM destination are configured
(so lifecycle events reach Lagebild) — and never Make.com. billing.secrets.validate asserts the
Stripe secrets are declared in the generated env schema (names only). Both no-op pass when billing is
not configured. Node-safe: read disk only — no astro:env, no Stripe SDK.</purpose>
<non-goals>
  <item>Do not call Stripe or resolve prices — configuration guards only.</item>
  <item>Do not read secret VALUES — names only, from the generated env schema.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0191: initial billing config + secrets validators.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import { passResult, resultFromViolations } from "./result-helpers.ts";

interface IntegrationsConfig {
  crm?: { adapter?: string };
  inbound?: { sources?: string[] };
  destinations?: Array<{ kind?: string; vendor?: string; mode?: string }>;
  funnel?: { version?: string; sources?: string[]; enabled?: boolean };
}

/** The Stripe secrets the billing adapter requires (RFC-0191). */
const STRIPE_SECRETS = ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] as const;

/**
 * The price-role registry the lifecycle layer classifies invoices against (spec §08).
 * These must be declared in the generated env schema when Stripe billing is configured so
 * `invoice_kind` inference and the change/setup/cycle flows can resolve a price's role.
 */
const PRICE_ROLE_KEYS = [
  "STRIPE_PRICE_BASE_MONTHLY",
  "STRIPE_PRICE_BASE_YEARLY",
  "STRIPE_PRICE_SETUP",
  "STRIPE_PRICE_CHANGE",
] as const;

async function loadIntegrations(appDir: string): Promise<IntegrationsConfig | null> {
  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const integrations = (manifest as unknown as { integrations?: IntegrationsConfig }).integrations;
  return integrations ?? null;
}

/** True when Stripe is a declared funnel source (billing is intended). */
function billingIntended(integrations: IntegrationsConfig | null): boolean {
  return (integrations?.funnel?.sources ?? []).includes("stripe");
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
  const re = /^\s*([A-Z][A-Z0-9_]*)\s*:\s*envField\./gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) keys.add(match[1]);
  return keys;
}

export async function runBillingConfigValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const integrations = await loadIntegrations(appDir);
  if (!billingIntended(integrations)) {
    return passResult(
      "billing.config.validate",
      "billing.config.validate: skipped (Stripe is not a configured funnel source)",
    );
  }

  const violations: string[] = [];

  // The Stripe webhook must be an inbound source so payment/lifecycle events can arrive.
  const inboundSources = integrations?.inbound?.sources ?? [];
  if (!inboundSources.includes("stripe")) {
    violations.push(
      `[stripe-source-without-inbound] Stripe is a funnel source but "stripe" is not in ` +
        `integrations.inbound.sources — the Stripe webhook cannot be received (RFC-0191).`,
    );
  }

  // Lifecycle events must reach Lagebild → a CRM destination is required.
  const hasCrmDestination = (integrations?.destinations ?? []).some((d) => d.kind === "crm");
  if (!hasCrmDestination) {
    violations.push(
      `[billing-without-crm-destination] Stripe billing needs a CRM destination so subscription/` +
        `invoice state reaches Lagebild — none configured (RFC-0191/0186).`,
    );
  }

  // The price-role registry must be declared so invoice_kind classification can resolve
  // (spec §08). Absent env schema is reported by billing.secrets.validate.
  const envKeys = await loadEnvSchemaKeys(appDir);
  if (envKeys) {
    for (const key of PRICE_ROLE_KEYS) {
      if (!envKeys.has(key)) {
        violations.push(
          `[missing-price-role] Stripe billing needs the price-role id "${key}" in the generated ` +
            `env schema for invoice_kind classification (spec §08 / RFC-0191).`,
        );
      }
    }
  }

  if (violations.length === 0) {
    return passResult(
      "billing.config.validate",
      "billing.config.validate: OK — Stripe inbound source, CRM destination, and price-role ids configured",
    );
  }
  return resultFromViolations("billing.config.validate", violations);
}

export async function runBillingSecretsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const integrations = await loadIntegrations(appDir);
  if (!billingIntended(integrations)) {
    return passResult(
      "billing.secrets.validate",
      "billing.secrets.validate: skipped (Stripe is not a configured funnel source)",
    );
  }

  const envKeys = await loadEnvSchemaKeys(appDir);
  if (envKeys === null) {
    return resultFromViolations("billing.secrets.validate", [
      "[missing-env-schema] src/env.schema.generated.mjs not found — run api.routes.generate " +
        "before validating billing secrets",
    ]);
  }

  const violations: string[] = [];
  for (const secret of STRIPE_SECRETS) {
    if (!envKeys.has(secret)) {
      violations.push(
        `[missing-secret] Stripe billing requires "${secret}", which is absent from the generated ` +
          `env schema (declare it via the stripe-webhook route's api[].secrets) (RFC-0191).`,
      );
    }
  }

  if (violations.length === 0) {
    return passResult(
      "billing.secrets.validate",
      "billing.secrets.validate: OK — Stripe secrets are declared in the env schema",
    );
  }
  return resultFromViolations("billing.secrets.validate", violations);
}
