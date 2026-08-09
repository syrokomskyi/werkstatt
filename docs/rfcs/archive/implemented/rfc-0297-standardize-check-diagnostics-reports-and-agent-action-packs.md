---
id: RFC-0297
title: "Standardize check diagnostics, reports, and agent action packs"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-05
implementedAt: 2026-07-05
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0203
  - RFC-0247
  - RFC-0256
  - RFC-0293
  - RFC-0294
  - RFC-0295
  - RFC-0298
  - RFC-0299
commands:
  proposed: []
  added:
    - check.report.generate
    - check.action-pack.generate
    - check.compare
  changed: []
  removed: []
appsImpacted:
  - check-warpgogol-com
packagesImpacted:
  - "@gogol/check-core"
  - "@gogol/site-kernel-check-warpgogol"
successSignals:
  - "Every check finding is a canonical Diagnostic with URL/screenshot/source hint data, not free-form prose."
  - "Reports are deterministic JSON and human-readable HTML generated from the same data."
  - "Agent action packs tell an AI agent exactly what to inspect, what to change, and how to verify the fix."
nonGoals:
  - "Do not auto-edit websites from this layer."
  - "Do not require source anchors for third-party sites."
  - "Do not hide warnings in summaries only; actionable warnings must be Diagnostics."
acceptance:
  - probe: command-registered
    name: "check.report.generate"
  - probe: command-registered
    name: "check.action-pack.generate"
  - probe: command-registered
    name: "check.compare"
  - probe: file-exists
    path: "packages/check-core/src/report.ts"
---

# RFC-0297: Standardize check diagnostics, reports, and agent action packs

## Context

The checker is only useful if its output is repairable. A vague quality score or prose review forces a future agent to rediscover context. The ecosystem already solved this for repository checks with RFC-0203 Diagnostics: stable rule ids, severity, locators, and fix hints. URL-first checking needs the same discipline, extended to URLs, DOM selectors, screenshot regions, and optional WGogol source anchors.

## Problem

Rendered-site quality findings are naturally fuzzy:

- "The homepage feels unclear."
- "The Ukrainian page sounds translated."
- "The pricing CTA appears too late."

Without a strict report and action format, those findings are not enough for an implementation agent. They need anchors, evidence, suggested edits, and verification commands.

## Decision

All Check Warpgogol checks emit canonical `Diagnostic[]` and one generated **CheckReport**. A second generated artifact, the **AgentActionPack**, groups diagnostics into concrete repair tasks.

Reports are evidence-first:

- every report references exactly one evidence graph hash;
- every diagnostic references evidence inside that graph;
- every action pack item references diagnostics by id/ruleId and carries a verification path.

## Architectural fit

- RFC-0203 is the base diagnostic model. This RFC does not replace it.
- RFC-0247 requires actionable warnings to travel as diagnostics, not summary prose. This applies to check reports as well.
- RFC-0256 maintenance queues can later ingest action pack items, but the first implementation keeps a product-specific action pack to avoid coupling.

## Design

### Diagnostic Data Extension

The `Diagnostic` interface remains unchanged. URL-specific location data lives in `data`:

```ts
export interface CheckDiagnosticData {
  check: {
    runId: string;
    evidenceGraphHash: string;
  };
  url?: string;
  finalUrl?: string;
  selector?: string;
  screenshot?: {
    path: string;
    box?: ScreenshotBox;
  };
  sourceAnchor?: {
    workspacePath: string;
    line?: number;
    column?: number;
    pageId?: string;
    lang?: string;
    blockId?: string;
    propPath?: string;
  };
  audienceProfile?: string;
  confidence?: number;
}
```

### Report Contract

