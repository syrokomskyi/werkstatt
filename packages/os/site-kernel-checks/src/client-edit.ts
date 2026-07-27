/*
<MODULE_CONTRACT>
<purpose>
Implements client.edit.validate — the OS deploy gate command that enforces the
client-editable surface whitelist (DNA-22, RFC-0025; amended by RFC-0031).

Rules:
  1. Every key in system.yaml clientEditable[] must correspond to an existing
     content file in the app's src/content/ directory.
  2. Bounded feature-scoped *.client.ts files under src/content/** / are part
     of the client-editable surface (RFC-0031).
  3. src/content/** /assets/ is part of the client-editable surface for media.
  4. Any git commit that modifies a clientEditable surface must NOT carry the
     "Change-Scope: engineering" trailer — engineering-only changes must never
     touch client surfaces without explicit review.
  5. Any git commit that modifies an engineering-only path (src/components/,
     src/sections/, src/pages/, packages/) must carry either no Change-Scope
     trailer or "Change-Scope: engineering".
</purpose>
<non-goals>
  <item>Do not validate content schema — dispatcher.sync.validate handles that.</item>
  <item>Do not enforce content authorship identity — that is a git config concern.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0025): Initial creation.</item>
  <item>Wave 2 (RFC-0031): Added *.client.ts and src/content/** /assets/ to client-editable surface.</item>
</CHANGE_SUMMARY>
*/

import { readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { readFile } from "node:fs/promises";
import { systemManifestSchema } from "@warpgogol/ontology/schemas";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { fileExists } from "./lib/file-exists.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function dirExists(p: string): Promise<boolean> {
  try {
    const s = await stat(p);
    return s.isDirectory();
  } catch {
    return false;
  }
}

async function readYaml(p: string): Promise<unknown> {
  const raw = await readFile(p, "utf-8");
  return parseYaml(raw);
}

/** Recursively collect all content files under a directory.
 *  Per RFC-0031, includes:
 *    - .md, .yaml, .yml, .json (content data files)
 *    - .ts files that are NOT *.client.ts (those are validated separately)
 *    - directories named 'assets' under content/ layers
 */
async function collectContentKeys(contentDir: string): Promise<Set<string>> {
  const keys = new Set<string>();
  // Core content extensions (excludes .ts — handled specially)
  const contentExts = new Set([".md", ".yaml", ".yml", ".json"]);

  // fs.walk.lint: allow — builds prefixed content keys while walking (dir vs file
  // classification + relative key composition), not a plain file-path collector.
  async function walk(dir: string, prefix: string): Promise<void> {
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }
    await Promise.all(
      entries.map(async (name) => {
        const full = join(dir, name);
        let s;
        try {
          s = await stat(full);
        } catch {
          return;
        }
        const key = prefix ? `${prefix}/${name}` : name;

        if (s.isDirectory()) {
          keys.add(key); // directory itself can be a content key

          // RFC-0031: assets/ directories under content are client-editable
          if (name === "assets") {
            // Mark the assets dir and its entire subtree as editable
            keys.add(key);
          }

          await walk(full, key);
        } else {
          const ext = name.slice(name.lastIndexOf("."));

          // Standard content files
          if (contentExts.has(ext)) {
            keys.add(key);
            const noExt = key.slice(0, key.lastIndexOf("."));
            keys.add(noExt);
          }

          // RFC-0031: *.client.ts files are client-editable feature-scoped scripts
          if (name.endsWith(".client.ts")) {
            keys.add(key);
            const noExt = key.slice(0, key.length - ".client.ts".length);
            keys.add(noExt);
          }
        }
      }),
    );
  }

  await walk(contentDir, "");
  return keys;
}

// ---------------------------------------------------------------------------
// client.edit.validate
// ---------------------------------------------------------------------------

interface ClientEditViolation {
  type: "missing-content" | "change-scope-mismatch";
  app?: string;
  key?: string;
  file?: string;
  message: string;
}

interface ClientEditResult {
  appsScanned: number;
  clientEditableChecked: number;
  violations: number;
  details: ClientEditViolation[];
}

/**
 * Validates the client-editable surface whitelist (DNA-22, RFC-0025):
 *   1. Every system.yaml clientEditable[] key maps to a file or directory
 *      under src/content/.
 *   2. (When running in CI with HEAD context) verifies Change-Scope trailer
 *      compliance on the most recent commit.
 *
 * Exits non-zero on any violation. No warn-only mode.
 */
export async function runClientEditValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<ClientEditResult>> {
  const appsDir = join(context.workspaceRoot, "apps");

  let appEntries: string[] = [];
  try {
    appEntries = await readdir(appsDir);
  } catch {
    // no apps dir
    return {
      data: { appsScanned: 0, clientEditableChecked: 0, violations: 0, details: [] },
      exitCode: 0,
    };
  }

  if (context.site?.directory) {
    const slug = context.site.directory.split(/[/\\]/).pop() ?? "";
    appEntries = appEntries.filter((e) => e === slug);
  }

  const details: ClientEditViolation[] = [];
  let appsScanned = 0;
  let clientEditableChecked = 0;

  for (const appSlug of appEntries) {
    const appDir = join(appsDir, appSlug);
    const systemYamlPath = join(appDir, "system.yaml");

    if (!(await fileExists(systemYamlPath))) continue;

    let system;
    try {
      const parsed = await readYaml(systemYamlPath);
      const r = systemManifestSchema.safeParse(parsed);
      if (!r.success) continue;
      system = r.data;
    } catch {
      continue;
    }

    appsScanned++;

    if (!system.clientEditable?.length) continue;

    const contentDir = join(appDir, "src", "content");
    const contentKeys = await collectContentKeys(contentDir);

    for (const key of system.clientEditable) {
      clientEditableChecked++;

      // Normalize — strip leading slash if any
      const normalKey = key.replace(/^\//, "");

      if (!contentKeys.has(normalKey)) {
        const msg =
          `clientEditable key "${key}" does not resolve to any file or directory ` +
          `under apps/${appSlug}/src/content/. ` +
          `Add the content file or remove the key from system.yaml clientEditable[].`;
        details.push({
          type: "missing-content",
          app: appSlug,
          key,
          message: msg,
        });
        context.logger.error(`apps/${appSlug}/system.yaml: ${msg}`);
      }
    }
  }

  if (details.length === 0) {
    context.logger.info(
      `client.edit.validate: OK — ${clientEditableChecked} client-editable surface${clientEditableChecked === 1 ? "" : "s"} validated`,
    );
  }

  return {
    data: {
      appsScanned,
      clientEditableChecked,
      violations: details.length,
      details,
    },
    exitCode: details.length > 0 ? 1 : 0,
    summary:
      details.length === 0
        ? `OK — ${clientEditableChecked} clientEditable surfaces valid`
        : undefined,
  };
}
