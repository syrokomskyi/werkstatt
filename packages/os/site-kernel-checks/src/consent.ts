/*
<MODULE_CONTRACT>
<purpose>RFC-0177: enforce the consent-gated storage & third-party-script policy.
consent.activation.validate (postbuild) fails if a configured chat widget vendor's origin appears as
a script/iframe/preconnect in rendered dist HTML before activation — the click-to-load guarantee.
legal.processors.validate (author) fails if a configured chat widget or external destination lacks a
processor/recipient disclosure + a DPA reference in the Datenschutz/Privacy Policy prose.</purpose>
<non-goals>
  <item>Do not parse or store visitor PII — these are config/markup guards only.</item>
  <item>No-op pass when no chat widget / external destination is configured.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0177: initial implementation.</item>
  <item>Architecture review: replaced hardcoded CHAT_VENDOR_ORIGINS map with chatAdapterVendorOrigins from @warpgogol/chat.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { readFile, readdir } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import { passResult, resultFromViolations } from "./result-helpers.ts";
import { collectFiles } from "@warpgogol/share/fs";
import { chatAdapterVendorOrigins } from "@warpgogol/chat";
import {
  runPrivacyConsentComplianceInstrument,
  type PrivacyConsentState,
  toDeterministicContext,
} from "@syrokomskyi/axiom-study";

interface IntegrationsConfig {
  chat?: { adapter?: string; options?: Record<string, string> };
  destinations?: Array<{ kind?: string; vendor?: string; mode?: string }>;
}

interface GrowthConfig {
  vendor?: { adapter?: string; options?: Record<string, string> };
}

/** Vendor display tokens that must appear in the Datenschutz disclosure. */
const VENDOR_DISCLOSURE_TOKENS: Record<string, string> = {
  matomo: "matomo",
  innocraft: "innocraft",
  uchat: "uchat",
  pipedrive: "pipedrive",
  "supabase-buffer": "supabase",
};

/** DPA markers accepted as evidence the studio↔client processor relationship is disclosed. */
const DPA_MARKERS = [
  "auftragsverarbeitung",
  "auftragsverarbeiter",
  "avv",
  "dpa",
  "data processing",
];

async function loadIntegrations(appDir: string): Promise<IntegrationsConfig | null> {
  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const integrations = (manifest as unknown as { integrations?: IntegrationsConfig }).integrations;
  return integrations ?? null;
}

async function loadGrowth(appDir: string): Promise<GrowthConfig | null> {
  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const growth = (manifest as unknown as { growth?: GrowthConfig }).growth;
  return growth ?? null;
}

function activeChatAdapter(integrations: IntegrationsConfig | null): string | null {
  const adapter = integrations?.chat?.adapter;
  return adapter && adapter !== "null" ? adapter : null;
}

// ---------------------------------------------------------------------------
// consent.activation.validate (postbuild)
// ---------------------------------------------------------------------------

