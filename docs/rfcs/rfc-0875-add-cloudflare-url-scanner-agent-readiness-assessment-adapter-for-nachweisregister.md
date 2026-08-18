---
id: RFC-0875
title: "Add Cloudflare URL Scanner Agent Readiness assessment adapter for Nachweisregister"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
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
  - RFC-0713
satisfies: []
versionBump: minor
commands:
  proposed:
    - nachweis.measure.cloudflare-agent-readiness
  added:
    - nachweis.measure.cloudflare-agent-readiness
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "Adapter uses Cloudflare URL Scanner API with agentReadiness enabled"
  - "Scans are Unlisted by default"
  - "Raw submission and final result JSON are retained"
  - "Provider schema drift fails safely without guessed field mappings"
nonGoals:
  - "Does not scrape isitagentready.com HTML"
  - "Does not expose Cloudflare API tokens"
  - "Does not turn provider score into a certification claim"
  - "Does not add env vars to .env.example for services or sites — env vars are engine-scoped (DNA-40)"
---

# RFC-0875: Add Cloudflare URL Scanner Agent Readiness assessment adapter for Nachweisregister

## Context

Cloudflare exposes Agent Readiness through its URL Scanner and documents a programmatic API. This is preferable to automating/scraping the public `isitagentready.com` UI.

The provider's score model is evolving, so the integration must preserve raw results and use explicit parser fixtures rather than assuming a permanently fixed set of categories.

## Problem

1. **No Cloudflare Agent Readiness adapter exists.** The generic `nachweis.assessment.ingest` (RFC-0873) and the Lighthouse adapter (RFC-0874) are implemented, but there is no adapter for Cloudflare URL Scanner Agent Readiness — the second technical assessment provider identified in ADR-0054.

2. **No canonical API integration.** Without a programmatic adapter, the only way to capture Agent Readiness data would be scraping the `isitagentready.com` UI, which is brittle, undocumented, and violates the nonGoals of this RFC.

3. **Provider schema evolution risk.** Cloudflare's Agent Readiness score model is new and evolving. The adapter must preserve raw results and use fixture-backed parsers to handle schema drift safely, rather than hard-coding field paths.

## Decision

Add:

```text
nachweis.measure.cloudflare-agent-readiness
```

The command:

1. submits an **Unlisted** URL Scanner scan with Agent Readiness enabled;
2. polls for completion with bounded timing;
3. stores the submission response and final raw result;
4. parses Agent Readiness using a versioned, fixture-backed parser;
5. emits `AssessmentBundleV1`;
6. invokes generic `nachweis.assessment.ingest`;
7. stops at N1.

## Architectural fit

- **ADR-0054** — establishes technical assessments as a first-class Nachweisregister evidence profile. This RFC implements the second provider adapter (Cloudflare) after RFC-0874 (Lighthouse).
- **RFC-0873** — defines `nachweis.assessment.ingest` and `AssessmentBundleV1`. This RFC reuses both without modification.
- **RFC-0874** — establishes the provider-adapter pattern (submit → poll → parse → build bundle → delegate to ingest). This RFC follows the same pattern.
- **RFC-0713** — isolates R2 credentials per bucket. Raw scanner results are stored in the existing nachweis R2 bucket via `nachweis.assessment.ingest`; no new R2 bucket is needed.
- **DNA-59** — evidence preservation in R2. Raw scanner results are private R2 artifacts stored immutably under observation-specific paths.
- **DNA-40** — env-example contract. The new env vars must be documented in the root `.env.example` with `# How to obtain:` instructions.

## Design

The adapter follows the same delegation pattern as RFC-0874 (Lighthouse):

1. Submit a scan to the Cloudflare URL Scanner API with `agentReadiness: true` and `visibility: Unlisted`.
2. Poll the result endpoint at 15-second intervals until completion or 5-minute timeout.
3. Save the submission response and final result as canonical artifacts.
4. Parse Agent Readiness dimensions using a fixture-backed parser with explicit field paths.
5. Build an `AssessmentBundleV1` with `execution.mode = provider-run`.
6. Delegate to `nachweis.assessment.ingest` for R2 upload, PBP write, and Bordbuch append.
7. Stop at N1 capture — no signing, approval, or publication.

The handler lives in `packages/werkstatt/src/nachweis/nachweis-cloudflare-agent-readiness-measure.ts`, following the same package boundary as `nachweis-lighthouse-measure.ts`.

## CLI

