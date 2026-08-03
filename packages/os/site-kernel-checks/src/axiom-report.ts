/*
<MODULE_CONTRACT>
  <purpose>RFC-0633: reads Axiom evidence JSON files (study-run.json, staged-capsule.json, observation-bundle.json, evidence-metadata.json) from missions/{mission}/evidence/axiom/ and writes a self-contained HTML triage report. Pure renderAxiomReportHtml function with HTML escaping. Supports --dry-run (RFC-0601). Exit 0 on success regardless of finding severity (renderer, not gate).</purpose>
  <non-goals>
    <item>Does not re-run Axiom checks or capture new evidence.</item>
    <item>Does not modify evidence JSON files.</item>
    <item>Does not generate PDF or other non-HTML report formats.</item>
    <item>Does not replace renderReportHtml in check-core (different ecosystem).</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0633: initial implementation of axiom.report command and renderAxiomReportHtml pure function.</item>
  <item>Split findings into violations vs incomplete in dashboard and chart; Mermaid pie colors match severity badge colors.</item>
</CHANGE_SUMMARY>
*/

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import {
  writeFileIfChanged,
  type KernelCommandInput,
  type KernelCommandResult,
  type KernelRuntimeContext,
  type KernelNextStep,
} from "@warpgogol/site-kernel";

import { resolveMissionDir } from "@warpgogol/site-kernel";

import type { StudyRun, Finding, ObservationBundle } from "@syrokomskyi/axiom-study";
import type {
  StagedCapsule,
  CapabilityManifest,
  ClosureDecision,
} from "@syrokomskyi/axiom-capture";

export interface MethodologyEvidenceEntry {
  id: string;
  digest?: string;
  blockOn?: string[];
}

export interface EvidenceMetadata {
  missionId: string;
  commitSha?: string;
  runTimestamp?: string;
  methodologies?: MethodologyEvidenceEntry[];
}

export interface AxiomReportData {
  command: "axiom.report";
  status: "pass" | "fail";
  missionId: string;
  evidenceDir: string;
  reportPath: string;
  findingsCount: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  totalFindings: number;
  closureSatisfied: boolean;
  renderedFiles?: { [path: string]: string };
}

const SEVERITY_ORDER: Finding["severity"][] = ["critical", "high", "medium", "low", "info"];

const SEVERITY_COLORS: Record<Finding["severity"], string> = {
  critical: "bg-red-100 text-red-800 border-red-300",
  high: "bg-orange-100 text-orange-800 border-orange-300",
  medium: "bg-yellow-100 text-yellow-800 border-yellow-300",
  low: "bg-blue-100 text-blue-800 border-blue-300",
  info: "bg-gray-100 text-gray-800 border-gray-300",
};

const SEVERITY_HEX: Record<Finding["severity"], string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  info: "#6b7280",
};

