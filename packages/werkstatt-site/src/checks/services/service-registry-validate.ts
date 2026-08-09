/*
<MODULE_CONTRACT>
<purpose>RFC-0751: service.registry.validate — validates the services: key in systems/registry.yaml. Cross-checks each entry with services/<id>/service.config.yaml. Workspace-scoped command.</purpose>
<non-goals>
  <item>Does not validate Worker names — that is service.naming.validate.</item>
  <item>Does not deploy services — that is leitstand.service.deploy.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0751: initial implementation of service.registry.validate command.</item>
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
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "../result-helpers.ts";

interface ServiceConfigYaml {
  id?: string;
  kind?: string;
  routes?: string[];
  publicEndpoints?: boolean;
}

export async function runServiceRegistryValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const { workspaceRoot } = context;
  const registryPath = join(workspaceRoot, "systems", "registry.yaml");

  if (!existsSync(registryPath)) {
    diagnostics.push({
      ruleId: "SVC-REG-01",
      severity: "error",
      file: "systems/registry.yaml",
      message: "Registry file not found at systems/registry.yaml.",
    });
    return diagnosticsResult("service.registry.validate", diagnostics);
  }

  let registry: { services?: ServiceConfigYaml[] };
  try {
    const content = readFileSync(registryPath, "utf8");
    registry = parseYaml(content) as { services?: ServiceConfigYaml[] };
  } catch (err) {
    diagnostics.push({
      ruleId: "SVC-REG-01",
      severity: "error",
      file: "systems/registry.yaml",
      message: `Failed to parse registry: ${err instanceof Error ? err.message : String(err)}`,
    });
    return diagnosticsResult("service.registry.validate", diagnostics);
  }

  const services = registry.services;
  if (!services || !Array.isArray(services) || services.length === 0) {
    diagnostics.push({
      ruleId: "SVC-REG-02",
      severity: "error",
      file: "systems/registry.yaml",
      message: "No services: key found in registry. Add CF Worker service entries.",
      fixHint: "Add a services: key with entries for each Cloudflare Worker service.",
    });
    return diagnosticsResult("service.registry.validate", diagnostics);
  }

  const seenIds = new Set<string>();
  const seenWorkerNames = new Set<string>();

  for (const service of services) {
    const id = service.id;

    // SVC-REG-03: required fields
    if (!id || id.trim() === "") {
      diagnostics.push({
        ruleId: "SVC-REG-03",
        severity: "error",
        file: "systems/registry.yaml",
        message: "Service entry missing required 'id' field.",
      });
      continue;
    }

    // SVC-REG-04: duplicate id
    if (seenIds.has(id)) {
      diagnostics.push({
        ruleId: "SVC-REG-04",
        severity: "error",
        file: "systems/registry.yaml",
        message: `Duplicate service id '${id}'.`,
      });
    }
    seenIds.add(id);

    // SVC-REG-05: workerName must equal id
    const workerName = (service as { workerName?: string }).workerName;
    if (!workerName || workerName.trim() === "") {
      diagnostics.push({
        ruleId: "SVC-REG-03",
        severity: "error",
        file: "systems/registry.yaml",
        message: `Service '${id}' missing required 'workerName' field.`,
      });
    } else if (workerName !== id) {
      diagnostics.push({
        ruleId: "SVC-REG-05",
        severity: "error",
        file: "systems/registry.yaml",
        message: `Service '${id}': workerName '${workerName}' must equal id '${id}'.`,
      });
    }

    if (workerName) {
      if (seenWorkerNames.has(workerName)) {
        diagnostics.push({
          ruleId: "SVC-REG-04",
          severity: "error",
          file: "systems/registry.yaml",
          message: `Duplicate workerName '${workerName}'.`,
        });
      }
      seenWorkerNames.add(workerName);
    }

    // SVC-REG-06: cross-check with service.config.yaml
    const configPath = join(workspaceRoot, "services", id, "service.config.yaml");
    if (!existsSync(configPath)) {
      diagnostics.push({
        ruleId: "SVC-REG-06",
        severity: "error",
        file: `services/${id}/service.config.yaml`,
        message: `Service '${id}': service.config.yaml not found at services/${id}/service.config.yaml.`,
      });
    } else {
      try {
        const configContent = readFileSync(configPath, "utf8");
        const config = parseYaml(configContent) as ServiceConfigYaml;

        if (config.id && config.id !== id) {
          diagnostics.push({
            ruleId: "SVC-REG-06",
            severity: "error",
            file: `services/${id}/service.config.yaml`,
            message: `Service '${id}': service.config.yaml id '${config.id}' does not match registry id '${id}'.`,
          });
        }

        const configKind = config.kind;
        const registryKind = (service as { kind?: string }).kind;
        if (configKind && registryKind && configKind !== registryKind) {
          diagnostics.push({
            ruleId: "SVC-REG-06",
            severity: "error",
            file: `services/${id}/service.config.yaml`,
            message: `Service '${id}': kind mismatch — registry has '${registryKind}', service.config.yaml has '${configKind}'.`,
          });
        }
      } catch (err) {
        diagnostics.push({
          ruleId: "SVC-REG-06",
          severity: "error",
          file: `services/${id}/service.config.yaml`,
          message: `Service '${id}': failed to parse service.config.yaml: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }

    // SVC-REG-07: wrangler.jsonc must exist for CF Worker services
    const wranglerPath = join(workspaceRoot, "services", id, "wrangler.jsonc");
    if (!existsSync(wranglerPath)) {
      diagnostics.push({
        ruleId: "SVC-REG-07",
        severity: "error",
        file: `services/${id}/wrangler.jsonc`,
        message: `Service '${id}': wrangler.jsonc not found — not a Cloudflare Worker service.`,
      });
    }
  }

  if (diagnostics.length > 0) {
    return diagnosticsResult("service.registry.validate", diagnostics);
  }

  const data: CheckResult = {
    command: "service.registry.validate",
    status: "pass",
    diagnostics: [],
    summary: { error: 0, warning: 0, info: 0 },
  };

  return {
    data,
    exitCode: 0,
    summary: `service.registry.validate: pass — ${services.length} service(s) registered`,
  };
}
