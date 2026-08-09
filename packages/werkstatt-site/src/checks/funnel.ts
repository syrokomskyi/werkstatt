/*
<MODULE_CONTRACT>
<purpose>RFC-0188: static governance for the Visitor Sales Funnel. The PLATFORM owns the funnel
stage/event/transition graph (@warpgogol/werkstatt-site/share/integration); these validators guard that the app's
funnel configuration and localized copy stay aligned with it, that no legacy UChat stage string or
Make.com reference leaks back into the funnel path, and that the canonical transition graph itself
stays self-consistent (no stranded stage). Node-safe: read disk + pure contracts only — no astro:env,
no vendor SDK, no network.</purpose>
<non-goals>
  <item>Do not run the funnel or call UChat/Stripe/Pipedrive — configuration + content guards only.</item>
  <item>Do not require the funnel: absent funnel block/content ⇒ no-op pass (pilot not yet enabled).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0188 Phase 2 (contract): initial funnel validators.</item>
</CHANGE_SUMMARY>
*/

import { basename, join, relative } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { requireAstroSitePaths } from "@warpgogol/werkstatt-site/paths";
import { loadSystemManifest } from "@warpgogol/werkstatt-site/content";
import {
  FUNNEL_TERMINAL_STAGES,
  FUNNEL_TRANSITION_TRIGGERS,
  FUNNEL_TRANSITIONS,
  FUNNEL_VERSION,
  LEGACY_FUNNEL_STAGES,
  VISITOR_FUNNEL_SOURCES,
  VISITOR_FUNNEL_STAGES,
  isValidFunnelStage,
  reachableStages,
  scanForMakeComReferences,
} from "@warpgogol/werkstatt-site/integration";
import { passResult, resultFromViolations } from "./result-helpers.ts";

interface FunnelConfig {
  version?: string;
  sources?: string[];
  enabled?: boolean;
}

interface IntegrationsConfig {
  crm?: { adapter?: string };
  inbound?: { sources?: string[] };
  destinations?: Array<{ kind?: string; vendor?: string; mode?: string }>;
  funnel?: FunnelConfig;
}

/** Read the `integrations:` block from system.md. Null when the app declares none. */
async function loadIntegrations(appDir: string): Promise<IntegrationsConfig | null> {
  const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
  const integrations = (manifest as unknown as { integrations?: IntegrationsConfig }).integrations;
  return integrations ?? null;
}

const FUNNEL_CONTENT_DIR = ["src", "content", "funnel"];

/** Recursively list files under `dir` (absolute paths). Empty when `dir` is absent. */
async function walkFiles(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(full)));
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// funnel.contract.validate
// ---------------------------------------------------------------------------

export async function runFunnelContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const integrations = await loadIntegrations(appDir);
  const funnel = integrations?.funnel;
  if (!funnel) {
    return passResult(
      "funnel.contract.validate",
      "funnel.contract.validate: skipped (no integrations.funnel block — pilot not enabled)",
    );
  }

  const violations: string[] = [];

  if (funnel.version && funnel.version !== FUNNEL_VERSION) {
    violations.push(
      `[unknown-funnel-version] configured funnel.version "${funnel.version}" does not match the ` +
        `platform contract version "${FUNNEL_VERSION}" — bump the app after a contract change`,
    );
  }

  for (const source of funnel.sources ?? []) {
    if (!VISITOR_FUNNEL_SOURCES.includes(source as never)) {
      violations.push(
        `[unknown-funnel-source] "${source}" is not an allowed funnel source ` +
          `(catalog: ${VISITOR_FUNNEL_SOURCES.join(", ")})`,
      );
    }
  }

  // Make.com is excluded from every funnel path, in any mode. Scan the funnel
  // content domain and any per-app funnel binding files for references.
  const funnelFiles = await walkFiles(join(appDir, ...FUNNEL_CONTENT_DIR));
  for (const file of funnelFiles) {
    const raw = await readFile(file, "utf-8").catch(() => "");
    for (const hit of scanForMakeComReferences(raw)) {
      violations.push(
        `[make-com-reference] ${relative(appDir, file)}:${hit.line} contains "${hit.match}" — ` +
          `Make.com is excluded from every funnel path (RFC-0188)`,
      );
    }
  }
  // The configured sources themselves must not name Make.com.
  for (const source of funnel.sources ?? []) {
    if (scanForMakeComReferences(source).length > 0) {
      violations.push(
        `[make-com-source] funnel source "${source}" names Make.com — excluded everywhere (RFC-0188)`,
      );
    }
  }

  if (violations.length === 0) {
    return passResult(
      "funnel.contract.validate",
      `funnel.contract.validate: OK — version ${funnel.version ?? FUNNEL_VERSION}, ` +
        `${(funnel.sources ?? []).length} source(s), zero Make.com references`,
    );
  }
  return resultFromViolations("funnel.contract.validate", violations);
}

