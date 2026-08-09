/*
<MODULE_CONTRACT>
<purpose>RFC-0761: Pre-deploy validation gate. deploy.preflight checks that the target env file
(.env for both sites and services) exists, contains all keys from .env.example,
has no extra keys, and has no empty values. Exits non-zero on any failure, blocking the deploy.</purpose>
<non-goals>
  <item>Do not create missing env files — use env.local.check for that.</item>
  <item>Do not read or validate root .env — root is tooling-only, not deployed.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0388: initial implementation — deploy.preflight command.</item>
  <item>RFC-0761: remove --env flag, target is always .env for sites and services.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
  Diagnostic,
  CheckResult,
} from "@warpgogol/site-kernel";
import { discoverSiteWorkspaces } from "@warpgogol/site-kernel";
import { diagnosticsResult, passResult } from "../result-helpers.ts";

const ENV_EXAMPLE = ".env.example";


function parseEnvFile(raw: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) continue;
    result.set(key, value);
  }
  return result;
}

export async function runDeployPreflight(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const flags = input.flags ?? {};
  const siteName = (flags.site as string) ?? (flags["--site"] as string);
  const serviceName = (flags.service as string) ?? (flags["--service"] as string);

  // RFC-0761: --env flag is no longer supported
  const envFlag = (flags.env as string) ?? (flags["--env"] as string);
  if (envFlag) {
    return {
      data: {
        command: "deploy.preflight",
        status: "fail",
        diagnostics: [],
        summary: { error: 1, warning: 0, info: 0 },
      },
      exitCode: 1,
      summary: `deploy.preflight: --env flag is no longer supported. Use --secrets-file .env. See RFC-0761.`,
    };
  }

  const diagnostics: Diagnostic[] = [];
  let targetPath: string;
  let examplePath: string;
  let targetLabel: string;

  if (siteName) {
    const sites = await discoverSiteWorkspaces(context.workspaceRoot);
    const site = sites.find((s) => s.name === siteName);
    if (!site) {
      return {
        data: {
          command: "deploy.preflight",
          status: "fail",
          diagnostics: [],
          summary: { error: 1, warning: 0, info: 0 },
        },
        exitCode: 1,
        summary: `deploy.preflight: site "${siteName}" not found`,
      };
    }
    targetPath = join(site.directory, ".env");
    examplePath = join(site.directory, ENV_EXAMPLE);
    targetLabel = `${siteName}/.env`;
  } else if (serviceName) {
    targetPath = join(context.workspaceRoot, "services", serviceName, ".env");
    examplePath = join(context.workspaceRoot, "services", serviceName, ENV_EXAMPLE);
    targetLabel = `services/${serviceName}/.env`;
  } else {
    return {
      data: {
        command: "deploy.preflight",
        status: "fail",
        diagnostics: [],
        summary: { error: 1, warning: 0, info: 0 },
      },
      exitCode: 1,
      summary: `deploy.preflight: must specify --site <name> or --service <name>`,
    };
  }

  // Check 1: target file exists
  if (!existsSync(targetPath)) {
    diagnostics.push({
      ruleId: "DEPLOY-PREFLIGHT-01",
      severity: "error",
      file: targetLabel,
      message: `Target env file ${targetLabel} does not exist.`,
      fixHint: `Run env.local.check to create it from .env.example, then fill the values.`,
    });
    return diagnosticsResult("deploy.preflight", diagnostics);
  }

  // Check 2: .env.example exists
  if (!existsSync(examplePath)) {
    diagnostics.push({
      ruleId: "DEPLOY-PREFLIGHT-01",
      severity: "error",
      file: targetLabel,
      message: `.env.example not found alongside ${targetLabel}.`,
      fixHint: `Create .env.example with all required keys and # How to obtain: instructions.`,
    });
    return diagnosticsResult("deploy.preflight", diagnostics);
  }

  const exampleRaw = await readFile(examplePath, "utf-8");
  const targetRaw = await readFile(targetPath, "utf-8");
  const exampleKeys = parseEnvFile(exampleRaw);
  const targetKeys = parseEnvFile(targetRaw);

  // Check 2: all keys present
  for (const [key] of exampleKeys) {
    if (!targetKeys.has(key)) {
      diagnostics.push({
        ruleId: "DEPLOY-PREFLIGHT-02",
        severity: "error",
        file: targetLabel,
        message: `Key "${key}" is present in .env.example but missing in ${targetLabel}.`,
        fixHint: `Add ${key}=<value> to ${targetLabel}.`,
      });
    }
  }

  // Check 3: no extra keys
  for (const [key] of targetKeys) {
    if (!exampleKeys.has(key)) {
      diagnostics.push({
        ruleId: "DEPLOY-PREFLIGHT-03",
        severity: "error",
        file: targetLabel,
        message: `Key "${key}" is present in ${targetLabel} but not in .env.example.`,
        fixHint: `Remove ${key} from ${targetLabel} or add it to .env.example.`,
      });
    }
  }

  // Check 4: no empty values
  for (const [key, value] of targetKeys) {
    if (value.length === 0) {
      diagnostics.push({
        ruleId: "DEPLOY-PREFLIGHT-04",
        severity: "error",
        file: targetLabel,
        message: `Key "${key}" has an empty value in ${targetLabel}.`,
        fixHint: `Fill in the value for ${key} in ${targetLabel}.`,
      });
    }
  }

  if (diagnostics.length > 0) {
    return diagnosticsResult("deploy.preflight", diagnostics);
  }

  return passResult(
    "deploy.preflight",
    `deploy.preflight: ${targetLabel} OK (${exampleKeys.size} keys checked)`,
  );
}
