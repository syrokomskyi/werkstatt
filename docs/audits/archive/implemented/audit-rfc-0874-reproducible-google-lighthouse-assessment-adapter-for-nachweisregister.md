---
rfcId: RFC-0874
auditId: AUDIT-RFC-0874-01
date: 2026-08-18
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0874

## Verdict: Needs revision

The RFC has a solid core — reproducible Lighthouse evidence with canonical LHR preservation, median aggregation, and `AssessmentBundleV1` handoff to RFC-0873 ingest. However, it is missing 7 required V-13 sections (Problem, Architectural fit, Design, Rollout, Alternatives considered, Risks, Implementation notes for agents), declares the wrong `packagesImpacted` entry, and omits `dependsOn` for its hard prerequisites. The structural gaps must be filled before the pipeline can proceed to enhance.

## Mechanical validation (rfc.validate)

**Pass with 7 V-13 warnings** (all `severity: warning`):

- Missing `## Problem`
- Missing `## Architectural fit`
- Missing `## Design`
- Missing `## Rollout`
- Missing `## Alternatives considered`
- Missing `## Risks`
- Missing `## Implementation notes for agents`

No errors. The RFC passes mechanical validation but does not satisfy the required-sections convention for `command` kind RFCs.

## Axis A — Structural completeness

1. **Missing `## Problem` section.** The RFC jumps from `## Context` to `## Decision` without articulating the problem. The problem is inferable (no reproducible Lighthouse evidence procedure exists), but V-13 requires an explicit section. RFC-0873 has a 4-item Problem section; this RFC should have at least 2-3 items explaining why the current state is insufficient (e.g. "no adapter exists to run Lighthouse and produce `AssessmentBundleV1`", "manual screenshots are not canonical evidence", "Lighthouse score variance requires multi-run aggregation").

2. **Missing `## Architectural fit` section.** The RFC should reference DNA-59 (Evidence preservation — LHR artifacts stored in R2), DNA-53 (Semantic fingerprint governance — artifact hashing via `byteHashFile`), and DNA-67 (Pre-deploy Lighthouse parity gate — relationship between build-time Lighthouse checks and this operator-run measurement command). RFC-0873 has a detailed Architectural fit section; this RFC should follow the same pattern.

3. **Missing `## Design` section.** No TypeScript contracts, no file system responsibilities table, no `--json` output shape. The RFC references `AssessmentBundleV1` from RFC-0873 but does not show the adapter's own types (e.g. `LighthouseRunResult`, `LighthouseCategoryProjection`, `LighthouseAdapterOptions`). RFC-0873 has a full Design section with TypeScript contracts and a file system responsibilities table.

4. **Missing `## Rollout` section.** The RFC does not describe default behavior, pilot integration, or pipeline placement. It should state: operator-invoked (not in any pipeline), entitlement-gated (same as `nachweis.assessment.ingest`), warpgogol-com pilot, no migration needed (additive command).

5. **Missing `## Alternatives considered` section.** At least one real alternative with a rejection reason is required. Candidates: (a) manual Lighthouse CLI + hand-crafted bundle — rejected because it is not reproducible; (b) PageSpeed Insights API — rejected because it is a non-goal (field data, not lab data); (c) extend `nachweis.assessment.ingest` with a `--lighthouse` flag — rejected because Lighthouse execution is a distinct concern from bundle ingestion.

6. **Missing `## Risks` section.** The RFC should address: Lighthouse version drift (pinned dependency mitigates), Chrome/Chromium availability (what happens when the browser is not installed), Lighthouse performance category variance (5-run median mitigates), Agentic Browsing category availability across Chrome versions, and agent misinterpretation risk (agents must not hard-code screenshot values).

7. **Missing `## Implementation notes for agents` section.** The RFC should include explicit behavioral rules: agents MAY implement only when status is `accepted`; the adapter MUST NOT duplicate R2/hashing/PBP/Bordbuch logic (delegate to `nachweis.assessment.ingest`); the Lighthouse dependency MUST be pinned in `packages/werkstatt/package.json`; the adapter MUST NOT sign/approve/publish; screenshot values MUST NOT be hard-coded.

8. **No `--json` output shape documented.** The CLI section shows `--json` as optional but does not document the JSON result structure. RFC-0873 has a full `## Result` section with JSON example.

9. **No failure modes table.** Error codes (`LIGHTHOUSE_CANONICAL_BATCH_INCOMPLETE`, `LIGHTHOUSE_SCHEMA_UNSUPPORTED`) are mentioned inline but not structured into a table. RFC-0873 has a structured `## Failure modes` table.

