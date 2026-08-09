/* <MODULE_CONTRACT>
<purpose>Facilitates the export of client application files while respecting ignore patterns and predefined inclusion/exclusion rules.</purpose>
<non-goals>
  <item>Do not handle the transport or orchestration of configuration settings.</item>
  <item>Do not parse raw content of files; focus solely on file management.</item>
  <item>Do not manage application state or runtime context beyond file operations.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Backfilled Compass scaffolding to enhance file navigation and maintainability.</item>
</CHANGE_SUMMARY> */

import { execFile } from "node:child_process";
import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";

const execFileAsync = promisify(execFile);
/**
 * Convert a single gitignore-format line into a RegExp, or return null if
 * the line is blank, a comment, or a negation pattern.
 *
 * Rules implemented:
 *  - Trailing slash is stripped before matching (it signals "directory only",
 *    which we do not need to distinguish here because we check paths, not types).
 *  - Leading slash is stripped; its presence (or any internal slash) marks the
 *    pattern as "rooted" (relative to workspace root).
 *  - Unrooted patterns match at any depth: `*.log` hits `a/b/c.log`.
 *  - `**` matches any sequence of path segments.
 *  - `*` matches any sequence of non-separator characters.
 *  - `?` matches a single non-separator character.
 */
function patternToRegex(raw: string): RegExp | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("!")) {
    return null;
  }

  let p = trimmed;

  // Detect whether pattern is rooted (has a slash other than trailing)
  const hasTrailingSlash = p.endsWith("/");
  if (hasTrailingSlash) p = p.slice(0, -1);
  const hasLeadingSlash = p.startsWith("/");
  if (hasLeadingSlash) p = p.slice(1);
  const hasInternalSlash = p.includes("/");
  const isRooted = hasLeadingSlash || hasInternalSlash;

  // Escape all regex meta-characters except the glob characters (* ? [)
  const regexStr = p
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\x00") // protect ** before replacing *
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]")
    .replace(/\x00/g, ".*"); // ** → any depth

  if (isRooted) {
    return new RegExp(`^${regexStr}($|/)`);
  }
  // Unrooted: match as a full path segment at any depth
  return new RegExp(`(^|/)${regexStr}($|/)`);
}

/** Parse an ignore file (gitignore format) and return a list of compiled RegExps. */
function parseIgnoreFile(content: string): RegExp[] {
  return content
    .split("\n")
    .map((line) => patternToRegex(line))
    .filter((r): r is RegExp => r !== null);
}

/**
 * Return true if `relativePath` (slash-normalised, relative to workspace root)
 * matches at least one compiled ignore pattern.
 */
function isIgnoredPath(relativePath: string, patterns: RegExp[]): boolean {
  const normalised = relativePath.replace(/\\/g, "/");
  return patterns.some((re) => re.test(normalised));
} /**
 * Return true if this `.env`-family filename is a safe template that should
 * always be copied regardless of depth or ignore rules.
 * Only `.env.example` qualifies — it contains no secrets.
 */
function isEnvExample(name: string): boolean {
  return name === ".env.example";
}

/**
 * Return true if this `.env`-family file at the given relative path is an
 * app-level env file that should always be copied.
 *
 * Allowed: files that are NOT at workspace root depth, e.g.
 *   `apps/main/.env`, `apps/main/.env.local`
 * Excluded: root-level `.env` / `.env.*` (studio secrets — RFC-0007).
 */
function isAllowedEnvFile(relativePath: string, basename: string): boolean {
  if (!(basename === ".env" || basename.startsWith(".env."))) return false;
  if (isEnvExample(basename)) return true;
  // Only allow when not at root depth (relativePath !== basename means it is nested)
  return relativePath !== basename;
} /**
 * Remove every entry inside `targetDir` except `.git`.
 * Creates `targetDir` if it does not exist yet.
 */
