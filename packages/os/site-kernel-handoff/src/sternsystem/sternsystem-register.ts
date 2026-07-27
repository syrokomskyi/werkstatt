/*
<MODULE_CONTRACT>
<purpose>RFC-0354 §7.1 + RFC-0532: sternsystem.register — add a new Sternsystem to the fleet
registry, create pin, content stubs, open first mission, and trigger materialization.
With --amend: update pin and open amend mission without creating a new registry entry.</purpose>
<non-goals>
  <item>Do not introduce app-specific runtime composition or deployment behavior into this reusable package source file.</item>
  <item>Do not reimplement pin, mission.open, or mission.materialize logic — delegate to existing commands.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0354: initial register command handler.</item>
  <item>RFC-0532: extend with pin creation, content stubs, mission.open, mission.materialize, --amend/--amend-id flags, and atomic rollback.</item>
</CHANGE_SUMMARY>
*/

import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
  KernelFlagValue,
} from "@warpgogol/site-kernel";
import { StarCatalog, type StarName } from "@warpgogol/ontology/cosmic";
import { parseBriefFrontmatter } from "@warpgogol/site-kernel-onboarding";
import {
  readRegistry,
  writeRegistry,
  findEntry,
  findEntryByStar,
  hasAppsCollision,
} from "./registry-io.ts";
import { runSternsystemPin } from "./sternsystem-pin.ts";
import { ensureMirrorHook } from "./mirror-hook.ts";
import { runMissionOpen } from "../mission/mission-open.ts";
import { runMissionMaterialize } from "../mission/mission-materialize.ts";
import { runMissionAbort } from "../mission/mission-abort.ts";

