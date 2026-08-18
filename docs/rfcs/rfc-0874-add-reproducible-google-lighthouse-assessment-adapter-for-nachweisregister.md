---
id: RFC-0874
title: "Add reproducible Google Lighthouse assessment adapter for Nachweisregister"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-18
updatedAt: 2026-08-18
enhancedAt: 2026-08-18
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - ADR-0054
  - RFC-0872
  - RFC-0873
  - RFC-0833
dependsOn:
  - RFC-0872
  - RFC-0873
satisfies: []
versionBump: minor
commands:
  proposed:
    - nachweis.measure.lighthouse
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "Five sequential Lighthouse LHRs are captured with a pinned workspace version"
  - "Numeric category projection uses median and retains all samples"
  - "Agentic Browsing pass counts are not converted into a fake 0-100 score"
  - "The adapter emits and ingests AssessmentBundleV1"
nonGoals:
  - "Does not use PageSpeed Insights field data"
  - "Does not make Lighthouse a deploy gate"
  - "Does not scrape Chrome DevTools UI"
---

# RFC-0874: Add reproducible Google Lighthouse assessment adapter for Nachweisregister

## Context

Warpgogol wants Lighthouse results to function as evidence, not as a screenshot badge.

Lighthouse contains valuable run metadata in the Lighthouse Result (LHR), but performance values can vary with execution conditions. A reproducible evidence procedure therefore must preserve all canonical runs and disclose aggregation.

## Problem

1. **No reproducible Lighthouse evidence procedure exists.** ADR-0054 established technical assessments as a first-class Nachweisregister evidence profile, and RFC-0873 added the generic `nachweis.assessment.ingest` command. But there is no adapter that runs Lighthouse with a fixed methodology, captures canonical LHR artifacts, and produces a valid `AssessmentBundleV1`. Without an adapter, Lighthouse results cannot enter the Nachweisregister as evidence.

2. **Manual screenshots are not canonical evidence.** The operator has a Lighthouse screenshot showing scores (Performance 91, Accessibility 100, Best Practices 96, SEO 100, Agentic Browsing 3/3). A screenshot is not reproducible, not machine-readable, and not hash-verifiable. It cannot serve as a canonical raw-result artifact.

3. **Lighthouse score variance requires multi-run aggregation.** Lighthouse performance scores vary between runs due to network timing, CPU scheduling, and runtime conditions. A single run is not representative. A reproducible procedure must run multiple times, preserve all samples, and disclose the aggregation method (median for numeric categories).

4. **Non-numeric categories must not be coerced.** Agentic Browsing is a pass-count category (3/3), not a 0-100 score. Forcing it into a numeric score would misrepresent the provider's result. The adapter must preserve provider-native result forms for non-numeric categories.

## Decision

Add:

```text
nachweis.measure.lighthouse
```

The command runs a fixed Warpgogol methodology (`WG-LH-01`), generates canonical LHR JSON artifacts, creates `AssessmentBundleV1`, then calls the generic assessment ingest.

## Dependency/version rule

Use a **workspace-pinned exact Lighthouse dependency**.

Forbidden: `npx lighthouse@latest`, `npx -y lighthouse`, unversioned global Lighthouse binary.

The actual accepted RFC MUST record the exact package and version resolved in the workspace at implementation time.

If Chrome/Chromium is also explicitly provisioned by the workspace, record its version. Otherwise record the actual LHR `userAgent` and environment metadata from the run.

## Architectural fit

