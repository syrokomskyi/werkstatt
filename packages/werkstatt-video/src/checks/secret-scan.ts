/*
<MODULE_CONTRACT>
<purpose>video.secret.scan — WV-04 secret scan enforcement for video composition source (RFC-0778).</purpose>
<keywords>validator, secret, scan, security, video, editframe</keywords>
<non-goals>
  <item>Does not modify files — read-only validator.</item>
  <item>Does not use external tools — regex-based scan only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0778: initial secret scan — regex patterns for API keys, tokens, passwords in src .ts/.tsx files.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import type { Dirent } from "node:fs";
import type {
  KernelCommandDefinition,
  KernelCommandResult,
} from "@warpgogol/werkstatt/kernel/types";

export interface SecretScanViolation {
  ruleId: string;
  file: string;
  line: number;
  message: string;
}

export interface SecretScanData {
  command: string;
  status: "pass" | "fail";
  violations: SecretScanViolation[];
}

const SRC_DIR = "src";

const SECRET_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  {
    pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']([A-Za-z0-9_\-]{20,})["']/gi,
    label: "Hardcoded API key",
  },
  {
    pattern: /(?:secret|token|password|passwd)\s*[:=]\s*["']([A-Za-z0-9_\-]{8,})["']/gi,
    label: "Hardcoded secret/token/password",
  },
  {
    pattern: /(?:AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    label: "AWS access key pattern",
  },
  {
    pattern: /ghp_[A-Za-z0-9]{36}/g,
    label: "GitHub personal access token",
  },
  {
    pattern: /sk_live_[A-Za-z0-9]{24,}/g,
    label: "Stripe secret key",
  },
  {
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    label: "Private key block",
  },
];

export async function scanSecrets(
  projectRoot: string,
): Promise<KernelCommandResult<SecretScanData>> {
  const violations: SecretScanViolation[] = [];
  const srcPath = join(projectRoot, SRC_DIR);
  const files = await listSourceFiles(srcPath);

  for (const filePath of files) {
    const content = await readFile(filePath, "utf-8");
    const lines = content.split("\n");
    const relFile = relative(projectRoot, filePath);

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      // Skip comment lines
      if (line.trim().startsWith("//") || line.trim().startsWith("*")) {
        continue;
      }
      for (const { pattern, label } of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(line)) {
          violations.push({
            ruleId: "WV-04",
            file: relFile,
            line: i + 1,
            message: `${label} detected in source`,
          });
          break;
        }
      }
    }
  }

  const status = violations.length === 0 ? "pass" : "fail";
  return {
    data: { command: "video.secret.scan", status, violations },
    exitCode: status === "pass" ? 0 : 1,
    summary: `video.secret.scan: ${status} (${violations.length} violations)`,
  };
}

async function listSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await listSourceFiles(fullPath)));
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) &&
      !entry.name.endsWith(".d.ts")
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

export function createSecretScanCommand(): KernelCommandDefinition<SecretScanData> {
  return {
    name: "video.secret.scan",
    description: "Scan video composition source for hardcoded secrets (WV-04)",
    scope: "workspace",
    cacheable: false,
    async execute(_input, context) {
      return scanSecrets(context.workspaceRoot);
    },
  };
}
