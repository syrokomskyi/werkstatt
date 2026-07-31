/*
<MODULE_CONTRACT>
  <purpose>RFC-0626: bordbuch.commit — auto-commit dirty bordbuch projection files in the cache clone after bordbuch.generate.</purpose>
  <non-goals>
    <item>Does not generate bordbuch projections — use bordbuch.generate for that.</item>
    <item>Does not commit non-bordbuch files — only stages the three bordbuch projection paths.</item>
    <item>Does not acquire locks — pipeline runs sequentially and bordbuch.generate has already released locks by the time bordbuch.commit runs.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0626: initial bordbuch.commit command handler.</item>
</CHANGE_SUMMARY>
*/

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { gitExec } from "../werkstatt/git-exec.ts";
import { resolveCachePath } from "../sternsystem/registry-io.ts";

const BORDBUCH_PROJECTION_PATHS = [
  "bordbuch/status.generated.yaml",
  "public/.well-known/bordbuch.json",
  "public/.well-known/bordbuch/index.html",
];

export interface BordbuchCommitResult {
  committed: boolean;
  commitSha: string | null;
  systemId: string;
  filesCommitted: string[];
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

export async function commitBordbuchProjections(
  workspaceRoot: string,
  systemId: string,
): Promise<BordbuchCommitResult> {
  let cachePath: string;
  try {
    cachePath = await resolveCachePath(workspaceRoot, systemId);
  } catch {
    return { committed: false, commitSha: null, systemId, filesCommitted: [] };
  }

  const status = gitExec(cachePath, "status --porcelain", { allowNonZero: true });
  if (!status) {
    return { committed: false, commitSha: null, systemId, filesCommitted: [] };
  }

  const dirtyFiles = status
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => line.slice(3).trim());

  const bordbuchDirty = dirtyFiles.filter((f) =>
    BORDBUCH_PROJECTION_PATHS.some((p) => f === p || f.startsWith(p)),
  );

  if (bordbuchDirty.length === 0) {
    return { committed: false, commitSha: null, systemId, filesCommitted: [] };
  }

  const addArgs = bordbuchDirty.map((f) => `-- ${f}`).join(" ");
  gitExec(cachePath, `add ${addArgs}`);

  gitExec(cachePath, 'commit -m "chore: bordbuch projections from build.prepare"');

  const sha = gitExec(cachePath, "rev-parse HEAD");

  return { committed: true, commitSha: sha, systemId, filesCommitted: bordbuchDirty };
}

export async function runBordbuchCommit(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<BordbuchCommitResult>> {
  const { workspaceRoot, logger } = context;
  const systemId = flagString(input, "system") ?? context.site?.name;

  if (!systemId) {
    return {
      summary: "[bordbuch.commit] no system id — skipping",
    };
  }

  const result = await commitBordbuchProjections(workspaceRoot, systemId);

  if (result.committed) {
    logger.success(
      `[bordbuch.commit] committed ${result.filesCommitted.length} bordbuch projection files for ${systemId}`,
    );
    return {
      data: result,
      summary: `[bordbuch.commit] committed ${result.filesCommitted.length} bordbuch projection files for ${systemId}`,
    };
  }

  return {
    data: result,
    summary: `[bordbuch.commit] no dirty bordbuch files for ${systemId}`,
  };
}
