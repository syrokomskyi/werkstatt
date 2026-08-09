# Axiom Phase 2 — Expert Specification

**Date:** 2026-08-03 **Author:** Werkstatt session **Status:** Draft — for Axiom team

## Context

Werkstatt's `mission.check` command (RFC-0629/RFC-0665) currently runs **only** the `automated-web-accessibility` methodology. The other 7 methodologies declared in `systems/methodologies.md` are placeholders with `pending-phase2:<id>` digests. This document specifies what the Axiom team must implement to enable full methodology execution and remove duplication from Werkstatt.

## Current state (Phase 1)

### What Werkstatt does today

`packages/os/site-kernel-checks/src/mission-check.ts`:

1. Discovers URLs via `CrawleeDiscoveryExecutor`
2. Captures browser evidence via `PlaywrightEvidenceDriver` (all 12 evidence roles)
3. Runs **only** `runAccessibilityInstrument` against `axe-raw-result` evidence
4. Writes `staged-capsule.json`, `observation-bundle.json`, `study-run.json`, `evidence-metadata.json`
5. Other methodologies get `digest: "pending-phase2:<id>"` in `evidence-metadata.json`

### What Axiom packages already have

- **`@syrokomskyi/axiom-capture`**: `PlaywrightEvidenceDriver` captures all 12 evidence roles (rendered-html, full-page-screenshot, cdp-dom-snapshot, cdp-accessibility-tree, axe-raw-result, performance-metrics, console-errors, page-errors, http-response-headers, cookie-state, network-requests). `CrawleeDiscoveryExecutor` for URL discovery.
- **`@syrokomskyi/axiom-study`**: Instrument implementations for all 8 methodologies (accessibility, multilingual, performance-vitals, privacy-consent, runtime-health, security-headers, seo-runtime, visual-regression). Each instrument has a state schema and `analyze` function that expects evidence as input.
- **`@syrokomskyi/axiom-methodology`**: Methodology package factories (`createAutomatedWebAccessibilityMethodology`, etc.) and `methodologyPackageDigest` for computing digests.

### What's missing

1. **`runActiveMethodologies`** orchestrator function — does not exist in any Axiom package
2. **Instrument-to-evidence-role mapping** — no explicit declaration of which evidence roles each instrument consumes
3. **Caching layer** — no result caching to skip re-analysis when evidence hasn't changed
4. **Multi-instrument study-run aggregation** — `study-run.json` only contains accessibility findings

## Phase 2 requirements

### 1. `runActiveMethodologies` orchestrator

**Package:** `@syrokomskyi/axiom-methodology` (or new `@syrokomskyi/axiom-orchestration`)

**Signature:**

```ts
interface RunActiveMethodologiesInput {
  /** Discovered URLs with their captured evidence */
  pages: Array<{
    url: string;
    evidence: CapturedEvidence[];
  }>;
  /** Methodology configs from systems/methodologies.md */
  activeMethodologies: Array<{
    id: string;
    instruments: string[];
    blockOn: string[];
  }>;
  /** Cache directory for methodology results (optional) */
  cacheDir?: string;
}

interface RunActiveMethodologiesOutput {
  findings: Finding[];
  methodologyDigests: Array<{ id: string; digest: string }>;
  studyRun: StudyRun;
  stagedCapsule: StagedCapsule;
  observationBundle: ObservationBundle;
}

export async function runActiveMethodologies(
  input: RunActiveMethodologiesInput,
): Promise<RunActiveMethodologiesOutput>;
```

**Responsibilities:**

- For each active methodology, resolve its methodology package via `fixtures.ts` factory functions
- For each instrument in the methodology, find the matching evidence roles from captured evidence
- Run the instrument's `analyze` function against the evidence
- Aggregate all findings into a single `StudyRun`
- Compute `methodologyPackageDigest` for each methodology
- Return all artifacts in the native Axiom format (staged-capsule, observation-bundle, study-run)

### 2. Instrument-to-evidence-role mapping

Each instrument needs to declare which evidence roles it consumes. Suggested approach: add an `evidenceRoles` field to the instrument definition or methodology package.

