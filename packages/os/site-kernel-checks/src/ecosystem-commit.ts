/*
<MODULE_CONTRACT>
  <purpose>RFC-0533: ecosystem.commit command handler — atomic version bump, semantic hash, and commit with trailers for platform-scope changes.</purpose>
  <non-goals>
    <item>Do not manage git staging of operator files — the operator stages platform files; ecosystem.commit only adds package.json and the version log.</item>
    <item>Do not validate conventional commit message format — message body is the operator's responsibility.</item>
    <item>Do not support multi-RFC commits — one commit references at most one RFC.</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0533: initial ecosystem.commit command handler.</item>
  <item>RFC-0704: added independentVersionPackages skip-bump logic — when all staged platform files belong to independent packages, skips root version bump, version log write, and platform trailers.</item>
</CHANGE_SUMMARY>
*/

import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { parse as yamlParse, stringify as yamlStringify } from "yaml";

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import {
  resolvePlatformSemanticHash,
  parseSemver,
  isPlatformScope,
  extractTrailer,
} from "@warpgogol/site-kernel";

const execFileAsync = promisify(execFile);

const VERSION_LOG_PATH = "docs/platform-version-log.generated.yaml";
const PACKAGE_JSON_PATH = "package.json";

export interface EcosystemCommitInput {
  message: string;
  rfc?: string;
  dryRun?: boolean;
  amend?: boolean;
  json?: boolean;
}

export interface EcosystemCommitResult {
  command: "ecosystem.commit";
  status: "ok" | "blocked" | "dry-run";
  previousVersion: string;
  newVersion: string;
  bumpType: "patch" | "minor" | "major" | "none";
  rfcId: string | null;
  platformSemanticHash: string;
  commitSha: string | null;
  trailers: {
    "X-Platform-Bump"?: string;
    "X-Platform-Version"?: string;
    "X-RFC"?: string;
  };
  pcForecast?: {
    pc02: "pass" | "warning";
    pc03: "pass" | "error";
  };
  violations?: EcosystemCommitViolation[];
  skipPlatformBump?: boolean;
  warnings?: string[];
}

export interface EcosystemCommitViolation {
  code: string;
  message: string;
  fixHint: string;
}

function flagString(input: KernelCommandInput, key: string): string | undefined {
  const v = input.flags[key];
  return typeof v === "string" ? v : undefined;
}

function flagBoolean(input: KernelCommandInput, key: string): boolean {
  const v = input.flags[key];
  return typeof v === "boolean" ? v : false;
}

async function getStagedFiles(workspaceRoot: string): Promise<string[]> {
  const { stdout } = await execFileAsync("git", ["diff", "--cached", "--name-only"], {
    cwd: workspaceRoot,
  });
  return stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0);
}

async function getHeadCommitSha(workspaceRoot: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["rev-parse", "--short", "HEAD"], {
    cwd: workspaceRoot,
  });
  return stdout.trim();
}

async function isCommitPushed(workspaceRoot: string, sha: string): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("git", ["branch", "-r", "--contains", sha], {
      cwd: workspaceRoot,
    });
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function getCommitMessage(workspaceRoot: string, sha: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["log", "-1", "--format=%B", sha], {
    cwd: workspaceRoot,
  });
  return stdout;
}

