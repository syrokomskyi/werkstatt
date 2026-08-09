/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/fingerprint-commands.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not implement normalizers — those live in @warpgogol/fingerprint.</item>
  <item>Do not define pipeline placement — that lives in the PACKAGES_CHECK_PIPELINE.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0364: initial command runners for the three fingerprint commands.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";

import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
  Diagnostic,
  CheckResult,
} from "@warpgogol/site-kernel";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import {
  fingerprintFile,
  fingerprintTree,
  type FingerprintResult,
  type FingerprintOptions,
} from "@warpgogol/fingerprint/semantic";
import { diagnosticsResult, passResult } from "./result-helpers.ts";

// ─── fingerprint.calculate ─────────────────────────────────────────────────

export async function runFingerprintCalculate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<FingerprintResult>> {
  const targetPath = input.flags["path"] as string | undefined;
  const mode = (input.flags["mode"] as string | undefined) ?? "semantic";

  if (!targetPath) {
    return {
      data: {
        algorithm: "sha256",
        mode: mode as "byte" | "semantic",
        value: "",
        files: [],
      },
      exitCode: 1,
      summary: "fingerprint.calculate: --path flag is required",
    };
  }

  const absPath = path.resolve(context.workspaceRoot, targetPath);
  const options: FingerprintOptions = {
    mode: mode as "byte" | "semantic",
    root: context.workspaceRoot,
  };

  try {
    try {
      await context.io.readdir(absPath);
      const result = await fingerprintTree(absPath, options);
      return {
        data: result,
        exitCode: 0,
        summary: `fingerprint.calculate: ${result.files.length} files, hash=${result.value.slice(0, 20)}...`,
      };
    } catch {
      // Not a directory or not listable; fingerprintFile will surface the precise read error.
    }
    const fileResult = await fingerprintFile(absPath, options);
    const result: FingerprintResult = {
      algorithm: "sha256",
      mode: fileResult.mode,
      value: fileResult.hash,
      files: [fileResult],
    };
    return {
      data: result,
      exitCode: 0,
      summary: `fingerprint.calculate: ${absPath}, hash=${fileResult.hash.slice(0, 20)}...`,
    };
  } catch (err) {
    return {
      data: {
        algorithm: "sha256",
        mode: mode as "byte" | "semantic",
        value: "",
        files: [],
      },
      exitCode: 1,
      summary: `fingerprint.calculate: error reading ${absPath}: ${(err as Error).message}`,
    };
  }
}

// ─── fingerprint.usage.lint ────────────────────────────────────────────────

const HASH_PATTERNS = [
  /\bcreateHash\b/,
  /\bcrypto\.subtle\.digest\b/,
  /\bsha256\b/i,
  /\bhashTree\b/,
  /\bpackagesHash\b/,
  /\bcontentHash\b/,
];

interface AllowlistEntry {
  file: string;
  reason: string;
}

async function loadAllowlist(context: KernelRuntimeContext): Promise<AllowlistEntry[]> {
  try {
    const raw = await context.io.readFile(
      path.join(context.workspaceRoot, "packages", "fingerprint", "allowlist.json"),
    );
    return JSON.parse(raw) as AllowlistEntry[];
  } catch {
    return [];
  }
}

function isAllowlisted(filePath: string, allowlist: AllowlistEntry[]): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return allowlist.some((entry) => {
    const pattern = entry.file.replace(/\\/g, "/");
    if (pattern.includes("*")) {
      const regex = new RegExp(pattern.replace(/\./g, "\\.").replace(/\*/g, ".*"));
      return regex.test(normalized);
    }
    return normalized.endsWith(pattern) || normalized.includes(pattern);
  });
}

export async function runFingerprintUsageLint(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const mode = (input.flags["mode"] as string | undefined) ?? "warning";
  const diagnostics: Diagnostic[] = [];

  const allowlist = await loadAllowlist(context);
  const packagesDir = path.join(context.workspaceRoot, "packages");
  const files = await collectFiles(packagesDir, {
    extensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts"],
  });

  for (const file of files) {
    const relPath = path.relative(context.workspaceRoot, file).replace(/\\/g, "/");
    if (relPath.includes("packages/fingerprint/")) continue;
    if (isAllowlisted(relPath, allowlist)) continue;

    const content = await context.io.readFile(file);
    for (const pattern of HASH_PATTERNS) {
      if (pattern.test(content)) {
        diagnostics.push({
          ruleId: "FP-USAGE-01",
          severity: "error",
          file: relPath,
          message: `Direct hash usage detected (${pattern.source}). Use @warpgogol/fingerprint instead, or add an allowlist entry with a reason.`,
          fixHint:
            "Import byteHash/stableJsonHash/fingerprintFile from @warpgogol/fingerprint, or add an entry to packages/fingerprint/allowlist.json with a reason.",
        });
        break;
      }
    }
  }

  if (mode === "warning") {
    const warnings = diagnostics.map((d) => ({ ...d, severity: "warning" as const }));
    return diagnosticsResult("fingerprint.usage.lint", warnings);
  }

  return diagnosticsResult("fingerprint.usage.lint", diagnostics);
}