10. **Acceptance criteria are checkable but some are vague.** "Median/min/max/samples are correct" — correct compared to what? Should reference a deterministic test fixture with known expected values. "Tool and browser/run metadata are captured" — which metadata fields? Should reference the "Captured LHR metadata" section explicitly.

## Axis B — DNA alignment

1. **`satisfies: []` is empty.** For a `command` kind RFC, `--satisfies` is not required (RFC-0331). However, the RFC body should still reference relevant DNA invariants in an `## Architectural fit` section. Currently none are mentioned.

2. **DNA-59 (Evidence preservation) is not referenced.** Lighthouse LHR artifacts are stored in R2 via `nachweis.assessment.ingest`. The RFC should state this alignment.

3. **DNA-53 (Semantic fingerprint governance) is not referenced.** Artifact hashing uses `byteHashFile` from `@warpgogol/werkstatt/fingerprint` (via RFC-0873 ingest). The RFC should state this.

4. **DNA-67 (Pre-deploy Lighthouse parity gate) is not referenced.** This DNA invariant (established by RFC-0833) is directly related — it covers build-time Lighthouse checks. This RFC adds an operator-run Lighthouse measurement command. The RFC should clarify the relationship: this command produces evidence for the Nachweisregister, while DNA-67 covers build-time validation. They are complementary, not overlapping.

5. **`related: [ADR-0054, RFC-0872, RFC-0873]` is correct and relevant.** ADR-0054 established technical assessments as a first-class evidence profile; RFC-0872 added the `technical-assessment` PBP contract; RFC-0873 added the generic ingest. All three are correctly related.

## Axis C — Ecosystem fit

1. **`packagesImpacted` is incorrect.** The RFC lists `["@warpgogol/werkstatt-site"]` but the command `nachweis.measure.lighthouse` would be registered in `packages/werkstatt/src/nachweis/nachweis.module.ts` (in `@warpgogol/werkstatt`, not `werkstatt-site`). The handler file would live at `packages/werkstatt/src/nachweis/nachweis-lighthouse-measure.ts`. RFC-0873 correctly lists `@warpgogol/werkstatt` as impacted. This RFC should list `@warpgogol/werkstatt` at minimum. `@warpgogol/werkstatt-site` is not impacted because the PBP `technical-assessment` kind and `NachweisTechnicalAssessmentV1` interface already exist (RFC-0872, implemented).

2. **No pipeline placement stated.** The RFC should explicitly state that the command is operator-invoked, not added to `build.prepare` or `build.check` (same as `nachweis.assessment.ingest`).

3. **No Compass sync mentioned.** If the RFC adds a new command, `docs/verification-plan.xml` may need synchronization. The RFC should identify which `docs/*.xml` files need updates.

4. **No AGENTS.md update mentioned.** `packages/werkstatt/AGENTS.md` may need a note about the new Lighthouse measurement command and its entitlement gating pattern.

5. **Command lifecycle is internally consistent.** `commands.proposed: ["nachweis.measure.lighthouse"]` is correct for a draft RFC. Upon implementation, it would move to `commands.added`.

6. **Missing `dependsOn` field.** DNA-65 (RFC-0795) established the `dependsOn` frontmatter field for direct implementation dependencies. This RFC cannot be implemented without RFC-0872 (technical-assessment PBP contract) and RFC-0873 (generic assessment ingest). The `related` field lists them, but `dependsOn: [RFC-0872, RFC-0873]` should be declared explicitly. `rfc.implement.stamp` enforces RFC-IMP-07: a hard block when any `dependsOn` entry is not `implemented`. Both RFC-0872 and RFC-0873 are `implemented`, so this is a safe declaration.

## Axis D — Forward-only compliance

No issues. The RFC does not propose compatibility shims, dual-paths, or backward compatibility layers. It builds directly on RFC-0873's `AssessmentBundleV1` and calls the generic ingest. The "Pilot bootstrap rule" section explicitly forbids seeding screenshot values into PBP content — this is forward-only discipline. No legacy code paths are maintained.

## Axis E — Agent-facing policy

1. **No self-authorizing language found.** The RFC does not contain "may proceed while draft" or "implementation can start before acceptance" language.

2. **No `NEEDS CLARIFICATION` markers.** The RFC text is clean of unresolved markers.

