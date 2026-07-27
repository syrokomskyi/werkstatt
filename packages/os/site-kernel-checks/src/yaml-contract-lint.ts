/*
<MODULE_CONTRACT>
<purpose>
  yaml.contract.lint — RFC-0376: enforce the YAML-only contract for non-tool-mandatory
  files. Scans the repository for .json/.jsonc files outside the whitelist (YAML-CONTRACT-01),
  .yml files anywhere (YAML-CONTRACT-02), .generated.json files anywhere (YAML-CONTRACT-03),
  missing/unparseable whitelist (YAML-CONTRACT-04), and .yaml files whose content is JSON
  instead of YAML (YAML-CONTRACT-05).
</purpose>
<non-goals>
  <item>Do not rewrite offending files — this is a read-only lint.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0376: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { parse as yamlParse } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { collectFiles } from "@warpgogol/share/fs";
import { diagnosticsResult } from "./result-helpers.ts";

const WHITELIST_PATH = "yaml-contract.whitelist.yaml";

const EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  ".git",
  ".cache",
  ".output",
  ".astro",
  ".turbo",
  ".agents",
  ".changelog-system",
  ".claude",
  ".github",
  ".vscode",
  ".windsurf",
  ".wrangler",
  ".opencode",
  ".werkstatt",
  "packages",
  "scripts",
  "tmp",
  "systems",
  "missions",
  "releases",
  "agents",
  "logs",
  "coverage",
  "out",
]);

function parseGitignore(text: string): Set<string> {
  const result = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("!")) continue;
    if (trimmed.includes("*")) continue;
    if (trimmed.includes("/")) {
      const top = trimmed.replace(/^\/+/, "").split("/")[0];
      if (top) result.add(top);
    } else {
      result.add(trimmed);
    }
  }
  return result;
}

function makeIgnore(excludeDirs: Set<string>): (name: string) => boolean {
  return (name: string) => excludeDirs.has(name) || name.startsWith("-") || name.startsWith("old-");
}

function globToRegex(pattern: string): RegExp {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        re += ".*";
        i++;
        if (pattern[i + 1] === "/") i++;
      } else {
        re += "[^/]*";
      }
    } else if (c === "?") {
      re += "[^/]";
    } else if (c === ".") {
      re += "\\.";
    } else if ("+()^$|{}[]".includes(c)) {
      re += "\\" + c;
    } else {
      re += c;
    }
  }
  return new RegExp("^" + re + "$");
}

interface WhitelistConfig {
  [category: string]: string[];
}

function flattenWhitelist(config: WhitelistConfig): string[] {
  const patterns: string[] = [];
  for (const category of Object.keys(config)) {
    const entries = config[category];
    if (Array.isArray(entries)) {
      patterns.push(...entries);
    }
  }
  return patterns;
}

export async function runYamlContractLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const root = context.workspaceRoot;

  const whitelistAbs = join(root, WHITELIST_PATH);
  let whitelistPatterns: string[];

  try {
    const raw = await context.io.readFile(whitelistAbs);
    const parsed = yamlParse(raw) as WhitelistConfig;
    whitelistPatterns = flattenWhitelist(parsed);
  } catch {
    diagnostics.push({
      ruleId: "YAML-CONTRACT-04",
      severity: "error",
      file: WHITELIST_PATH,
      message: `Whitelist file is missing or unparseable.`,
      fixHint: `Create ${WHITELIST_PATH} at the repository root with categorized tool-mandatory JSON file patterns.`,
    });
    return diagnosticsResult("yaml.contract.lint", diagnostics);
  }

  const compiledPatterns = whitelistPatterns.map((p) => ({
    pattern: p,
    regex: globToRegex(p),
  }));

  const dynamicExclude = new Set(EXCLUDE_DIRS);
  try {
    const gitignoreRaw = await context.io.readFile(join(root, ".gitignore"));
    for (const name of parseGitignore(gitignoreRaw)) {
      dynamicExclude.add(name);
    }
  } catch {
    // .gitignore may not exist in test fixtures — that's fine.
  }

  const allFiles = await collectFiles(root, {
    extensions: [".json", ".jsonc", ".yml", ".yaml"],
    ignore: makeIgnore(dynamicExclude),
  });

  for (const abs of allFiles) {
    const relPath = relative(root, abs).replace(/\\/g, "/");

    // .yaml files are checked by YAML-CONTRACT-05 below, not here.
    if (relPath.endsWith(".yaml")) continue;

    if (relPath.endsWith(".yml")) {
      const ymlWhitelisted = compiledPatterns.some((cp) => cp.regex.test(relPath));
      if (!ymlWhitelisted) {
        diagnostics.push({
          ruleId: "YAML-CONTRACT-02",
          severity: "error",
          file: relPath,
          message: `File uses .yml extension. Use .yaml instead.`,
          fixHint: `Rename ${relPath} to ${relPath.replace(/\.yml$/, ".yaml")} or add to ${WHITELIST_PATH} if tool-mandatory.`,
        });
      }
      continue;
    }

    if (relPath.endsWith(".generated.json")) {
      diagnostics.push({
        ruleId: "YAML-CONTRACT-03",
        severity: "error",
        file: relPath,
        message: `Generated artifact uses .json extension. Use .generated.yaml instead.`,
        fixHint: `Run the owning generator to produce ${relPath.replace(/\.generated\.json$/, ".generated.yaml")} and delete the stale .json file.`,
      });
      continue;
    }

    const isWhitelisted = compiledPatterns.some((cp) => cp.regex.test(relPath));
    if (!isWhitelisted) {
      diagnostics.push({
        ruleId: "YAML-CONTRACT-01",
        severity: "error",
        file: relPath,
        message: `JSON file is not in the tool-mandatory whitelist. Use .yaml instead.`,
        fixHint: `Convert to ${relPath.replace(/\.json[c]?$/, ".yaml")} or add to ${WHITELIST_PATH} if tool-mandatory.`,
      });
    }
  }

  // YAML-CONTRACT-05: .yaml files must not contain JSON content.
  for (const abs of allFiles) {
    const relPath = relative(root, abs).replace(/\\/g, "/");
    if (!relPath.endsWith(".yaml")) continue;

    let raw: string;
    try {
      raw = await context.io.readFile(abs);
    } catch {
      continue;
    }

    const firstNonWs = raw.trimStart()[0];
    if (firstNonWs === "{" || firstNonWs === "[") {
      diagnostics.push({
        ruleId: "YAML-CONTRACT-05",
        severity: "error",
        file: relPath,
        message: `YAML file contains JSON content (starts with '${firstNonWs}'). Use YAML syntax instead.`,
        fixHint: `Rewrite ${relPath} using YAML block-style syntax (key: value, lists with -).`,
      });
    }
  }

  return diagnosticsResult("yaml.contract.lint", diagnostics);
}