// ---------------------------------------------------------------------------
// funnel.stage.validate
// ---------------------------------------------------------------------------

export async function runFunnelStageValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const violations: string[] = [];

  // 1) Canonical graph self-test (always runs — the graph is platform-owned).
  for (const [from, tos] of Object.entries(FUNNEL_TRANSITIONS)) {
    if (!isValidFunnelStage(from)) {
      violations.push(
        `[unknown-funnel-stage] transition source "${from}" is not a canonical stage`,
      );
    }
    for (const to of tos) {
      if (!isValidFunnelStage(to)) {
        violations.push(`[unknown-funnel-stage] "${from}" → "${to}" targets a non-canonical stage`);
      }
    }
  }
  for (const terminal of FUNNEL_TERMINAL_STAGES) {
    if ((FUNNEL_TRANSITIONS[terminal] ?? []).length > 0) {
      violations.push(
        `[terminal-stage-has-transition] terminal stage "${terminal}" must have no outbound transition`,
      );
    }
  }
  const reachable = reachableStages();
  for (const stage of VISITOR_FUNNEL_STAGES) {
    if (!reachable.has(stage)) {
      violations.push(
        `[unreachable-funnel-stage] "${stage}" is not reachable from the funnel entry — every ` +
          `canonical stage must be reachable so no visitor is stranded (RFC-0188)`,
      );
    }
  }

  // 2) Optional per-app stage mapping (src/content/funnel/uchat.stages.json) — every
  // referenced stage must be canonical and must not be a legacy UChat stage string.
  const mappingFile = join(appDir, ...FUNNEL_CONTENT_DIR, "uchat.stages.json");
  const rawMapping = await readFile(mappingFile, "utf-8").catch(() => null);
  if (rawMapping !== null) {
    let mapped: string[] = [];
    try {
      const parsed = JSON.parse(rawMapping) as unknown;
      mapped = Array.isArray(parsed)
        ? (parsed as string[])
        : Object.keys(parsed as Record<string, unknown>);
    } catch {
      violations.push(`[invalid-stage-mapping] ${relative(appDir, mappingFile)} is not valid JSON`);
    }
    for (const stage of mapped) {
      if (LEGACY_FUNNEL_STAGES.includes(stage)) {
        violations.push(
          `[legacy-funnel-stage] "${stage}" is a retired UChat stage name — not a canonical funnel ` +
            `stage (RFC-0188)`,
        );
      } else if (!isValidFunnelStage(stage)) {
        violations.push(
          `[unknown-funnel-stage] mapped stage "${stage}" is not in the canonical catalog`,
        );
      }
    }
  }

  // 3) Trigger completeness (RFC-0219): every stage with outbound transitions must
  //    appear in at least one FUNNEL_TRANSITION_TRIGGERS entry.
  const coveredFroms = new Set(FUNNEL_TRANSITION_TRIGGERS.map((e) => e.from));
  for (const stage of VISITOR_FUNNEL_STAGES) {
    if ((FUNNEL_TRANSITIONS[stage] ?? []).length > 0 && !coveredFroms.has(stage)) {
      violations.push(
        `[trigger-incomplete] stage "${stage}" has outbound transitions in FUNNEL_TRANSITIONS but no trigger in FUNNEL_TRANSITION_TRIGGERS (RFC-0219)`,
      );
    }
  }

  if (violations.length === 0) {
    return passResult(
      "funnel.stage.validate",
      `funnel.stage.validate: OK — ${VISITOR_FUNNEL_STAGES.length} canonical stages, all reachable, trigger overlay complete`,
    );
  }
  return resultFromViolations("funnel.stage.validate", violations);
}

