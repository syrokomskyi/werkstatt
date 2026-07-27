/*
<MODULE_CONTRACT>
<purpose>
RFC-0235 egress text normalization commands. The build's "find all of them"
adapter over public output, layered on the @gogol/share normalizer:
  - text.normalize.apply (app, dist mutator): rewrite every text-bearing artifact
    under dist/client through the per-site normalizer. Runs in build.post after all
    dist generation/mutation and before the postbuild validators.
  - text.normalize.validate (app, warn-only): re-scan dist/client for residual
    enabled signals and report them as RFC-0203 Diagnostics — never gates.
  - text.normalize.report (app, advisory): list signals present in authored source
    so authors MAY clean them (never forced).
  - text.normalize.rules.list (workspace, advisory): enumerate the signal registry.
</purpose>
<non-goals>
  <item>Do not touch authored source files (apply/validate operate on dist only).</item>
  <item>Do not gate the build — validate is warning-class (RFC-0235 decision).</item>
  <item>Do not normalize signed artifacts (cosmic-passport JSON, keys) or _astro bundles.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0235: initial egress text normalization commands.</item>
</CHANGE_SUMMARY>
*/

import { access, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { collectFiles } from "@gogol/share/fs";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import {
  SIGNAL_REGISTRY,
  resolveNormalizeConfig,
  normalizeByKind,
  normalizeKindForPath,
  detectResidual,
  type NormalizeConfig,
  type NormalizableKind,
} from "@gogol/share/text-normalize";
import { loadSystemManifest } from "@gogol/site-kernel-content";
import { diagnosticsResult, passResult, failResult } from "./result-helpers.ts";

const RULE_APPLY = "TEXT-NORM-APPLY";
const RULE_RESIDUAL = "TEXT-NORM-01";

/**
 * Paths excluded from text normalization even when the extension matches.
 * - signed cosmic passport + signing keys (normalizing post-sign breaks passport.verify);
 * - hashed _astro bundles (JS/CSS/source maps — not human prose, integrity-sensitive).
 */
function isExcluded(relPath: string): boolean {
  const p = relPath.replace(/\\/g, "/").toLowerCase();
  if (p.includes("/_astro/")) return true;
  if (p.includes("/.well-known/") && p.includes("cosmic-passport")) return true;
  if (p.endsWith("-key.json")) return true;
  return false;
}

interface DistFile {
  abs: string;
  rel: string;
  kind: NormalizableKind;
}

async function collectDistFiles(distRoot: string, workspaceRoot: string): Promise<DistFile[]> {
  const results: DistFile[] = [];
  const files = await collectFiles(distRoot, { ignore: () => false });
  for (const abs of files) {
    const kind = normalizeKindForPath(abs);
    if (!kind) continue;
    const rel = relative(workspaceRoot, abs).replace(/\\/g, "/");
    if (isExcluded(rel)) continue;
    results.push({ abs, rel, kind });
  }
  return results;
}

function resolveDistClient(
  context: KernelRuntimeContext,
  input: KernelCommandInput,
): string | null {
  const app = context.site?.name ?? (input.flags.site as string | undefined);
  if (!app) return null;
  const appDir = context.site?.directory ?? join(context.workspaceRoot, "apps", app);
  return join(appDir, "dist", "client");
}

async function loadConfig(
  context: KernelRuntimeContext,
  input: KernelCommandInput,
): Promise<NormalizeConfig> {
  const app = context.site?.name ?? (input.flags.site as string | undefined);
  const appDir = context.site?.directory ?? (app ? join(context.workspaceRoot, "apps", app) : null);
  if (!appDir) return resolveNormalizeConfig(undefined);
  try {
    const { manifest } = await loadSystemManifest(join(appDir, "src", "content"));
    return resolveNormalizeConfig(manifest);
  } catch {
    return resolveNormalizeConfig(undefined);
  }
}

// ---------------------------------------------------------------------------
// text.normalize.apply — dist adapter
// ---------------------------------------------------------------------------

export async function runTextNormalizeApply(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const cmd = "text.normalize.apply";
  const distClient = resolveDistClient(context, input);
  if (!distClient) return failResult(cmd, ["TEXT-NORM-02: App not specified."]);
  try {
    await access(distClient);
  } catch {
    return failResult(cmd, [`TEXT-NORM-02: dist/client missing for app. Run build first.`]);
  }

  const cfg = await loadConfig(context, input);
  if (!cfg.enabled) {
    return passResult(cmd, `${cmd}: disabled by system.md — skipped`);
  }

  const files = await collectDistFiles(distClient, context.workspaceRoot);
  const changedFiles: string[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file.abs, "utf-8");
    } catch {
      continue;
    }
    const next = normalizeByKind(content, file.kind, cfg);
    if (next !== content) {
      if (!context.dryRun) await writeFile(file.abs, next, "utf-8");
      changedFiles.push(file.rel);
    }
  }

  return {
    data: {
      command: cmd,
      status: "pass",
      filesScanned: files.length,
      filesChanged: changedFiles.length,
      changedFiles: changedFiles.length > 0 ? changedFiles : undefined,
    },
    exitCode: 0,
    summary: `${cmd}: scanned ${files.length}, normalized ${changedFiles.length}`,
  };
}

