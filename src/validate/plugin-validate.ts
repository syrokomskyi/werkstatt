/*
<MODULE_CONTRACT>
<purpose>werkstatt.plugin.validate command handler (RFC-0770). Validates that exactly
one stack plugin is registered in tools/kernel.config.ts, that the plugin's profileId
matches forge.yaml's profile field, that all plugin moduleLoaders resolve, and that
deploy adapters referenced in systems/registry.yaml are provided by the engine or plugin.</purpose>
<non-goals>
  <item>Does not modify any files — read-only validator.</item>
  <item>Does not load full kernel registry — only inspects moduleLoaders for plugin schema.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0770: initial werkstatt.plugin.validate handler with PLUGIN-01..05 failure modes.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { tsImport } from "tsx/esm/api";
import type { KernelAppConfig, KernelModule } from "@warpgogol/site-kernel/types";

const PLUGIN_SCHEMA = "werkstatt/plugin@1";
const KERNEL_CONFIG_REL = "tools/kernel.config.ts";
const FORGE_YAML_REL = "forge.yaml";
const REGISTRY_YAML_REL = "systems/registry.yaml";

export type PluginValidateStatus = "pass" | "warn" | "fail";

export interface PluginValidateViolation {
  ruleId: string;
  severity: "error" | "warning";
  message: string;
}

export interface PluginValidatePluginInfo {
  id: string;
  profileId: string;
}

export interface PluginValidateData {
  command: string;
  status: PluginValidateStatus;
  plugin: PluginValidatePluginInfo | null;
  violations: PluginValidateViolation[];
}

export interface PluginValidateResult {
  data: PluginValidateData;
  exitCode: number;
  summary?: string;
}

interface MinimalLogger {
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

/**
 * Pure validation function — callable from any context.
 * Performs the full PLUGIN-01..05 validation sequence.
 */