| Instrument | Evidence roles consumed |
| --- | --- |
| `accessibility` | `axe-raw-result`, `cdp-accessibility-tree`, `rendered-html` |
| `multilingual-content-consistency` | `rendered-html`, `cdp-dom-snapshot` |
| `runtime-functional-health` | `console-errors`, `page-errors`, `network-requests` |
| `privacy-consent-compliance` | `cookie-state`, `network-requests`, `http-response-headers` |
| `seo-technical-runtime` | `rendered-html`, `http-response-headers`, `cdp-dom-snapshot` |
| `security-headers` | `http-response-headers` |
| `performance-vitals` | `performance-metrics` |
| `visual-regression` | `full-page-screenshot` (requires baseline comparison) |

### 3. Caching layer

**Location:** Inside Axiom, not Werkstatt.

**Strategy:**

- Cache key = hash of (methodology digest + evidence digests for consumed roles)
- Cache value = instrument findings (serialized JSON)
- Cache location: `cacheDir/<methodology-id>/<cache-key>.json`
- Cache invalidation: automatic when evidence or methodology package changes (digest mismatch)
- Cache is optional — when `cacheDir` is not provided, all instruments run fresh

**Interface:**

```ts
interface MethodologyCache {
  get(methodologyId: string, cacheKey: string): Promise<CachedResult | null>;
  set(methodologyId: string, cacheKey: string, result: CachedResult): Promise<void>;
}

function computeCacheKey(
  methodologyDigest: string,
  evidenceDigests: string[],
): string;
```

### 4. What Werkstatt will remove

After Phase 2 is delivered, Werkstatt's `mission-check.ts` will be simplified to:

1. Discover URLs via `CrawleeDiscoveryExecutor`
2. Capture browser evidence via `PlaywrightEvidenceDriver`
3. Call `runActiveMethodologies({ pages, activeMethodologies, cacheDir })`
4. Write the returned artifacts (study-run, staged-capsule, observation-bundle, evidence-metadata) to disk
5. Auto-generate `report.html` via `renderAxiomReportHtml`

**Removed from Werkstatt:**

- Direct import of `runAccessibilityInstrument` and `createAutomatedWebAccessibilityMethodology`
- The `if (m.id === "automated-web-accessibility")` special case
- The `pending-phase2` placeholder digest logic
- Manual finding aggregation and closure evaluation
- Manual `study-run.json` / `staged-capsule.json` / `observation-bundle.json` construction

### 5. Visual regression baseline

Visual regression requires a baseline screenshot to compare against. Options:

- **Option A:** Store baselines in R2 alongside evidence. First run establishes baseline; subsequent runs diff against it.
- **Option B:** Store baselines in the mission workpiece under `missions/<id>/evidence/baselines/`. Committed to the cache clone.

**Recommendation:** Option A (R2) — keeps baselines persistent across materializations and mission closures.

### 6. Contract: Werkstatt → Axiom

Werkstatt provides:

- `pages: Array<{ url, evidence: CapturedEvidence[] }>` — raw captured evidence per page
- `activeMethodologies` — parsed from `systems/methodologies.md`
- `cacheDir` — path to `missions/<id>/evidence/axiom/.cache/`

Axiom returns:

- `findings: Finding[]` — all findings from all methodologies, tagged with `extension[methodologyId]`
- `methodologyDigests` — real digests (replaces `pending-phase2` placeholders)
- `studyRun`, `stagedCapsule`, `observationBundle` — native Axiom artifacts

### 7. Testing requirements

- Unit tests for `runActiveMethodologies` with mock evidence
- Integration test: capture → runActiveMethodologies → verify findings for each methodology
- Cache hit/miss tests
- Test that all 8 methodologies produce at least one finding when given real evidence

## Deliverables for Axiom team

1. **`runActiveMethodologies`** function exported from `@syrokomskyi/axiom-methodology` (or new orchestration package)
2. **`evidenceRoles`** field on instrument definitions
3. **Methodology cache** implementation (file-based, digest-keyed)
4. **Visual regression** baseline strategy (with R2 storage)
5. **Updated `study-run.json` schema** if needed to carry multi-methodology findings
6. **Migration guide** for Werkstatt to switch from Phase 1 to Phase 2

## Werkstatt side (after Axiom delivers)

1. Replace Phase 1 logic in `mission-check.ts` with `runActiveMethodologies` call
2. Remove `pending-phase2` placeholder logic
3. Remove direct instrument imports
4. Pass `cacheDir` for methodology caching
5. Update `axiom-report.ts` to handle real findings from all methodologies (PENDING status disappears)