// ---------------------------------------------------------------------------
// text.normalize.validate — warn-only residual backstop
// ---------------------------------------------------------------------------

export async function runTextNormalizeValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "text.normalize.validate";
  const distClient = resolveDistClient(context, input);
  if (!distClient) {
    return diagnosticsResult(cmd, [
      { ruleId: RULE_RESIDUAL, severity: "warning", message: "App not specified; skipped." },
    ]);
  }
  try {
    await access(distClient);
  } catch {
    return diagnosticsResult(cmd, [
      {
        ruleId: RULE_RESIDUAL,
        severity: "warning",
        message: "dist/client missing; skipped (run build first).",
      },
    ]);
  }

  const cfg = await loadConfig(context, input);
  const diagnostics: Diagnostic[] = [];
  if (cfg.enabled) {
    const files = await collectDistFiles(distClient, context.workspaceRoot);
    for (const file of files) {
      let content: string;
      try {
        content = await readFile(file.abs, "utf-8");
      } catch {
        continue;
      }
      const finding = detectResidual(content, file.kind, cfg);
      if (finding) {
        diagnostics.push({
          ruleId: RULE_RESIDUAL,
          severity: "warning",
          message: `Residual AI-signal(s) [${finding.signals.join(", ")}] in public output. The egress adapter (text.normalize.apply) did not neutralize this — likely an unhandled file kind.`,
          file: file.rel,
          line: finding.line,
          fixHint:
            "Ensure text.normalize.apply runs in build.post over this artifact, or extend normalizeKindForPath.",
        });
      }
    }
  }

  // Warn-only: never gate the build (RFC-0235).
  const base = diagnosticsResult(cmd, diagnostics);
  return {
    ...base,
    exitCode: 0,
    summary: `${cmd}: ${diagnostics.length} residual finding(s) (advisory)`,
  };
}

// ---------------------------------------------------------------------------
// text.normalize.report — advisory source scan
// ---------------------------------------------------------------------------

async function collectSourceFiles(contentRoot: string, workspaceRoot: string): Promise<DistFile[]> {
  const results: DistFile[] = [];
  const files = await collectFiles(contentRoot, { ignore: () => false });
  for (const abs of files) {
    const kind = normalizeKindForPath(abs);
    // Authored content is Markdown/MD or JSON; treat unknown text as txt-safe md is fine.
    if (kind !== "md" && kind !== "json") continue;
    results.push({ abs, rel: relative(workspaceRoot, abs).replace(/\\/g, "/"), kind });
  }
  return results;
}

export async function runTextNormalizeReport(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "text.normalize.report";
  const app = context.site?.name ?? (input.flags.site as string | undefined);
  const appDir = context.site?.directory ?? (app ? join(context.workspaceRoot, "apps", app) : null);
  if (!appDir) {
    return diagnosticsResult(cmd, [
      { ruleId: RULE_RESIDUAL, severity: "info", message: "App not specified; skipped." },
    ]);
  }
  const cfg = await loadConfig(context, input);
  const files = await collectSourceFiles(join(appDir, "src", "content"), context.workspaceRoot);
  const diagnostics: Diagnostic[] = [];
  for (const file of files) {
    let content: string;
    try {
      content = await readFile(file.abs, "utf-8");
    } catch {
      continue;
    }
    const finding = detectResidual(content, file.kind, cfg);
    if (finding) {
      diagnostics.push({
        ruleId: RULE_RESIDUAL,
        severity: "info",
        message: `Authored source contains signal(s) [${finding.signals.join(", ")}]. The egress adapter normalizes these on the way to public output; source cleanup is optional.`,
        file: file.rel,
        line: finding.line,
      });
    }
  }
  const base = diagnosticsResult(cmd, diagnostics);
  return {
    ...base,
    exitCode: 0,
    summary: `${cmd}: ${diagnostics.length} authored source file(s) carry signals (advisory)`,
  };
}

// ---------------------------------------------------------------------------
// text.normalize.rules.list — registry enumeration
// ---------------------------------------------------------------------------

export async function runTextNormalizeRulesList(
  _input: KernelCommandInput,
  _context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const cmd = "text.normalize.rules.list";
  const diagnostics: Diagnostic[] = SIGNAL_REGISTRY.map((s) => ({
    ruleId: `${RULE_APPLY}:${s.id}`,
    severity: "info" as const,
    message: `${s.id} [default ${s.default ? "on" : "off"}] ${s.title} — ${s.unicode} → ${s.replacement}`,
  }));
  const base = diagnosticsResult(cmd, diagnostics);
  return {
    ...base,
    exitCode: 0,
    summary: `${cmd}: ${diagnostics.length} signal(s) registered`,
  };
}
