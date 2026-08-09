---
rfcId: RFC-0633
planId: PLAN-RFC-0633-01
status: draft
owner: architecture
createdAt: 2026-08-01
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/site-kernel-checks"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - packages/os/site-kernel-checks/AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
---

# Implementation Plan: RFC-0633

## 1. Objectives

- [ ] Objective 1 — `axiom.report` command registered and callable via CLI — maps to acceptance criterion "axiom.report command registered in site-kernel-checks command table"
- [ ] Objective 2 — `renderAxiomReportHtml` pure function produces self-contained HTML with all 9 sections — maps to acceptance criteria "renderAxiomReportHtml pure function implemented" and "HTML report includes all 9 sections"
- [ ] Objective 3 — `--json` and `--dry-run` flags work correctly — maps to acceptance criteria "--json output format matches AxiomReportData" and "dryRun mode returns HTML in data.renderedFiles"
- [ ] Objective 4 — Failure modes AXIOM-REPORT-01..05 implemented with correct exit codes — maps to acceptance criterion "Failure modes implemented"
- [ ] Objective 5 — `leitstand.dev-deploy` auto-invokes `axiom.report` after `mission.check` (best-effort) — maps to acceptance criterion "leitstand.dev-deploy auto-invokes axiom.report"
- [ ] Objective 6 — Unit tests cover success, missing files, dryRun, HTML structure — maps to acceptance criterion "Unit tests cover: successful report generation, missing evidence, dryRun, HTML sections"

## 2. Affected artifacts

### 2.1 Code and commands

- **New file:** `packages/os/site-kernel-checks/src/axiom-report.ts` — `runAxiomReport` command handler + `renderAxiomReportHtml` pure rendering function + `AxiomReportData`/`AxiomReportResult`/`EvidenceMetadata` interfaces + `escapeHtml` helper + `countFindingsBySeverity` helper
- **Modify:** `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts` — add `axiom.report` command entry (after `mission.check` entry, same file)
- **Modify:** `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — add `axiom.report` auto-invocation in `runLeitstandDevDeploy` after `mission.check` block (lines ~557-560), best-effort with try/catch warning
- **New file:** `packages/os/site-kernel-checks/src/tests/axiom-report.test.ts` — unit tests

### 2.2 Configuration and data

- No YAML/JSON config changes. The command reads from `missions/<mid>/evidence/axiom/` (already produced by `mission.check`).

### 2.3 Documentation and specs

- `packages/os/site-kernel-checks/AGENTS.md` — add `axiom-report.ts` module row to the "What lives here" table
- `packages/os/site-kernel-handoff/AGENTS.md` — note `leitstand.dev-deploy` auto-invokes `axiom.report` after `mission.check`
- RFC file is read-only reference (already accepted)

### 2.4 Validation and pipelines

- `axiom.report` is NOT part of `build.check` or `build.prepare` — it is a reporting tool, not a validator
- No CI workflow changes needed
- `rfc.validate --id RFC-0633` must pass before stamping implemented

## 3. Step sequence

### Step 1. Implement `renderAxiomReportHtml` pure function and types

**Goal:** Create the pure rendering function and all TypeScript interfaces in `axiom-report.ts`.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/axiom-report.ts`
- Define interfaces: `EvidenceMetadata`, `AxiomReportData`, `AxiomReportResult`, `AxiomReportInput`
- Implement `escapeHtml(value: string): string` — follow `escapeHtml` pattern from `@warpgogol/check-core/src/report.ts:125-131`
- Implement `countFindingsBySeverity(findings: Finding[])` — count by severity (critical/high/medium/low/info)
- Implement `renderAxiomReportHtml(studyRun, capsule, bundle, metadata): string` — pure function, no I/O
  - Section 1: Header — mission ID, commit SHA, `studyRun.recordedAt` (freshness indicator), evidence dir
  - Section 2: Severity dashboard — 5 badge cards with counts and Tailwind color classes
  - Section 3: Mermaid pie chart — `pie` diagram with severity distribution
  - Section 4: Closure decision — `capsule.closureDecision.satisfied` badge + reason
  - Section 5: Capability manifest — table from `capsule.capabilityManifest.receipts[]`
  - Section 6: Findings by severity — collapsible `<details>` sections, critical → info, each finding shows ruleId, title, affectedSubjectId, findingId
  - Section 7: Findings by page — group by `affectedSubjectId`, per-page severity counts
  - Section 8: Tool profile — from `capsule.runtimeAttestation.toolDigests` (playwright, chromium, crawlee)
  - Section 9: Footer — generated-at timestamp, evidence dir path
  - All string content HTML-escaped via `escapeHtml`
  - Self-contained: Tailwind CDN `<script>`, Mermaid CDN `<script>`, inline `<style>` for print-friendliness

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check` — TypeScript compiles
- Import types from `@syrokomskyi/axiom-study` and `@syrokomskyi/axiom-capture` resolve correctly

**Completion criterion:** `axiom-report.ts` exists, exports `renderAxiomReportHtml` and all interfaces, TypeScript compiles without errors.

**Human review:** no

---

### Step 2. Implement `runAxiomReport` command handler

**Goal:** Add the I/O handler that reads evidence JSON files and writes `report.html`.

**Agent actions:**

- In `axiom-report.ts`, implement `runAxiomReport(input, context): Promise<KernelCommandResult<AxiomReportData>>`
- Read flags: `--mission` (required), `--dry-run` (optional boolean), `--json` (optional boolean)
- Resolve evidence dir: `join(resolveMissionDir(workspaceRoot, missionId), "evidence", "axiom")`
- Failure mode AXIOM-REPORT-01: if evidence dir doesn't exist, return exitCode 1 with diagnostic
- Read `study-run.json` — failure mode AXIOM-REPORT-02 (exit 1)
- Read `staged-capsule.json` — failure mode AXIOM-REPORT-03 (exit 1)
- Read `observation-bundle.json` — failure mode AXIOM-REPORT-04 (exit 1)
- Read `evidence-metadata.json` — failure mode AXIOM-REPORT-05 (exit 0, warn, use "unknown" for missing fields)
- Call `renderAxiomReportHtml(studyRun, capsule, bundle, metadata)` to produce HTML
- If `--dry-run`: set `data.renderedFiles = { "report.html": html }`, skip file write
- If not dry-run: write `report.html` via `writeFileIfChanged` from `@warpgogol/site-kernel`
- Build `AxiomReportData` with findingsCount, totalFindings, closureSatisfied, reportPath
- Build `nextSteps`: e.g. `["Review N high-severity findings at missions/<mid>/evidence/axiom/report.html"]` or `["No high-severity findings — report generated for reference"]`
- Return `{ data, exitCode: 0, summary, nextSteps }`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run build:check`