// ---------------------------------------------------------------------------
// funnel.copy.validate
// ---------------------------------------------------------------------------

/** Locales that warpgogol-com must keep aligned (RFC-0188). */
const PILOT_REQUIRED_LOCALES: Readonly<Record<string, readonly string[]>> = {
  "warpgogol-com": ["de", "uk"],
};

/** Legacy tariff copy that must never appear in funnel content (RFC-0188). */
const LEGACY_TARIFF_PATTERNS: readonly RegExp[] = [
  /\b39\s*€/,
  /€\s*39\b/,
  /\b(?:Jährlich|Monatlich)\s*39\b/i,
];

export async function runFunnelCopyValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const siteName = basename(appDir);
  const funnelDir = join(appDir, ...FUNNEL_CONTENT_DIR);

  // Discover locale subdirectories.
  let localeDirs: string[];
  try {
    localeDirs = (await readdir(funnelDir, { withFileTypes: true }))
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch {
    return passResult(
      "funnel.copy.validate",
      "funnel.copy.validate: skipped (no src/content/funnel/ domain — pilot not enabled)",
    );
  }

  const violations: string[] = [];

  // Required locales (pilot parity).
  for (const required of PILOT_REQUIRED_LOCALES[siteName] ?? []) {
    if (!localeDirs.includes(required)) {
      violations.push(
        `[missing-funnel-locale] ${siteName} requires funnel copy for "${required}" — ` +
          `src/content/funnel/${required}/ is absent (RFC-0188 de/uk parity)`,
      );
    }
  }

  // Cross-locale file parity + legacy-tariff scan.
  const filesByLocale = new Map<string, Set<string>>();
  for (const locale of localeDirs) {
    const files = await walkFiles(join(funnelDir, locale));
    const rels = new Set<string>();
    for (const file of files) {
      rels.add(relative(join(funnelDir, locale), file).replace(/\\/g, "/"));
      const raw = await readFile(file, "utf-8").catch(() => "");
      for (const pattern of LEGACY_TARIFF_PATTERNS) {
        if (pattern.test(raw)) {
          violations.push(
            `[legacy-tariff-copy] ${relative(appDir, file)} contains the retired 39 € tariff — ` +
              `prices must derive from business.offer (RFC-0188)`,
          );
          break;
        }
      }
    }
    filesByLocale.set(locale, rels);
  }
  if (localeDirs.length > 1) {
    const union = new Set<string>();
    for (const set of filesByLocale.values()) for (const rel of set) union.add(rel);
    for (const locale of localeDirs) {
      const present = filesByLocale.get(locale)!;
      for (const rel of union) {
        if (!present.has(rel)) {
          violations.push(
            `[funnel-copy-parity-gap] locale "${locale}" is missing "${rel}" present in another ` +
              `locale — funnel copy must stay aligned across languages (RFC-0188)`,
          );
        }
      }
    }
  }

  if (violations.length === 0) {
    return passResult(
      "funnel.copy.validate",
      `funnel.copy.validate: OK — ${localeDirs.length} locale(s) aligned, no legacy tariff copy`,
    );
  }
  return resultFromViolations("funnel.copy.validate", violations);
}