- **DNA-59 (Evidence preservation):** Lighthouse LHR artifacts are stored in R2 via `nachweis.assessment.ingest` (RFC-0873). The adapter does not implement its own R2 upload, hashing, or Bordbuch append — it delegates entirely to the generic ingest command. This aligns with DNA-59's append-only archive principle.
- **DNA-53 (Semantic fingerprint governance):** Artifact hashing uses `byteHashFile` from `@warpgogol/werkstatt/fingerprint` (via RFC-0873 ingest). The adapter does not introduce ad hoc hashing.
- **DNA-67 (Pre-deploy Lighthouse parity gate, RFC-0833):** DNA-67 covers build-time Lighthouse validators (`lighthouse.validate`, `lighthouse.budget.check`) that catch issues before deployment. This RFC adds an operator-run measurement command that produces canonical evidence for the Nachweisregister. They are complementary: DNA-67 is a build-time gate; this command is an operator-run evidence producer. No overlap — build-time validation checks parity; this command produces reproducible observations for publication.
- **DNA-65 (RFC dependency tracking):** This RFC declares `dependsOn: [RFC-0872, RFC-0873]` because it cannot be implemented without the `technical-assessment` PBP kind (RFC-0872) and the generic assessment ingest (RFC-0873). Both are `implemented`.
- **Module placement:** `packages/werkstatt/src/nachweis/nachweis-lighthouse-measure.ts` — same module as existing nachweis commands. Registered in `nachweis.module.ts` alongside `nachweis.assessment.ingest`.
- **Compass sync:** `docs/verification-plan.xml` may need synchronization if the new command affects the verification surface. The command is not added to any pipeline (operator-invoked, not automatic).
- **AGENTS.md update:** `packages/werkstatt/AGENTS.md` may need a note about the Lighthouse measurement command and its entitlement gating pattern.

## CLI

```sh
pnpm exec werkstatt run nachweis.measure.lighthouse \
  --system warpgogol-com \
  --url https://warpgogol.com/ \
  --series-id warpgogol-lighthouse-home \
  --authorization-basis site-owner \
  --runs 5 \
  --methodology WG-LH-01@1.0 \
  --freshness-days 30
```

Optional: `--dry-run`, `--json`

### Flags

- `--system` required, target system ID
- `--url` required, production HTTPS URL to measure
- `--series-id` required, path-safe series identifier (e.g. `warpgogol-lighthouse-home`)
- `--authorization-basis` required, one of `site-owner | service-contract | explicit-operator`
- `--runs` optional, defaults to `5` (pilot fixed value for `WG-LH-01@1.0`)
- `--methodology` required, format `<id>@<version>` (e.g. `WG-LH-01@1.0`) — parsed into `methodology.id` and `methodology.version` in the bundle
- `--freshness-days` optional, defaults to `30` (pilot default)
- `--dry-run` optional, skip Lighthouse execution and ingest
- `--json` optional, output JSON result

### `--methodology` parsing

The `--methodology` flag uses the format `<id>@<version>`. The adapter parses it by splitting on the first `@` character:

- `WG-LH-01@1.0` → `methodology.id = "WG-LH-01"`, `methodology.version = "1.0"`
- Missing `@` or empty id/version is a validation error (`LIGHTHOUSE_METHODOLOGY_INVALID`).

### `--json` output shape

```json
{
  "command": "nachweis.measure.lighthouse",
  "status": "ok",
  "systemId": "warpgogol-com",
  "seriesId": "warpgogol-lighthouse-home",
  "observationId": "20260818T070000Z-<short-hash>",
  "lighthouseVersion": "12.x.x",
  "runCount": 5,
  "aggregation": "median",
  "ingest": {
    "verificationLevel": "N1",
    "artifactHashes": { "lhr-run-01": "<sha256>", "lhr-run-02": "<sha256>" },
    "alreadyIngested": false,
    "bordbuchEventId": "<id>"
  }
}
```

The `ingest` field wraps the `AssessmentIngestResult` from `nachweis.assessment.ingest`. On failure, `status` is `error` with a `code` field matching the failure mode table.

### Fixed pilot constraints

For `WG-LH-01@1.0`:

- target is production HTTPS URL;
- five runs;
- sequential, never parallel;
- standard default Lighthouse configuration from the pinned version unless this RFC's implementation records an explicit config file;
- no browser extensions;
- no authentication;
- no mutation of the target site;
- no "pick best run";
- all five successful LHR JSONs are canonical artifacts.

