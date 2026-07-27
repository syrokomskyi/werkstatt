/*
<MODULE_CONTRACT>
<purpose>RFC-0168 (Session C): generate apps/<id>/.env.example from the app's GENERATED env schema
(src/env.schema.generated.mjs — the canonical secret union written by api.routes.generate), plus
STRIPE_SECRET_KEY when the app participates in entitlements (RFC-0169). Comments are grouped per
Integration Port adapter (single source of truth: @warpgogol/share/integration) and personalized for
the concrete site (its domain). env.example.validate guards that every value stays EMPTY, so a real
secret can never leak into the repo through the tracked example file.</purpose>
<non-goals>
  <item>Do not read or write real secret values — the example holds keys with empty values only.</item>
  <item>Do not recompute the secret union — mirror the GENERATED env schema (single source).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0168 (Session C): initial implementation — generated, personalized, leak-guarded.</item>
  <item>RFC-0182: Add Cloudflare Regional Services API credentials block (CLOUDFLARE_API_TOKEN, CLOUDFLARE_ZONE_ID).</item>
  <item>RFC-0186: Add Lagebild CRM Buffer env block (SUPABASE_BUFFER_SERVICE_KEY, SUPABASE_BUFFER_URL, SUPABASE_BUFFER_TENANT_ID).</item>
  <item>RFC-0204: Add PUBLIC_IMAGE_PROVIDER=build-portable block for build-portable responsive image variants.</item>
  <item>RFC-0388: Add # How to obtain: per-key instructions. Change renderBlock to accept EnvKey[] with howToObtain field.</item>
  <item>RFC-0388: Add blank line between variables within a block for ENV-CONTRACT-06 compliance.</item>
  <item>Fix: HOW_TO_OBTAIN keys mismatched actual env var names (TELEGRAM_BOT_TOKEN vs INTEGRATION_TELEGRAM_BOT_TOKEN, etc.) — all integration keys fell back to generic "See project documentation" text. Keys now match the INTEGRATION_-prefixed env var names; Telegram instructions expanded with BotFather /token and getUpdates details.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import {
  CHANNEL_ADAPTERS,
  CRM_ADAPTERS,
  UPSTASH_QSTASH_SECRETS,
  UPSTASH_REDIS_SECRETS,
} from "@warpgogol/integration";
import { passResult, failResult, resultFromViolations } from "../result-helpers.ts";

const ENV_EXAMPLE = ".env.example";
const STRIPE_KEY = "STRIPE_SECRET_KEY";

/** Human presentation for each adapter group (doc comments only — not the contract). */
const ADAPTER_LABELS: Readonly<Record<string, string>> = {
  telegram:
    "Channel: Telegram — both required to enable delivery (bot via @BotFather; chat id = destination).",
  whatsapp:
    "Channel: WhatsApp Cloud API — all three required (TOKEN, sender PHONE_ID, recipient TO in E.164).",
  pipedrive:
    "CRM: Pipedrive — both required for the best-effort lead upsert (DOMAIN = the <domain> in https://<domain>.pipedrive.com).",
};

/** RFC-0181: email is sent via Cloudflare Email Routing (no API key) — config, not Resend. */
const EMAIL_ROUTING_KEYS = ["INTEGRATION_EMAIL_TO", "INTEGRATION_EMAIL_FROM"] as const;

/** RFC-0186: Lagebild CRM Buffer — Supabase tenant registry + per-site buffer secrets. */
const LAGEBILD_BUFFER_KEYS = [
  "SUPABASE_BUFFER_SERVICE_KEY",
  "SUPABASE_BUFFER_URL",
  "SUPABASE_BUFFER_TENANT_ID",
] as const;

/** Parse the declared secret KEYS from the GENERATED env schema (RFC-0149), in file order. */
async function loadEnvSchemaKeys(appDir: string): Promise<string[] | null> {
  const path = join(appDir, "src", "env.schema.generated.mjs");
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return null;
  }
  const keys: string[] = [];
  const re = /^\s*([A-Z][A-Z0-9_]*)\s*:\s*envField\./gm;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw)) !== null) keys.push(match[1]);
  return keys;
}