```sh
pnpm exec werkstatt run nachweis.measure.cloudflare-agent-readiness \
  --system warpgogol-com \
  --url https://warpgogol.com/

pnpm exec werkstatt run nachweis.measure.cloudflare-agent-readiness \
  --system warpgogol-com \
  --url https://warpgogol.com/ \
  --series-id cloudflare-agent-readiness-pilot \
  --methodology CF-AR-01@1.0 \
  --freshness-days 30 \
  --dry-run \
  --json
```

Flags:

- `--system` required, target system ID
- `--url` required, target HTTPS URL to scan
- `--series-id` optional, assessment series ID (default: `cloudflare-agent-readiness-pilot`)
- `--authorization-basis` optional, `site-owner` (default) | `service-contract` | `explicit-operator`
- `--methodology` optional, `<id>@<version>` format (default: `CF-AR-01@1.0`)
- `--freshness-days` optional, max age in days (default: 30)
- `--dry-run` optional, skip API call and ingest — return dry-run result
- `--json` optional, output JSON result

Scope: `workspace`. Manually invoked — not a pipeline step.

## TypeScript contracts

```ts
interface CloudflareAgentReadinessMeasureResult {
  command: "nachweis.measure.cloudflare-agent-readiness";
  status: "ok" | "error" | "skip";
  systemId: string;
  seriesId: string;
  observationId: string;
  scanId: string;
  ingest?: AssessmentIngestResult;
  code?: string;
}
```

The adapter reuses `AssessmentBundleV1`, `AssessmentBundleArtifact`, and `AssessmentIngestResult` from `nachweis-io.ts` (RFC-0873). No new schema types are introduced.

## File system responsibilities

| Path | Responsibility |
| --- | --- |
| `packages/werkstatt/src/nachweis/nachweis-cloudflare-agent-readiness-measure.ts` | New handler — submit, poll, parse, build bundle, delegate to ingest |
| `packages/werkstatt/src/nachweis/nachweis.module.ts` | Register new command in kernel module |
| `packages/werkstatt/src/nachweis/index.ts` | Export new handler and types |
| `packages/werkstatt/src/tests-handoff/nachweis-cloudflare-agent-readiness-measure.test.ts` | Unit tests with fixtures and mocked HTTP |
| `packages/werkstatt/src/tests-handoff/fixtures/cloudflare-agent-readiness/` | Sanitized fixture files for parser tests |
| `.env.example` (root) | Document `CLOUDFLARE_URL_SCANNER_ACCOUNT_ID` and `CLOUDFLARE_URL_SCANNER_API_TOKEN` |
| `docs/COMMANDS.md` | Regenerated via `command.manifest.generate` |

## Credentials

Use dedicated least-privilege environment variables:

```text
CLOUDFLARE_URL_SCANNER_ACCOUNT_ID
CLOUDFLARE_URL_SCANNER_API_TOKEN
```

The token must have only the permissions needed for URL Scanner according to current Cloudflare documentation.

Never reuse the R2 Nachweis credentials for Cloudflare API scanning.

Never write these values into: logs, assessment bundle, PBP, Bordbuch, raw artifact after sanitization, generated site output.

## API submission

The adapter uses the current official endpoint resolved from Cloudflare documentation:

```text
POST /client/v4/accounts/{account_id}/urlscanner/v2/scan
```

Request concept:

```json
{
  "url": "https://warpgogol.com/",
  "visibility": "Unlisted",
  "options": {
    "agentReadiness": true
  }
}
```

The implementation MUST verify the exact currently documented request schema before acceptance. If Cloudflare changes the field casing/shape, follow the official current contract and update fixtures/RFC implementation notes rather than forcing this illustrative body.

`Unlisted` is required by default so evidence capture does not automatically create a publicly searchable scan before Warpgogol's own publication gate.

## Polling

Cloudflare documents scan completion as asynchronous. The submission response returns a `uuid` (scan ID). Poll the result endpoint:

```text
GET /client/v4/accounts/{account_id}/urlscanner/v2/result/{scan_id}
```

HTTP status codes:

- `404` — scan still in progress; continue polling
- `200` — scan complete; parse the response body
- other — transient or terminal error

Response body fields:

- `task.status` — `Queued`, `InProgress`, or `Finished`
- `task.success` — boolean indicating success/failure when `task.status` is `Finished`

Use:

```text
poll interval: 15 seconds
maximum elapsed time: 5 minutes
```

These constants MUST be named/configured for tests.

Behavior:

- HTTP 404 or `task.status` is `Queued`/`InProgress`: continue polling;
- HTTP 200 and `task.success === true`: parse;
- HTTP 200 and `task.success === false`: terminal provider failure;
- max elapsed time: `CLOUDFLARE_SCAN_TIMEOUT`;
- no infinite retry loop.