**Completion criterion:** `runAxiomReport` handles all 5 failure modes, writes `report.html` via `writeFileIfChanged`, supports `--dry-run`, returns `nextSteps`.

**Human review:** no

---

### Step 3. Register `axiom.report` in command table

**Goal:** Make `axiom.report` discoverable and callable via the kernel CLI.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts`, add a new `CheckCommandEntry` for `axiom.report` after the `mission.check` entry
- Set: `name: "axiom.report"`, `scope: "workspace"`, `supportsAllSites: false`, `mutatesState: true`, `cacheable: false`
- Flags: `mission` (string, required), `dry-run` (boolean, optional), `json` (boolean, optional)
- `writes: ["missions/{mission}/evidence/axiom/report.html"]`
- `reads: ["missions/{mission}/evidence/axiom/**"]`
- `execute: runAxiomReport`
- Import `runAxiomReport` from `../axiom-report.ts`

**Validation:**

- `pnpm exec site-kernel run axiom.report --mission=test 2>&1 | grep "axiom.report"` — command is recognized (will fail on missing mission, but command name should appear)

**Completion criterion:** `axiom.report` appears in the command registry and is callable via `site-kernel run axiom.report`.

**Human review:** no

---

### Step 4. Integrate `axiom.report` into `leitstand.dev-deploy`

**Goal:** Auto-invoke `axiom.report` after `mission.check` in the dev-deploy pipeline.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`, in `runLeitstandDevDeploy`, after the `mission.check` block (after line ~557, before the "RFC-0629: No evidence post-processing" comment):
- Add a best-effort `axiom.report` invocation:
  ```ts
  // RFC-0633: Auto-invoke axiom.report after mission.check (best-effort, non-blocking)
  try {
    const { executeKernelCommand } = await import("@warpgogol/site-kernel");
    await executeKernelCommand({
      workspaceRoot,
      commandName: "axiom.report",
      argv: [`--mission=${missionId}`],
    });
    logger.info(`[leitstand.dev-deploy] axiom.report: report.html generated`);
  } catch (reportErr) {
    logger.warn(`[leitstand.dev-deploy] axiom.report failed (non-blocking): ${reportErr instanceof Error ? reportErr.message : String(reportErr)}`);
  }
  ```
- This runs regardless of whether `mission.check` passed or failed (operator needs the report especially when there are findings)
- The `executeKernelCommand` import is already available in scope (used for `mission.check` above)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `leitstand.dev-deploy` calls `axiom.report` after `mission.check`; failures in `axiom.report` produce a warning, not a pipeline failure.

**Human review:** no

---

### Step 5. Write unit tests