async function clearTargetDirectory(
  targetDir: string,
  logger: KernelRuntimeContext["logger"],
): Promise<void> {
  let entries: Dirent[];

  try {
    entries = await fs.readdir(targetDir, { withFileTypes: true });
  } catch (err) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr.code === "ENOENT") {
      await fs.mkdir(targetDir, { recursive: true });
      logger.info(`[client.export] created target directory: ${targetDir}`);
      return;
    }
    throw err;
  }

  for (const entry of entries) {
    if (entry.name === ".git") {
      logger.info("[client.export] preserved .git in target");
      continue;
    }
    await fs.rm(path.join(targetDir, entry.name), { recursive: true, force: true });
  }

  logger.info(`[client.export] cleared target directory (preserved .git): ${targetDir}`);
} /**
 * Build the inline filter used by `fs.cp` for recursive directory copies.
 * The filter is called for every entry (file or directory) encountered.
 *
 * Hard exclusions (RFC-0007, evaluated before ignore patterns):
 * - `.git` anywhere.
 * - `AGENTS.md` at any depth.
 * - `docs/` at workspace root depth.
 * - `docs/` directories anywhere under `packages/`.
 * - `.agents/`, `.changelog-system/`, `.claude/`, `.github/` at root depth.
 * - `.windsurfrules` at root depth.
 * - `onboarding/` at root depth (onboarding workspace).
 * - `apps-todo/` at root depth (draft applications).
 * - Root-level `.env` / `.env.*` (studio secrets) — except `.env.example`.
 * - `node_modules/` directories at any depth (reinstalled via `pnpm i` in target).
 * - `pnpm-lock.yaml` at root depth (regenerated via `pnpm i` in target).
 *
 * Hard inclusions:
 * - `.env.example` at any depth.
 * - App-level `.env` / `.env.*` (nested, not at root depth).
 *
 * Sibling app directories inside `apps/` (i.e. `apps/<X>` where X ≠ appName):
 * always excluded so that only the target app is present in the copy.
 *
 * Everything else: excluded if it matches any compiled ignore pattern.
 *
 * Returning `false` for a directory skips the directory **and all its contents**.
 */

/** Root-depth agent tooling directory names that are always excluded (RFC-0007). */
const ROOT_AGENT_TOOLING_DIRS = new Set([".agents", ".changelog-system", ".claude", ".github"]);

function buildCopyFilter(
  workspaceRoot: string,
  patterns: RegExp[],
  appName: string,
  siblingAppDirs: Set<string>,
): (src: string) => boolean {
  return (src: string): boolean => {
    const basename = path.basename(src);
    const relativePath = path.relative(workspaceRoot, src).replace(/\\/g, "/");

    // Workspace root itself must pass
    if (!relativePath || relativePath === ".") return true;

    // Hard exclusion: never copy .git
    if (basename === ".git") return false;

    // node_modules: always exclude at any depth (reinstalled via pnpm i in target)
    if (basename === "node_modules") return false;

    // Hard exclusion: never copy AGENTS.md at any depth (RFC-0007)
    if (basename === "AGENTS.md") return false;

    const parts = relativePath.split("/");
    const depth = parts.length;

    // Hard exclusion: root docs/ directory (RFC-0007)
    if (depth === 1 && basename === "docs") return false;

    // Hard exclusion: docs/ directories anywhere under packages/ (RFC-0007)
    if (parts[0] === "packages" && basename === "docs") return false;

    // Hard exclusion: root-depth agent tooling directories (RFC-0007)
    if (depth === 1 && ROOT_AGENT_TOOLING_DIRS.has(basename)) return false;

    // Hard exclusion: .windsurfrules at root depth (RFC-0007)
    if (depth === 1 && basename === ".windsurfrules") return false;

    // Hard exclusion: onboarding at root depth
    if (depth === 1 && basename === "onboarding") return false;

    // Hard exclusion: apps-todo at root depth (RFC-0007)
    if (depth === 1 && basename === "apps-todo") return false;

    // Hard exclusion: pnpm-lock.yaml at root depth (regenerated via pnpm i in target)
    if (depth === 1 && basename === "pnpm-lock.yaml") return false;

    // .env.example: always include at any depth (safe template — RFC-0007)
    if (isEnvExample(basename)) return true;

    // .env / .env.*: include only when not at root depth (app-level env files — RFC-0007)
    if (basename === ".env" || basename.startsWith(".env.")) {
      return isAllowedEnvFile(relativePath, basename);
    }

    // Inside apps/: exclude sibling app directories
    if (parts[0] === "apps" && depth === 2) {
      const dirName = parts[1];
      if (dirName !== appName && siblingAppDirs.has(dirName)) {
        return false;
      }
    }

    return !isIgnoredPath(relativePath, patterns);
  };
}
export type ClientExportData = {
  targetDir: string;
  included: string[];
  excluded: string[];
};