If the current Lighthouse environment cannot execute Agentic Browsing due Chrome/version requirements, the command must record the category as unavailable/unsupported for that run. It must not fabricate 0 or pass.

If Chrome/Chromium is not installed or cannot be launched, the command fails immediately with `LIGHTHOUSE_CHROME_NOT_FOUND` before any runs begin. If the target URL is unreachable, returns non-200, or times out, the Lighthouse process exits non-zero — this counts as a canonical run failure (`LIGHTHOUSE_CANONICAL_BATCH_INCOMPLETE`).

## Canonical run validity

A run is canonical-success only if:

- Lighthouse process exits successfully;
- LHR JSON parses;
- LHR has no fatal/runtime error that invalidates the run;
- requested/final URL metadata exists.

If any of the five required runs is invalid:

- the canonical batch fails;
- valid partial LHRs may be retained in a local failed-run directory for diagnosis;
- **do not** aggregate only the remaining "good" runs;
- no assessment observation is ingested.

Use error: `LIGHTHOUSE_CANONICAL_BATCH_INCOMPLETE`

## Captured LHR metadata

At minimum retain from each LHR where available:

- `lighthouseVersion`;
- `fetchTime`;
- `userAgent`;
- `requestedUrl`;
- `mainDocumentUrl` / final URL;
- `configSettings`;
- `categories`;
- runtime warnings/errors;
- audit data required to render/understand category results.

The raw LHR is canonical. A generated HTML report MAY be stored with `role: report`, `canonical: false`.

## Aggregation

### Numeric categories

For every category whose provider result is a conventional numeric score:

1. convert provider score to display 0-100 only according to Lighthouse's own score representation;
2. retain all five sample scores;
3. sort values;
4. use exact median;
5. store min and max.

Example:

```json
{
  "id": "performance",
  "providerLabel": "Performance",
  "score": 91,
  "samples": [90, 91, 91, 92, 93],
  "min": 90,
  "max": 93
}
```

The samples above are illustrative only.

### Non-numeric/pass-count categories

Do not force them into 0-100.

For Agentic Browsing, preserve provider-native pass-count/status information, e.g.:

```json
{
  "id": "agentic-browsing",
  "providerLabel": "Agentic Browsing",
  "numerator": 3,
  "denominator": 3,
  "status": "pass",
  "experimental": true
}
```

The actual parser MUST derive the shape from the pinned Lighthouse result/fixture, not from this example or the user screenshot.

### Unknown future categories

Preserve them using normalized IDs/provider labels whenever their result form can be mapped safely.

If an unknown result shape cannot be normalized without guessing:

- raw LHR remains available;
- fail the adapter with `LIGHTHOUSE_SCHEMA_UNSUPPORTED`;
- update parser via a new/amending RFC or compatible patch with fixture coverage.

Never silently omit a category.

## Assessment bundle mapping

```text
provider.id = google-chrome-lighthouse
provider.name = Google Lighthouse
tool.id = lighthouse
tool.name = Lighthouse
tool.version = exact LHR lighthouseVersion
execution.mode = operator-run
methodology.id = WG-LH-01
methodology.version = 1.0
methodology.runCount = 5
methodology.aggregation = median
freshness.maxAgeDays = 30 (pilot default)
```

`observedAt` for the batch MUST be deterministic from run metadata. Use the first canonical run `fetchTime` as batch start or define another explicit deterministic rule in code/tests; do not use `new Date()` after the runs merely to manufacture a timestamp.

## Artifact keys

Required:

```text
lhr-run-01.json
lhr-run-02.json
lhr-run-03.json
lhr-run-04.json
lhr-run-05.json
methodology.json
```

`methodology.json` records: methodology ID/version, exact Lighthouse version, command options/config, target URL, run count, aggregation rule, environment facts that affect interpretation.

It is `role: methodology`, non-canonical unless implementation intentionally makes the signed normalized bundle itself canonical; raw LHR files remain canonical source artifacts.

## Pilot bootstrap rule

The user-supplied screenshot currently shows:

