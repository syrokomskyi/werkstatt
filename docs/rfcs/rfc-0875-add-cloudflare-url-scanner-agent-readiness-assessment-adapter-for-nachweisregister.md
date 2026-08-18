---
id: RFC-0875
title: "Add Cloudflare URL Scanner Agent Readiness assessment adapter for Nachweisregister"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-18
updatedAt: 2026-08-18
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
  added: []
  changed: []
  removed: []
appsImpacted:
  - warpgogol-com
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "Adapter uses Cloudflare URL Scanner API with agentReadiness enabled"
  - "Scans are Unlisted by default"
  - "Raw submission and final result JSON are retained"
  - "Provider schema drift fails safely without guessed field mappings"
nonGoals:
  - "Does not scrape isitagentready.com HTML"
  - "Does not expose Cloudflare API tokens"
  - "Does not turn provider score into a certification claim"
---

# RFC-0875: Add Cloudflare URL Scanner Agent Readiness assessment adapter for Nachweisregister

## Context

Cloudflare exposes Agent Readiness through its URL Scanner and documents a programmatic API. This is preferable to automating/scraping the public `isitagentready.com` UI.

The provider's score model is evolving, so the integration must preserve raw results and use explicit parser fixtures rather than assuming a permanently fixed set of categories.

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

Cloudflare documents scan completion as asynchronous.

Use:

```text
poll interval: 15 seconds
maximum elapsed time: 5 minutes
```

These constants MUST be named/configured for tests.

Behavior:

- in-progress response/status: continue;
- success: parse;
- terminal provider failure: fail;
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

## Acceptance criteria

- [ ] Uses official URL Scanner API, not UI scraping.
- [ ] Dedicated least-privilege env vars.
- [ ] Unlisted default.
- [ ] `agentReadiness` requested.
- [ ] 15s bounded polling, 5min max by default.
- [ ] Raw submission/result retained.
- [ ] Parser has real/official fixture coverage.
- [ ] Schema drift fails safely.
- [ ] Dimensions are not hard-coded to a fixed count.
- [ ] Not-checked is not zero.
- [ ] Adapter emits valid `AssessmentBundleV1`.
- [ ] Generic ingest performs R2/PBP/Bordbuch.
- [ ] Adapter never signs/approves/publishes.
- [ ] User screenshot values are not hard-coded.