/**
 * `client.export` command handler.
 *
 * Copies all workspace-root files and directories that are not excluded by
 * `.gitignore` or `.windsurfignore` into `../clients/[app-name]`.
 *
 * Hard exclusions (RFC-0007):
 *  - `.git` is **never** copied.
 *  - `docs/` at workspace root and under `packages/` are **never** copied.
 *  - `AGENTS.md` at any depth is **never** copied.
 *  - `.agents/`, `.changelog-system/`, `.claude/`, `.github/` are **never** copied.
 *  - `.windsurfrules` is **never** copied.
 *  - `onboarding/` is **never** copied (onboarding workspace).
 *  - `apps-todo/` is **never** copied (draft applications).
 *  - Root-level `.env` / `.env.*` are **never** copied (studio secrets).
 *
 * Hard inclusions:
 *  - `.env.example` at any depth is **always** copied.
 *  - App-level `.env` / `.env.*` (inside `apps/<name>/`) are **always** copied.
 *
 * Hard exclusions (beyond RFC-0007):
 *  - `node_modules/` directories at any depth are **never** copied (reinstalled via `pnpm i`).
 *  - `pnpm-lock.yaml` at root depth is **never** copied (regenerated via `pnpm i`).
 *
 * Before copying the target directory is cleared (preserving `.git` if present).
 */