```text
Performance       91
Accessibility    100
Best Practices    96
SEO              100
Agentic Browsing  3/3
```

These values MUST NOT be seeded into PBP content as the canonical observation.

After this RFC is implemented on the actual production site, run the adapter. Whatever the canonical five-run result produces becomes the publishable evidence.

## Public semantics

Suggested DE labels:

```text
Google Lighthouse
Messung mit Google Lighthouse
5 Laeufe · Median bei numerischen Kategorien
Gemessen am <observedAt>
```

Required limitation:

```text
Punktuelle technische Messung. Keine Zertifizierung und keine Garantie zukuenftiger Werte.
```

If Agentic Browsing is shown:

```text
Experimentelle Lighthouse-Kategorie; als Pruefstatus/Passzahl, nicht als 0-100-Benchmark dargestellt.
```

## Tests

Fixtures:

- complete LHR numeric categories;
- Agentic Browsing pass-count fixture from the pinned version;
- redirect target;
- runtime error;
- unknown category;
- malformed JSON;
- five-run aggregation with even/odd safeguards (method fixed at 5);
- no cherry-picking on one failed run.

Network/browser integration tests MUST be separated from deterministic unit tests. Unit tests MUST NOT depend on live `warpgogol.com`.

## Failure modes

| Code | Condition |
| --- | --- |
| `LIGHTHOUSE_CHROME_NOT_FOUND` | Chrome/Chromium not installed or cannot be launched |
| `LIGHTHOUSE_CANONICAL_BATCH_INCOMPLETE` | one or more of the five required runs failed |
| `LIGHTHOUSE_SCHEMA_UNSUPPORTED` | unknown category result shape cannot be normalized |
| `LIGHTHOUSE_METHODOLOGY_INVALID` | `--methodology` flag missing `@` or has empty id/version |
| `LIGHTHOUSE_URL_INVALID` | `--url` is not a valid HTTPS URL |
| `LIGHTHOUSE_DEPENDENCY_UNPINNED` | Lighthouse package not found in workspace dependencies |
| `ASSESSMENT_BUNDLE_INVALID` | bundle validation failed in `nachweis.assessment.ingest` |
| `ASSESSMENT_R2_UPLOAD_FAILED` | R2 upload failed during ingest (from RFC-0873) |
| `ASSESSMENT_PBP_WRITE_FAILED` | PBP persistence failed during ingest (from RFC-0873) |
| `ASSESSMENT_BORDBUCH_WRITE_FAILED` | Bordbuch append failed during ingest (from RFC-0873) |

## Design

### TypeScript contracts

```ts
// packages/werkstatt/src/nachweis/nachweis-lighthouse-measure.ts

export interface LighthouseRunResult {
  runIndex: number;
  lhrPath: string;
  lighthouseVersion: string;
  fetchTime: string;
  userAgent: string;
  requestedUrl: string;
  finalUrl: string;
  categories: LighthouseCategoryProjection[];
}

export interface LighthouseCategoryProjection {
  id: string;
  providerLabel: string;
  score?: number;
  numerator?: number;
  denominator?: number;
  status?: "pass" | "fail" | "not-checked";
  level?: string;
  experimental?: boolean;
  min?: number;
  max?: number;
  samples?: number[];
}

export interface LighthouseMeasureOptions {
  systemId: string;
  url: string;
  seriesId: string;
  authorizationBasis: "site-owner" | "service-contract" | "explicit-operator";
  runs: number;
  methodologyId: string;
  methodologyVersion: string;
  freshnessDays: number;
  dryRun: boolean;
}

export interface LighthouseMeasureResult {
  command: "nachweis.measure.lighthouse";
  status: "ok" | "error";
  systemId: string;
  seriesId: string;
  observationId: string;
  lighthouseVersion: string;
  runCount: number;
  aggregation: "median";
  ingest?: AssessmentIngestResult;
  code?: string;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/nachweis/nachweis-lighthouse-measure.ts` | Command handler — runs Lighthouse, parses LHR, builds bundle, calls ingest |
