/*
<MODULE_CONTRACT>
<purpose>Maintains packages/os/site-kernel-checks/src/test-signal.ts as an authored site-kernel-checks authored module so agents can evolve it without rediscovering local boundaries.</purpose>
<non-goals>
  <item>Do not execute package tests; pnpm test remains the runtime test gate.</item>
  <item>Do not require full coverage for every package in the first rollout.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0249: add explicit package-level test signal classification for the autonomous package quality gate.</item>
  <item>RFC-0251: add skipped-test owner/rationale/review metadata and a policy validator.</item>
</CHANGE_SUMMARY>
*/

import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { discoverWorkspacePackages } from "@warpgogol/site-kernel";
import { diagnosticsResult } from "./result-helpers.ts";

export type TestSignalKind = "real" | "noop" | "absent" | "skipped";

export interface PackageTestSignal {
  packageName: string;
  directory: string;
  script?: string;
  signal: TestSignalKind;
  evidence: string;
  metadata?: {
    signal: "skipped";
    owner?: string;
    rationale?: string;
    reviewAfter?: string;
  };
  requiredAction?: string;
}

interface PackageJson {
  name?: string;
  scripts?: Record<string, string>;
  gogol?: {
    testSignal?: {
      signal?: TestSignalKind;
      owner?: string;
      rationale?: string;
      reviewAfter?: string;
    };
  };
}

type TestSignalTier = 0 | 1 | 2 | 3;

interface TestSignalPolicyEntry {
  packageName: string;
  directory: string;
  tier: TestSignalTier;
  signal: TestSignalKind;
  owner?: string;
  rationale?: string;
  reviewAfter?: string;
}

const NOOP_PATTERNS = [
  /process\.exit\s*\(\s*0\s*\)/i,
  /\bno tests?\b/i,
  /\btests? (?:not )?(?:yet|todo|pending)\b/i,
  /\bskip(?:ped|ping)? tests?\b/i,
  /\bplaceholder\b/i,
];

const TIER_0_PACKAGES = new Set([
  "@warpgogol/site-kernel",
  "@warpgogol/site-kernel-checks",
  "@warpgogol/werkstatt-site/share",
  "@warpgogol/werkstatt-site/integration-adapter-stripe",
  "@warpgogol/werkstatt-site/integration-adapter-supabase-crm",
]);

const TIER_1_PATTERNS = [
  /^@warpgogol\/site-kernel-/,
  /^@warpgogol\/growth/,
  /^@warpgogol\/chat/,
  /^@warpgogol\/lagebild-sync-worker$/,
];