export async function runClientExport(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ClientExportData>> {
  const { workspaceRoot, site, logger, dryRun } = context;

  if (!site) {
    throw new Error("[client.export] this command requires a site context — use --site <name>");
  }

  const targetDir = path.resolve(workspaceRoot, "..", "clients", site.name);

  // ── Load ignore patterns ────────────────────────────────────────────────
  const ignorePatterns: RegExp[] = [];
  for (const filename of [".gitignore", ".windsurfignore"]) {
    try {
      const content = await fs.readFile(path.join(workspaceRoot, filename), "utf8");
      const parsed = parseIgnoreFile(content);
      ignorePatterns.push(...parsed);
      logger.info(`[client.export] loaded ${parsed.length} patterns from ${filename}`);
    } catch {
      // Not present — silently skip
    }
  }

  // ── Collect sibling app directories ────────────────────────────────────
  // Only the target app's directory inside apps/ should be copied.
  const siblingAppDirs = new Set<string>();
  try {
    const appsEntries = await fs.readdir(path.join(workspaceRoot, "apps"), { withFileTypes: true });
    for (const entry of appsEntries) {
      if (entry.isDirectory() && entry.name !== site.name) {
        siblingAppDirs.add(entry.name);
      }
    }
  } catch {
    // apps/ not present — nothing to exclude
  }
  if (siblingAppDirs.size > 0) {
    logger.info(`[client.export] will exclude sibling apps: ${[...siblingAppDirs].join(", ")}`);
  }

  // ── Classify root-level entries ─────────────────────────────────────────
  const rootEntries = await fs.readdir(workspaceRoot, { withFileTypes: true });
  const included: string[] = [];
  const excluded: string[] = [];

  for (const entry of rootEntries) {
    const { name } = entry;

    // Hard exclusion: .git
    if (name === ".git") {
      excluded.push(name);
      continue;
    }

    // node_modules: always exclude (reinstalled via pnpm i in target)
    if (name === "node_modules") {
      excluded.push(name);
      continue;
    }

    // Hard exclusions (RFC-0007): studio-internal content
    if (
      name === "AGENTS.md" ||
      name === "docs" ||
      name === ".windsurfrules" ||
      ROOT_AGENT_TOOLING_DIRS.has(name)
    ) {
      excluded.push(name);
      continue;
    }

    // Hard exclusion: onboarding directory
    if (name === "onboarding") {
      excluded.push(name);
      continue;
    }

    // Hard exclusion (RFC-0007): draft apps directory
    if (name === "apps-todo") {
      excluded.push(name);
      continue;
    }

    // .env.example: always include (safe template — RFC-0007)
    if (isEnvExample(name)) {
      included.push(name);
      continue;
    }

    // Root-level .env / .env.*: exclude (studio secrets — RFC-0007)
    if (name === ".env" || name.startsWith(".env.")) {
      excluded.push(name);
      continue;
    }

    // pnpm-lock.yaml: exclude at root depth (regenerated via pnpm i in target)
    if (name === "pnpm-lock.yaml") {
      excluded.push(name);
      continue;
    }

    if (isIgnoredPath(name, ignorePatterns)) {
      excluded.push(name);
    } else {
      included.push(name);
    }
  }

  logger.section("[client.export] plan");
  logger.info(`Target:  ${targetDir}`);
  logger.info(`Include: ${included.join("  ")}`);
  logger.info(`Exclude: ${excluded.join("  ")}`);

  if (dryRun) {
    if (siblingAppDirs.size > 0) {
      logger.info(`[client.export] apps/ siblings excluded: ${[...siblingAppDirs].join(", ")}`);
    }
    return {
      data: { targetDir, included, excluded },
      summary: `[client.export] dry-run: ${included.length} root items would be copied → ${targetDir}`,
    };
  }

  // ── Clear target (preserve .git) ────────────────────────────────────────
  await clearTargetDirectory(targetDir, logger);

  // ── Copy each included root entry ────────────────────────────────────────
  const copyFilter = buildCopyFilter(workspaceRoot, ignorePatterns, site.name, siblingAppDirs);

  for (const name of included) {
    const src = path.join(workspaceRoot, name);
    const dest = path.join(targetDir, name);
    const dirent = rootEntries.find((e) => e.name === name)!;

    if (dirent.isDirectory()) {
      await fs.cp(src, dest, { recursive: true, filter: copyFilter });
    } else {
      await fs.copyFile(src, dest);
    }

    logger.info(`[client.export] copied: ${name}`);
  }

  // ── Run pnpm install to regenerate lockfile and node_modules ────────────
  if (!dryRun) {
    logger.info(`[client.export] running pnpm install in ${targetDir} …`);
    try {
      const { stdout } = await execFileAsync("pnpm", ["install"], {
        cwd: targetDir,
      });
      logger.info(`[client.export] pnpm install output:\n${stdout}`);
      logger.success(
        `[client.export] done — ${included.length} items copied → ${targetDir}, pnpm-lock.yaml regenerated`,
      );
    } catch (err) {
      logger.error(`[client.export] pnpm install failed: ${(err as Error).message}`);
      throw err;
    }
  } else {
    logger.info(`[client.export] dry-run: would run pnpm install in ${targetDir}`);
    logger.success(
      `[client.export] dry-run done — ${included.length} items would be copied → ${targetDir}`,
    );
  }

  return {
    data: { targetDir, included, excluded },
    summary: `[client.export] ${included.length} items copied to ${targetDir}${dryRun ? " (dry-run)" : ", pnpm-lock.yaml regenerated"}`,
  };
}
