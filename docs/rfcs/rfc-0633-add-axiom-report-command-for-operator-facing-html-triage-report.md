---
id: RFC-0633
title: "Add axiom.report command for operator-facing HTML triage report"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-01
updatedAt: 2026-08-01
enhancedAt: 2026-08-01
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0629
  - RFC-0630
  - RFC-0628
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-49
  - DNA-46
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - axiom.report
  added:
    - axiom.report
  changed:
    - leitstand.dev-deploy
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - site-kernel-checks
  - site-kernel-handoff
successSignals:
  - "axiom.report generates self-contained HTML from Axiom evidence JSON"
  - "leitstand.dev-deploy auto-invokes axiom.report after mission.check"
  - "HTML report includes severity dashboard, Mermaid diagrams, findings by severity and by page, capability manifest, closure decision"
  - "dryRun mode returns rendered HTML in data.renderedFiles without writing to disk"
nonGoals:
  - "Does not re-run Axiom checks or capture new evidence"
  - "Does not modify evidence JSON files"
  - "Does not generate PDF or other non-HTML report formats"
  - "Does not replace the existing renderReportHtml function in check-core (different ecosystem)"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0633: Add axiom.report command for operator-facing HTML triage report

## Context

RFC-0629 introduced `mission.check` — a one-shot Axiom accessibility check that writes native capsule files (`study-run.json`, `staged-capsule.json`, `observation-bundle.json`, `evidence-metadata.json`) to `missions/<mid>/evidence/axiom/`. RFC-0630 hardened the capture contract with runtime tool profiles and pre-flight checks. RFC-0628 integrated `mission.check` into `leitstand.dev-deploy` as a pre-release Axiom verification gate.

The evidence JSON files are machine-readable and structured for provenance (content-addressed digests, hash-chained study runs, capability manifests). However, they are not human-readable: an operator who wants to triage findings must manually parse JSON, cross-reference finding IDs with observation bundles, and mentally aggregate severity counts. The existing `renderReportHtml` function in `@warpgogol/check-core` serves a different ecosystem (check-warpgogol evidence graphs, not Axiom capsules) and produces a barebones `<ul>` list unsuitable for operator triage.

## Problem

After `leitstand.dev-deploy` runs `mission.check`, the operator has no human-readable view of the results. To assess the scale of accessibility problems and decide whether to proceed or fix, the operator must:

1. Open `study-run.json` and scan the `findings[]` array manually.
2. Cross-reference `staged-capsule.json` for the capability manifest and closure decision.
3. Mentally aggregate severity counts (critical/high/medium/low/info).
4. Cross-reference `evidence-metadata.json` for the commit SHA and mission ID.

This violates the operator-facing readability expectation of DNA-49 (Leitstand): the Leitstand pipeline produces evidence but does not present it in a triage-friendly format. The gap is operational, not structural — the data exists, but the presentation layer is missing.

## Decision

The kernel gains an `axiom.report` command that reads Axiom evidence JSON files from `missions/<mid>/evidence/axiom/` and writes a self-contained HTML triage report to `missions/<mid>/evidence/axiom/report.html`. The `leitstand.dev-deploy` pipeline auto-invokes `axiom.report` after `mission.check` completes, so the operator always receives a fresh HTML report after every dev deploy.

## Architectural fit

- **DNA-49 (Leitstand)** — `axiom.report` extends the `leitstand.dev-deploy` pipeline by auto-invoking after `mission.check`. The operator receives a triage report as part of the dev-deploy flow, not as a separate manual step.
- **DNA-46 (Mission lifecycle)** — The report is written to `missions/<mid>/evidence/axiom/report.html`, within the mission evidence directory. It is an ephemeral artifact tied to the mission's lifecycle, not a persistent committed file.
- **Site OS operator model** — `axiom.report` is a standalone kernel command registered in `site-kernel-checks` (same package as `mission.check`). It reads evidence files that `mission.check` writes and produces a human-readable presentation. The command supports `dryRun` mode (RFC-0601) for deterministic output validation.
- **Scaling Playbook** — Applies uniformly across all Sternsystems. Any mission that runs `mission.check` can generate an HTML report with no per-site configuration.

