/*
<MODULE_CONTRACT>
<purpose>RFC-0477: sternsystem.status — read-only synchronization state inspection for a Sternsystem.</purpose>
<non-goals>
  <item>Does not mutate state — read-only diagnostic command.</item>
  <item>Does not check bordbuch hash-chain integrity — that is bordbuch.validate.</item>
  <item>Does not show deployment status — that is leitstand.status.</item>
  <item>Does not perform live network calls to the mirror — reads local refs only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0477: initial sternsystem.status command handler.</item>
</CHANGE_SUMMARY>
*/

import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import type { BordbuchEntry } from "@warpgogol/ontology/operations";
import { readRegistry, findEntry } from "./registry-io.ts";
import { readBordbuch } from "../bordbuch/bordbuch-io.ts";
import { readMissionManifest } from "../mission/mission-io.ts";

export interface SternsystemStatusGit {
  headSha: string | null;
  originSha: string | null;
  mirrorSha: string | null;
  headVsOrigin: "sync" | "behind" | "ahead" | "diverged" | "unknown";
  originVsMirror: "sync" | "behind" | "ahead" | "diverged" | "unknown";
  dirtyFiles: string[];
}

export interface SternsystemStatusBordbuch {
  lastEvents: BordbuchEntry[];
  totalEvents: number;
}

export interface SternsystemStatusLastMission {
  missionId: string | null;
  state: string;
  reconciledAt: string | null;
}

export interface SternsystemStatusData {
  systemId: string;
  git: SternsystemStatusGit;
  bordbuch: SternsystemStatusBordbuch;
  lastMission: SternsystemStatusLastMission | null;
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function flagBoolean(input: KernelCommandInput, key: string): boolean {
  const v = input.flags[key];
  return v === true || v === "true";
}

function gitExec(cwd: string, args: string): string {
  return execSync(`git ${args}`, {
    cwd,
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    timeout: 30_000,
  }).trim();
}

function resolveRepoPath(workspaceRoot: string, repo: string): string {
  if (repo.startsWith("local:")) {
    return path.resolve(workspaceRoot, repo.slice("local:".length));
  }
  if (repo.startsWith("./") || repo.startsWith("../") || repo.startsWith("/")) {
    return path.resolve(workspaceRoot, repo);
  }
  return repo;
}

function compareSha(
  a: string | null,
  b: string | null,
): "sync" | "behind" | "ahead" | "diverged" | "unknown" {
  if (!a || !b) return "unknown";
  if (a === b) return "sync";
  return "unknown";
}

async function statusForSystem(
  workspaceRoot: string,
  systemId: string,
): Promise<SternsystemStatusData> {
  const systemDir = path.join(workspaceRoot, "systems", systemId);
  const registry = await readRegistry(workspaceRoot);
  const entry = findEntry(registry, systemId);

  // Git SHAs
  let headSha: string | null = null;
  let originSha: string | null = null;
  let mirrorSha: string | null = null;
  let dirtyFiles: string[] = [];

  if (existsSync(systemDir)) {
    try {
      headSha = gitExec(systemDir, "rev-parse HEAD");
    } catch {
      headSha = null;
    }
    try {
      dirtyFiles = gitExec(systemDir, "status --porcelain")
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => l.slice(3));
    } catch {
      dirtyFiles = [];
    }
  }

  if (entry?.repo) {
    const bareRepoPath = resolveRepoPath(workspaceRoot, entry.repo);
    if (existsSync(bareRepoPath)) {
      let branch: string;
      try {
        branch = gitExec(bareRepoPath, "symbolic-ref HEAD").replace("refs/heads/", "");
      } catch {
        branch = "master";
      }
      try {
        originSha = gitExec(bareRepoPath, `rev-parse ${branch}`);
      } catch {
        originSha = null;
      }
      if (entry.mirror) {
        try {
          mirrorSha = gitExec(bareRepoPath, `rev-parse refs/mirror/${branch}`);
        } catch {
          mirrorSha = null;
        }
      }
    }
  }

  // Bordbuch events
  const entries = await readBordbuch(workspaceRoot, systemId);
  const lastEvents = entries.slice(-6);
  const totalEvents = entries.length;

  // Last mission from bordbuch
  let lastMission: SternsystemStatusLastMission | null = null;
  let lastMissionId: string | null = null;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (
      entries[i].kind === "mission-open" ||
      entries[i].kind === "mission-close" ||
      entries[i].kind === "mission-abort"
    ) {
      lastMissionId = entries[i].missionId ?? null;
      break;
    }
  }

  if (lastMissionId) {
    try {
      const manifest = await readMissionManifest(workspaceRoot, lastMissionId);
      lastMission = {
        missionId: lastMissionId,
        state: manifest.state,
        reconciledAt: manifest.reconciledAt,
      };
    } catch {
      lastMission = {
        missionId: lastMissionId,
        state: "unknown",
        reconciledAt: null,
      };
    }
  }

  return {
    systemId,
    git: {
      headSha,
      originSha,
      mirrorSha,
      headVsOrigin: compareSha(headSha, originSha),
      originVsMirror: compareSha(originSha, mirrorSha),
      dirtyFiles,
    },
    bordbuch: {
      lastEvents,
      totalEvents,
    },
    lastMission,
  };
}

export async function runSternsystemStatus(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<SternsystemStatusData | SternsystemStatusData[]>> {
  const { workspaceRoot } = context;
  const id = flagString(input, "id");
  const all = flagBoolean(input, "all");

  if (!id && !all) {
    throw new Error("[sternsystem.status] --id is required (or use --all for all systems)");
  }

  if (all) {
    const registry = await readRegistry(workspaceRoot);
    const results: SternsystemStatusData[] = [];
    for (const entry of registry.systems) {
      try {
        const status = await statusForSystem(workspaceRoot, entry.id);
        results.push(status);
      } catch {
        results.push({
          systemId: entry.id,
          git: {
            headSha: null,
            originSha: null,
            mirrorSha: null,
            headVsOrigin: "unknown",
            originVsMirror: "unknown",
            dirtyFiles: [],
          },
          bordbuch: { lastEvents: [], totalEvents: 0 },
          lastMission: null,
        });
      }
    }
    return {
      data: results,
      summary: `[sternsystem.status] reported ${results.length} system(s)`,
    };
  }

  const status = await statusForSystem(workspaceRoot, id!);
  const mirrorInfo =
    status.git.originVsMirror === "sync"
      ? "mirror in sync"
      : status.git.originVsMirror === "unknown"
        ? "mirror unknown"
        : `mirror ${status.git.originVsMirror}`;
  return {
    data: status,
    summary: `[sternsystem.status] ${id}: HEAD=${status.git.headVsOrigin} origin, ${mirrorInfo}`,
  };
}
