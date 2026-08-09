/*
<MODULE_CONTRACT>
  <purpose>workshop.scaffold handler (RFC-0779) — creates a consumer workshop monorepo
  from a stack profile selection. Generates workshop-specific files, delegates
  forge-specific artifacts to forge.init, and optionally runs post-scaffold verification.</purpose>
  <non-goals>
    <item>Do not scaffold projects — that is onboarding.scaffold (plugin hook).</item>
    <item>Do not add a --force flag — ever.</item>
    <item>Do not import stack plugins — this package is stack-agnostic (DNA-64).</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0779: initial workshop.scaffold handler.</item>
</CHANGE_SUMMARY>
*/

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
  KernelNextStep,
} from "../kernel/types.ts";
import type { ForgeCommandInput, ForgeRuntimeContext } from "@warpgogol/forge";
import { getWorkshopFiles, STACK_PLUGIN_MAP, type WorkshopTemplateVars } from "./templates.ts";

export interface ScaffoldWorkshopResult {
  command: "workshop.scaffold";
  status: "pass" | "fail";
  workshop: {
    name: string;
    stack: string;
    path: string;
    plugin: string;
    engine: string;
  };
  verification?: {
    "forge.doctor": "pass" | "fail" | "skipped";
    "werkstatt.plugin.validate": "pass" | "fail" | "skipped";
    "werkstatt.autonomy.validate": "pass" | "fail" | "skipped";
  };
  filesCreated: string[];
  errors: string[];
}