export async function validatePlugin(
  workspaceRoot: string,
  logger: MinimalLogger,
): Promise<PluginValidateResult> {
  const violations: PluginValidateViolation[] = [];
  let plugin: PluginValidatePluginInfo | null = null;

  // 1. Check tools/kernel.config.ts exists → PLUGIN-05
  const kernelConfigPath = join(workspaceRoot, KERNEL_CONFIG_REL);
  let config: KernelAppConfig | undefined;
  try {
    const moduleNamespace = await tsImport(pathToFileURL(kernelConfigPath).href, import.meta.url);
    const candidate = moduleNamespace.default ?? moduleNamespace.config;
    if (candidate && typeof candidate === "object") {
      config = candidate as KernelAppConfig;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    violations.push({
      ruleId: "PLUGIN-05",
      severity: "error",
      message: `tools/kernel.config.ts not found or unresolvable: ${message}. Run onboarding.scaffold first to create it.`,
    });
    logger.error(`PLUGIN-05: ${message}`);
    return buildResult(violations, plugin);
  }

  if (!config) {
    violations.push({
      ruleId: "PLUGIN-05",
      severity: "error",
      message: "tools/kernel.config.ts does not export a valid config object.",
    });
    return buildResult(violations, plugin);
  }

  // 2. Scan moduleLoaders for plugins (schema === werkstatt/plugin@1)
  const moduleLoaders = config.moduleLoaders ?? {};
  const discoveredPlugins: Array<{
    id: string;
    profileId: string;
    moduleLoaders: Record<string, () => Promise<KernelModule>>;
    deployAdapters?: Record<string, unknown>;
  }> = [];

  for (const [loaderName, loader] of Object.entries(moduleLoaders)) {
    try {
      const mod = await loader();
      const candidate = mod as unknown as Record<string, unknown>;
      if (candidate?.schema === PLUGIN_SCHEMA) {
        discoveredPlugins.push({
          id: String(candidate.id),
          profileId: String(candidate.profileId),
          moduleLoaders:
            (candidate.moduleLoaders as Record<string, () => Promise<KernelModule>>) ?? {},
          deployAdapters: candidate.deployAdapters as Record<string, unknown> | undefined,
        });
      }
    } catch {
      // Module loader failed — will be caught by PLUGIN-03 if it's a plugin loader
    }
  }

  // 3. PLUGIN-01: zero or multiple plugins
  if (discoveredPlugins.length === 0) {
    // Check forge.yaml for profile field to determine warn-only vs enforce
    const forgeProfile = await readForgeProfile(workspaceRoot);
    if (forgeProfile === null) {
      // Warn-only transition: no profile field → no plugin expected yet
      violations.push({
        ruleId: "PLUGIN-01",
        severity: "warning",
        message:
          "No stack plugin registered (werkstatt/plugin@1). Warn-only mode active until forge.yaml profile field is set (RFC-0776).",
      });
      logger.warn("PLUGIN-01: no stack plugin registered (warn-only mode)");
      return buildResult(violations, plugin);
    }
    // Enforce mode: profile field exists but no plugin
    violations.push({
      ruleId: "PLUGIN-01",
      severity: "error",
      message: `No stack plugin registered but forge.yaml profile is set to "${forgeProfile}". Install a plugin with profileId matching "${forgeProfile}".`,
    });
    return buildResult(violations, plugin);
  }

  if (discoveredPlugins.length > 1) {
    const ids = discoveredPlugins.map((p) => p.id).join(", ");
    violations.push({
      ruleId: "PLUGIN-01",
      severity: "error",
      message: `Multiple stack plugins registered (${ids}). Exactly one plugin per workshop is required.`,
    });
    return buildResult(violations, plugin);
  }

  const discoveredPlugin = discoveredPlugins[0]!;
  plugin = { id: discoveredPlugin.id, profileId: discoveredPlugin.profileId };

  // 4. Read forge.yaml profile field → PLUGIN-02
  const forgeProfile = await readForgeProfile(workspaceRoot);
  if (forgeProfile !== null && forgeProfile !== discoveredPlugin.profileId) {
    violations.push({
      ruleId: "PLUGIN-02",
      severity: "error",
      message: `Plugin profileId "${discoveredPlugin.profileId}" does not match forge.yaml profile "${forgeProfile}".`,
    });
    logger.error(
      `PLUGIN-02: profileId mismatch (plugin: ${discoveredPlugin.profileId}, forge.yaml: ${forgeProfile})`,
    );
  }

  // 5. Dynamic import each plugin moduleLoader → PLUGIN-03
  for (const [loaderName, loader] of Object.entries(discoveredPlugin.moduleLoaders)) {
    try {
      await loader();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      violations.push({
        ruleId: "PLUGIN-03",
        severity: "error",
        message: `Module loader "${loaderName}" failed to resolve: ${message}`,
      });
      logger.error(`PLUGIN-03: loader "${loaderName}" failed: ${message}`);
    }
  }

  // 6. Read systems/registry.yaml deploy adapter references → PLUGIN-04
  const registryAdapters = await readRegistryDeployAdapters(workspaceRoot);
  if (registryAdapters.length > 0) {
    const pluginAdapters = new Set(Object.keys(discoveredPlugin.deployAdapters ?? {}));
    for (const adapterId of registryAdapters) {
      if (!pluginAdapters.has(adapterId)) {
        violations.push({
          ruleId: "PLUGIN-04",
          severity: "error",
          message: `Deploy adapter "${adapterId}" referenced in systems/registry.yaml but not provided by the plugin.`,
        });
        logger.error(`PLUGIN-04: adapter "${adapterId}" not provided`);
      }
    }
  }

  return buildResult(violations, plugin);
}

function buildResult(
  violations: PluginValidateViolation[],
  plugin: PluginValidatePluginInfo | null,
): PluginValidateResult {
  const hasErrors = violations.some((v) => v.severity === "error");
  const hasWarnings = violations.some((v) => v.severity === "warning");
  const status: PluginValidateStatus = hasErrors ? "fail" : hasWarnings ? "warn" : "pass";

  return {
    data: {
      command: "werkstatt.plugin.validate",
      status,
      plugin,
      violations,
    },
    exitCode: hasErrors ? 1 : 0,
    summary: hasErrors ? undefined : `[werkstatt.plugin.validate] ${status}`,
  };
}

async function readForgeProfile(workspaceRoot: string): Promise<string | null> {
  try {
    const content = await readFile(join(workspaceRoot, FORGE_YAML_REL), "utf8");
    const parsed = parseYaml(content) as Record<string, unknown>;
    const profile = parsed?.profile;
    if (typeof profile === "string" && profile.length > 0) {
      return profile;
    }
    return null;
  } catch {
    return null;
  }
}

async function readRegistryDeployAdapters(workspaceRoot: string): Promise<string[]> {
  try {
    const content = await readFile(join(workspaceRoot, REGISTRY_YAML_REL), "utf8");
    const parsed = parseYaml(content) as Record<string, unknown>;
    const systems = parsed?.systems;
    if (!Array.isArray(systems)) return [];
    const adapters = new Set<string>();
    for (const system of systems) {
      const sys = system as Record<string, unknown>;
      const deployment = sys.deployment as Record<string, unknown> | undefined;
      const adapter = deployment?.adapter;
      if (typeof adapter === "string" && adapter.length > 0) {
        adapters.add(adapter);
      }
    }
    return [...adapters];
  } catch {
    return [];
  }
}