| `packages/werkstatt/src/nachweis/nachweis.module.ts` | Module registration (add command) |
| `packages/werkstatt/src/nachweis/index.ts` | Barrel exports |
| `packages/werkstatt/src/tests-handoff/nachweis-lighthouse-measure.test.ts` | Unit tests with LHR fixtures |
| `packages/werkstatt/package.json` | Pinned `lighthouse` dependency |
| `<temp-dir>/lhr-run-NN.json` | Canonical LHR artifacts (before ingest) |
| `<temp-dir>/methodology.json` | Methodology metadata artifact |
| R2 bucket `nachweis` | Via `nachweis.assessment.ingest` — `{systemId}/private/assessments/{seriesId}/{observationId}/{artifactKey}.{ext}` |
| `<cache>/src/content/business-profile/{lang}/trust/evidence/{slug}.md` | PBP evidence-source entity (via ingest) |

### Performance

Five sequential Lighthouse runs against a production URL take approximately 2.5–5 minutes (30–60 seconds per run). The command is long-running and operator-invoked — it is not part of any build pipeline. The 6-minute command execution timeout (§Command execution timeout discipline) may be exceeded; operators should be aware of this when running interactively.

## Rollout

- **Default behavior:** The command is registered but skips execution if `nachweis` entitlement is not resolved (same as all existing nachweis commands). The `lighthouse` dependency is added to `packages/werkstatt/package.json` as a pinned exact version.
- **warpgogol-com pilot:** `entitlementsOverride: ["nachweis"]` in `system.md`. R2 bucket `nachweis` already exists (RFC-0707). R2 credentials `R2_NACHWEIS_*` already configured (RFC-0713).
- **Pipeline integration:** None — the command is operator-invoked, not added to `build.prepare` or `build.check`.
- **Existing apps:** No migration needed — the command is additive. Sites without `nachweis` entitlement are unaffected.
- **Lighthouse dependency:** Pinned in `packages/werkstatt/package.json` at implementation time. The exact version is recorded in the RFC's `## Dependency/version rule` section upon acceptance.

## Alternatives considered

1. **Manual Lighthouse CLI + hand-crafted bundle.** Rejected — an operator running `npx lighthouse@latest` manually and hand-crafting a JSON bundle is not reproducible. The pinned dependency, fixed methodology, and five-run protocol are the reproducibility guarantees. A manual procedure cannot enforce these.

2. **PageSpeed Insights API.** Rejected — PageSpeed Insights returns field data (CrUX) blended with lab data, not canonical Lighthouse LHR artifacts. The RFC's `nonGoals` explicitly exclude field data. Field data is not reproducible (it aggregates over a 28-day window and cannot be re-run).

3. **Extend `nachweis.assessment.ingest` with a `--lighthouse` flag.** Rejected — Lighthouse execution (running an external tool, managing Chrome, parsing LHR) is a fundamentally different concern from bundle ingestion. RFC-0873 explicitly envisioned provider adapters as separate commands that produce bundles and call the generic ingest. Combining them would create a bifurcated code path inside one command, violating the single-responsibility principle.

## Risks

1. **Lighthouse version drift.** Lighthouse releases can change category schemas, audit IDs, or result structures. Mitigation: the `lighthouse` dependency is pinned to an exact version in `packages/werkstatt/package.json`. Upgrading requires a deliberate dependency update and re-running fixtures.

2. **Chrome/Chromium availability.** Lighthouse requires Chrome/Chromium. If the browser is not installed, the command fails with `LIGHTHOUSE_CHROME_NOT_FOUND` before any runs begin. Mitigation: document the Chrome requirement in `packages/werkstatt/AGENTS.md` and verify availability at command start.

3. **Lighthouse performance category variance.** Performance scores vary between runs due to network timing, CPU scheduling, and runtime conditions. Mitigation: five-run median with all samples preserved. The variance is disclosed, not hidden.