// ─── fingerprint.fixtures.validate ─────────────────────────────────────────

export async function runFingerprintFixturesValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const diagnostics: Diagnostic[] = [];
  const fixturesDir = path.join(
    context.workspaceRoot,
    "packages",
    "fingerprint",
    "src",
    "tests",
    "fixtures",
  );

  let pairsChecked = 0;

  try {
    const entries = (await context.io.readdir(fixturesDir))
      .filter((entry) => entry.isFile)
      .map((entry) => entry.name);
    const beforeFiles = entries.filter((f) => f.includes(".before."));

    for (const beforeFile of beforeFiles) {
      const _ext = path.extname(beforeFile);
      const _baseName = beforeFile.replace(".before", "");
      const afterFile = beforeFile.replace(".before", ".after");

      if (!entries.includes(afterFile)) continue;

      const beforePath = path.join(fixturesDir, beforeFile);
      const afterPath = path.join(fixturesDir, afterFile);

      const beforeResult = await fingerprintFile(beforePath, { mode: "semantic" });
      const afterResult = await fingerprintFile(afterPath, { mode: "semantic" });

      pairsChecked++;

      const isCommentOnly = beforeFile.includes("comment") || beforeFile.includes("keyorder");
      const isMeaningful =
        beforeFile.includes("meaningful") ||
        beforeFile.includes("value") ||
        beforeFile.includes("codefence");

      if (isCommentOnly && beforeResult.hash !== afterResult.hash) {
        diagnostics.push({
          ruleId: "FP-FIXTURE-01",
          severity: "error",
          file: `packages/fingerprint/src/tests/fixtures/${beforeFile}`,
          message: `Comment-only/formatting-only change altered semantic hash (before: ${beforeResult.hash.slice(0, 16)}, after: ${afterResult.hash.slice(0, 16)}).`,
          fixHint: "The normalizer must strip comments and formatting whitespace.",
        });
      }

      if (isMeaningful && beforeResult.hash === afterResult.hash) {
        diagnostics.push({
          ruleId: "FP-FIXTURE-02",
          severity: "error",
          file: `packages/fingerprint/src/tests/fixtures/${beforeFile}`,
          message: `Meaningful change did not alter semantic hash.`,
          fixHint: "The normalizer must detect this change type.",
        });
      }
    }

    // Binary byte hash check
    const binaryBefore = path.join(fixturesDir, "binary.before.bin");
    const binaryAfter = path.join(fixturesDir, "binary.after.bin");
    const beforeByte = await fingerprintFile(binaryBefore, { mode: "byte" });
    const afterByte = await fingerprintFile(binaryAfter, { mode: "byte" });
    pairsChecked++;

    if (beforeByte.hash === afterByte.hash) {
      diagnostics.push({
        ruleId: "FP-FIXTURE-03",
        severity: "error",
        file: "packages/fingerprint/src/tests/fixtures/binary.before.bin",
        message: "Binary byte changes did not alter byte hash.",
        fixHint: "byteHash must produce different hashes for different bytes.",
      });
    }
  } catch (err) {
    diagnostics.push({
      ruleId: "FP-FIXTURE-04",
      severity: "error",
      file: "packages/fingerprint/src/tests/fixtures/",
      message: `Failed to read fixtures: ${(err as Error).message}`,
      fixHint: "Ensure fixture files exist in packages/fingerprint/src/tests/fixtures/",
    });
  }

  if (diagnostics.length === 0) {
    return passResult(
      "fingerprint.fixtures.validate",
      `fingerprint.fixtures.validate: ${pairsChecked} fixture pairs validated`,
    );
  }

  return diagnosticsResult("fingerprint.fixtures.validate", diagnostics);
}