function bumpVersion(current: string, bumpType: "patch" | "minor" | "major"): string {
  const [major, minor, patch] = parseSemver(current);
  if (bumpType === "major") return `${major + 1}.0.0`;
  if (bumpType === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

async function readRfcVersionBump(
  workspaceRoot: string,
  rfcId: string,
): Promise<{ versionBump: string | undefined; found: boolean }> {
  const rfcDir = path.join(workspaceRoot, "docs", "rfcs");
  try {
    const files = await fs.readdir(rfcDir);
    const rfcFile = files.find(
      (f) => f.startsWith(rfcId.toLowerCase() + "-") || f.startsWith(rfcId + "-"),
    );
    if (!rfcFile) return { versionBump: undefined, found: false };
    const content = await fs.readFile(path.join(rfcDir, rfcFile), "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) return { versionBump: undefined, found: true };
    const fm = yamlParse(fmMatch[1]) as Record<string, unknown>;
    return {
      versionBump: typeof fm["versionBump"] === "string" ? fm["versionBump"] : undefined,
      found: true,
    };
  } catch {
    return { versionBump: undefined, found: false };
  }
}

interface PlatformVersionLogEntry {
  hash: string;
  version: string;
  validatedAt: string;
}

async function writeVersionLog(
  workspaceRoot: string,
  hash: string,
  version: string,
): Promise<void> {
  const logPath = path.join(workspaceRoot, VERSION_LOG_PATH);
  const entry: PlatformVersionLogEntry = {
    hash,
    version,
    validatedAt: new Date().toISOString(),
  };
  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(logPath, yamlStringify(entry), "utf-8");
}

async function readVersionLog(workspaceRoot: string): Promise<PlatformVersionLogEntry | null> {
  const logPath = path.join(workspaceRoot, VERSION_LOG_PATH);
  try {
    const content = await fs.readFile(logPath, "utf-8");
    return yamlParse(content) as PlatformVersionLogEntry;
  } catch {
    return null;
  }
}

function buildCommitMessage(
  message: string,
  bumpType: string,
  newVersion: string,
  rfcId: string | null,
): string {
  const trailers = [`X-Platform-Bump: ${bumpType}`, `X-Platform-Version: ${newVersion}`];
  if (rfcId) {
    trailers.push(`X-RFC: ${rfcId}`);
  }
  return `${message}\n\n${trailers.join("\n")}`;
}

function isIndependentPackage(filePath: string, independentPackages: string[]): boolean {
  return independentPackages.some((pkgPath) => filePath.startsWith(pkgPath + "/"));
}

async function loadIndependentVersionPackages(
  workspaceRoot: string,
): Promise<{ packages: string[]; invalidPaths: string[] }> {
  const forgeYamlPath = path.join(workspaceRoot, "forge.yaml");
  try {
    const content = await fs.readFile(forgeYamlPath, "utf-8");
    const parsed = yamlParse(content) as Record<string, unknown>;
    const list = parsed["independentVersionPackages"];
    if (!Array.isArray(list)) return { packages: [], invalidPaths: [] };
    const packages: string[] = [];
    const invalidPaths: string[] = [];
    for (const pkgPath of list) {
      if (typeof pkgPath !== "string") continue;
      const pkgJsonPath = path.join(workspaceRoot, pkgPath, "package.json");
      try {
        await fs.access(pkgJsonPath);
        packages.push(pkgPath);
      } catch {
        invalidPaths.push(pkgPath);
      }
    }
    return { packages, invalidPaths };
  } catch {
    return { packages: [], invalidPaths: [] };
  }
}

export async function runEcosystemCommit(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<EcosystemCommitResult>> {
  const { workspaceRoot } = context;
  const message = flagString(input, "message");
  const rfcId = flagString(input, "rfc");
  const dryRun = flagBoolean(input, "dry-run");
  const amend = flagBoolean(input, "amend");

  const violations: EcosystemCommitViolation[] = [];

  if (!message) {
    violations.push({
      code: "EC-08",
      message: "Missing required --message flag.",
      fixHint: 'Provide --message "<your commit message>".',
    });
  }

  // Get staged files
  const stagedFiles = await getStagedFiles(workspaceRoot);
  const platformStaged = stagedFiles.filter(isPlatformScope);

  // EC-01: no staged files in platform scope
  if (platformStaged.length === 0) {
    violations.push({
      code: "EC-01",
      message: "No staged files match platform scope (packages/**, integrations/**, services/**).",
      fixHint: "Use `git commit` for non-platform changes, or stage platform files first.",
    });
  }

  // RFC-0704: Check if all staged platform files belong to independent version packages
  const { packages: independentPackages, invalidPaths } =
    await loadIndependentVersionPackages(workspaceRoot);
  const warnings: string[] = [];
  for (const invalidPath of invalidPaths) {
    warnings.push(
      `independentVersionPackages path "${invalidPath}" does not exist or has no package.json — proceeding with normal bump`,
    );
  }
  const allInIndependent =
    independentPackages.length > 0 &&
    platformStaged.length > 0 &&
    platformStaged.every((f) => isIndependentPackage(f, independentPackages));
  const skipPlatformBump = allInIndependent && invalidPaths.length === 0;

  // In skip mode, EC-02 and EC-03 do not apply — ecosystem.commit does not touch package.json or the version log
  if (!skipPlatformBump) {
    // EC-02: package.json already staged
    if (stagedFiles.includes(PACKAGE_JSON_PATH)) {
      violations.push({
        code: "EC-02",
        message: "package.json is already staged by the operator.",
        fixHint: "Unstage package.json — ecosystem.commit manages it exclusively.",
      });
    }

    // EC-03: version log already staged
    if (stagedFiles.includes(VERSION_LOG_PATH)) {
      violations.push({
        code: "EC-03",
        message: "platform-version-log.generated.yaml is already staged by the operator.",
        fixHint: "Unstage the log file — ecosystem.commit manages it exclusively.",
      });
    }
  }

  // Skip-bump path: commit without version bump, version log, or platform trailers
  if (skipPlatformBump && violations.length === 0) {
    if (dryRun) {
      return {
        data: {
          command: "ecosystem.commit",
          status: "dry-run",
          previousVersion: "",
          newVersion: "",
          bumpType: "none",
          rfcId: rfcId ?? null,
          platformSemanticHash: "",
          commitSha: null,
          trailers: {},
          skipPlatformBump: true,
          warnings: warnings.length > 0 ? warnings : undefined,
        },
        exitCode: 0,
        summary: `Dry-run: skip platform bump (all staged files in independentVersionPackages)`,
      };
    }

    // Commit with just the operator's message — no platform trailers
    const skipCommitArgs = amend
      ? ["commit", "--amend", "-m", message!]
      : ["commit", "-m", message!];
    await execFileAsync("git", skipCommitArgs, {
      cwd: workspaceRoot,
      env: { ...process.env, ECOSYSTEM_COMMIT: "1" },
    });

    const commitSha = await getHeadCommitSha(workspaceRoot);

    return {
      data: {
        command: "ecosystem.commit",
        status: "ok",
        previousVersion: "",
        newVersion: "",
        bumpType: "none",
        rfcId: rfcId ?? null,
        platformSemanticHash: "",
        commitSha,
        trailers: {},
        skipPlatformBump: true,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
      exitCode: 0,
      summary: `Committed independent-package change (skip platform bump)`,
    };
  }

  // Determine bump type
  let bumpType: "patch" | "minor" | "major" = "patch";
  let resolvedRfcId: string | null = null;

  if (rfcId) {
    resolvedRfcId = rfcId;
    const { versionBump, found } = await readRfcVersionBump(workspaceRoot, rfcId);

    // EC-04: RFC not found
    if (!found) {
      violations.push({
        code: "EC-04",
        message: `${rfcId} not found in docs/rfcs/.`,
        fixHint:
          'Run `rfc.next-id` for the next free RFC number, or `rfc.create --title "..."` to create one.',
      });
    } else if (versionBump === undefined) {
      // EC-05: versionBump absent in post-cutoff RFC
      violations.push({
        code: "EC-05",
        message: `${rfcId} has no versionBump field.`,
        fixHint:
          "Add `versionBump: patch | minor | none | major` to RFC frontmatter before committing.",
      });
    } else if (versionBump === "none") {
      // EC-06: versionBump: none
      violations.push({
        code: "EC-06",
        message: `${rfcId} declares versionBump: none — no version bump needed.`,
        fixHint: "Use `git commit` for prose-only RFC changes that do not touch platform scope.",
      });
    } else if (versionBump === "minor" || versionBump === "major") {
      bumpType = versionBump;
    }
  }

  // Read current version
  let packageJson: { version?: string };
  try {
    packageJson = JSON.parse(
      await fs.readFile(path.join(workspaceRoot, PACKAGE_JSON_PATH), "utf-8"),
    ) as { version?: string };
  } catch {
    throw new Error("[ecosystem.commit] Could not read root package.json");
  }
  const currentVersion = packageJson.version ?? "0.0.0";

  // Handle --amend
  let previousVersion = currentVersion;
  if (amend) {
    const headSha = await getHeadCommitSha(workspaceRoot);
    const pushed = await isCommitPushed(workspaceRoot, headSha);
    if (pushed) {
      violations.push({
        code: "EC-07",
        message: "The target commit has been pushed to a remote and cannot be amended.",
        fixHint: "Create a new commit instead of amending.",
      });
    }
    const prevMessage = await getCommitMessage(workspaceRoot, headSha);
    const prevVersionTrailer = extractTrailer(prevMessage, "X-Platform-Version");
    if (prevVersionTrailer) {
      previousVersion = prevVersionTrailer;
    } else {
      violations.push({
        code: "EC-09",
        message: "The target commit was not created by ecosystem.commit and cannot be amended.",
        fixHint: "Only ecosystem.commit commits can be amended with --amend.",
      });
    }
  }

  // If violations, return blocked
  if (violations.length > 0) {
    return {
      data: {
        command: "ecosystem.commit",
        status: "blocked",
        previousVersion: currentVersion,
        newVersion: currentVersion,
        bumpType,
        rfcId: resolvedRfcId,
        platformSemanticHash: "",
        commitSha: null,
        trailers: {
          "X-Platform-Bump": bumpType,
          "X-Platform-Version": currentVersion,
        },
        violations,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
      exitCode: 1,
      summary: `ecosystem.commit blocked: ${violations.map((v) => v.code).join(", ")}`,
    };
  }

  // Compute new version
  const newVersion = amend
    ? bumpVersion(previousVersion, bumpType)
    : bumpVersion(currentVersion, bumpType);

  // Compute platform semantic hash
  const platformSemanticHash = await resolvePlatformSemanticHash(workspaceRoot);

  // Build trailers
  const trailers: EcosystemCommitResult["trailers"] = {
    "X-Platform-Bump": bumpType,
    "X-Platform-Version": newVersion,
  };
  if (resolvedRfcId) {
    trailers["X-RFC"] = resolvedRfcId;
  }

  // Dry-run: return forecast without committing
  if (dryRun) {
    const lastLog = await readVersionLog(workspaceRoot);
    const hashChanged = lastLog ? lastLog.hash !== platformSemanticHash : true;
    const versionBumpedFromLog = lastLog ? lastLog.version !== newVersion : true;
    const pc02 = hashChanged && !versionBumpedFromLog ? "warning" : "pass";
    const pc03 = hashChanged && !versionBumpedFromLog ? "error" : "pass";
    return {
      data: {
        command: "ecosystem.commit",
        status: "dry-run",
        previousVersion: amend ? previousVersion : currentVersion,
        newVersion,
        bumpType,
        rfcId: resolvedRfcId,
        platformSemanticHash,
        commitSha: null,
        trailers,
        pcForecast: {
          pc02: pc02 as "pass" | "warning",
          pc03: pc03 as "pass" | "error",
        },
        warnings: warnings.length > 0 ? warnings : undefined,
      },
      exitCode: 0,
      summary: `Dry-run: ${amend ? previousVersion : currentVersion} → ${newVersion} (${bumpType}${resolvedRfcId ? `, ${resolvedRfcId}` : ""})`,
    };
  }

  // Write version log
  await writeVersionLog(workspaceRoot, platformSemanticHash, newVersion);

  // Bump package.json version
  const pkgPath = path.join(workspaceRoot, PACKAGE_JSON_PATH);
  const pkgContent = await fs.readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(pkgContent) as Record<string, unknown>;
  pkg["version"] = newVersion;
  await fs.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");

  // Stage package.json and version log
  await execFileAsync("git", ["add", PACKAGE_JSON_PATH, VERSION_LOG_PATH], {
    cwd: workspaceRoot,
  });

  // Commit with trailers
  const fullMessage = buildCommitMessage(message!, bumpType, newVersion, resolvedRfcId);
  const commitArgs = amend
    ? ["commit", "--amend", "-m", fullMessage]
    : ["commit", "-m", fullMessage];
  await execFileAsync("git", commitArgs, {
    cwd: workspaceRoot,
    env: { ...process.env, ECOSYSTEM_COMMIT: "1" },
  });

  const commitSha = await getHeadCommitSha(workspaceRoot);

  return {
    data: {
      command: "ecosystem.commit",
      status: "ok",
      previousVersion: amend ? previousVersion : currentVersion,
      newVersion,
      bumpType,
      rfcId: resolvedRfcId,
      platformSemanticHash,
      commitSha,
      trailers,
      warnings: warnings.length > 0 ? warnings : undefined,
    },
    exitCode: 0,
    summary: `Committed platform change: ${amend ? previousVersion : currentVersion} → ${newVersion} (${bumpType})`,
  };
}