export async function runConsentActivationValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const integrations = await loadIntegrations(appDir);
  const adapter = activeChatAdapter(integrations);
  if (!adapter) {
    return passResult(
      "consent.activation.validate",
      "consent.activation.validate: skipped (no active chat widget configured)",
    );
  }
  const origins = chatAdapterVendorOrigins(adapter);
  if (origins.length === 0) {
    return passResult(
      "consent.activation.validate",
      `consent.activation.validate: skipped (no known origins for adapter "${adapter}")`,
    );
  }

  // Pre-activation invariant: the vendor origin must not appear as a loaded
  // resource (script src / iframe src / preconnect|dns-prefetch) in server HTML.
  const originAlt = origins.map((o) => o.replace(/[.]/g, "\\.")).join("|");
  const loadedResourceRe = new RegExp(
    `(?:src|href)\\s*=\\s*["'][^"']*(?:${originAlt})|rel\\s*=\\s*["'](?:preconnect|dns-prefetch)["'][^>]*(?:${originAlt})`,
    "i",
  );

  const distDir = join(appDir, "dist");
  const violations: string[] = [];
  const htmlFiles = await collectFiles(distDir, { extensions: [".html"], ignore: () => false });
  for (const abs of htmlFiles) {
    const html = await readFile(abs, "utf8");
    const match = html.match(loadedResourceRe);
    if (match) {
      violations.push(
        `[third-party-before-activation] ${abs}: loads "${match[0].slice(0, 80)}" before user ` +
          `activation — the chat widget must be click-to-load (RFC-0175/0177)`,
      );
    }
  }

  // RFC-0016: call axiom-study privacy-consent instrument
  let instrumentRunId: string | undefined;
  if (htmlFiles.length > 0) {
    try {
      const instrumentCtx = toDeterministicContext({
        origin: "build-time",
        recordedAt: new Date().toISOString(),
        auditId: "consent.activation.validate",
        environment: {},
      });
      const states: PrivacyConsentState[] = htmlFiles.map((abs) => {
        const relPath = relative(appDir, abs).replace(/\\/g, "/");
        return {
          url: `https://build.local/${relPath}`,
          locale: "de",
          profileId: adapter ?? "site",
          logicalPath: relPath,
          hasConsentBanner: true,
          thirdPartyRequestsBeforeConsent: violations
            .filter((v) => v.includes(abs))
            .map(() => ({ domain: origins[0] ?? "unknown", type: "resource" })),
          blockingScriptsBeforeConsent: [],
        };
      });
      const instrumentResult = runPrivacyConsentComplianceInstrument({
        context: instrumentCtx,
        states,
      });
      instrumentRunId = instrumentResult.instrumentRun.instrumentRunId;
    } catch {
      // Instrument failure must not break the gate
    }
  }

  const baseResult =
    violations.length === 0
      ? passResult(
          "consent.activation.validate",
          `consent.activation.validate: ok (no pre-activation ${adapter} origin in dist)`,
        )
      : resultFromViolations("consent.activation.validate", violations);

  if (instrumentRunId && baseResult.data) {
    (baseResult.data as unknown as Record<string, unknown>).instrumentRunId = instrumentRunId;
  }

  return baseResult;
}

// ---------------------------------------------------------------------------
// legal.processors.validate (author)
// ---------------------------------------------------------------------------

/** Collect Datenschutz / privacy-policy prose text across locales (lowercased). */
async function loadDisclosureText(appDir: string): Promise<string> {
  const proseDir = join(appDir, "src", "content", "prose");
  let texts: string[] = [];
  let langs: import("node:fs").Dirent[];
  try {
    langs = await readdir(proseDir, { withFileTypes: true });
  } catch {
    return "";
  }
  for (const lang of langs) {
    if (!lang.isDirectory()) continue;
    for (const name of ["datenschutz.md", "privacy-policy.md"]) {
      try {
        texts.push(await readFile(join(proseDir, lang.name, name), "utf8"));
      } catch {
        /* absent — fine */
      }
    }
  }
  return texts.join("\n").toLowerCase();
}

export async function runLegalProcessorsValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const integrations = await loadIntegrations(appDir);
  const growth = await loadGrowth(appDir);

  // Vendors that require disclosure: an active chat widget + any configured destination
  // (RFC-0176). The legacy RFC-0168 channels/crm block stays out of scope here.
  const vendors = new Set<string>();
  const chatAdapter = activeChatAdapter(integrations);
  if (chatAdapter) vendors.add(chatAdapter);
  for (const dest of integrations?.destinations ?? []) {
    if (dest.vendor) vendors.add(dest.vendor);
  }
  if (growth?.vendor?.adapter === "matomo") {
    vendors.add("matomo");
    vendors.add("innocraft");
  }

  if (vendors.size === 0) {
    return passResult(
      "legal.processors.validate",
      "legal.processors.validate: skipped (no chat widget / external destination configured)",
    );
  }

  const disclosure = await loadDisclosureText(appDir);
  const violations: string[] = [];
  for (const vendor of vendors) {
    const token = VENDOR_DISCLOSURE_TOKENS[vendor] ?? vendor;
    if (!disclosure.includes(token.toLowerCase())) {
      violations.push(
        `[missing-processor-disclosure] "${vendor}" is configured but not named in the ` +
          `Datenschutz/Privacy Policy (processor + recipients disclosure required, RFC-0177)`,
      );
    }
  }
  if (!DPA_MARKERS.some((m) => disclosure.includes(m))) {
    violations.push(
      `[missing-dpa-reference] no studio↔client DPA reference found in the Datenschutz ` +
        `(e.g. "Auftragsverarbeitung"/"AVV"/"DPA") — required when PII transits the site (RFC-0177)`,
    );
  }

  return violations.length === 0
    ? passResult(
        "legal.processors.validate",
        `legal.processors.validate: ok (${vendors.size} vendor(s) disclosed + DPA reference present)`,
      )
    : resultFromViolations("legal.processors.validate", violations);
}
