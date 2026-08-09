/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-check-warpgogol/src/commands/services.ts as an authored site-kernel-check-warpgogol authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303 Phase 3: extracted from commands.ts as part of the domain split.</item>
</CHANGE_SUMMARY>
*/

import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { diagnosticsResult } from "../result.ts";

export async function runServicesWorkspaceValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const workspacePath = join(context.workspaceRoot, "pnpm-workspace.yaml");
  const workspace = await context.io.readFile(workspacePath);
  if (!workspace.includes("services/*")) {
    diagnostics.push({
      ruleId: "SERVICES-01",
      severity: "error",
      file: "pnpm-workspace.yaml",
      message: "pnpm-workspace.yaml does not include services/*.",
      fixHint: "Add services/* to the workspace package globs.",
    });
  }
  if (!(await context.io.exists(join(context.workspaceRoot, "services", "AGENTS.md")))) {
    diagnostics.push({
      ruleId: "SERVICES-02",
      severity: "error",
      file: "services/AGENTS.md",
      message: "services/AGENTS.md is missing.",
      fixHint: "Document backend composition-only rules for services/*.",
    });
  }
  const packageFiles = await context.io.glob("services/*/package.json", {
    cwd: context.workspaceRoot,
  });
  for (const packageFile of packageFiles) {
    const normalizedPackageFile = packageFile.replace(/\\/g, "/");
    const serviceDir = normalizedPackageFile.replace(/\/package\.json$/, "");
    const serviceId = serviceDir.replace(/^services\//, "");
    const packageJson = JSON.parse(
      await context.io.readFile(join(context.workspaceRoot, normalizedPackageFile)),
    ) as {
      private?: boolean;
      scripts?: Record<string, string>;
    };
    if (packageJson.private !== true) {
      diagnostics.push({
        ruleId: "SERVICES-03",
        severity: "error",
        file: normalizedPackageFile,
        message: "Service workspace package.json must be private.",
        fixHint: "Set private: true.",
      });
    }
    if (!packageJson.scripts?.["build:check"]) {
      diagnostics.push({
        ruleId: "SERVICES-04",
        severity: "error",
        file: normalizedPackageFile,
        message: "Service workspace package.json must define build:check.",
        fixHint: "Add a build:check script, usually tsc --noEmit.",
      });
    }
    const configPath = `${serviceDir}/service.config.yaml`;
    if (!(await context.io.exists(join(context.workspaceRoot, configPath)))) {
      diagnostics.push({
        ruleId: "SERVICES-05",
        severity: "error",
        file: configPath,
        message: "Service workspace is missing service.config.yaml.",
        fixHint: "Add a service.config.yaml manifest for this backend runtime.",
      });
      continue;
    }
    const config = JSON.parse(
      await context.io.readFile(join(context.workspaceRoot, configPath)),
    ) as {
      id?: string;
      kind?: string;
      entry?: string;
    };
    if (config.id !== serviceId) {
      diagnostics.push({
        ruleId: "SERVICES-10",
        severity: "error",
        file: configPath,
        message: `Service workspace id "${config.id ?? "(missing)"}" must match directory "${serviceId}".`,
        fixHint: `Set id to "${serviceId}".`,
      });
    }
    const allowedKinds = new Set([
      "node-runner",
      "cloudflare-worker",
      "scheduled-worker",
      "integration-worker",
      "proxy-worker",
      "compose-stack",
    ]);
    if (!config.kind || !allowedKinds.has(config.kind)) {
      diagnostics.push({
        ruleId: "SERVICES-06",
        severity: "error",
        file: configPath,
        message: `Service workspace kind "${config.kind ?? "(missing)"}" is not allowed.`,
        fixHint:
          "Use one of: node-runner, cloudflare-worker, scheduled-worker, integration-worker, proxy-worker, compose-stack.",
      });
    }
    // compose-stack services use declarative config (e.g. casting.yaml) as entry, not .ts source
    if (
      config.entry &&
      config.kind !== "compose-stack" &&
      !(await context.io.exists(join(context.workspaceRoot, serviceDir, config.entry)))
    ) {
      diagnostics.push({
        ruleId: "SERVICES-07",
        severity: "error",
        file: configPath,
        message: `Service workspace entry does not exist: ${config.entry}`,
        fixHint: "Point entry to an existing runtime file.",
      });
    }
    // compose-stack services must have their entry config file present
    if (
      config.kind === "compose-stack" &&
      config.entry &&
      !(await context.io.exists(join(context.workspaceRoot, serviceDir, config.entry)))
    ) {
      diagnostics.push({
        ruleId: "SERVICES-07",
        severity: "error",
        file: configPath,
        message: `Service workspace entry config does not exist: ${config.entry}`,
        fixHint: "Point entry to an existing declarative config file (e.g. casting.yaml).",
      });
    }
  }
  const serviceSources = await context.io.glob("services/**/*.ts", { cwd: context.workspaceRoot });
  for (const source of serviceSources) {
    const text = await context.io.readFile(join(context.workspaceRoot, source));
    if (/from\s+["'](?:\.\.\/)*apps\//.test(text) || /from\s+["']apps\//.test(text)) {
      diagnostics.push({
        ruleId: "SERVICES-08",
        severity: "error",
        file: source,
        message: "Service workspace source imports from apps/*.",
        fixHint: "Move shared code to packages/* and import it from there.",
      });
    }
  }
  const appSources = await context.io.glob("apps/**/*.ts", { cwd: context.workspaceRoot });
  for (const source of appSources) {
    const text = await context.io.readFile(join(context.workspaceRoot, source));
    if (/from\s+["'](?:\.\.\/)*services\//.test(text) || /from\s+["']services\//.test(text)) {
      diagnostics.push({
        ruleId: "SERVICES-09",
        severity: "error",
        file: source,
        message: "App source imports from services/*.",
        fixHint: "Expose shared contracts from packages/* instead.",
      });
    }
  }
  return diagnosticsResult("services.workspace.validate", diagnostics);
}

export async function runCheckWarpgogolRunnerValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const required = [
    "services/check-warpgogol-runner/package.json",
    "services/check-warpgogol-runner/service.config.yaml",
    "services/check-warpgogol-runner/Dockerfile",
    "services/check-warpgogol-runner/src/worker.ts",
    "services/check-warpgogol-runner/src/run-once.ts",
    "packages/check-core/src/run-request.ts",
    "apps/check-warpgogol-com/src/pages/api/check-runs/index.ts",
    "apps/check-warpgogol-com/src/pages/api/check-runs/[runid].ts",
  ];
  for (const file of required) {
    if (!(await context.io.exists(join(context.workspaceRoot, file)))) {
      diagnostics.push({
        ruleId: "CW-RUNNER-01",
        severity: "error",
        file,
        message: `Required Check Warpgogol runner file is missing: ${file}`,
        fixHint: "Create the required file from RFC-0304.",
      });
    }
  }
  const packagePath = join(context.workspaceRoot, "services/check-warpgogol-runner/package.json");
  if (await context.io.exists(packagePath)) {
    const pkg = JSON.parse(await context.io.readFile(packagePath)) as {
      dependencies?: Record<string, string>;
    };
    for (const dep of ["@warpgogol/werkstatt-site/check-core", "@warpgogol/werkstatt-site/check-runner"]) {
      if (!pkg.dependencies?.[dep]) {
        diagnostics.push({
          ruleId: "CW-RUNNER-02",
          severity: "error",
          file: "services/check-warpgogol-runner/package.json",
          message: `check-warpgogol-runner must depend on ${dep}.`,
          fixHint: `Add ${dep} as a workspace dependency.`,
        });
      }
    }
  }
  const runnerSources = await context.io.glob("services/check-warpgogol-runner/src/**/*.ts", {
    cwd: context.workspaceRoot,
  });
  for (const source of runnerSources) {
    const text = await context.io.readFile(join(context.workspaceRoot, source));
    if (text.includes("apps/") || text.includes("@warpgogol/check-warpgogol-com")) {
      diagnostics.push({
        ruleId: "CW-RUNNER-03",
        severity: "error",
        file: source,
        message: "Runner backend source must not import or reference apps/*.",
        fixHint: "Move shared contracts to packages/*.",
      });
    }
  }
  const workerPath = join(context.workspaceRoot, "services/check-warpgogol-runner/src/worker.ts");
  if (await context.io.exists(workerPath)) {
    const worker = await context.io.readFile(workerPath);
    if (!worker.includes("@warpgogol/werkstatt-site/check-core") && !worker.includes("./run-once.ts")) {
      diagnostics.push({
        ruleId: "CW-RUNNER-04",
        severity: "error",
        file: "services/check-warpgogol-runner/src/worker.ts",
        message: "Runner worker does not use shared Check Warpgogol run contracts.",
        fixHint: "Import run contracts from @warpgogol/werkstatt-site/check-core directly or through run-once.ts.",
      });
    }
  }
  const apiFiles = [
    "apps/check-warpgogol-com/src/pages/api/check-runs/index.ts",
    "apps/check-warpgogol-com/src/pages/api/check-runs/[runid].ts",
  ];
  for (const file of apiFiles) {
    const path = join(context.workspaceRoot, file);
    if (!(await context.io.exists(path))) continue;
    const text = await context.io.readFile(path);
    if (
      text.includes("playwright") ||
      text.includes("@warpgogol/werkstatt-site/check-runner") ||
      text.includes("services/")
    ) {
      diagnostics.push({
        ruleId: "CW-RUNNER-05",
        severity: "error",
        file,
        message: "App API endpoint imports runner-only code.",
        fixHint: "Keep browser execution in services/check-warpgogol-runner.",
      });
    }
  }
  return diagnosticsResult("check-warpgogol.runner.validate", diagnostics);
}