## Design

### CLI surface

```sh
# Standalone invocation
pnpm exec site-kernel run axiom.report --mission=<missionId>

# With JSON output (for programmatic consumers)
pnpm exec site-kernel run axiom.report --mission=<missionId> --json

# dryRun mode (RFC-0601) — returns HTML in data.renderedFiles, no file write
pnpm exec site-kernel run axiom.report --mission=<missionId> --dry-run --json
```

**Flags:**

| Flag | Required | Description |
| --- | --- | --- |
| `--mission` | yes | Mission ID (e.g. `warpgogol-com-m000024`) |
| `--json` | no | Emit structured JSON output instead of human-readable summary |
| `--dry-run` | no | RFC-0601 dryRun mode: return HTML in `data.renderedFiles`, skip file write |

**Scope:** workspace (reads from `missions/<mid>/`, not from a specific app).

### TypeScript contracts

```ts
import type { StudyRun, Finding } from "@syrokomskyi/axiom-study";
import type { StagedCapsule, CapabilityManifest } from "@syrokomskyi/axiom-capture";
import type { ObservationBundle } from "@syrokomskyi/axiom-study";

interface AxiomReportInput {
  mission: string;
}

interface EvidenceMetadata {
  missionId: string;
  commitSha?: string;
}

interface AxiomReportData {
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
  renderedFiles?: { [path: string]: string }; // dryRun mode
}

interface AxiomReportResult {
  data: AxiomReportData;
  exitCode: 0 | 1;
  summary: string;
  nextSteps: string[];
}

// Pure rendering function (no I/O)
function renderAxiomReportHtml(
  studyRun: StudyRun,
  capsule: StagedCapsule,
  bundle: ObservationBundle,
  metadata: EvidenceMetadata,
): string
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `missions/<mid>/evidence/axiom/study-run.json` | Read — findings, severity, study run metadata |
| `missions/<mid>/evidence/axiom/staged-capsule.json` | Read — capability manifest, closure decision |
| `missions/<mid>/evidence/axiom/observation-bundle.json` | Read — page-level observations, tool profile |
| `missions/<mid>/evidence/axiom/evidence-metadata.json` | Read — missionId, commitSha, recordedAt |
| `missions/<mid>/evidence/axiom/report.html` | Write — self-contained HTML triage report |

The command does not modify any evidence JSON files. It only reads them and writes `report.html`. In `dryRun` mode, no files are written.

### Output format

**JSON output (`--json`):**

```json
{
  "command": "axiom.report",
  "status": "pass",
  "exitCode": 0,
  "data": {
    "command": "axiom.report",
    "status": "pass",
    "missionId": "warpgogol-com-m000024",
    "evidenceDir": "missions/warpgogol-com-m000024/evidence/axiom",
    "reportPath": "missions/warpgogol-com-m000024/evidence/axiom/report.html",
    "findingsCount": { "critical": 0, "high": 2, "medium": 5, "low": 3, "info": 1 },
    "totalFindings": 11,
    "closureSatisfied": false
  },
  "summary": "axiom.report: generated report.html — 11 findings (2 high, 5 medium, 3 low, 1 info), closure blocked"
}
```

**HTML report structure:**

The HTML file is self-contained (Tailwind CDN + Mermaid CDN) and contains:

1. **Header** — mission ID, commit SHA, `StudyRun.recordedAt` timestamp (evidence freshness indicator), evidence directory path.
2. **Severity dashboard** — five badge cards (critical/high/medium/low/info) with counts and color coding.
3. **Mermaid pie chart** — severity distribution as a visual pie chart.
4. **Closure decision** — satisfied/blocked status badge with reason text.
5. **Capability manifest** — table of capabilities (http, browser, accessibility, archive, replay, closure, runtime-attestation) with state badges.
6. **Findings by severity** — collapsible sections sorted critical → info. Each finding shows rule ID, title, affected URL, finding ID.
7. **Findings by page** — findings grouped by `affectedSubjectId` (URL), with per-page severity counts.
8. **Tool profile** — Playwright, Crawlee, Chromium versions used during capture (from `observation-bundle.json`).
9. **Footer** — generated-at timestamp, evidence directory path.

### Failure modes

| Condition | Exit code | Diagnostic | Behavior |
| --- | --- | --- | --- |
| Evidence directory not found | 1 | `AXIOM-REPORT-01` | No `missions/<mid>/evidence/axiom/` directory. Operator must run `mission.check` first. |
| `study-run.json` missing or invalid JSON | 1 | `AXIOM-REPORT-02` | Cannot read findings. Evidence may be corrupted or incomplete. |
| `staged-capsule.json` missing or invalid JSON | 1 | `AXIOM-REPORT-03` | Cannot read capability manifest and closure decision. |
| `observation-bundle.json` missing or invalid JSON | 1 | `AXIOM-REPORT-04` | Cannot read page-level observations and tool profile. |
| `evidence-metadata.json` missing or invalid JSON | 0 (warn) | `AXIOM-REPORT-05` | Metadata is optional for report rendering; HTML shows "unknown" for missing fields. |
| All files present, findings exist | 0 | — | Report generated successfully. Exit 0 regardless of finding severity — the report is a presentation layer, not a gate. |

**Key design choice:** `axiom.report` always exits 0 when evidence files are present and valid, even if there are critical findings. The command is a renderer, not a gate. The gate logic lives in `mission.check` (exit 1 for high/critical) and `leitstand.propagate` (blocks on high/critical). This separation prevents double-gating.

## Rollout

- **Default behavior:** `axiom.report` is available immediately after implementation. No flag day, no opt-in — any mission with Axiom evidence can generate a report.
- **Pipeline integration:** `leitstand.dev-deploy` in `site-kernel-handoff` is modified to call `axiom.report` after `mission.check` completes (regardless of whether `mission.check` passed or failed — the operator needs the report especially when there are findings). If `axiom.report` fails (e.g. evidence files missing), it emits a warning but does not block the dev-deploy pipeline. The report generation is best-effort in the pipeline context.
- **Standalone usage:** Operators can run `axiom.report --mission=<id>` manually at any time after `mission.check` has produced evidence.
- **No migration path needed:** This is a new command, not a replacement. No existing command is superseded.
- **No `build.check` integration:** `axiom.report` is not part of `build.check` or `build.prepare`. It is a reporting tool, not a validator.

## Alternatives considered

1. **Skill-only approach (fo-axiom-report skill).** An LLM skill that reads evidence JSON and writes HTML, similar to `fo-architecture`. Rejected because: (a) non-deterministic — same JSON could produce different HTML depending on LLM session; (b) cannot be called from `leitstand.dev-deploy` pipeline automatically; (c) requires an agent session to generate a report, adding friction for the operator.

2. **Extend `renderReportHtml` in `check-core`.** Reuse the existing HTML rendering function. Rejected because: (a) `check-core` serves the check-warpgogol evidence-graph ecosystem, not Axiom capsules — the input types are incompatible; (b) the existing function produces a barebones `<ul>` list, not a triage dashboard; (c) `check-core` is a schema-and-logic package without I/O, and `axiom.report` needs filesystem access.

3. **Add HTML rendering inside `mission.check` itself.** Have `mission.check` write `report.html` alongside the JSON files. Rejected because: (a) violates single-responsibility — `mission.check` is a check/capture command, not a presentation command; (b) `mission.check` can fail before writing evidence, and the report would be lost; (c) standalone re-generation of the report (e.g. after changing the HTML template) would require re-running the entire check, which takes minutes.

## Risks

- **CDN dependency.** The HTML report uses Tailwind CDN and Mermaid CDN. If the operator views the report offline, styles and diagrams will not load. Mitigation: the report remains readable without styles (semantic HTML), and the operator typically views it in a browser with internet access.
- **Evidence format drift.** If `@syrokomskyi/axiom-study` or `@syrokomskyi/axiom-capture` change their schema (e.g. `Finding` shape, `StagedCapsule` structure), `axiom.report` must be updated. Mitigation: the command imports types from these packages, so TypeScript will catch breaking changes at compile time.
- **Pipeline coupling.** Adding `axiom.report` to `leitstand.dev-deploy` creates a dependency between the pipeline and the report command. If `axiom.report` has a bug, it could interfere with dev-deploy. Mitigation: the pipeline call is best-effort — failures in `axiom.report` emit a warning but do not block `leitstand.dev-deploy`.
- **Agent misinterpretation.** Agents might confuse `axiom.report` (renderer, exit 0 on success regardless of findings) with `mission.check` (gate, exit 1 on high/critical). Mitigation: the Implementation notes section explicitly states that `axiom.report` is not a gate.

## Acceptance criteria

- [x] `axiom.report` command registered in `site-kernel-checks` command table with correct name, flags, and scope (evidence: packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts:369-392)
- [x] `renderAxiomReportHtml` pure function implemented in `site-kernel-checks` with TypeScript types from `@syrokomskyi/axiom-study` and `@syrokomskyi/axiom-capture` (evidence: packages/os/site-kernel-checks/src/axiom-report.ts:29-33,182-187)
- [x] HTML report includes all 9 sections: header, severity dashboard, Mermaid pie chart, closure decision, capability manifest, findings by severity, findings by page, tool profile, footer (evidence: packages/os/site-kernel-checks/src/axiom-report.ts:300-370, src/tests/axiom-report.test.ts:341-368)
- [x] `--json` output format matches `AxiomReportData` interface and is documented in the RFC (evidence: packages/os/site-kernel-checks/src/axiom-report.ts:43-57, docs/rfcs/rfc-0633:206-222)
- [x] `dryRun` mode (RFC-0601) returns HTML in `data.renderedFiles` without writing to disk (evidence: packages/os/site-kernel-checks/src/axiom-report.ts:417-419,447-449, src/tests/axiom-report.test.ts:324-338)
- [x] Failure modes implemented: `AXIOM-REPORT-01` through `AXIOM-REPORT-05` with correct exit codes (evidence: packages/os/site-kernel-checks/src/axiom-report.ts:393-415, src/tests/axiom-report.test.ts:258-322)
- [x] `leitstand.dev-deploy` in `site-kernel-handoff` auto-invokes `axiom.report` after `mission.check` (best-effort, non-blocking) (evidence: packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:561-575)
- [x] Unit tests in `site-kernel-checks` cover: successful report generation, missing evidence directory, missing individual JSON files, dryRun mode, HTML contains expected sections (evidence: packages/os/site-kernel-checks/src/tests/axiom-report.test.ts:10 tests, pnpm --filter @warpgogol/site-kernel-checks run test — 741 passed)
- [x] `rfc.validate` passes on this file before merging (evidence: pnpm exec site-kernel run rfc.validate --id RFC-0633 — exit 0)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- **`axiom.report` is a renderer, not a gate.** It exits 0 when evidence files are present and valid, regardless of finding severity. The gate logic lives in `mission.check` and `leitstand.propagate`. Agents MUST NOT add gate logic to `axiom.report`.
- **Pipeline integration is best-effort.** If `axiom.report` fails inside `leitstand.dev-deploy`, the pipeline continues with a warning. Agents MUST NOT make `axiom.report` a hard gate in the pipeline.
- **Use `writeFileIfChanged`** from `@warpgogol/site-kernel` for writing `report.html`, not raw `writeFile`.
- **HTML-escape all string content.** `renderAxiomReportHtml` must escape all user-provided content (finding titles, rule IDs, URLs, diagnostics) to prevent XSS in the self-contained HTML report. Follow the `escapeHtml` pattern from `@warpgogol/check-core/src/report.ts`.
- **Populate `nextSteps`.** The result must include actionable `nextSteps` (e.g., "Review N high-severity findings at missions/<mid>/evidence/axiom/report.html" or "Fix critical findings and re-run mission.check --external-preview").
- **Update AGENTS.md files.** `packages/os/site-kernel-checks/AGENTS.md` should reference the new `axiom.report` command. `packages/os/site-kernel-handoff/AGENTS.md` should note the `leitstand.dev-deploy` auto-invocation change.