No exponential retry is needed for the normal "still processing" state. Transient HTTP errors may use the repository's standard bounded retry helper if one exists; do not invent a competing retry framework.

## Canonical artifacts

Required:

```text
cloudflare-submission.json
cloudflare-result.json
provider-parser-metadata.json
```

`cloudflare-result.json` is canonical `raw-result`.

Before hashing/storing, sanitize only secrets injected by the caller if any. The default adapter SHOULD NOT send custom Authorization headers to the scanned target, so the ordinary public Warpgogol scan should need no such redaction.

Do not transform away unknown provider fields in the raw result.

## Parser rule: no guessing

The implementing agent MUST first obtain a real completed API result in an operator/integration environment or use an official full fixture if available.

Then:

1. save a sanitized fixture under tests;
2. identify the exact Agent Readiness property paths;
3. implement a parser against those paths;
4. lock behavior with tests.

If the raw schema does not match a supported parser: `ASSESSMENT_SCHEMA_UNSUPPORTED`

The adapter MUST preserve diagnostic metadata but MUST NOT invent paths based on field names heuristically.

## Normalization

Map all provider dimensions that are present.

Do **not** hard-code that there are exactly four, five or six dimensions.

Represent:

- provider-native 0-100 scores as `score`;
- pass-count checks as `numerator/denominator` when available;
- levels as `level`;
- `not checked` as `status: not-checked`;
- unscored dimensions without a numeric score.

Commerce or another unscored/not-checked dimension MUST NOT be treated as score 0 and MUST NOT reduce a provider overall score unless the provider itself does so.

## Assessment bundle mapping

```text
provider.id = cloudflare
provider.name = Cloudflare
tool.id = cloudflare-url-scanner-agent-readiness
tool.name = Cloudflare URL Scanner -- Agent Readiness
tool.version = provider/API version if available
execution.mode = provider-run
methodology.id = CF-AR-01
methodology.version = 1.0
methodology.runCount = 1
methodology.aggregation = provider
freshness.maxAgeDays = 30 (pilot default)
```

`observedAt` MUST come from provider result/task metadata when available. Do not substitute local current time if the provider supplies a scan timestamp.

`providerReportUrl` is optional and may be included only if the URL is intentionally shareable and does not expose credentials/private data.

## Pilot bootstrap rule

The supplied screenshot currently displays:

```text
Overall: 100
Level 5: Agent-Native
Discoverability: 100 (4/4)
Content: 100 (1/1)
Bot Access Control: 100 (2/2)
API/Auth/MCP & Skill Discovery: 100 (7/7)
Commerce: Not checked
```

Do not hard-code these values.

The canonical API scan performed after implementation is authoritative even if its categories or values differ.

## Public semantics

Suggested DE copy:

```text
Cloudflare Agent Readiness
Test durch Cloudflare
Gemessen am <observedAt>
```

Required limitation:

```text
Punktueller externer Test. Keine Zertifizierung, keine Empfehlung durch Cloudflare und keine Garantie zukuenftiger Werte.
```

Do not display a Cloudflare logo unless the project's trademark/design policy separately authorizes it.

## Security and privacy

- Unlisted by default.
- Never include target-site private auth headers in the pilot scan.
- Never expose API token.
- Treat raw scanner results as private R2 artifacts by default.
- Public page exposes normalized results + hashes; a provider report link is optional.
- If raw Cloudflare output contains data that should not be public, do not make it a public derivative merely for transparency.

## Output format

```json
{
  "command": "nachweis.measure.cloudflare-agent-readiness",
  "status": "ok",
  "systemId": "warpgogol-com",
  "seriesId": "cloudflare-agent-readiness-pilot",
  "observationId": "obs-20260818T120000Z",
  "scanId": "<uuid>",
  "ingest": {
    "systemId": "warpgogol-com",
    "slug": "cloudflare-cf-ar-01",
    "seriesId": "cloudflare-agent-readiness-pilot",
    "observationId": "obs-20260818T120000Z",
    "verificationLevel": "N1",
    "artifactHashes": { "cloudflare-result": "<sha256>" },
    "alreadyIngested": false,
    "bordbuchEventId": "<id>",
    "dryRun": false
  }
}
```

## Failure modes

