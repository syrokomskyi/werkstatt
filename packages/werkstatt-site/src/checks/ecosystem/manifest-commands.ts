/*
<MODULE_CONTRACT>
<purpose>Command handlers for ecosystem manifest generation, validation, workspace discovery, and surface validation.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0303: extracted manifest command handlers from ecosystem.ts into ecosystem/manifest-commands.ts.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { discoverWorkspacePackages, writeFileAtomic } from "@warpgogol/werkstatt/kernel";
import { parse as yamlParse } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import type { WorkspacePackageInfo } from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "../result-helpers.ts";
import { validateFleetSitesDrift } from "../fleet-sites-generate.ts";
import type { EcosystemManifest } from "./types.ts";
import { ECOSYSTEM_MANIFEST_PATH, PNPM_WORKSPACE_PATH } from "./types.ts";
import { buildEcosystemManifest, renderManifest } from "./manifest.ts";

export async function runWorkspaceDiscoveryValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult & { packages: WorkspacePackageInfo[] }>> {
  const discovery = await discoverWorkspacePackages(context.workspaceRoot);
  const result = diagnosticsResult("workspace.discovery.validate", discovery.diagnostics);
  return {
    ...result,
    data: {
      command: result.data?.command ?? "workspace.discovery.validate",
      status: result.data?.status ?? "pass",
      diagnostics: result.data?.diagnostics ?? [],
      summary: result.data?.summary ?? { error: 0, warning: 0, info: 0 },
      packages: discovery.packages,
    },
  };
}

export async function runEcosystemManifestGenerate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<{ file: string }>> {
  const target = join(context.workspaceRoot, ECOSYSTEM_MANIFEST_PATH);
  await writeFileAtomic(
    target,
    renderManifest(await buildEcosystemManifest(context.workspaceRoot)),
  );
  return {
    data: { file: ECOSYSTEM_MANIFEST_PATH },
    exitCode: 0,
    summary: `ecosystem.manifest.generate: wrote ${ECOSYSTEM_MANIFEST_PATH}`,
  };
}

export async function runEcosystemManifestValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const expected = renderManifest(await buildEcosystemManifest(context.workspaceRoot));
  const target = join(context.workspaceRoot, ECOSYSTEM_MANIFEST_PATH);
  let actual = "";
  try {
    actual = await readFile(target, "utf8");
  } catch {
    return diagnosticsResult("ecosystem.manifest.validate", [
      {
        ruleId: "ecosystem.manifest.validate",
        severity: "error",
        file: ECOSYSTEM_MANIFEST_PATH,
        message: `${ECOSYSTEM_MANIFEST_PATH} is missing.`,
        fixHint: "Run ecosystem.manifest.generate.",
      },
    ]);
  }

  if (actual !== expected) {
    let ruleMessage = `${ECOSYSTEM_MANIFEST_PATH} drifted from live workspace state.`;
    try {
      const parsed = yamlParse(actual) as {
        meta?: { schemaVersion?: unknown };
        generatedAt?: unknown;
      };
      if (parsed.meta?.schemaVersion !== 2) {
        ruleMessage = `${ECOSYSTEM_MANIFEST_PATH} uses an unsupported legacy manifest schema.`;
      }
    } catch {
      ruleMessage = `${ECOSYSTEM_MANIFEST_PATH} is not valid JSON.`;
    }
    return diagnosticsResult("ecosystem.manifest.validate", [
      {
        ruleId: "ecosystem.manifest.validate",
        severity: "error",
        file: ECOSYSTEM_MANIFEST_PATH,
        message: ruleMessage,
        fixHint: "Update the generator if needed, then run ecosystem.manifest.generate.",
      },
    ]);
  }

  return diagnosticsResult("ecosystem.manifest.validate", []);
}

export async function runWorkspaceSurfaceValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const live = await buildEcosystemManifest(context.workspaceRoot);
  const target = join(context.workspaceRoot, ECOSYSTEM_MANIFEST_PATH);
  let committed: EcosystemManifest | undefined;
  try {
    committed = yamlParse(await readFile(target, "utf8")) as EcosystemManifest;
  } catch {
    diagnostics.push({
      ruleId: "workspace.surface.validate",
      severity: "error",
      file: ECOSYSTEM_MANIFEST_PATH,
      message: "Agent Control Plane manifest is missing or unreadable.",
      fixHint: "Run ecosystem.manifest.generate, then rerun workspace.surface.validate.",
    });
  }

  if (committed?.meta?.schemaVersion !== 2) {
    diagnostics.push({
      ruleId: "workspace.surface.validate",
      severity: "error",
      file: ECOSYSTEM_MANIFEST_PATH,
      message: "Agent Control Plane manifest must use schemaVersion 2.",
      fixHint: "Run ecosystem.manifest.generate after updating the generator.",
    });
  }

  const committedPackageDirectories = new Set(
    (committed?.packages ?? []).map((pkg) => pkg.directory),
  );
  for (const pkg of live.packages) {
    if (!committedPackageDirectories.has(pkg.directory)) {
      diagnostics.push({
        ruleId: "workspace.surface.validate",
        severity: "error",
        file: PNPM_WORKSPACE_PATH,
        message: `Workspace package ${pkg.directory} is not present in ${ECOSYSTEM_MANIFEST_PATH}.`,
        fixHint:
          "Update ecosystem manifest generation to derive packages from pnpm-workspace.yaml globs, then run ecosystem.manifest.generate.",
        data: { workspacePattern: pkg.workspacePattern },
      });
    }
  }

  const committedPipelineByName = new Map(
    (committed?.pipelines ?? []).map((pipeline) => [pipeline.name, pipeline]),
  );
  for (const pipeline of live.pipelines) {
    const committedPipeline = committedPipelineByName.get(pipeline.name);
    if (!committedPipeline) {
      diagnostics.push({
        ruleId: "workspace.surface.validate",
        severity: "error",
        file: "tools/kernel.config.ts",
        message: `Pipeline ${pipeline.name} is not present in ${ECOSYSTEM_MANIFEST_PATH}.`,
        fixHint: "Run ecosystem.manifest.generate after changing root pipeline registration.",
      });
      continue;
    }
    if (committedPipeline.scope !== pipeline.scope) {
      diagnostics.push({
        ruleId: "workspace.surface.validate",
        severity: "error",
        file: "tools/kernel.config.ts",
        message: `Pipeline ${pipeline.name} scope is ${committedPipeline.scope}, expected ${pipeline.scope}.`,
        fixHint: "Regenerate the Agent Control Plane manifest from live command metadata.",
      });
    }
    if (pipeline.scope === "workspace" && !committedPipeline.executableFromRoot) {
      diagnostics.push({
        ruleId: "workspace.surface.validate",
        severity: "error",
        file: "tools/kernel.config.ts",
        message: `Workspace pipeline ${pipeline.name} is not marked executableFromRoot.`,
        fixHint:
          "Regenerate the manifest and ensure workspace pipeline steps are workspace-scoped.",
      });
    }
  }

  const packagesCheck = committedPipelineByName.get("packages.check");
  const packagesCheckRun = committedPipelineByName.get("packages-check.run");
  if (!packagesCheck || !packagesCheckRun) {
    diagnostics.push({
      ruleId: "workspace.surface.validate",
      severity: "error",
      file: "tools/kernel.config.ts",
      message:
        "packages.check and packages-check.run must both be represented in the ACP manifest.",
      fixHint: "Keep the root pipeline alias and exported composite pipeline synchronized.",
    });
  } else if (packagesCheck.commands.join("\n") !== packagesCheckRun.commands.join("\n")) {
    diagnostics.push({
      ruleId: "workspace.surface.validate",
      severity: "error",
      file: "tools/kernel.config.ts",
      message: "packages.check and packages-check.run command lists differ.",
      fixHint:
        "Either make them aliases over the same steps or document and test the intentional difference.",
    });
  }

  // RFC-0378: fleet/fleet.sites.yaml must not drift from discoverSiteWorkspaces output
  const fleetDrift = await validateFleetSitesDrift(context.workspaceRoot);
  if (fleetDrift.drifted) {
    diagnostics.push({
      ruleId: "workspace.surface.validate",
      severity: "error",
      file: "fleet/fleet.sites.yaml",
      message: "fleet/fleet.sites.yaml has drifted from workspace site discovery.",
      fixHint: "Run pnpm exec werkstatt run fleet.sites.generate to regenerate.",
    });
  }

  return diagnosticsResult("workspace.surface.validate", diagnostics);
}
