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
  - "@warpgogol/werkstatt-site"
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

## Acceptance criteria

- [ ] Exact Lighthouse dependency is pinned.
- [ ] Command runs five sequential canonical runs by default.
- [ ] Raw LHR JSON for every successful canonical run is preserved.
- [ ] Any canonical run failure prevents ingest.
- [ ] Median/min/max/samples are correct.
- [ ] Agentic Browsing is not converted into a fake score.
- [ ] Tool and browser/run metadata are captured.
- [ ] Adapter emits valid `AssessmentBundleV1`.
- [ ] Generic ingest handles hashes/R2/PBP/Bordbuch.
- [ ] Adapter never signs/approves/publishes.
- [ ] User screenshot values are not hard-coded.