function isViolationFinding(f: Finding): boolean {
  return (
    (
      (f.extension as Record<string, unknown> | undefined)?.["automated-web-accessibility"] as
        Record<string, unknown> | undefined
    )?.predicate === "accessibility.axe.violation"
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function countFindingsBySeverity(findings: Finding[]): AxiomReportData["findingsCount"] {
  const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  return counts;
}

function groupFindingsByPage(findings: Finding[]): Map<string, Finding[]> {
  const groups = new Map<string, Finding[]>();
  for (const f of findings) {
    const key = f.affectedSubjectId;
    const list = groups.get(key);
    if (list) {
      list.push(f);
    } else {
      groups.set(key, [f]);
    }
  }
  return groups;
}

function renderFindingsTypeDashboard(
  label: string,
  counts: AxiomReportData["findingsCount"],
  total: number,
): string {
  const cards = SEVERITY_ORDER.map((sev) => {
    const count = counts[sev];
    const colorClass = SEVERITY_COLORS[sev];
    return `<div class="rounded-lg border ${colorClass} p-4 text-center">
      <div class="text-3xl font-bold">${count}</div>
      <div class="text-sm uppercase mt-1">${escapeHtml(sev)}</div>
    </div>`;
  }).join("\n");
  return `<div class="mb-6">
    <h3 class="text-lg font-semibold mb-2">${escapeHtml(label)} <span class="text-sm font-normal text-gray-500">(${total})</span></h3>
    <div class="grid grid-cols-5 gap-3">${cards}</div>
  </div>`;
}

function renderMermaidPie(counts: AxiomReportData["findingsCount"], title: string): string {
  const activeSeverities = SEVERITY_ORDER.filter((sev) => counts[sev] > 0);
  if (activeSeverities.length === 0) {
    return `<p class="text-gray-500 italic">No findings to chart.</p>`;
  }
  const segments = activeSeverities
    .map((sev) => `  "${sev} (${counts[sev]})" : ${counts[sev]}`)
    .join("\n");
  const themeVars = activeSeverities
    .map((sev, i) => `"pie${i + 1}": "${SEVERITY_HEX[sev]}"`)
    .join(", ");
  return `<pre class="mermaid">
%%{init: {"theme": "base", "themeVariables": {${themeVars}}}%%
pie title ${escapeHtml(title)}
${segments}
</pre>`;
}

function renderClosureDecision(closure: ClosureDecision): string {
  const badgeClass = closure.satisfied
    ? "bg-green-100 text-green-800 border-green-300"
    : "bg-red-100 text-red-800 border-red-300";
  const statusText = closure.satisfied ? "Satisfied" : "Blocked";
  return `<div class="rounded-lg border ${badgeClass} p-4 mb-6">
    <div class="flex items-center gap-3">
      <span class="text-lg font-bold">${escapeHtml(statusText)}</span>
      <span class="text-sm opacity-75">${escapeHtml(closure.status)}</span>
    </div>
    <p class="mt-2 text-sm">${escapeHtml(closure.reason)}</p>
  </div>`;
}

function renderCapabilityManifest(manifest: CapabilityManifest): string {
  const rows = manifest.receipts
    .map((r) => {
      const stateClass =
        r.state === "complete"
          ? "bg-green-100 text-green-800"
          : r.state === "excluded"
            ? "bg-gray-100 text-gray-600"
            : "bg-yellow-100 text-yellow-800";
      return `<tr>
        <td class="border px-3 py-2 font-mono text-sm">${escapeHtml(r.capability)}</td>
        <td class="border px-3 py-2"><span class="rounded px-2 py-1 text-xs ${stateClass}">${escapeHtml(r.state)}</span></td>
        <td class="border px-3 py-2 text-sm">${r.expectedCount}</td>
        <td class="border px-3 py-2 text-sm">${r.observedCount}</td>
      </tr>`;
    })
    .join("\n");
  return `<table class="w-full border-collapse mb-6">
    <thead><tr class="bg-gray-100">
      <th class="border px-3 py-2 text-left">Capability</th>
      <th class="border px-3 py-2 text-left">State</th>
      <th class="border px-3 py-2 text-left">Expected</th>
      <th class="border px-3 py-2 text-left">Observed</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderFindingsBySeverity(findings: Finding[], typeLabel: string): string {
  const sections = SEVERITY_ORDER.filter((sev) => findings.some((f) => f.severity === sev))
    .map((sev) => {
      const sevFindings = findings.filter((f) => f.severity === sev);
      const colorClass = SEVERITY_COLORS[sev];
      const items = sevFindings
        .map(
          (f) => `<li class="mb-2 p-3 rounded border border-gray-200">
          <div class="font-semibold">${escapeHtml(f.title)}</div>
          <div class="text-sm text-gray-600 mt-1">
            <span class="font-mono">${escapeHtml(f.ruleId)}</span> ·
            <span class="font-mono">${escapeHtml(f.findingId)}</span>
          </div>
          <div class="text-sm text-gray-500 mt-1">Page: ${escapeHtml(f.affectedSubjectId)}</div>
        </li>`,
        )
        .join("\n");
      return `<details class="mb-3" open>
      <summary class="cursor-pointer rounded-t border ${colorClass} px-3 py-2 font-semibold">
        ${escapeHtml(sev)} (${sevFindings.length})
      </summary>
      <ul class="mt-2">${items}</ul>
    </details>`;
    })
    .join("\n");
  return sections || `<p class="text-gray-500 italic">No ${typeLabel} findings.</p>`;
}

function renderFindingsByPage(findings: Finding[], typeLabel: string): string {
  const groups = groupFindingsByPage(findings);
  const sections = Array.from(groups.entries())
    .map(([page, pageFindings]) => {
      const counts = countFindingsBySeverity(pageFindings);
      const severitySummary = SEVERITY_ORDER.filter((s) => counts[s] > 0)
        .map((s) => `${s}: ${counts[s]}`)
        .join(", ");
      const items = pageFindings
        .map(
          (f) => `<li class="mb-1 p-2 rounded border border-gray-200">
          <span class="rounded px-2 py-0.5 text-xs ${SEVERITY_COLORS[f.severity]}">${escapeHtml(f.severity)}</span>
          <span class="ml-2 font-semibold">${escapeHtml(f.title)}</span>
          <span class="ml-2 font-mono text-xs text-gray-500">${escapeHtml(f.ruleId)}</span>
        </li>`,
        )
        .join("\n");
      return `<details class="mb-3">
      <summary class="cursor-pointer rounded border border-gray-300 px-3 py-2 font-semibold">
        ${escapeHtml(page)} <span class="text-sm text-gray-500">(${severitySummary})</span>
      </summary>
      <ul class="mt-2">${items}</ul>
    </details>`;
    })
    .join("\n");
  return sections || `<p class="text-gray-500 italic">No ${typeLabel} findings.</p>`;
}

function renderToolProfile(capsule: StagedCapsule): string {
  const attestation = capsule.runtimeAttestation;
  if (!attestation) return `<p class="text-gray-500 italic">No runtime attestation available.</p>`;
  const tools = attestation.toolDigests;
  const rows = Object.entries(tools)
    .map(
      ([name, version]) =>
        `<tr><td class="border px-3 py-2 font-mono text-sm">${escapeHtml(name)}</td><td class="border px-3 py-2 text-sm">${escapeHtml(version)}</td></tr>`,
    )
    .join("\n");
  return `<table class="w-full border-collapse">
    <thead><tr class="bg-gray-100">
      <th class="border px-3 py-2 text-left">Tool</th>
      <th class="border px-3 py-2 text-left">Version</th>
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function renderGateSummary(methodologies: MethodologyEvidenceEntry[], findings: Finding[]): string {
  const rows = methodologies
    .map((m) => {
      const blockOnSet = new Set(m.blockOn ?? ["high", "critical"]);
      const methodologyFindings = findings.filter((f) => {
        const ext = f.extension as Record<string, Record<string, unknown>> | undefined;
        return ext?.[m.id]?.predicate !== undefined;
      });
      const blockingCount = methodologyFindings.filter((f) => {
        if (!f.severity || !blockOnSet.has(f.severity)) return false;
        const ext = f.extension as Record<string, Record<string, unknown>> | undefined;
        const predicate = ext?.[m.id]?.predicate;
        if (typeof predicate === "string" && predicate.endsWith(".incomplete")) return false;
        return true;
      }).length;
      const passed = blockingCount === 0;
      const statusClass = passed
        ? "bg-green-100 text-green-800 border-green-300"
        : "bg-red-100 text-red-800 border-red-300";
      const statusText = passed ? "PASS" : "FAIL";
      return `<tr>
  <td class="border px-3 py-2 font-mono text-sm">${escapeHtml(m.id)}</td>
  <td class="border px-3 py-2 text-sm">${escapeHtml((m.blockOn ?? ["high", "critical"]).join(", "))}</td>
  <td class="border px-3 py-2 text-sm">${methodologyFindings.length}</td>
  <td class="border px-3 py-2 text-sm">${blockingCount}</td>
  <td class="border px-3 py-2 text-center font-bold ${statusClass}">${statusText}</td>
</tr>`;
    })
    .join("\n");

  return `<table class="w-full border-collapse text-sm">
<thead>
<tr>
  <th class="border px-3 py-2 text-left">Methodology</th>
  <th class="border px-3 py-2 text-left">Block On</th>
  <th class="border px-3 py-2 text-left">Findings</th>
  <th class="border px-3 py-2 text-left">Blocking</th>
  <th class="border px-3 py-2 text-center">Status</th>
</tr>
</thead>
<tbody>
${rows}
</tbody>
</table>`;
}

export function renderAxiomReportHtml(
  studyRun: StudyRun,
  capsule: StagedCapsule,
  bundle: ObservationBundle,
  metadata: EvidenceMetadata,
): string {
  const findings = studyRun.findings;
  const violationFindings = findings.filter(isViolationFinding);
  const incompleteFindings = findings.filter((f) => !isViolationFinding(f));
  const violationCounts = countFindingsBySeverity(violationFindings);
  const total = findings.length;
  const closure = capsule.closureDecision;
  const recordedAt = studyRun.recordedAt;
  const commitSha = metadata.commitSha ?? "unknown";
  const missionId = metadata.missionId;

  // RFC-0665: Gate summary — pass/fail per methodology
  const methodologies = metadata.methodologies ?? [];
  const hasMethodologies = methodologies.length > 0;
  const gateSummaryHtml = hasMethodologies
    ? renderGateSummary(methodologies, findings)
    : `<div class="text-sm text-gray-500">No methodologies[] in evidence-metadata.json — pre-RFC-0665 evidence (legacy report format).</div>`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Axiom Report — ${escapeHtml(missionId)}</title>
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
<style>@media print { .no-print { display: none; } details { open: true; } }</style>
</head>
<body class="bg-gray-50 max-w-5xl mx-auto p-6">

<header class="mb-6">
  <h1 class="text-2xl font-bold">Axiom Triage Report</h1>
  <div class="text-sm text-gray-600 mt-2">
    <div><strong>Mission:</strong> ${escapeHtml(missionId)}</div>
    <div><strong>Commit SHA:</strong> <code>${escapeHtml(commitSha)}</code></div>
    <div><strong>Evidence recorded at:</strong> ${escapeHtml(recordedAt)}</div>
    <div><strong>Observation bundle:</strong> <code>${escapeHtml(bundle.bundleId)}</code></div>
  </div>
</header>

<section class="mb-6">
  <h2 class="text-xl font-bold mb-3">Gate Summary (RFC-0665)</h2>
  ${gateSummaryHtml}
</section>

<section class="mb-6">
  <h2 class="text-xl font-bold mb-3">Severity Dashboard</h2>
  ${renderFindingsTypeDashboard("Violations", violationCounts, violationFindings.length)}
  ${
    incompleteFindings.length > 0
      ? `<div class="mt-4 text-sm text-gray-500">
    <strong>Incomplete:</strong> ${incompleteFindings.length} finding(s) — axe could not determine the background color automatically (e.g. text over images, overlapping elements). Requires manual review.
  </div>`
      : ""
  }
</section>

<section class="mb-6">
  <h2 class="text-xl font-bold mb-3">Severity Distribution</h2>
  <h3 class="text-lg font-semibold mb-2">Violations</h3>
  ${renderMermaidPie(violationCounts, "Violations by Severity")}
</section>

<section class="mb-6">
  <h2 class="text-xl font-bold mb-3">Closure Decision</h2>
  ${renderClosureDecision(closure)}
</section>

<section class="mb-6">
  <h2 class="text-xl font-bold mb-3">Capability Manifest</h2>
  ${renderCapabilityManifest(capsule.capabilityManifest)}
</section>

<section class="mb-6">
  <h2 class="text-xl font-bold mb-3">Violations by Severity</h2>
  ${renderFindingsBySeverity(violationFindings, "violation")}
</section>

<section class="mb-6">
  <h2 class="text-xl font-bold mb-3">Violations by Page</h2>
  ${renderFindingsByPage(violationFindings, "violation")}
</section>

<section class="mb-6">
  <h2 class="text-xl font-bold mb-3">Tool Profile</h2>
  ${renderToolProfile(capsule)}
</section>

<footer class="border-t border-gray-300 pt-4 text-sm text-gray-500">
  <div>Generated at: ${escapeHtml(new Date().toISOString())}</div>
  <div>Total findings: ${total} (${violationFindings.length} violations, ${incompleteFindings.length} incomplete)</div>
</footer>

<script>mermaid.initialize({ startOnLoad: true });</script>
</body>
</html>`;
}

export async function runAxiomReport(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<AxiomReportData>> {
  const { workspaceRoot, logger } = context;

  const missionId = input.flags["mission"] as string | undefined;
  if (!missionId) {
    throw new Error("axiom.report requires --mission <mission-id>");
  }

  const dryRun = input.flags["dry-run"] === true || input.flags["dry-run"] === "true";

  const missionDir = resolveMissionDir(workspaceRoot, missionId);
  const evidenceDir = join(missionDir, "evidence", "axiom");

  if (!existsSync(evidenceDir)) {
    return failResult(
      evidenceDir,
      1,
      `AXIOM-REPORT-01: evidence directory not found at ${evidenceDir}. Run mission.check first.`,
    );
  }

  const studyRunPath = join(evidenceDir, "study-run.json");
  let studyRun: StudyRun;
  try {
    studyRun = JSON.parse(readFileSync(studyRunPath, "utf-8"));
  } catch {
    return failResult(
      evidenceDir,
      1,
      `AXIOM-REPORT-02: cannot read study-run.json at ${studyRunPath}.`,
    );
  }

  const capsulePath = join(evidenceDir, "staged-capsule.json");
  let capsule: StagedCapsule;
  try {
    capsule = JSON.parse(readFileSync(capsulePath, "utf-8"));
  } catch {
    return failResult(
      evidenceDir,
      1,
      `AXIOM-REPORT-03: cannot read staged-capsule.json at ${capsulePath}.`,
    );
  }

  const bundlePath = join(evidenceDir, "observation-bundle.json");
  let bundle: ObservationBundle;
  try {
    bundle = JSON.parse(readFileSync(bundlePath, "utf-8"));
  } catch {
    return failResult(
      evidenceDir,
      1,
      `AXIOM-REPORT-04: cannot read observation-bundle.json at ${bundlePath}.`,
    );
  }

  const metadataPath = join(evidenceDir, "evidence-metadata.json");
  let metadata: EvidenceMetadata = { missionId };
  if (existsSync(metadataPath)) {
    try {
      metadata = JSON.parse(readFileSync(metadataPath, "utf-8"));
    } catch {
      logger.warn(
        `AXIOM-REPORT-05: cannot read evidence-metadata.json at ${metadataPath}. Using "unknown" for missing fields.`,
      );
    }
  } else {
    logger.warn(
      `AXIOM-REPORT-05: evidence-metadata.json not found at ${metadataPath}. Using "unknown" for missing fields.`,
    );
  }

  const html = renderAxiomReportHtml(studyRun, capsule, bundle, metadata);
  const reportPath = join(evidenceDir, "report.html");
  const relativeReportPath = `missions/${missionId}/evidence/axiom/report.html`;

  if (!dryRun) {
    await writeFileIfChanged(reportPath, html);
  }

  const findings = studyRun.findings;
  const violationFindings = findings.filter(isViolationFinding);
  const incompleteFindings = findings.filter((f) => !isViolationFinding(f));
  const violationCounts = countFindingsBySeverity(violationFindings);
  const total = findings.length;
  const closureSatisfied = capsule.closureDecision.satisfied;
  const errors = violationCounts.critical + violationCounts.high;

  const nextSteps: KernelNextStep[] =
    errors > 0
      ? [
          {
            action: `Review ${errors} high-severity violation(s) at ${relativeReportPath}`,
            kind: "optional",
          },
          {
            action: `Fix critical/high violations and re-run mission.check --external-preview`,
            kind: "required",
          },
        ]
      : [
          {
            action: `Report generated at ${relativeReportPath} — ${violationFindings.length} violation(s), ${incompleteFindings.length} incomplete`,
            kind: "optional",
          },
        ];

  const summary = `axiom.report: ${dryRun ? "dry-run" : "generated"} report.html — ${total} finding(s) (${violationFindings.length} violations: ${violationCounts.critical} critical, ${violationCounts.high} high, ${violationCounts.medium} medium, ${violationCounts.low} low, ${violationCounts.info} info; ${incompleteFindings.length} incomplete), closure ${closureSatisfied ? "satisfied" : "blocked"}`;

  const data: AxiomReportData = {
    command: "axiom.report",
    status: "pass",
    missionId,
    evidenceDir,
    reportPath: relativeReportPath,
    findingsCount: violationCounts,
    totalFindings: total,
    closureSatisfied,
  };

  if (dryRun) {
    data.renderedFiles = { [relativeReportPath]: html };
  }

  return {
    data,
    exitCode: 0,
    summary,
    nextSteps,
  };
}

function failResult(
  evidenceDir: string,
  exitCode: 0 | 1,
  summary: string,
): KernelCommandResult<AxiomReportData> {
  return {
    data: {
      command: "axiom.report",
      status: "fail",
      missionId: "",
      evidenceDir,
      reportPath: "",
      findingsCount: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
      totalFindings: 0,
      closureSatisfied: false,
    },
    exitCode,
    summary,
    nextSteps: [],
  };
}