interface ManifestEntitlement {
  billing?: { stripeCustomerId?: string };
  entitlementsOverride?: unknown;
  identity?: { domain?: string; tagline?: string };
}

/** True when the app participates in entitlements at all (live billing or a dev override). */
function participatesInEntitlements(m: ManifestEntitlement): boolean {
  if (m.billing && typeof m.billing === "object") return true;
  return Array.isArray(m.entitlementsOverride);
}

interface EnvKey {
  key: string;
  howToObtain: string;
  defaultValue?: string;
}

const HOW_TO_OBTAIN: Readonly<Record<string, string>> = {
  STRIPE_SECRET_KEY: "Stripe Dashboard → Developers → API Keys → Secret key (sk_live_*).",
  STRIPE_WEBHOOK_SECRET:
    "Stripe Dashboard → Press W (Workbench) → Overview → Secret Key (whsec_*).",
  INTEGRATION_TELEGRAM_BOT_TOKEN:
    "Telegram → @BotFather → /newbot → copy the API token (format: 123456789:AA...). For existing bots: send /token to BotFather.",
  INTEGRATION_TELEGRAM_CHAT_ID:
    "Send any message to the bot, then open https://api.telegram.org/bot<TOKEN>/getUpdates → result[0].message.chat.id. For groups/channels: invite the bot, send a message, then check the same URL (channel chat IDs are negative, e.g. -1001234567890).",
  INTEGRATION_WHATSAPP_TOKEN: "Meta Business Suite → WhatsApp Manager → API tokens.",
  INTEGRATION_WHATSAPP_PHONE_ID: "Meta Business Suite → WhatsApp Manager → phone number ID.",
  INTEGRATION_WHATSAPP_TO: "Recipient phone number in E.164 format (e.g. 491701234567).",
  INTEGRATION_PIPEDRIVE_API_TOKEN:
    "Pipedrive → Settings → Personal Preferences → API → copy the API token. If the API tab is missing, ask an admin to enable API access permission.",
  INTEGRATION_PIPEDRIVE_DOMAIN:
    "The company domain in your Pipedrive URL: https://<domain>.pipedrive.com. Alternatively, query GET https://api.pipedrive.com/v1/users/me with x-api-token header → company_domain field.",
  INTEGRATION_EMAIL_TO: "Cloudflare Dashboard → Email Routing. TO: verified destination address.",
  INTEGRATION_EMAIL_FROM:
    "Cloudflare Dashboard → Email Routing. FROM: verified sender on zone domain.",
  INTEGRATION_INBOUND_SECRET:
    "Generate a random secret: openssl rand -hex 32. Used to verify QStash webhook signatures.",
  SUPABASE_BUFFER_URL: "Supabase Dashboard → Settings → General → Project URL.",
  SUPABASE_BUFFER_SERVICE_KEY: "Supabase Dashboard → Settings → API → service_role key.",
  SUPABASE_BUFFER_TENANT_ID: "Run: pnpm exec site-kernel run lagebild.tenant.add --site <name>.",
  UPSTASH_QSTASH_URL: "Upstash Console → QStash → EU Region → Overview → Quickstart → QSTASH_URL.",
  UPSTASH_QSTASH_TOKEN: "Upstash Console → QStash → COPY/DELETE tokens section.",
  UPSTASH_QSTASH_CURRENT_SIGNING_KEY: "Upstash Console → QStash → Settings → Current signing key.",
  UPSTASH_QSTASH_NEXT_SIGNING_KEY: "Upstash Console → QStash → Settings → Next signing key.",
  UPSTASH_REDIS_REST_URL: "Upstash Console → Redis → eu-central-1 → REST API section.",
  UPSTASH_REDIS_REST_TOKEN: "Upstash Console → Redis → eu-central-1 → REST API section.",
  CLOUDFLARE_ACCOUNT_ID: "Cloudflare Dashboard → Overview → API section (right sidebar).",
  CLOUDFLARE_READONLY_API_TOKEN:
    "Cloudflare Dashboard → My Profile → API Tokens → Create Custom Token with Zone:Read.",
  CLOUDFLARE_API_TOKEN:
    "Cloudflare Dashboard → My Profile → API Tokens. Prefer CLOUDFLARE_READONLY_API_TOKEN (least-privilege).",
  CLOUDFLARE_ZONE_ID:
    "Cloudflare Dashboard → Domains Overview → click any domain → right-hand sidebar → API section → Zone ID.",
  PUBLIC_IMAGE_PROVIDER: 'Set to "build-portable" to enable; leave empty for raw origin assets.',
};

