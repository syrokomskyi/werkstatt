/*
<MODULE_CONTRACT>
<purpose>RFC-0136 amend orchestration gates: the batch-scoped phase readiness gate
(amend.phase.validate) and the amend composite gates (amend-check.author /
amend-check.postbuild / amend-check.run). Composites sub-dispatch the RFC-0135
amend commands and audit.delta.run by name via executeKernelCommand.</purpose>
<non-goals>
  <item>Do not define the amend batch bundle, provenance, or coverage ledger — those are RFC-0135 (site-kernel-onboarding).</item>
  <item>Do not own audit.delta.run — that lives in @warpgogol/werkstatt-site/audit (RFC-0136 file map).</item>
  <item>Do not own workflow.lint — that is extended in site-kernel/src/workflow.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0136: Add amend phase gate and amend-check composites.</item>
  <item>RFC-0136: Move audit.delta.run to @warpgogol/werkstatt-site/audit.</item>
</CHANGE_SUMMARY>
*/

import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseOnboardingArtifactHeader } from "@warpgogol/share/onboarding-yaml";
import { executeKernelCommand } from "@warpgogol/site-kernel";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";

const AMEND_PHASES = ["a0-intake", "a2-compose", "a3-author", "a4-audit"] as const;
type AmendPhase = (typeof AMEND_PHASES)[number];

interface Finding {
  ruleId: string;
  severity: "info" | "warn" | "error";
  file?: string;
  message: string;
}

// Required machine-readable outputs per amend phase, mirroring RFC-0076's PHASE_ARTIFACTS.
const AMEND_PHASE_ARTIFACTS: Record<AmendPhase, Array<{ path: string; metadata: boolean }>> = {
  "a0-intake": [{ path: "a0-intake/input-manifest.json", metadata: false }],
  "a2-compose": [{ path: "a2-compose/site-plan-delta.md", metadata: true }],
  "a3-author": [{ path: "a3-author/atoms.yaml", metadata: true }],
  "a4-audit": [{ path: "a4-audit/audit-report.md", metadata: true }],
};