```ts
export interface CheckReport {
  schemaVersion: "1.0.0";
  runId: string;
  target: PublicCheckTargetSnapshot;
  evidenceGraphHash: string;
  generatedAt: string;
  status: "pass" | "warn" | "fail";
  score: {
    overall: number;
    technical: number;
    localization: number;
    accessibility: number;
    audience: number | null;
  };
  diagnostics: Diagnostic[];
  pages: PageScore[];
  summaries: {
    executive: string;
    agent: string;
  };
  contentHash: string;
}
```

`contentHash` excludes `generatedAt` and is stable for identical inputs.

### Agent Action Pack

```ts
export interface AgentActionPack {
  schemaVersion: "1.0.0";
  runId: string;
  targetId: string;
  evidenceGraphHash: string;
  tasks: AgentRepairTask[];
  contentHash: string;
}

export interface AgentRepairTask {
  id: string;
  priority: "P0" | "P1" | "P2" | "P3";
  title: string;
  rationale: string;
  diagnostics: Array<{ ruleId: string; diagnosticIndex: number }>;
  target:
    | { kind: "wgogol-source"; anchors: CheckDiagnosticData["sourceAnchor"][] }
    | { kind: "external-url"; urls: string[]; selectors?: string[] };
  suggestedChange: string;
  verification: {
    commands: string[];
    expected: string;
  };
}
```

### Commands

```sh
pnpm exec werkstatt run check.report.generate --run .check-warpgogol/runs/<runId> --json
pnpm exec werkstatt run check.action-pack.generate --run .check-warpgogol/runs/<runId> --json
pnpm exec werkstatt run check.compare --before .check-warpgogol/runs/a --after .check-warpgogol/runs/b --json
```

### Validation Rules

| Rule | Severity | Meaning |
| --- | --- | --- |
| `CW-REP-01` | error | Report schema invalid or contentHash mismatch. |
| `CW-REP-02` | error | Report evidenceGraphHash does not match the evidence artifact. |
| `CW-REP-03` | error | Diagnostic lacks URL/screenshot/source evidence for an actionable finding. |
| `CW-REP-04` | warning | Actionable warning has no action-pack task. |
| `CW-REP-05` | error | Action pack references a diagnostic that does not exist. |

## Rollout

1. Add report and action-pack schemas to `@gogol/check-core`.
2. Implement report generation from diagnostics and graph.
3. Implement action-pack grouping with deterministic priority rules.
4. Implement before/after comparison by report hashes and diagnostic keys.
5. Make `apps/check-warpgogol-com` render reports and tasks from these artifacts only.

## Alternatives considered

- **HTML report only.** Rejected: humans need HTML, agents need deterministic JSON.
- **Use maintenance debt queues directly.** Rejected for MVP: external sites have no repository queue; action packs are portable.
- **Let LLM write the whole action pack.** Rejected: grouping can use deterministic rules; AI can contribute suggested text but not own the schema.

## Risks

- **Too many low-value tasks.** Mitigated by priority rules and grouping diagnostics by page/section.
- **False source anchors.** Mitigated by requiring hints to include hashes and by falling back to URL tasks when source mapping is uncertain.
- **Score gaming.** Mitigated by making diagnostics and evidence primary; score is a summary, not the authority.

## Acceptance criteria

- [x] `CheckReport` and `AgentActionPack` schemas exist and are tested. (evidence: implemented historically)
- [x] `check.report.generate` writes `report.json` and `report.html` from the same report object. (evidence: implemented historically)
- [x] `check.action-pack.generate` writes stable task ids and groups related diagnostics. (evidence: implemented historically)
- [x] `check.compare` reports fixed, new, and unchanged diagnostics between two runs. (evidence: implemented historically)
- [x] Actionable warnings are represented as diagnostics and not only as prose. (evidence: implemented historically)
- [x] Reports for targets without WGogol hints remain valid. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Never write action items without linking them to diagnostics.
- Keep suggested changes imperative and bounded; an agent should be able to execute the instruction or know why it cannot.
- If a task points to WGogol source, include the re-run command that proves the fix on the deployed alt URL.