export interface SternsystemRegisterData {
  command: "sternsystem.register";
  system: string;
  status: "pass" | "fail";
  registryEntry?: {
    id: string;
    cosmicStar: string;
    status: "registered" | "active";
    registeredAt: string;
  };
  pinPath?: string;
  firstMissionId?: string;
  diagnostics: string[];
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function flagBool(input: KernelCommandInput, key: string): boolean {
  const v = input.flags[key];
  return typeof v === "boolean" ? v : false;
}

function flagNumber(input: KernelCommandInput, key: string): number | undefined {
  const v = input.flags[key];
  return typeof v === "number" ? v : typeof v === "string" ? Number(v) : undefined;
}

function makeInput(flags: Record<string, KernelFlagValue>): KernelCommandInput {
  return { flags, args: [], argv: [] };
}

export async function createContentStub(workspaceRoot: string, id: string): Promise<void> {
  const briefPath = join(workspaceRoot, "onboarding", id, ".input", "00-brief.md");
  if (!existsSync(briefPath)) return;

  const raw = await readFile(briefPath, "utf8");
  let brief: ReturnType<typeof parseBriefFrontmatter>;
  try {
    brief = parseBriefFrontmatter(raw);
  } catch {
    return;
  }

  const contentDir = join(workspaceRoot, "systems", id, "content");
  await mkdir(contentDir, { recursive: true });

  const supported = brief.i18n.supported.map((l) => `  - ${l}`).join("\n");
  const systemMd = `---
identity:
  domain: ${brief.client.domain}
i18n:
  default: ${brief.i18n.default}
  supported:
${supported}
legalJurisdiction: ${brief.legalJurisdiction}
---
`;
  await writeFile(join(contentDir, "system.md"), systemMd, "utf8");
}

async function rollbackRegistry(workspaceRoot: string, id: string): Promise<void> {
  const registry = await readRegistry(workspaceRoot);
  const entryIndex = registry.systems.findIndex((s) => s.id === id);
  if (entryIndex >= 0) {
    registry.systems.splice(entryIndex, 1);
    await writeRegistry(workspaceRoot, registry);
  }
}

async function rollbackPin(workspaceRoot: string, id: string): Promise<void> {
  const pinPath = join(workspaceRoot, "systems", id, "system.pin.json");
  if (existsSync(pinPath)) {
    await rm(pinPath, { force: true });
  }
}

async function rollbackContent(workspaceRoot: string, id: string): Promise<void> {
  const contentPath = join(workspaceRoot, "systems", id, "content");
  if (existsSync(contentPath)) {
    await rm(contentPath, { recursive: true, force: true });
  }
}

async function rollbackSystemDirIfEmpty(workspaceRoot: string, id: string): Promise<void> {
  const systemDir = join(workspaceRoot, "systems", id);
  if (!existsSync(systemDir)) return;
  const gitDir = join(systemDir, ".git");
  if (existsSync(gitDir)) return;
  await rm(systemDir, { recursive: true, force: true });
}

export async function runSternsystemRegister(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SternsystemRegisterData>> {
  const { workspaceRoot, logger } = context;

  const id = flagString(input, "id");
  const cosmicStar = flagString(input, "cosmicStar");
  const repo = flagString(input, "repo");
  const platform = flagString(input, "platform");
  const mirror = flagString(input, "mirror");
  const isAmend = flagBool(input, "amend");
  const amendId = flagNumber(input, "amend-id");

  if (!id) throw new Error("[sternsystem.register] requires --id <kebab-case-id>");

  const diagnostics: string[] = [];

  if (isAmend) {
    const registry = await readRegistry(workspaceRoot);
    const entry = findEntry(registry, id);
    if (!entry) {
      throw new Error(
        `[sternsystem.register] --amend: system '${id}' does not exist in systems/registry.yaml`,
      );
    }

    const pinInput: Record<string, KernelFlagValue> = { id };
    if (platform) pinInput.platform = platform;
    const pinResult = await runSternsystemPin(makeInput(pinInput), context);
    const pinPath = pinResult.data!.pinPath;

    const brief = amendId ? `Amend ${amendId} for ${id}` : `Amend for ${id}`;
    const missionResult = await runMissionOpen(makeInput({ system: id, brief }), context);
    const missionId = missionResult.data!.missionId;

    try {
      await runMissionMaterialize(makeInput({ mission: missionId }), context);
    } catch (materializeError) {
      logger.info(
        `[sternsystem.register] mission.materialize failed during amend — aborting mission ${missionId}`,
      );
      try {
        await runMissionAbort(
          makeInput({
            mission: missionId,
            reason: "sternsystem.register amend: materialize failed",
          }),
          context,
        );
      } catch (abortError) {
        diagnostics.push(
          `mission.abort also failed: ${abortError instanceof Error ? abortError.message : String(abortError)}`,
        );
      }
      throw materializeError;
    }

    return {
      data: {
        command: "sternsystem.register",
        system: id,
        status: "pass",
        pinPath,
        firstMissionId: missionId,
        diagnostics,
      },
      summary: `[sternsystem.register] amended '${id}' — mission ${missionId} opened and materialized`,
    };
  }

  if (!cosmicStar) throw new Error("[sternsystem.register] requires --cosmicStar <StarName>");
  if (!repo) throw new Error("[sternsystem.register] requires --repo <git-url-or-local-path>");

  if (!(StarCatalog as readonly string[]).includes(cosmicStar)) {
    throw new Error(`[sternsystem.register] cosmicStar '${cosmicStar}' is not in StarCatalog`);
  }

  if (hasAppsCollision(workspaceRoot, id)) {
    throw new Error(
      `[sternsystem.register] id '${id}' matches existing apps/${id}/ — extract first`,
    );
  }

  const registry = await readRegistry(workspaceRoot);

  if (findEntry(registry, id)) {
    throw new Error(`[sternsystem.register] id '${id}' already exists in systems/registry.yaml`);
  }

  const starOwner = findEntryByStar(registry, cosmicStar, "archived");
  if (starOwner) {
    throw new Error(
      `[sternsystem.register] cosmicStar '${cosmicStar}' is already used by '${starOwner.id}' (status: ${starOwner.status})`,
    );
  }

  const pinnedPlatform = platform ?? registry.systems[0]?.pinnedPlatform ?? "0.0.0";

  const entry = {
    id,
    cosmicStar: cosmicStar as StarName,
    repo,
    pinnedPlatform,
    currentMission: null,
    lastRelease: null,
    status: "registered" as const,
    registeredAt: new Date().toISOString(),
    mirror: mirror ?? undefined,
    notes: "",
  };

  registry.systems.push(entry);
  await writeRegistry(workspaceRoot, registry);

  const systemDir = join(workspaceRoot, "systems", id);
  await mkdir(systemDir, { recursive: true });

  let pinCreated = false;
  let contentCreated = false;
  let missionOpened = false;
  let missionId: string | undefined;

  try {
    const pinInput: Record<string, KernelFlagValue> = { id };
    if (platform) pinInput.platform = platform;
    const pinResult = await runSternsystemPin(makeInput(pinInput), context);
    const pinPath = pinResult.data!.pinPath;
    pinCreated = true;

    await createContentStub(workspaceRoot, id);
    contentCreated = true;

    const missionResult = await runMissionOpen(
      makeInput({ system: id, brief: `Initial onboarding for ${id}` }),
      context,
    );
    missionId = missionResult.data!.missionId;
    missionOpened = true;

    try {
      await runMissionMaterialize(makeInput({ mission: missionId }), context);
    } catch (materializeError) {
      logger.info(
        `[sternsystem.register] mission.materialize failed — rolling back mission ${missionId}`,
      );
      try {
        await runMissionAbort(
          makeInput({ mission: missionId, reason: "sternsystem.register: materialize failed" }),
          context,
        );
      } catch (abortError) {
        diagnostics.push(
          `mission.abort also failed: ${abortError instanceof Error ? abortError.message : String(abortError)}`,
        );
      }
      throw materializeError;
    }

    if (mirror) {
      const bareRepoPath = repo.startsWith("local:")
        ? path.resolve(workspaceRoot, repo.slice("local:".length))
        : repo.startsWith("./") || repo.startsWith("../") || repo.startsWith("/")
          ? path.resolve(workspaceRoot, repo)
          : repo;
      if (existsSync(bareRepoPath)) {
        const hookResult = ensureMirrorHook(bareRepoPath);
        if (hookResult.installed) {
          logger.info(`[sternsystem.register] installed post-receive mirror auto-push hook`);
        } else if (hookResult.updated) {
          logger.info(`[sternsystem.register] updated post-receive mirror auto-push hook`);
        }
      }
    }

    logger.success(
      `[sternsystem.register] registered '${id}' (cosmicStar: ${cosmicStar}) — mission ${missionId} opened and materialized`,
    );

    return {
      data: {
        command: "sternsystem.register",
        system: id,
        status: "pass",
        registryEntry: {
          id,
          cosmicStar,
          status: "active",
          registeredAt: entry.registeredAt,
        },
        pinPath,
        firstMissionId: missionId,
        diagnostics,
      },
      summary: `[sternsystem.register] ${id} registered with cosmicStar ${cosmicStar} — mission ${missionId} materialized`,
    };
  } catch (error) {
    logger.info(
      `[sternsystem.register] rolling back due to error: ${error instanceof Error ? error.message : String(error)}`,
    );

    if (missionOpened && missionId) {
      try {
        await runMissionAbort(
          makeInput({ mission: missionId, reason: "sternsystem.register rollback" }),
          context,
        );
      } catch (abortError) {
        diagnostics.push(
          `mission.abort during rollback failed: ${abortError instanceof Error ? abortError.message : String(abortError)}`,
        );
      }
    }
    if (contentCreated) {
      await rollbackContent(workspaceRoot, id);
    }
    if (pinCreated) {
      await rollbackPin(workspaceRoot, id);
    }
    await rollbackRegistry(workspaceRoot, id);
    await rollbackSystemDirIfEmpty(workspaceRoot, id);

    diagnostics.push(
      `sternsystem.register failed: ${error instanceof Error ? error.message : String(error)}`,
    );

    return {
      data: {
        command: "sternsystem.register",
        system: id,
        status: "fail",
        diagnostics,
      },
      exitCode: 1,
      summary: `[sternsystem.register] ${id} failed and rolled back: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