4. **Agentic Browsing category availability.** Agentic Browsing is an experimental Lighthouse category that may not be available in all Chrome/Lighthouse versions. Mitigation: the adapter records the category as unavailable/unsupported for that run rather than fabricating a score. The `experimental: true` flag is preserved in the bundle.

5. **Agent misinterpretation.** Agents may attempt to hard-code the screenshot values (Performance 91, Accessibility 100, etc.) into PBP content instead of running the adapter. Mitigation: `## Implementation notes for agents` explicitly forbids this; the pilot bootstrap rule section states the screenshot values MUST NOT be seeded.

6. **Long-running command timeout.** Five sequential Lighthouse runs may exceed the 6-minute command execution timeout. Mitigation: the command is operator-invoked, not part of automated pipelines. Operators should run it with awareness of the expected duration.

7. **Security/privacy — LHR content.** LHR output may contain URLs, headers, or other metadata from the target site. The adapter does not redact LHR content (it is canonical raw data). Operators are responsible for ensuring the target URL is safe to measure publicly. No credentials or PII are added by the adapter itself.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- This RFC depends on RFC-0872 (`technical-assessment` PBP kind) and RFC-0873 (`nachweis.assessment.ingest`) — both must be `implemented` before this RFC. `dependsOn: [RFC-0872, RFC-0873]` is declared in frontmatter.
- The `lighthouse` dependency MUST be pinned to an exact version in `packages/werkstatt/package.json`. Forbidden: `npx lighthouse@latest`, `npx -y lighthouse`, unversioned global Lighthouse binary.
- The adapter MUST NOT duplicate R2 path construction, SHA-256 hashing, PBP persistence, or Bordbuch append logic. It produces an `AssessmentBundleV1` and calls `nachweis.assessment.ingest` (or its core function directly).
- The adapter MUST NOT sign, approve, timestamp, or publish. It ends at N1 capture (same as `nachweis.assessment.ingest`).
- Screenshot values (Performance 91, Accessibility 100, Best Practices 96, SEO 100, Agentic Browsing 3/3) MUST NOT be hard-coded into PBP content or test fixtures as expected production values. Test fixtures MUST use synthetic LHR data with known expected aggregation results.
- `observedAt` MUST be deterministic from run metadata (first canonical run `fetchTime`), not from `new Date()` after the runs.
- The adapter is entitlement-gated: it returns `makeSkipResult` when `nachweis` entitlement is not resolved, same as all existing nachweis commands.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0874 --reason "..." --invariant "DNA-N"` instead of working around it.

## Acceptance criteria

- [ ] Exact Lighthouse dependency is pinned in `packages/werkstatt/package.json`.
- [ ] Command runs five sequential canonical runs by default.
- [ ] Raw LHR JSON for every successful canonical run is preserved as canonical artifact.
- [ ] Any canonical run failure prevents ingest (`LIGHTHOUSE_CANONICAL_BATCH_INCOMPLETE`).
- [ ] Median/min/max/samples are correct against a deterministic test fixture with known expected values.
- [ ] Agentic Browsing is preserved as numerator/denominator/status, not converted into a fake 0-100 score.
- [ ] Tool and browser/run metadata (`lighthouseVersion`, `fetchTime`, `userAgent`, `requestedUrl`, `finalUrl`, `configSettings`) are captured per the "Captured LHR metadata" section.
- [ ] Adapter emits valid `AssessmentBundleV1` accepted by `nachweis.assessment.ingest`.
- [ ] Generic ingest handles hashes/R2/PBP/Bordbuch (adapter does not duplicate these).
- [ ] Adapter never signs/approves/publishes (ends at N1 capture).
- [ ] User screenshot values are not hard-coded in PBP content or test fixtures.
- [ ] `--methodology` flag parsing splits `<id>@<version>` correctly.
- [ ] `--json` output shape matches the documented structure.
- [ ] Chrome/Chromium not installed fails with `LIGHTHOUSE_CHROME_NOT_FOUND`.
- [ ] Command is entitlement-gated (skips when `nachweis` entitlement is not resolved).