function withHowToObtain(keys: readonly string[]): EnvKey[] {
  return keys.map((k) => ({
    key: k,
    howToObtain: HOW_TO_OBTAIN[k] ?? "See project documentation or ask the operator.",
  }));
}

function renderBlock(title: string, keys: EnvKey[]): string {
  const keyLines = keys
    .map((k) => `# How to obtain: ${k.howToObtain}\n${k.key}=${k.defaultValue ?? ""}`)
    .join("\n\n");
  return `# ── ${title}\n${keyLines}\n`;
}

/** Render the full .env.example body, grouping schema keys per adapter, Stripe first. */
function renderEnvExample(opts: {
  site: string;
  domain: string | undefined;
  schemaKeys: string[];
  includeStripe: boolean;
}): string {
  const site = opts.domain ? opts.domain : opts.site;
  const remaining = new Set(opts.schemaKeys);
  const blocks: string[] = [];

  if (opts.includeStripe) {
    remaining.delete(STRIPE_KEY);
    blocks.push(
      renderBlock(
        "Entitlements — Stripe (RFC-0169). Build-time only; never shipped to the client.\n" +
          "# Resolves the paid-feature set from the Stripe Entitlements API. Leave empty in dev/CI\n" +
          "# and use entitlementsOverride in system.md; a configured billing.stripeCustomerId WITHOUT\n" +
          "# this key fails closed. Mirror the catalog as Stripe Features with these lookup keys:\n" +
          "#   feature_blog · feature_integrations_channels · feature_integrations_crm · feature_analytics",
        withHowToObtain([STRIPE_KEY]),
      ),
    );
  }

  for (const adapter of [...CHANNEL_ADAPTERS, ...CRM_ADAPTERS]) {
    const keys = adapter.requiredSecrets.filter((k) => remaining.has(k));
    if (keys.length === 0) continue;
    for (const k of keys) remaining.delete(k);
    blocks.push(
      renderBlock(ADAPTER_LABELS[adapter.id] ?? `Adapter: ${adapter.id}`, withHowToObtain(keys)),
    );
  }

  // The Upstash delivery + Cloudflare email secrets are owned by dedicated blocks below
  // — drop them from the schema-derived leftover so they are not listed twice (RFC-0181).
  for (const k of [...UPSTASH_QSTASH_SECRETS, ...UPSTASH_REDIS_SECRETS, ...EMAIL_ROUTING_KEYS]) {
    remaining.delete(k);
  }

  // Email via Cloudflare Email Routing — emitted when the site wires the delivery callback.
  const emailKeys = EMAIL_ROUTING_KEYS.filter((k) => opts.schemaKeys.includes(k));
  if (emailKeys.length > 0) {
    blocks.push(
      renderBlock(
        "Email via Cloudflare Email Routing (RFC-0181). No API key — the send_email Worker binding\n" +
          "# authorizes sending. FROM must be a verified sender on the zone domain; TO a verified\n" +
          "# destination address. Enable Email Routing on the zone first.",
        withHowToObtain([...emailKeys]),
      ),
    );
  }

  // RFC-0186: Lagebild CRM Buffer — emitted when the site wires Supabase buffer.
  const lagebildKeys = LAGEBILD_BUFFER_KEYS.filter((k) => remaining.has(k));
  if (lagebildKeys.length > 0) {
    for (const k of lagebildKeys) remaining.delete(k);
    blocks.push(
      renderBlock(
        "Lagebild CRM Buffer — Supabase (RFC-0186). Site writes leads to buffer;\n" +
          "# the shared sync worker (services/lagebild-sync-worker) processes them.\n" +
          "# SUPABASE_BUFFER_SERVICE_KEY: service_role key for buffer_outbox writes.\n" +
          "# SUPABASE_BUFFER_URL: Supabase project REST URL.\n" +
          "#   (If not shown in console: https://<project-id>.supabase.co from Settings → General)\n" +
          "# SUPABASE_BUFFER_TENANT_ID: UUID of this site in sync_tenants registry (for RLS isolation).",
        withHowToObtain([...lagebildKeys]),
      ),
    );
  }

  // Any secret not owned by a known adapter — still document it, just generically.
  const leftover = opts.schemaKeys.filter((k) => remaining.has(k));
  if (leftover.length > 0) {
    blocks.push(renderBlock("Other section secrets", withHowToObtain(leftover)));
  }

  // RFC-0181: EU-resident delivery substrate (Upstash). Generator-owned (not schema-
  // derived) so every site ships ready to plug in EU delivery. Lead PII stays in the
  // EU: QStash + Redis must be the eu-central-1 endpoints. Keys stay empty here.
  blocks.push(
    renderBlock(
      "QStash — Queue as a Service by Upstash (RFC-0181). EU region only " +
        "(UPSTASH_QSTASH_URL must be https://qstash-eu-central-1.upstash.io). Reliable lead\n" +
        "# delivery (retries + DLQ + dedup); signing keys verify the inbound webhook.",
      withHowToObtain([...UPSTASH_QSTASH_SECRETS]),
    ),
  );
  blocks.push(
    renderBlock(
      "Redis — Key-Value store by Upstash (RFC-0181). EU region only (the REST URL must be the\n" +
        "# eu-central-1 endpoint). Durable idempotency ledger (SET NX on eventId) — holds no PII.",
      withHowToObtain([...UPSTASH_REDIS_SECRETS]),
    ),
  );

  // RFC-0182: Cloudflare Regional Services validation (optional). Only required when
  // deployment.cloudflare.regionalServices.allowedZones is non-empty in system.md.
  // These credentials query the Cloudflare API to verify hostname regionalization.
  //
  // TOKEN SETUP (Cloudflare Dashboard → My Profile → API Tokens):
  //   1. Create a custom token named "Regional Services Read-only"
  //   2. Permissions:
  //      - Zone:Read (to list zones and read zone settings)
  //      - Regional Services:Read (to read regional hostname configuration)
  //   3. Zone Resources: Include — Specific zone — <your-domain> (e.g., warpgogol.com)
  //   4. Copy the generated token to CLOUDFLARE_READONLY_API_TOKEN
  //
  // ZONE_ID: Find in Cloudflare Dashboard → Overview → right sidebar "API" section.
  //
  // CLOUDFLARE_API_TOKEN is kept for backward compatibility; prefer CLOUDFLARE_READONLY_API_TOKEN
  // for the validation command (least-privilege principle).
  blocks.push(
    renderBlock(
      "Cloudflare Regional Services validation (RFC-0182). Optional — only required when\n" +
        "# system.md declares non-empty deployment.cloudflare.regionalServices.allowedZones.\n" +
        "#\n" +
        "# TOKEN CREATION (Cloudflare Dashboard → My Profile → API Tokens):\n" +
        '#   1. Create Custom Token: name it "Regional Services Read-only"\n' +
        "#   2. Permissions: Zone:Read (covers the regional hostnames API endpoint)\n" +
        '#      Enterprise/Data Localization Suite plans may also show "Data Localization Suite:Read"\n' +
        "#   3. Zone Resources: Include → Specific zone → your domain (e.g., warpgogol.com)\n" +
        "#   4. Copy token to CLOUDFLARE_READONLY_API_TOKEN below\n" +
        "#\n" +
        "# ACCOUNT_ID & ZONE_ID: Cloudflare Dashboard → Overview → API section (right sidebar).\n" +
        "#   Account ID is at the top; Zone ID is below it for the selected domain.\n" +
        "# Prefer CLOUDFLARE_READONLY_API_TOKEN over CLOUDFLARE_API_TOKEN (least-privilege).",
      withHowToObtain([
        "CLOUDFLARE_ACCOUNT_ID",
        "CLOUDFLARE_READONLY_API_TOKEN",
        "CLOUDFLARE_API_TOKEN",
        "CLOUDFLARE_ZONE_ID",
      ]),
    ),
  );

  // RFC-0204: Build-portable responsive image variants (not a runtime secret — build-time toggle).
  // Default to build-portable so all sites generate responsive variants without Cloudflare.
  blocks.push(
    renderBlock(
      "Responsive image variants (RFC-0204). Build-portable emits real srcset from\n" +
        "# pre-generated static width variants; no Cloudflare Image Transformations required.\n" +
        '# Default is "build-portable"; set empty to fall back to raw origin assets.',
      [
        {
          key: "PUBLIC_IMAGE_PROVIDER",
          howToObtain: HOW_TO_OBTAIN["PUBLIC_IMAGE_PROVIDER"] ?? "See project documentation.",
          defaultValue: "build-portable",
        },
      ],
    ),
  );

  const header =
    `# ${site} — runtime & build secrets. Copy to .env and fill the keys you need.\n` +
    `# Every key is OPTIONAL: a section degrades gracefully when its\n` +
    `# key is absent (the send-message form falls back to a mailto link). sites-check prints a gentle\n` +
    `# notice (integration.secrets.audit) listing live vs dormant channels — it never blocks a build.\n` +
    `#\n` +
    `# Never commit .env. The values here MUST stay empty (env.example.validate enforces it).\n` +
    `# Every key includes a "# How to obtain:" line with concrete instructions (RFC-0388).\n`;

  if (blocks.length === 0) {
    return `${header}#\n# This site wires no runtime secrets — nothing to configure.\n`;
  }
  return `${header}\n${blocks.join("\n")}`;
}