| Code | Exit code | Condition |
| --- | --- | --- |
| `CLOUDFLARE_URL_INVALID` | 1 | `--url` is not an HTTPS URL |
| `CLOUDFLARE_METHODOLOGY_INVALID` | 1 | `--methodology` is not in `<id>@<version>` format |
| `CLOUDFLARE_CREDENTIALS_MISSING` | 1 | `CLOUDFLARE_URL_SCANNER_ACCOUNT_ID` or `CLOUDFLARE_URL_SCANNER_API_TOKEN` env var is not set |
| `CLOUDFLARE_SUBMISSION_FAILED` | 1 | POST to scan endpoint returns non-2xx or network error after retries |
| `CLOUDFLARE_SCAN_TIMEOUT` | 1 | Polling exceeds 5-minute maximum elapsed time |
| `CLOUDFLARE_SCAN_FAILED` | 1 | `task.success === false` — terminal provider failure |
| `ASSESSMENT_SCHEMA_UNSUPPORTED` | 1 | Raw result schema does not match a supported parser version |
| `ASSESSMENT_BUNDLE_INVALID` | 1 | Built bundle fails `assessmentBundleV1Schema` validation |
| `ASSESSMENT_INGEST_FAILED` | 1 | Delegated `nachweis.assessment.ingest` returns non-zero exit code |

All error results include `status: "error"`, the error `code`, and a human-readable `summary`. The adapter does not retry on terminal failures.

## Tests

Deterministic unit tests use fixtures and mocked HTTP:

- submission request includes Agent Readiness;
- visibility defaults to Unlisted;
- provider job in progress;
- successful completion;
- provider terminal failure;
- timeout after bounded polling;
- schema drift;
- additional unknown dimension preserved/handled;
- Commerce/not-checked not mapped to zero;
- secret redaction if custom header support is ever enabled.

At least one manually run integration test against the official API is required before marking implemented, but it MUST NOT run automatically in normal builds.

## Rollout

1. Implement the handler in `packages/werkstatt/src/nachweis/`.
2. Register the command in `nachweis.module.ts`.
3. Add env vars to root `.env.example` with `# How to obtain:` instructions.
4. Add unit tests with fixtures and mocked HTTP.
5. Run one manual integration test against the live Cloudflare API to obtain a real fixture.
6. Regenerate `docs/COMMANDS.md` via `command.manifest.generate`.
7. Update `packages/werkstatt/AGENTS.md` nachweis module documentation.

No existing apps or pipelines are affected — the command is manually invoked, not a pipeline step.

## Alternatives considered

- **Scrape `isitagentready.com` HTML.** Rejected: brittle, undocumented, breaks on UI changes, and violates the nonGoals. The official API is documented and stable.
- **Extend `nachweis.measure.lighthouse` with a provider flag.** Rejected: each provider has distinct API mechanics (CLI subprocess vs HTTP API, 5-run median vs single provider run, different polling patterns). A separate command per provider follows the one-decision-per-RFC principle.
- **Build the parser heuristically from field names.** Rejected: the RFC explicitly requires fixture-backed parsing with explicit field paths. Heuristic parsing would silently break on schema changes.

## Risks

- **Provider schema drift.** Cloudflare's Agent Readiness API is new and may change field names, paths, or response structure. Mitigation: the adapter preserves raw results, uses fixture-backed parsers with explicit paths, and fails safely with `ASSESSMENT_SCHEMA_UNSUPPORTED` on unrecognized schemas.
- **Agent misinterpretation risk.** An implementing agent might hard-code the screenshot values (Overall: 100, Level 5, etc.) instead of parsing the real API response. Mitigation: the RFC explicitly states "Do not hard-code these values" and the acceptance criteria include "User screenshot values are not hard-coded."
- **False-positive dimension mapping.** An agent might map `not-checked` dimensions to score 0, artificially lowering the overall score. Mitigation: the RFC explicitly states "Commerce or another unscored/not-checked dimension MUST NOT be treated as score 0" and the acceptance criteria include "Not-checked is not zero."
- **Credential leakage.** The API token must never appear in logs, bundles, Bordbuch, or raw artifacts. Mitigation: the adapter uses env vars only, the credential scan in `nachweis.assessment.ingest` rejects bundles containing credential-like patterns, and the RFC explicitly lists forbidden destinations.
- **Rate limiting.** Cloudflare may rate-limit API calls. Mitigation: the adapter does not retry on rate-limit responses (treats them as transient errors via the standard retry helper if available, otherwise fails with `CLOUDFLARE_SUBMISSION_FAILED`).

## Acceptance criteria

