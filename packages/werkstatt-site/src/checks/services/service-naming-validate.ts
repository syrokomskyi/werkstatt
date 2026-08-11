/*
<MODULE_CONTRACT>
<purpose>RFC-0751: service.naming.validate — enforces Worker name = service id = directory name = package.json name. RFC-0805: extended with SVC-NAME-06 to reject -worker suffix. Workspace-scoped command.</purpose>
<non-goals>
  <item>Does not validate registry structure — that is service.registry.validate.</item>
  <item>Does not deploy services — that is leitstand.service.promote.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0751: initial implementation of service.naming.validate command.</item>
  <item>RFC-0805: add SVC-NAME-06 rule — reject service ids ending with -worker suffix.</item>
</CHANGE_SUMMARY>
*/

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "../result-helpers.ts";

interface RegistryService {
  id: string;
  workerName: string;
}

interface WranglerConfig {
  name?: string;
}

interface ServiceConfigYaml {
  id?: string;
}

interface PackageJson {
  name?: string;
}

function parseJsonc(content: string): unknown {
  const cleaned = content
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(cleaned);
}

export async function runServiceNamingValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const { workspaceRoot } = context;
  const registryPath = join(workspaceRoot, "services", "registry.yaml");

  if (!existsSync(registryPath)) {
    diagnostics.push({
      ruleId: "SVC-NAME-01",
      severity: "error",
      file: "services/registry.yaml",
      message: "Registry file not found at services/registry.yaml.",
    });
    return diagnosticsResult("service.naming.validate", diagnostics);
  }

  let services: RegistryService[];
  try {
    const content = readFileSync(registryPath, "utf8");
    const registry = parseYaml(content) as { services?: RegistryService[] };
    services = registry.services ?? [];
  } catch (err) {
    diagnostics.push({
      ruleId: "SVC-NAME-01",
      severity: "error",
      file: "services/registry.yaml",
      message: `Failed to parse registry: ${err instanceof Error ? err.message : String(err)}`,
    });
    return diagnosticsResult("service.naming.validate", diagnostics);
  }

  if (services.length === 0) {
    diagnostics.push({
      ruleId: "SVC-NAME-01",
      severity: "error",
      file: "services/registry.yaml",
      message: "No services found in registry.",
    });
    return diagnosticsResult("service.naming.validate", diagnostics);
  }

  for (const service of services) {
    const { id, workerName } = service;

    // SVC-NAME-06: id must not end with -worker suffix (RFC-0805)
    if (id.endsWith("-worker")) {
      const suggestedName = id.slice(0, -"-worker".length);
      diagnostics.push({
        ruleId: "SVC-NAME-06",
        severity: "error",
        file: "services/registry.yaml",
        message: `Service '${id}': id must not end with '-worker' suffix. Rename to '${suggestedName}'.`,
      });
    }

    // SVC-NAME-01: workerName must equal id
    if (workerName !== id) {
      diagnostics.push({
        ruleId: "SVC-NAME-01",
        severity: "error",
        file: "services/registry.yaml",
        message: `Service '${id}': workerName '${workerName}' must equal id '${id}'.`,
      });
    }

    const serviceDir = join(workspaceRoot, "services", id);

    // SVC-NAME-05: directory must exist
    if (!existsSync(serviceDir)) {
      diagnostics.push({
        ruleId: "SVC-NAME-05",
        severity: "error",
        file: `services/${id}/`,
        message: `Service '${id}': directory services/${id}/ does not exist.`,
      });
      continue;
    }

    // SVC-NAME-02: wrangler.jsonc name must equal id
    const wranglerPath = join(serviceDir, "wrangler.jsonc");
    if (existsSync(wranglerPath)) {
      try {
        const content = readFileSync(wranglerPath, "utf8");
        const wrangler = parseJsonc(content) as WranglerConfig;
        if (wrangler.name !== id) {
          diagnostics.push({
            ruleId: "SVC-NAME-02",
            severity: "error",
            file: `services/${id}/wrangler.jsonc`,
            message: `Service '${id}': wrangler.jsonc name '${wrangler.name}' must equal id '${id}'.`,
          });
        }
      } catch (err) {
        diagnostics.push({
          ruleId: "SVC-NAME-02",
          severity: "error",
          file: `services/${id}/wrangler.jsonc`,
          message: `Service '${id}': failed to parse wrangler.jsonc: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // SVC-NAME-03: service.config.yaml id must equal id
    const configPath = join(serviceDir, "service.config.yaml");
    if (existsSync(configPath)) {
      try {
        const content = readFileSync(configPath, "utf8");
        const config = parseYaml(content) as ServiceConfigYaml;
        if (config.id !== id) {
          diagnostics.push({
            ruleId: "SVC-NAME-03",
            severity: "error",
            file: `services/${id}/service.config.yaml`,
            message: `Service '${id}': service.config.yaml id '${config.id}' must equal id '${id}'.`,
          });
        }
      } catch (err) {
        diagnostics.push({
          ruleId: "SVC-NAME-03",
          severity: "error",
          file: `services/${id}/service.config.yaml`,
          message: `Service '${id}': failed to parse service.config.yaml: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // SVC-NAME-04: package.json name must equal id or @warpgogol/<id>
    const packageJsonPath = join(serviceDir, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const content = readFileSync(packageJsonPath, "utf8");
        const pkg = JSON.parse(content) as PackageJson;
        const expectedName = id;
        const expectedScopedName = `@warpgogol/${id}`;
        if (pkg.name !== expectedName && pkg.name !== expectedScopedName) {
          diagnostics.push({
            ruleId: "SVC-NAME-04",
            severity: "error",
            file: `services/${id}/package.json`,
            message: `Service '${id}': package.json name '${pkg.name}' must equal '${expectedName}' or '${expectedScopedName}'.`,
          });
        }
      } catch (err) {
        diagnostics.push({
          ruleId: "SVC-NAME-04",
          severity: "error",
          file: `services/${id}/package.json`,
          message: `Service '${id}': failed to parse package.json: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  if (diagnostics.length > 0) {
    return diagnosticsResult("service.naming.validate", diagnostics);
  }

  const data: CheckResult = {
    command: "service.naming.validate",
    status: "pass",
    diagnostics: [],
    summary: { error: 0, warning: 0, info: 0 },
  };

  return {
    data,
    exitCode: 0,
    summary: `service.naming.validate: pass — ${services.length} service(s) checked`,
  };
}