export async function runEnvExampleGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const paths = requireAstroSitePaths(context);
  const appDir = paths.appDirectory;

  const schemaKeys = (await loadEnvSchemaKeys(appDir)) ?? [];
  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const m = manifest as unknown as ManifestEntitlement;
  const includeStripe = participatesInEntitlements(m);
  const domain = m.identity?.domain?.trim();

  const content = renderEnvExample({
    site: context.site?.name ?? "site",
    domain,
    schemaKeys,
    includeStripe,
  });

  const target = join(appDir, ENV_EXAMPLE);
  if (existsSync(target)) {
    const existing = await readFile(target, "utf-8");
    if (existing === content) {
      return passResult("env.example.generate", "env.example.generate: up to date");
    }
  }
  if (!context.dryRun) {
    await mkdir(appDir, { recursive: true });
    await writeFile(target, content, "utf-8");
  }
  const keyCount = schemaKeys.length + (includeStripe ? 1 : 0);
  return passResult(
    "env.example.generate",
    `env.example.generate: ${keyCount} key(s) → .env.example${includeStripe ? " (incl. Stripe)" : ""}`,
  );
}

export async function runEnvExampleValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const target = join(appDir, ENV_EXAMPLE);
  let raw: string;
  try {
    raw = await readFile(target, "utf-8");
  } catch {
    return passResult(
      "env.example.validate",
      "env.example.validate: skipped (no .env.example; run env.example.generate)",
    );
  }

  const violations: string[] = [];
  const nonSecretDefaults = new Set(["PUBLIC_IMAGE_PROVIDER"]);
  raw.split(/\r?\n/).forEach((line, i) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (value.length > 0 && !nonSecretDefaults.has(key)) {
      violations.push(
        `[non-empty-value] line ${i + 1}: "${key}" has a value — .env.example must hold empty ` +
          `keys only so a real secret never leaks into the repo. Move the value to .env.`,
      );
    }
  });

  if (violations.length > 0) return failResult("env.example.validate", violations);
  return resultFromViolations("env.example.validate", violations);
}