**Goal:** Cover success path, failure modes, dryRun, and HTML structure.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/axiom-report.test.ts`
- Test cases:
  1. **Successful report generation** — create temp dir with valid `study-run.json`, `staged-capsule.json`, `observation-bundle.json`, `evidence-metadata.json`; run `runAxiomReport`; assert exitCode 0, `reportPath` correct, `findingsCount` matches, `closureSatisfied` matches, `nextSteps` non-empty
  2. **Missing evidence directory** — no `evidence/axiom/` dir; assert exitCode 1, AXIOM-REPORT-01
  3. **Missing `study-run.json`** — assert exitCode 1, AXIOM-REPORT-02
  4. **Missing `staged-capsule.json`** — assert exitCode 1, AXIOM-REPORT-03
  5. **Missing `observation-bundle.json`** — assert exitCode 1, AXIOM-REPORT-04
  6. **Missing `evidence-metadata.json`** — assert exitCode 0, AXIOM-REPORT-05 warning, report still generated with "unknown" fields
  7. **dryRun mode** — `--dry-run` flag; assert no file written, `data.renderedFiles["report.html"]` contains HTML
  8. **HTML structure** — render HTML and assert it contains: severity dashboard, Mermaid pie, closure decision, capability manifest, findings by severity, findings by page, tool profile, footer
  9. **HTML escaping** — finding title contains `<script>`; assert output contains `&lt;script&gt;` not `<script>`
- Use `mkdtempSync`/`rmSync` for temp dirs, `writeFileSync` for fixture JSON
- Construct valid `StudyRun`, `StagedCapsule`, `ObservationBundle` fixtures using the Zod schemas from axiom packages (or hand-crafted valid JSON matching the schemas)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-checks run test -- --reporter=verbose axiom-report`

**Completion criterion:** All test cases pass; coverage includes all 5 failure modes, dryRun, HTML structure, and HTML escaping.

**Human review:** no

---

### Step 6. Update AGENTS.md files

**Goal:** Document the new command and pipeline change in package-level AGENTS.md.

**Agent actions:**

- In `packages/os/site-kernel-checks/AGENTS.md`, add a row for `src/axiom-report.ts` to the "What lives here" table: `| src/axiom-report.ts | RFC-0633 runAxiomReport — reads Axiom evidence JSON (study-run.json, staged-capsule.json, observation-bundle.json, evidence-metadata.json) and writes self-contained HTML triage report to missions/{mission}/evidence/axiom/report.html. Pure renderAxiomReportHtml function with HTML escaping. Supports --dry-run (RFC-0601). Exit 0 on success regardless of finding severity (renderer, not gate). Failure modes: AXIOM-REPORT-01..05. |`
- In `packages/os/site-kernel-handoff/AGENTS.md`, update the `leitstand.dev-deploy` description to note the `axiom.report` auto-invocation: Add note that `leitstand.dev-deploy` auto-invokes `axiom.report` after `mission.check` (best-effort, non-blocking) per RFC-0633.

**Validation:**

- `git diff packages/os/site-kernel-checks/AGENTS.md packages/os/site-kernel-handoff/AGENTS.md` — both files modified

**Completion criterion:** Both AGENTS.md files reference the new command and pipeline integration.

**Human review:** no

---

### Step 7. Validate, review, fix, and stamp implemented

**Goal:** Run all validation, code review, fix findings, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0633` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-checks run build:check` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check` — must pass
- Run `pnpm --filter @warpgogol/site-kernel-checks run test -- axiom-report` — all tests pass
- Run `pnpm exec site-kernel run ecosystem.manifest.generate` if command surfaces changed (new `axiom.report` command added)
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`. Re-run `fo-review`. Maximum 3 iterations.
- **Check off acceptance criteria:** verify each criterion against implemented code. Mark `[x]` with inline `(evidence: <file:line>)` annotations.
- **Stamp implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0633 --implementation-commit <sha>`

**Validation:**

- `git status` — clean working tree
- `pnpm exec site-kernel run rfc.validate --id RFC-0633` — passes (V-25 reviewers, V-26 criteria checked, V-27 evidence annotations)
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All validation passes; acceptance criteria checked with evidence; RFC stamped as `implemented` via `rfc.implement.stamp`.

**Human review:** no — the `accepted → implemented` transition is automated via `rfc.implement.stamp`.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0633`
- `pnpm --filter @warpgogol/site-kernel-checks run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-checks run test -- axiom-report`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0633` in the subject line (RFC-0265 commit hygiene)
- `docs/rfcs/verification/rfc-0633.generated.json` — verification evidence (if acceptance probes declared — none in this RFC, so not required)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| CDN dependency (Tailwind/Mermaid) | Step 1: semantic HTML remains readable without styles; CDN scripts loaded only in browser |
| Evidence format drift | Step 1: import types from `@syrokomskyi/axiom-study` and `@syrokomskyi/axiom-capture` — TypeScript catches breaking changes at compile time |
| Pipeline coupling | Step 4: `axiom.report` invocation wrapped in try/catch, failures emit warning, non-blocking |
| Agent misinterpretation (renderer vs gate) | Step 6: AGENTS.md explicitly states "renderer, not gate"; Step 1: exit 0 regardless of finding severity |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49 or DNA-46, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0633 --reason "..." --invariant "DNA-N"` instead of working around it.
