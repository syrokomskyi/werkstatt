/*
<MODULE_CONTRACT>
<purpose>RFC-0807: Workspace-scoped OTLP env var validator for services. Checks WARPGOGOL_OTLP_ENDPOINT and WARPGOGOL_OTLP_TOKEN presence in .env.example with # How to obtain: lines, and source-level Env interface declarations for CF Worker services.</purpose>
<non-goals>
  <item>Do not validate .env.example format (env.contract.validate handles that).</item>
  <item>Do not check observability-stack — it is the SigNoz server itself (circular dependency).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0807: initial implementation — OTLP-01/02/03 rules for service OTLP env var compliance.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "../result.ts";

const OTLP_ENDPOINT_VAR = "WARPGOGOL_OTLP_ENDPOINT";
const OTLP_TOKEN_VAR = "WARPGOGOL_OTLP_TOKEN";
const EXCLUDED_SERVICES = new Set(["observability-stack"]);

async function listServices(context: KernelRuntimeContext): Promise<string[]> {
  const globs = await context.io.glob("services/*/package.json", {
    cwd: context.workspaceRoot,
  });
  return globs
    .map((g) =>
      g
        .replace(/\\/g, "/")
        .replace(/^services\//, "")
        .replace(/\/package\.json$/, ""),
    )
    .filter((id) => !EXCLUDED_SERVICES.has(id));
}

async function readIfExists(
  context: KernelRuntimeContext,
  relPath: string,
): Promise<string | null> {
  try {
    return await context.io.readFile(join(context.workspaceRoot, relPath));
  } catch {
    return null;
  }
}

function hasHowToObtain(envContent: string, varName: string): boolean {
  const lines = envContent.split(/\r?\n/);
  let commentBlockHasHowToObtain = false;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      commentBlockHasHowToObtain = false;
      continue;
    }
    if (trimmed.startsWith("#")) {
      if (/^#\s*How to obtain:/i.test(trimmed)) {
        commentBlockHasHowToObtain = true;
      }
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      commentBlockHasHowToObtain = false;
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (key === varName) {
      return commentBlockHasHowToObtain;
    }
    commentBlockHasHowToObtain = false;
  }
  return false;
}

function hasVarInEnvExample(envContent: string, varName: string): boolean {
  const lines = envContent.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key === varName) return true;
  }
  return false;
}

async function isCfWorkerService(
  context: KernelRuntimeContext,
  serviceName: string,
): Promise<boolean> {
  const wranglerPath = `services/${serviceName}/wrangler.jsonc`;
  return context.io.exists(join(context.workspaceRoot, wranglerPath));
}

async function hasOtlpVarsInSource(
  context: KernelRuntimeContext,
  serviceName: string,
): Promise<boolean> {
  const sources = await context.io.glob(`services/${serviceName}/src/**/*.ts`, {
    cwd: context.workspaceRoot,
  });
  for (const source of sources) {
    const text = await context.io.readFile(join(context.workspaceRoot, source));
    if (
      text.includes(OTLP_ENDPOINT_VAR) &&
      text.includes(OTLP_TOKEN_VAR)
    ) {
      return true;
    }
  }
  return false;
}

export async function runServiceOtlpValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const services = await listServices(context);

  for (const serviceId of services) {
    const envExamplePath = `services/${serviceId}/.env.example`;
    const envContent = await readIfExists(context, envExamplePath);

    if (!envContent) {
      diagnostics.push({
        ruleId: "OTLP-01",
        severity: "error",
        file: envExamplePath,
        message: `${OTLP_ENDPOINT_VAR} missing from .env.example (file not found).`,
        fixHint: `Create ${envExamplePath} with ${OTLP_ENDPOINT_VAR} and ${OTLP_TOKEN_VAR}, each with a "# How to obtain:" line.`,
      });
      diagnostics.push({
        ruleId: "OTLP-02",
        severity: "error",
        file: envExamplePath,
        message: `${OTLP_TOKEN_VAR} missing from .env.example (file not found).`,
        fixHint: `Create ${envExamplePath} with ${OTLP_ENDPOINT_VAR} and ${OTLP_TOKEN_VAR}, each with a "# How to obtain:" line.`,
      });
    } else {
      if (!hasVarInEnvExample(envContent, OTLP_ENDPOINT_VAR)) {
        diagnostics.push({
          ruleId: "OTLP-01",
          severity: "error",
          file: envExamplePath,
          message: `${OTLP_ENDPOINT_VAR} missing from .env.example.`,
          fixHint: `Add ${OTLP_ENDPOINT_VAR}= with a preceding "# How to obtain:" comment line.`,
        });
      } else if (!hasHowToObtain(envContent, OTLP_ENDPOINT_VAR)) {
        diagnostics.push({
          ruleId: "OTLP-01",
          severity: "error",
          file: envExamplePath,
          message: `${OTLP_ENDPOINT_VAR} present but missing "# How to obtain:" instruction.`,
          fixHint: `Add a "# How to obtain:" comment line before ${OTLP_ENDPOINT_VAR}.`,
        });
      }

      if (!hasVarInEnvExample(envContent, OTLP_TOKEN_VAR)) {
        diagnostics.push({
          ruleId: "OTLP-02",
          severity: "error",
          file: envExamplePath,
          message: `${OTLP_TOKEN_VAR} missing from .env.example.`,
          fixHint: `Add ${OTLP_TOKEN_VAR}= with a preceding "# How to obtain:" comment line.`,
        });
      } else if (!hasHowToObtain(envContent, OTLP_TOKEN_VAR)) {
        diagnostics.push({
          ruleId: "OTLP-02",
          severity: "error",
          file: envExamplePath,
          message: `${OTLP_TOKEN_VAR} present but missing "# How to obtain:" instruction.`,
          fixHint: `Add a "# How to obtain:" comment line before ${OTLP_TOKEN_VAR}.`,
        });
      }
    }

    const isCfWorker = await isCfWorkerService(context, serviceId);
    if (isCfWorker) {
      const hasInSource = await hasOtlpVarsInSource(context, serviceId);
      if (!hasInSource) {
        diagnostics.push({
          ruleId: "OTLP-03",
          severity: "warning",
          file: `services/${serviceId}/src/`,
          message: `${OTLP_ENDPOINT_VAR} or ${OTLP_TOKEN_VAR} not found in service source. If this service delegates to a shared worker (env interface in package), this is expected.`,
          fixHint: `Add ${OTLP_ENDPOINT_VAR} and ${OTLP_TOKEN_VAR} to the Env interface in the service source, or confirm the shared worker handles OTLP env vars.`,
        });
      }
    }
  }

  return diagnosticsResult("service.otlp.validate", diagnostics);
}