- [x] Uses official URL Scanner API, not UI scraping. (evidence: nachweis-cloudflare-agent-readiness-measure.ts:submitScan uses POST /client/v4/accounts/{accountId}/urlscanner/v2/scan)
- [x] Dedicated least-privilege env vars. (evidence: .env.example:95-100 declares CLOUDFLARE_URL_SCANNER_ACCOUNT_ID and CLOUDFLARE_URL_SCANNER_API_TOKEN with How to obtain instructions)
- [x] Unlisted default. (evidence: nachweis-cloudflare-agent-readiness-measure.ts:submitScan sends visibility: "Unlisted" in request body; test case verifies)
- [x] `agentReadiness` requested. (evidence: nachweis-cloudflare-agent-readiness-measure.ts:submitScan sends agentReadiness: true in request body; test case verifies)
- [x] 15s bounded polling, 5min max by default. (evidence: nachweis-cloudflare-agent-readiness-measure.ts:DEFAULT_POLL_INTERVAL_MS=15000, DEFAULT_MAX_ELAPSED_MS=300000; timeout test verifies)
- [x] Raw submission/result retained. (evidence: nachweis-cloudflare-agent-readiness-measure.ts writes cloudflare-submission.json and cloudflare-result.json as bundle artifacts)
- [x] Parser has real/official fixture coverage. (evidence: packages/werkstatt/src/tests-handoff/fixtures/cloudflare-agent-readiness/sample-result.json)
- [x] Schema drift fails safely. (evidence: parseAgentReadiness throws SchemaUnsupportedError when agentReadiness absent; handler returns ASSESSMENT_SCHEMA_UNSUPPORTED; test case verifies)
- [x] Dimensions are not hard-coded to a fixed count. (evidence: parseAgentReadiness iterates result.agentReadiness.checks keys dynamically; unknown dimension test verifies)
- [x] Not-checked is not zero. (evidence: parseAgentReadiness maps not-checked status to status: "not-checked", no score: 0; parser unit test verifies)
- [x] Adapter emits valid `AssessmentBundleV1`. (evidence: handler validates bundle with assessmentBundleV1Schema before delegating to ingest)
- [x] Generic ingest performs R2/PBP/Bordbuch. (evidence: handler delegates to runNachweisAssessmentIngest, same as Lighthouse adapter; test logs show "uploaded 3 artifacts to R2")
- [x] Adapter never signs/approves/publishes. (evidence: handler ends after ingest delegation — no publish/approve/sign calls in nachweis-cloudflare-agent-readiness-measure.ts)
- [x] User screenshot values are not hard-coded. (evidence: parser reads from API response fields, no literal scores in handler; parseAgentReadiness iterates response checks)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: `accepted` (or `implemented`).
- The implementing agent MUST first obtain a real completed API result from the Cloudflare URL Scanner API or use an official full fixture. MUST NOT fabricate parser paths from field names heuristically.
- The implementing agent MUST save a sanitized fixture under `packages/werkstatt/src/tests-handoff/fixtures/cloudflare-agent-readiness/` and reference it in unit tests.
- The implementing agent MUST verify the exact currently documented request/response schema against the official Cloudflare API documentation before implementation. If the schema has changed, follow the official current contract and update fixtures rather than forcing the illustrative body in this RFC.
- The handler follows the same delegation pattern as `nachweis-lighthouse-measure.ts`: build `AssessmentBundleV1`, validate with `assessmentBundleV1Schema`, write to temp dir, delegate to `runNachweisAssessmentIngest`.
- The handler MUST use `fetch()` (Node 18+ built-in) for HTTP calls, not `axios` or `node-fetch` — the engine is stack-agnostic and must not add HTTP library dependencies.
- The handler MUST use `mkdtemp` for the temp working directory and clean it up in a `finally` block, same as `nachweis-lighthouse-measure.ts`.
- The handler MUST skip silently when `isNachweisEntitled` returns false, same as other nachweis commands.
- The `observedAt` MUST come from the provider result's scan timestamp, not `new Date().toISOString()`.
- The command MUST be registered in `nachweis.module.ts` with `scope: "workspace"`, `supportsAllSites: false`, `mutatesState: true`, `cacheable: false`.
- The command MUST be exported from `packages/werkstatt/src/nachweis/index.ts`.
- The env vars `CLOUDFLARE_URL_SCANNER_ACCOUNT_ID` and `CLOUDFLARE_URL_SCANNER_API_TOKEN` MUST be added to the root `.env.example` with `# How to obtain:` instructions (DNA-40).
- `docs/COMMANDS.md` MUST be regenerated via `pnpm exec werkstatt run command.manifest.generate` after registering the command.
- `packages/werkstatt/AGENTS.md` nachweis module documentation MUST be updated to list the new command.