// ---------------------------------------------------------------------------
// funnel.lagebild.validate
// ---------------------------------------------------------------------------

export async function runFunnelLagebildValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const integrations = await loadIntegrations(appDir);
  const funnel = integrations?.funnel;
  if (!funnel || !funnel.enabled) {
    return passResult(
      "funnel.lagebild.validate",
      "funnel.lagebild.validate: skipped (no enabled integrations.funnel block)",
    );
  }

  const violations: string[] = [];

  // An enabled funnel must drain into Lagebild → a CRM destination/adapter is required.
  const hasCrmDestination = (integrations?.destinations ?? []).some((d) => d.kind === "crm");
  const hasCrmAdapter = Boolean(integrations?.crm?.adapter && integrations.crm.adapter !== "null");
  if (!hasCrmDestination && !hasCrmAdapter) {
    violations.push(
      `[funnel-without-crm-destination] an enabled funnel needs a CRM destination (or crm adapter) ` +
        `so stage transitions reach Lagebild/Pipedrive — none configured (RFC-0188/0186)`,
    );
  }

  // An enabled funnel must have at least one inbound source feeding events.
  const inboundSources = integrations?.inbound?.sources ?? [];
  if (inboundSources.length === 0) {
    violations.push(
      `[funnel-without-inbound-source] an enabled funnel needs an inbound source (e.g. uchat) to ` +
        `deliver normalized funnel events — integrations.inbound.sources is empty (RFC-0188)`,
    );
  }

  if (!funnel.version) {
    violations.push(
      `[funnel-version-missing] integrations.funnel.version is required when enabled`,
    );
  }

  if (violations.length === 0) {
    return passResult(
      "funnel.lagebild.validate",
      "funnel.lagebild.validate: OK — enabled funnel has a CRM destination and an inbound source",
    );
  }
  return resultFromViolations("funnel.lagebild.validate", violations);
}

// ---------------------------------------------------------------------------
// funnel.org.validate (RFC-0190)
// ---------------------------------------------------------------------------

export async function runFunnelOrgValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const appDir = requireAstroSitePaths(context).appDirectory;
  const integrations = await loadIntegrations(appDir);
  const funnel = integrations?.funnel;
  if (!funnel || !funnel.enabled) {
    return passResult(
      "funnel.org.validate",
      "funnel.org.validate: skipped (no enabled integrations.funnel block)",
    );
  }

  const violations: string[] = [];

  // RFC-0190: the Organization (Person → N Deals → Org) is resolved-and-linked only by the
  // supabase-buffer destination adapter. A direct crm:pipedrive destination bypasses the
  // buffer, so the org graph (and offer snapshot / consent / funnel_stage) is never written.
  const destinations = integrations?.destinations ?? [];
  const crmDestinations = destinations.filter((d) => d.kind === "crm");
  const hasBufferDestination = crmDestinations.some((d) => d.vendor === "supabase-buffer");
  if (crmDestinations.length > 0 && !hasBufferDestination) {
    violations.push(
      `[org-path-bypasses-buffer] an enabled funnel writes the Organization graph only through the ` +
        `crm:supabase-buffer destination, but the configured CRM destination is ` +
        `"${crmDestinations.map((d) => d.vendor ?? "(none)").join(", ")}" — switch it to supabase-buffer ` +
        `so Person → N Deals → Organization is persisted (RFC-0190).`,
    );
  } else if (crmDestinations.length === 0) {
    violations.push(
      `[org-without-buffer-destination] an enabled funnel needs a crm:supabase-buffer destination to ` +
        `persist the Organization graph — none configured (RFC-0190).`,
    );
  }

  if (violations.length === 0) {
    return passResult(
      "funnel.org.validate",
      "funnel.org.validate: OK — the funnel writes the Organization graph through the Lagebild buffer",
    );
  }
  return resultFromViolations("funnel.org.validate", violations);
}