const KEBAB_CASE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export async function runWorkshopScaffold(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ScaffoldWorkshopResult>> {
  const { logger, outputFormat, dryRun } = context;
  const name = input.flags["name"] as string | undefined;
  const stack = input.flags["stack"] as string | undefined;
  const dest = input.flags["dest"] as string | undefined;
  const verify = input.flags["verify"] === true;

  const errors: string[] = [];
  const passNextSteps: KernelNextStep[] = [
    { action: "Fill in .npmrc with a valid npm read token", kind: "required" },
    { action: "Run pnpm install in the workshop directory", kind: "required" },
    { action: "Run pnpm exec werkstatt run forge.doctor to verify", kind: "required" },
    {
      action: "Run pnpm exec werkstatt run onboarding.scaffold to create first project",
      kind: "optional",
    },
  ];
  const failNextSteps: KernelNextStep[] = [
    { action: "Fix the errors above and re-run workshop.scaffold", kind: "required" },
  ];

  function fail(
    msg: string,
    partial?: Partial<ScaffoldWorkshopResult>,
  ): KernelCommandResult<ScaffoldWorkshopResult> {
    errors.push(msg);
    if (outputFormat === "pretty") {
      logger.error(msg);
    }
    return {
      data: {
        command: "workshop.scaffold",
        status: "fail",
        workshop: partial?.workshop ?? {
          name: name ?? "",
          stack: stack ?? "",
          path: dest ?? "",
          plugin: "",
          engine: "@warpgogol/werkstatt",
        },
        verification: partial?.verification,
        filesCreated: partial?.filesCreated ?? [],
        errors,
      },
      nextSteps: failNextSteps,
      exitCode: 1,
      summary: `workshop.scaffold: failed — ${msg}`,
    };
  }

  // 1. Validate required flags
  if (!name) {
    return fail("Missing required flag: --name <name>");
  }
  if (!stack) {
    return fail("Missing required flag: --stack <stack-profile-id>");
  }
  if (!dest) {
    return fail("Missing required flag: --dest <path>");
  }

  // 2. Validate kebab-case name
  if (!KEBAB_CASE.test(name)) {
    return fail(
      `Workshop name "${name}" is not kebab-case (expected ^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$)`,
    );
  }

  // 3. Validate stack profile — SCAFFOLD-01
  const pluginInfo = STACK_PLUGIN_MAP[stack];
  if (!pluginInfo) {
    const available = Object.keys(STACK_PLUGIN_MAP).join(", ");
    return fail(`Unknown stack profile "${stack}" (SCAFFOLD-01). Available: ${available}`);
  }

  // 4. Resolve destination directory
  const destPath = path.resolve(dest);

  // 5. Refuse if destination exists and is non-empty — SCAFFOLD-05
  if (fs.existsSync(destPath)) {
    const entries = fs.readdirSync(destPath);
    if (entries.length > 0) {
      return fail(
        `Destination directory "${destPath}" is not empty (contains: ${entries.slice(0, 5).join(", ")}${entries.length > 5 ? "…" : ""}). Refusing to scaffold (SCAFFOLD-05).`,
      );
    }
  }

  // 6. Build template variables
  const vars: WorkshopTemplateVars = {
    workshopName: name,
    stackId: stack,
    pluginPackage: pluginInfo.package,
    pluginImportName: pluginInfo.importName,
    pluginExportName: pluginInfo.exportName,
  };

  const workshopFiles = getWorkshopFiles(vars);
  const filesCreated: string[] = [];

  // 7. Dry-run mode — collect file list without writing
  if (dryRun) {
    for (const file of workshopFiles) {
      filesCreated.push(file.path);
    }
    if (outputFormat === "pretty") {
      logger.info(`Dry run: would create ${filesCreated.length} files in ${destPath}`);
      for (const f of filesCreated) {
        logger.info(`  would create: ${f}`);
      }
    }
    return {
      data: {
        command: "workshop.scaffold",
        status: "pass",
        workshop: {
          name,
          stack,
          path: destPath,
          plugin: pluginInfo.package,
          engine: "@warpgogol/werkstatt",
        },
        verification: {
          "forge.doctor": "skipped",
          "werkstatt.plugin.validate": "skipped",
          "werkstatt.autonomy.validate": "skipped",
        },
        filesCreated,
        errors: [],
      },
      nextSteps: passNextSteps,
      exitCode: 0,
      summary: `workshop.scaffold: dry run — would create ${filesCreated.length} files in ${destPath}`,
    };
  }

  // 8. Create destination directory
  fs.mkdirSync(destPath, { recursive: true });

  // 9. Write workshop-specific files
  for (const file of workshopFiles) {
    const filePath = path.join(destPath, file.path);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, file.content, "utf8");
    filesCreated.push(file.path);
  }

  // Make pre-commit executable
  const preCommitPath = path.join(destPath, "hooks", "pre-commit");
  if (fs.existsSync(preCommitPath)) {
    fs.chmodSync(preCommitPath, 0o755);
  }

  if (outputFormat === "pretty") {
    logger.success(`Wrote ${workshopFiles.length} workshop files to ${destPath}`);
  }

  // 10. Delegate forge-specific artifacts to forge.init
  // forge.init creates: forge.yaml, PREFERENCES.md, .agents/skills/, .agents/memory/,
  // docs/rfcs/, docs/adrs/, docs/plans/, docs/audits/, templates
  let forgeInitOk = true;
  try {
    const { runInit } = await import("@warpgogol/forge");
    const { resolveForgeRoot } = await import("@warpgogol/forge");

    let forgeRoot: string;
    try {
      forgeRoot = resolveForgeRoot(context.workspaceRoot);
    } catch {
      forgeRoot = context.workspaceRoot;
    }

    const initResult = runInit(
      { flags: {} },
      {
        workspaceRoot: destPath,
        forgeRoot,
        logger,
        dryRun: false,
        outputFormat,
      } as unknown as ForgeRuntimeContext,
      {
        profileId: stack,
        domain:
          stack === "astro-typescript-turborepo"
            ? "site"
            : stack === "phaser-turborepo"
              ? "game"
              : "video",
      },
    );

    if (initResult.status !== "pass") {
      forgeInitOk = false;
      errors.push(...initResult.errors);
      if (outputFormat === "pretty") {
        logger.warn(`forge.init completed with ${initResult.errors.length} error(s)`);
      }
    } else {
      filesCreated.push(...initResult.created);
      if (outputFormat === "pretty") {
        logger.info(
          `forge.init: created ${initResult.created.length} files, skipped ${initResult.skipped.length}`,
        );
      }
    }

    // 11. Scaffold memory layer (RFC-0664)
    const { scaffoldMemoryLayer } = await import("@warpgogol/forge");
    const memoryResult = scaffoldMemoryLayer(destPath);
    filesCreated.push(...memoryResult.created);

    // 12. Run forge.agents.generate for AGENTS.md
    try {
      const { runAgentsGenerate } = await import("@warpgogol/forge");
      const agentsResult = await runAgentsGenerate(
        { argv: [], flags: {} } as unknown as ForgeCommandInput,
        {
          workspaceRoot: destPath,
          forgeRoot,
          logger,
          dryRun: false,
          outputFormat,
        } as unknown as ForgeRuntimeContext,
      );
      if (agentsResult.exitCode === 0) {
        filesCreated.push("AGENTS.md");
        if (outputFormat === "pretty") {
          logger.info("forge.agents.generate: OK");
        }
      } else {
        if (outputFormat === "pretty") {
          logger.warn(
            "forge.agents.generate failed — AGENTS.md not generated. Run 'forge agents generate' manually.",
          );
        }
      }
    } catch (err) {
      if (outputFormat === "pretty") {
        logger.warn(`forge.agents.generate failed: ${(err as Error).message}`);
      }
    }
  } catch (err) {
    forgeInitOk = false;
    errors.push(`forge.init delegation failed: ${(err as Error).message}`);
    if (outputFormat === "pretty") {
      logger.error(`forge.init delegation failed: ${(err as Error).message}`);
    }
  }

  if (!forgeInitOk && errors.length > 0) {
    return {
      data: {
        command: "workshop.scaffold",
        status: "fail",
        workshop: {
          name,
          stack,
          path: destPath,
          plugin: pluginInfo.package,
          engine: "@warpgogol/werkstatt",
        },
        verification: {
          "forge.doctor": "skipped",
          "werkstatt.plugin.validate": "skipped",
          "werkstatt.autonomy.validate": "skipped",
        },
        filesCreated,
        errors,
      },
      nextSteps: failNextSteps,
      exitCode: 1,
      summary: `workshop.scaffold: failed — forge.init delegation failed`,
    };
  }

  // 13. Post-scaffold verification
  const verification: ScaffoldWorkshopResult["verification"] = {
    "forge.doctor": "skipped",
    "werkstatt.plugin.validate": "skipped",
    "werkstatt.autonomy.validate": "skipped",
  };

  if (verify) {
    if (outputFormat === "pretty") {
      logger.info("Running post-scaffold verification (--verify)...");
    }

    // Run pnpm install first
    try {
      if (outputFormat === "pretty") {
        logger.info("Running pnpm install...");
      }
      execSync("pnpm install", { cwd: destPath, stdio: "pipe", timeout: 120000 });
      if (outputFormat === "pretty") {
        logger.success("pnpm install: OK");
      }
    } catch (err) {
      const stderr = String((err as { stderr?: Buffer }).stderr ?? "").trim();
      if (
        stderr.includes("E401") ||
        stderr.includes("ENEEDAUTH") ||
        stderr.includes("unable to authenticate")
      ) {
        return fail(`npm auth failure during pnpm install (SCAFFOLD-06): ${stderr.slice(0, 200)}`, {
          workshop: {
            name,
            stack,
            path: destPath,
            plugin: pluginInfo.package,
            engine: "@warpgogol/werkstatt",
          },
          verification,
          filesCreated,
        });
      }
      return fail(`pnpm install failed: ${stderr.slice(0, 200) || (err as Error).message}`, {
        workshop: {
          name,
          stack,
          path: destPath,
          plugin: pluginInfo.package,
          engine: "@warpgogol/werkstatt",
        },
        verification,
        filesCreated,
      });
    }

    // Run forge.doctor — SCAFFOLD-03
    try {
      execSync("pnpm exec werkstatt run forge.doctor", {
        cwd: destPath,
        stdio: "pipe",
        timeout: 60000,
      });
      verification["forge.doctor"] = "pass";
      if (outputFormat === "pretty") {
        logger.success("forge.doctor: pass");
      }
    } catch {
      verification["forge.doctor"] = "fail";
      errors.push("forge.doctor failed (SCAFFOLD-03)");
      if (outputFormat === "pretty") {
        logger.error("forge.doctor: fail (SCAFFOLD-03)");
      }
    }

    // Run werkstatt.plugin.validate — SCAFFOLD-04
    try {
      execSync("pnpm exec werkstatt run werkstatt.plugin.validate", {
        cwd: destPath,
        stdio: "pipe",
        timeout: 60000,
      });
      verification["werkstatt.plugin.validate"] = "pass";
      if (outputFormat === "pretty") {
        logger.success("werkstatt.plugin.validate: pass");
      }
    } catch {
      verification["werkstatt.plugin.validate"] = "fail";
      errors.push("werkstatt.plugin.validate failed (SCAFFOLD-04)");
      if (outputFormat === "pretty") {
        logger.error("werkstatt.plugin.validate: fail (SCAFFOLD-04)");
      }
    }

    // Run werkstatt.autonomy.validate
    try {
      execSync("pnpm exec werkstatt run werkstatt.autonomy.validate", {
        cwd: destPath,
        stdio: "pipe",
        timeout: 60000,
      });
      verification["werkstatt.autonomy.validate"] = "pass";
      if (outputFormat === "pretty") {
        logger.success("werkstatt.autonomy.validate: pass");
      }
    } catch {
      verification["werkstatt.autonomy.validate"] = "fail";
      errors.push("werkstatt.autonomy.validate failed");
      if (outputFormat === "pretty") {
        logger.error("werkstatt.autonomy.validate: fail");
      }
    }

    // Check if any verification failed
    const anyFail = Object.values(verification).some((v) => v === "fail");
    if (anyFail) {
      return {
        data: {
          command: "workshop.scaffold",
          status: "fail",
          workshop: {
            name,
            stack,
            path: destPath,
            plugin: pluginInfo.package,
            engine: "@warpgogol/werkstatt",
          },
          verification,
          filesCreated,
          errors,
        },
        nextSteps: failNextSteps,
        exitCode: 1,
        summary: `workshop.scaffold: failed — verification failed`,
      };
    }
  }

  if (outputFormat === "pretty") {
    logger.success(`Scaffolded workshop "${name}" in ${destPath}`);
    for (const f of filesCreated) {
      logger.info(`  created: ${f}`);
    }
  }

  return {
    data: {
      command: "workshop.scaffold",
      status: "pass",
      workshop: {
        name,
        stack,
        path: destPath,
        plugin: pluginInfo.package,
        engine: "@warpgogol/werkstatt",
      },
      verification,
      filesCreated,
      errors: [],
    },
    nextSteps: passNextSteps,
    exitCode: 0,
    summary: `workshop.scaffold: OK — scaffolded ${name} with ${filesCreated.length} files`,
  };
}
