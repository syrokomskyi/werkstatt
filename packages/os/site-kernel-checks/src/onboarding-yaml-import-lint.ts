/*
<MODULE_CONTRACT>
<purpose>
RFC-0082 enforcement: prevent regression to direct `yaml`-package parsing in
kernel onboarding/audit/content-discipline modules. Every onboarding-artifact
read MUST go through `@warpgogol/share/onboarding-yaml` so the "first doc is
the RFC-0076 metadata header, last doc is the payload" rule has exactly one
owner.
</purpose>
<non-goals>
  <item>Do not parse the full TypeScript AST — this is a grep-class guardrail.</item>
  <item>Do not block direct `yaml` imports outside the kernel/onboarding surface — apps and templates remain free.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0082: Introduce the import-lint guard preventing direct YAML.parse of onboarding artifacts outside @warpgogol/share/onboarding-yaml.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";

interface LintViolation {
  file: string;
  line: number;
  message: string;
}

interface OnboardingYamlImportLintResult {
  command: "onboarding.yaml.import.lint";
  scannedFiles: number;
  violations: LintViolation[];
}

// The three call sites the RFC-0082 migration pinned. The lint enforces that
// they never regress to direct YAML parsing. Onboarding-yaml reads in NEW
// sources should also live on this list (extend it as part of the new
// reader's PR).
const ARTIFACT_READER_FILES = [
  "packages/os/site-kernel-onboarding/src/phase-contract.ts",
  "packages/os/site-kernel-checks/src/audit-validators.ts",
  "packages/share/src/content-discipline/parsers.ts",
] as const;

const FORBIDDEN_PATTERNS: Array<{ pattern: RegExp; message: string }> = [
  {
    pattern: /from\s+["']yaml["']/,
    message:
      'RFC-0082: direct `from "yaml"` import in an RFC-0076 onboarding-artifact reader. Use `@warpgogol/share/onboarding-yaml` instead.',
  },
  {
    pattern: /YAML\.parse(?:AllDocuments)?\s*\(/,
    message:
      "RFC-0082: direct `YAML.parse(...)` call in an RFC-0076 onboarding-artifact reader. Use `parseOnboardingArtifactPayload` (or `parseOnboardingArtifactHeader`).",
  },
  {
    pattern: /^\s*import\s+(?:\{\s*parse\s+as\s+parseYaml\s*\}|.*\bparse\s*as\s*parseYaml\b)/,
    message:
      "RFC-0082: aliased `parse as parseYaml` import from the `yaml` package in an RFC-0076 onboarding-artifact reader. Use `@warpgogol/share/onboarding-yaml`.",
  },
];

export async function runOnboardingYamlImportLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<OnboardingYamlImportLintResult>> {
  const violations: LintViolation[] = [];
  let scannedFiles = 0;
  for (const relPath of ARTIFACT_READER_FILES) {
    const filePath = join(context.workspaceRoot, relPath);
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      // File renamed or deleted — record a violation so the maintainer
      // updates this lint's pinned list AND the reader's migration status.
      violations.push({
        file: relPath,
        line: 0,
        message:
          "RFC-0082: pinned onboarding-artifact reader was not found. If the file was moved, update ARTIFACT_READER_FILES in onboarding-yaml-import-lint.ts.",
      });
      continue;
    }
    scannedFiles += 1;
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      for (const { pattern, message } of FORBIDDEN_PATTERNS) {
        if (pattern.test(line)) {
          violations.push({ file: relPath, line: index + 1, message });
          break;
        }
      }
    }
  }

  return {
    exitCode: violations.length > 0 ? 1 : 0,
    data: {
      command: "onboarding.yaml.import.lint",
      scannedFiles,
      violations,
    },
    summary:
      violations.length > 0
        ? `onboarding.yaml.import.lint: ${violations.length} RFC-0082 violation(s) in ${scannedFiles} pinned reader(s)`
        : `onboarding.yaml.import.lint: OK — ${scannedFiles} pinned reader(s) clean of direct YAML.parse of onboarding artifacts`,
  };
}