3. **Missing `## Implementation notes for agents` section (V-13).** The RFC should include explicit rules: agents MAY implement only when status is `accepted`; the adapter MUST NOT duplicate R2/hashing/PBP/Bordbuch logic; the Lighthouse dependency MUST be pinned; screenshot values MUST NOT be hard-coded; the adapter MUST NOT sign/approve/publish.

4. **"The actual accepted RFC MUST record the exact package and version"** (line 69) — this is a good forward-only constraint that prevents `npx lighthouse@latest` drift.

5. **Storage policy:** No cookies or client-side persistence introduced. The command is server-side only.

## Axis F — Pragmatism

1. **Minimal command surface:** `nachweis.measure.lighthouse` earns its existence. It cannot be a flag on `nachweis.assessment.ingest` because it runs an external tool (Lighthouse), which is a fundamentally different concern from bundle ingestion. RFC-0873 explicitly envisioned provider adapters as separate commands.

2. **Lean contracts:** The RFC does not introduce speculative TypeScript types. It reuses `AssessmentBundleV1` from RFC-0873. The adapter-specific types (LHR parser, category projection) are not yet defined — they belong in the `## Design` section.

3. **Existing patterns:** The RFC correctly builds on RFC-0873's generic ingest. The adapter pattern (produce bundle → call ingest) is exactly what RFC-0873 envisioned.

4. **Scope discipline:** `appsImpacted: ["warpgogol-com"]` is correct for the pilot. `packagesImpacted: ["@warpgogol/werkstatt-site"]` is incorrect (see Axis C finding 1). `nonGoals` are explicit and meaningful: no PageSpeed Insights field data, no deploy gate, no Chrome DevTools UI scraping.

## Axis G — Blind spots

1. **Performance cost not documented.** Five sequential Lighthouse runs against a production URL will take 2.5–5 minutes (30–60 seconds per run). The RFC should document this expected duration and note that the command is long-running.

2. **Chrome/Chromium availability not addressed.** The RFC mentions "If the current Lighthouse environment cannot execute Agentic Browsing due Chrome/version requirements" (line 102) but does not specify what happens if Chrome/Chromium is not installed at all. The command should fail with a clear error code (e.g. `LIGHTHOUSE_CHROME_NOT_FOUND`).

3. **Target URL reachability not addressed.** What happens if the target URL is unreachable, returns non-200, or times out? The RFC should specify that this counts as a canonical run failure (Lighthouse process exits non-zero → `LIGHTHOUSE_CANONICAL_BATCH_INCOMPLETE`).

4. **Concurrent execution not addressed.** Two operators running `nachweis.measure.lighthouse` simultaneously against the same URL would produce independent observations (different `observationId`). The RFC should confirm this is safe and expected.

5. **Lighthouse dependency location not specified.** The RFC says "workspace-pinned exact Lighthouse dependency" but does not specify which `package.json` to add it to. Since the adapter lives in `@warpgogol/werkstatt`, the `lighthouse` package should be added to `packages/werkstatt/package.json`. This should be stated explicitly.

6. **`--methodology` flag parsing not specified.** The CLI shows `--methodology WG-LH-01@1.0` but `AssessmentBundleV1.methodology` has separate `id` and `version` fields. The RFC should specify how `WG-LH-01@1.0` is parsed into `id: "WG-LH-01"` and `version: "1.0"`.

7. **Security/privacy:** The RFC mentions "no authentication" and "no mutation of the target site" but does not address whether LHR output could contain sensitive information (e.g. cookies, headers, internal URLs in audit data). The RFC should state that the adapter does not redact LHR content (it is canonical raw data) and that operators are responsible for ensuring the target URL is safe to measure publicly.

## Questions for the author

1. Which `package.json` should the `lighthouse` dependency be pinned in, and what is the exact version string? The RFC says "workspace-pinned" but does not specify the location or version. This must be resolved at implementation time per the RFC's own rule (line 69), but the accepted RFC should record it.

2. What is the exact `--json` output shape? The RFC shows `--json` as optional but does not document the result structure. Should it return the `AssessmentIngestResult` from `nachweis.assessment.ingest` directly, or a wrapper with Lighthouse-specific metadata (run count, LHR versions, aggregation details)?

3. How does this command relate to DNA-67 (Pre-deploy Lighthouse parity gate, RFC-0833)? DNA-67 covers build-time Lighthouse checks; this RFC adds an operator-run measurement command. Are they complementary (build-time validation vs. operator-run evidence), or is there overlap that needs to be reconciled?