function readFlag(input: KernelCommandInput, name: string): string | undefined {
  const direct = input.flags[name];
  if (typeof direct === "string") return direct;
  return undefined;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readArtifact(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

function result(
  command: string,
  findings: Finding[],
  extra: Record<string, unknown> = {},
): KernelCommandResult {
  const errors = findings.filter((finding) => finding.severity === "error");
  const status =
    errors.length > 0 ? "fail" : findings.some((f) => f.severity === "warn") ? "warn" : "pass";
  return {
    data: { command, status, findings, ...extra },
    exitCode: errors.length > 0 ? 1 : 0,
    summary:
      errors.length > 0
        ? `${command}: ${errors.length} violation(s)`
        : `${command}: OK${findings.length ? ` (${findings.length} note(s))` : ""}`,
  };
}

async function readBatchManifestHash(workspaceRoot: string, batch: string): Promise<string | null> {
  const raw = await readArtifact(
    join(workspaceRoot, "onboarding", ".output", batch, "a0-intake", "input-manifest.json"),
  );
  if (!raw) return null;
  try {
    return (JSON.parse(raw) as { inputHash?: string }).inputHash ?? null;
  } catch {
    return null;
  }
}

/** Extract a frontmatter scalar from a markdown source without a YAML dependency. */
function frontmatterScalar(source: string, key: string): string | null {
  if (!source.startsWith("---")) return null;
  const end = source.indexOf("\n---", 3);
  if (end === -1) return null;
  const block = source.slice(0, end);
  const match = block.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?\\s*$`, "m"));
  return match ? match[1].trim() : null;
}

/** Parse the RFC-0076 header from a markdown (frontmatter) or YAML/JSON amend artifact. */
async function readHeaderHash(filePath: string): Promise<string | null> {
  const raw = await readArtifact(filePath);
  if (!raw) return null;
  if (filePath.endsWith(".md")) {
    return frontmatterScalar(raw, "derivedFromInputHash");
  }
  if (filePath.endsWith(".json")) {
    try {
      const data = JSON.parse(raw) as Record<string, unknown>;
      return typeof data["derivedFromInputHash"] === "string"
        ? (data["derivedFromInputHash"] as string)
        : null;
    } catch {
      return null;
    }
  }
  return parseOnboardingArtifactHeader(raw)?.derivedFromInputHash ?? null;
}

// ---------------------------------------------------------------------------
// amend.phase.validate
// ---------------------------------------------------------------------------

export async function runAmendPhaseValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const command = "amend.phase.validate";
  const batch = readFlag(input, "batch");
  const phaseFlag = readFlag(input, "phase");

  if (!batch) {
    return result(command, [
      {
        ruleId: "amend.phase.no-batch",
        severity: "error",
        message: `${command} requires --batch amend-<NNN>.`,
      },
    ]);
  }
  if (!phaseFlag || !(AMEND_PHASES as readonly string[]).includes(phaseFlag)) {
    return result(command, [
      {
        ruleId: "amend.phase.invalid-phase",
        severity: "error",
        message: `--phase must be one of ${AMEND_PHASES.join(", ")}.`,
      },
    ]);
  }
  const phase = phaseFlag as AmendPhase;

  const manifestHash = await readBatchManifestHash(context.workspaceRoot, batch);
  if (!manifestHash) {
    return result(command, [
      {
        ruleId: "amend.phase.no-manifest",
        severity: "error",
        file: `onboarding/.output/${batch}/a0-intake/input-manifest.json`,
        message: "Batch manifest missing; run amend.input.validate first.",
      },
    ]);
  }

  const findings: Finding[] = [];
  const requestedIndex = AMEND_PHASES.indexOf(phase);
  const outputRoot = join(context.workspaceRoot, "onboarding", ".output", batch);

  // Check every phase up to and including the requested one (RFC-0076 cumulative gate).
  for (const checked of AMEND_PHASES.slice(0, requestedIndex + 1)) {
    for (const artifact of AMEND_PHASE_ARTIFACTS[checked]) {
      const absolutePath = join(outputRoot, artifact.path);
      const relPath = `onboarding/.output/${batch}/${artifact.path}`;
      if (!(await pathExists(absolutePath))) {
        findings.push({
          ruleId: "amend.phase.missing-output",
          severity: "error",
          file: relPath,
          message: `Required ${checked} output is missing before ${phase}.`,
        });
        continue;
      }
      if (!artifact.metadata) continue;
      const headerHash = await readHeaderHash(absolutePath);
      if (!headerHash) {
        findings.push({
          ruleId: "amend.phase.missing-metadata",
          severity: "error",
          file: relPath,
          message: `Required ${checked} output is missing its RFC-0076 derivedFromInputHash header.`,
        });
        continue;
      }
      if (headerHash !== manifestHash) {
        findings.push({
          ruleId: "amend.phase.stale-output",
          severity: "error",
          file: relPath,
          message: `Artifact derived from ${headerHash}; current batch manifest hash is ${manifestHash}.`,
        });
      }
    }
  }

  return result(command, findings, { batch, phase, inputHash: manifestHash });
}

// audit.delta.run now lives in @warpgogol/werkstatt-site/audit (RFC-0136 file map).
// amend-check.postbuild dispatches it by name via executeKernelCommand below,
// so there is no import coupling here.

// ---------------------------------------------------------------------------
// amend-check composites (author / postbuild / run) — mirrors RFC-0085 split
// ---------------------------------------------------------------------------

// RFC-0139: deterministic content validators that honour --scope-files. amend-check scopes
// these to the batch delta so pre-existing whole-app debt on untouched pages does not block
// an amend batch. Coverage/audit/provenance are already batch-scoped elsewhere.
const SCOPED_STEPS = new Set([
  "content.references.validate",
  "content.voice.lint",
  "pbp.content.validate",
  "page.block.validate",
  "page.shell.validate",
]);

async function dispatch(
  stepCommand: string,
  context: KernelRuntimeContext,
  argv: string[],
): Promise<{ ok: boolean; summary?: string; data?: unknown }> {
  const report = await executeKernelCommand({
    workspaceRoot: context.workspaceRoot,
    commandName: stepCommand,
    siteName: context.site?.name,
    siteExplicit: Boolean(context.site),
    argv,
  });
  const single = Array.isArray(report) ? report[0] : report;
  return { ok: single?.ok ?? false, summary: single?.summary, data: single?.data };
}

async function runAmendCheckSteps(
  command: string,
  steps: string[],
  context: KernelRuntimeContext,
  batch: string | undefined,
): Promise<KernelCommandResult> {
  const findings: Finding[] = [];
  const stepResults: Array<{ command: string; ok: boolean; summary?: string }> = [];
  const carriedForward: Array<{ command: string; summary?: string }> = [];

  // RFC-0139: resolve the batch's delta file set once, to scope the deterministic validators.
  let scopeFiles: string[] | null = null;
  if (batch && context.site && steps.some((s) => SCOPED_STEPS.has(s))) {
    try {
      const res = await dispatch("amend.delta.files", context, ["--batch", batch]);
      const files = (res.data as { files?: string[] } | undefined)?.files ?? [];
      scopeFiles = files;
      if (files.length === 0) {
        findings.push({
          ruleId: "amend-check.empty-delta",
          severity: "error",
          message: `amend.delta.files resolved no files for ${batch}; the batch staged nothing — fix a3-author.`,
        });
        return result(command, findings, { batch, steps: stepResults });
      }
    } catch (error) {
      findings.push({
        ruleId: "amend-check.delta-resolve-error",
        severity: "error",
        message: `amend.delta.files: ${error instanceof Error ? error.message : String(error)}`,
      });
      return result(command, findings, { batch, steps: stepResults });
    }
  }

  for (const stepCommand of steps) {
    // amend gates + coverage/audit need --batch; deterministic validators get --scope-files.
    const batchArgv =
      stepCommand.startsWith("amend.") ||
      stepCommand === "content.coverage.delta" ||
      stepCommand === "audit.delta.run"
        ? batch
          ? ["--batch", batch]
          : []
        : [];
    const scoped = SCOPED_STEPS.has(stepCommand) && scopeFiles !== null;
    const argv = scoped ? [...batchArgv, "--scope-files", scopeFiles!.join(",")] : batchArgv;

    let res: { ok: boolean; summary?: string };
    try {
      res = await dispatch(stepCommand, context, argv);
    } catch (error) {
      findings.push({
        ruleId: "amend-check.dispatch-error",
        severity: "error",
        message: `${stepCommand}: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }
    stepResults.push({ command: stepCommand, ok: res.ok, summary: res.summary });
    if (!res.ok) {
      findings.push({
        ruleId: "amend-check.step-failed",
        severity: "error",
        message: `${stepCommand} failed: ${res.summary ?? "see logs"}`,
      });
    } else if (scoped) {
      // RFC-0139 carried-forward: the scoped run passed; an unscoped pass surfaces any
      // pre-existing whole-app debt as a non-blocking warning so it stays visible.
      try {
        const whole = await dispatch(stepCommand, context, batchArgv);
        if (!whole.ok) {
          carriedForward.push({ command: stepCommand, summary: whole.summary });
          findings.push({
            ruleId: `${stepCommand}.carried-forward`,
            severity: "warn",
            message: `${stepCommand} has pre-existing whole-app debt outside this batch (not blocking): ${whole.summary ?? "see logs"}`,
          });
        }
      } catch {
        /* carried-forward visibility is best-effort; never fail on it */
      }
    }
  }
  return result(command, findings, { batch, steps: stepResults, carriedForward });
}

const AMEND_CHECK_AUTHOR_STEPS = [
  "pbp.content.validate",
  "content.references.validate",
  "content.voice.lint",
  "page.block.validate",
  "content.coverage.delta",
];

const AMEND_CHECK_POSTBUILD_STEPS = ["audit.delta.run", "amend.provenance.validate"];

export function runAmendCheckAuthor(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  return runAmendCheckSteps(
    "amend-check.author",
    AMEND_CHECK_AUTHOR_STEPS,
    context,
    readFlag(input, "batch"),
  );
}

export function runAmendCheckPostbuild(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  return runAmendCheckSteps(
    "amend-check.postbuild",
    AMEND_CHECK_POSTBUILD_STEPS,
    context,
    readFlag(input, "batch"),
  );
}

export function runAmendCheckRun(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  return runAmendCheckSteps(
    "amend-check.run",
    [...AMEND_CHECK_AUTHOR_STEPS, ...AMEND_CHECK_POSTBUILD_STEPS],
    context,
    readFlag(input, "batch"),
  );
}