function isIsoDate(value: string | undefined): boolean {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isExpiredIsoDate(value: string | undefined): boolean {
  if (!isIsoDate(value)) return false;
  return new Date(`${value}T00:00:00.000Z`).getTime() < Date.now();
}

function classifyTier(signal: PackageTestSignal): TestSignalTier {
  if (TIER_0_PACKAGES.has(signal.packageName)) return 0;
  if (signal.directory.startsWith("apps/")) return 3;
  if (signal.directory === "packages/ui" || signal.packageName === "@warpgogol/werkstatt-site/ontology") return 2;
  if (TIER_1_PATTERNS.some((pattern) => pattern.test(signal.packageName))) return 1;
  if (signal.directory.startsWith("packages/os/")) return 1;
  return 2;
}

function classifyScript(
  script: string | undefined,
): Pick<PackageTestSignal, "signal" | "evidence" | "requiredAction"> {
  if (!script) {
    return {
      signal: "absent",
      evidence: "package has no test script",
      requiredAction: "Add a real test script or document an explicit skipped test signal.",
    };
  }

  const normalized = script.trim();
  if (NOOP_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return {
      signal: "noop",
      evidence:
        "test script appears to print a placeholder or exit successfully without running tests",
      requiredAction:
        "Replace the placeholder with real tests or document an explicit skipped test signal.",
    };
  }

  return {
    signal: "real",
    evidence: "test script invokes a non-placeholder command",
  };
}

function asSentence(value: string): string {
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function applyExplicitSkip(
  pkg: PackageJson,
  classified: Pick<PackageTestSignal, "signal" | "evidence" | "requiredAction">,
): Pick<PackageTestSignal, "signal" | "evidence" | "metadata" | "requiredAction"> {
  const explicit = pkg.gogol?.testSignal;
  if (explicit?.signal !== "skipped") return classified;
  const metadata = {
    signal: "skipped" as const,
    ...(explicit.owner ? { owner: explicit.owner } : {}),
    ...(explicit.rationale ? { rationale: explicit.rationale } : {}),
    ...(explicit.reviewAfter ? { reviewAfter: explicit.reviewAfter } : {}),
  };
  if (classified.signal === "noop") {
    return {
      signal: "noop" as const,
      evidence: "package has a no-op test script and explicit skipped metadata",
      metadata,
      requiredAction:
        "Remove the no-op test script or replace it with a real test command before marking tests skipped.",
    };
  }
  if (!explicit.rationale?.trim()) {
    return {
      signal: "skipped" as const,
      evidence: "explicit skipped test signal is missing a rationale",
      metadata,
      requiredAction:
        "Add gogol.testSignal.rationale explaining why this package is intentionally skipped.",
    };
  }
  return {
    signal: "skipped" as const,
    evidence: explicit.rationale,
    metadata,
  };
}

export async function collectPackageTestSignals(
  workspaceRoot: string,
): Promise<PackageTestSignal[]> {
  const signals: PackageTestSignal[] = [];
  for (const workspacePackage of (await discoverWorkspacePackages(workspaceRoot)).packages) {
    const relDirectory = workspacePackage.directory;
    const pkg = workspacePackage.packageJson as PackageJson;
    const classified = applyExplicitSkip(pkg, classifyScript(pkg.scripts?.test));
    signals.push({
      packageName: pkg.name ?? relDirectory,
      directory: relDirectory,
      ...(pkg.scripts?.test ? { script: pkg.scripts.test } : {}),
      ...classified,
    });
  }
  return signals.sort((a, b) => a.directory.localeCompare(b.directory));
}

function diagnosticForSignal(signal: PackageTestSignal): Diagnostic | null {
  if (signal.signal === "real") return null;
  const severity: Diagnostic["severity"] =
    signal.signal === "skipped" && signal.requiredAction ? "error" : "warning";
  return {
    ruleId: "test.signal.validate",
    severity,
    file: `${signal.directory}/package.json`,
    message: `${signal.packageName} test signal is ${signal.signal}: ${asSentence(signal.evidence)}`,
    fixHint: signal.requiredAction ?? "No action required while the package is explicitly skipped.",
    data: { signal: signal.signal },
  };
}

function policyDiagnosticForSignal(signal: PackageTestSignal): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const metadata = signal.metadata;
  const tier = classifyTier(signal);
  const file = `${signal.directory}/package.json`;

  if (signal.signal === "real") return diagnostics;

  if (signal.signal === "noop") {
    diagnostics.push({
      ruleId: "test.signal.policy.validate",
      severity: "error",
      file,
      message: `${signal.packageName} has a no-op test script.`,
      fixHint:
        "Replace it with a real test script or remove it and add explicit gogol.testSignal skipped metadata.",
      data: { signal: signal.signal, tier },
    });
    return diagnostics;
  }

  if (signal.signal !== "skipped") {
    diagnostics.push({
      ruleId: "test.signal.policy.validate",
      severity: "error",
      file,
      message: `${signal.packageName} test signal is ${signal.signal} without package-level ownership metadata.`,
      fixHint:
        "Add a real test script or explicit gogol.testSignal skipped metadata with owner, rationale, and reviewAfter.",
      data: { signal: signal.signal, tier },
    });
    return diagnostics;
  }

  if (tier === 0) {
    diagnostics.push({
      ruleId: "test.signal.policy.validate",
      severity: "error",
      file,
      message: `${signal.packageName} is Tier 0 and must keep real tests.`,
      fixHint: "Add a real test script for this critical runtime package.",
      data: { signal: signal.signal, tier },
    });
  }

  if (!metadata?.owner?.trim()) {
    diagnostics.push({
      ruleId: "test.signal.policy.validate",
      severity: "error",
      file,
      message: `${signal.packageName} skipped-test metadata is missing owner.`,
      fixHint: "Set gogol.testSignal.owner.",
      data: { signal: signal.signal, tier },
    });
  }
  if (!metadata?.rationale?.trim()) {
    diagnostics.push({
      ruleId: "test.signal.policy.validate",
      severity: "error",
      file,
      message: `${signal.packageName} skipped-test metadata is missing rationale.`,
      fixHint: "Set gogol.testSignal.rationale.",
      data: { signal: signal.signal, tier },
    });
  }
  if (!isIsoDate(metadata?.reviewAfter)) {
    diagnostics.push({
      ruleId: "test.signal.policy.validate",
      severity: "error",
      file,
      message: `${signal.packageName} skipped-test metadata has no valid reviewAfter ISO date.`,
      fixHint: "Set gogol.testSignal.reviewAfter to YYYY-MM-DD.",
      data: { signal: signal.signal, tier },
    });
  } else if (isExpiredIsoDate(metadata?.reviewAfter)) {
    diagnostics.push({
      ruleId: "test.signal.policy.validate",
      severity: tier === 0 ? "error" : "warning",
      file,
      message: `${signal.packageName} skipped-test review date has passed.`,
      fixHint:
        "Review whether this package now needs real tests or extend the skip with a fresh rationale.",
      data: { signal: signal.signal, tier, reviewAfter: metadata?.reviewAfter },
    });
  }

  return diagnostics;
}

export async function runTestSignalValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult & { packages: PackageTestSignal[] }>> {
  const packages = await collectPackageTestSignals(context.workspaceRoot);
  const diagnostics = packages
    .map((signal) => diagnosticForSignal(signal))
    .filter((diagnostic): diagnostic is Diagnostic => diagnostic !== null);
  const result = diagnosticsResult("test.signal.validate", diagnostics);
  return {
    ...result,
    data: {
      command: result.data?.command ?? "test.signal.validate",
      status: result.data?.status ?? "pass",
      diagnostics: result.data?.diagnostics ?? [],
      summary: result.data?.summary ?? { error: 0, warning: 0, info: 0 },
      packages,
    },
  };
}

export async function runTestSignalPolicyValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult & { packages: TestSignalPolicyEntry[] }>> {
  const signals = await collectPackageTestSignals(context.workspaceRoot);
  const diagnostics = signals.flatMap((signal) => policyDiagnosticForSignal(signal));
  const result = diagnosticsResult("test.signal.policy.validate", diagnostics);
  return {
    ...result,
    data: {
      command: result.data?.command ?? "test.signal.policy.validate",
      status: result.data?.status ?? "pass",
      diagnostics: result.data?.diagnostics ?? [],
      summary: result.data?.summary ?? { error: 0, warning: 0, info: 0 },
      packages: signals.map((signal) => ({
        packageName: signal.packageName,
        directory: signal.directory,
        tier: classifyTier(signal),
        signal: signal.signal,
        ...(signal.metadata?.owner ? { owner: signal.metadata.owner } : {}),
        ...(signal.metadata?.rationale ? { rationale: signal.metadata.rationale } : {}),
        ...(signal.metadata?.reviewAfter ? { reviewAfter: signal.metadata.reviewAfter } : {}),
      })),
    },
  };
}
