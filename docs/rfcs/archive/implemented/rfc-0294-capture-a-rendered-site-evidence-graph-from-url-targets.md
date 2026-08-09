---
id: RFC-0294
title: "Capture a rendered site evidence graph from URL targets"
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
  - RFC-0233
  - RFC-0293
  - RFC-0295
  - RFC-0297
  - RFC-0302
commands:
  proposed: []
  added:
    - check.evidence.capture
    - check.evidence.validate
  changed: []
  removed: []
appsImpacted:
  - check-warpgogol-com
packagesImpacted:
  - "@gogol/check-core"
  - "@gogol/check-runner-node"
  - "@gogol/site-kernel-check-warpgogol"
successSignals:
  - "A URL target is captured into a deterministic SiteEvidenceGraph containing crawl, DOM, metadata, text, structured data, screenshots, network, and well-known artifact evidence."
  - "Every later check consumes the evidence graph instead of fetching the target independently."
  - "The capture command respects target safety policy, allowed hosts, robots policy, page budgets, and secret redaction."
nonGoals:
  - "Do not evaluate business quality in the capture command."
  - "Do not require a sitemap; crawl discovery can start from the base URL and well-known files."
  - "Do not persist raw secrets, cookies, request headers, or form values in the evidence graph."
acceptance:
  - probe: command-registered
    name: "check.evidence.capture"
  - probe: command-registered
    name: "check.evidence.validate"
  - probe: file-exists
    path: "packages/check-core/src/evidence.ts"
---

# RFC-0294: Capture a rendered site evidence graph from URL targets

## Context

Check Warpgogol needs one stable evidence layer that works for WGogol apps deployed to alt hosting and for third-party sites. The evidence must reflect rendered reality, not source assumptions. It also needs to be reusable: deterministic checks, AI audience review, report generation, before/after comparison, and agent action packs should all read the same captured artifact.

## Problem

If each check fetches the site on its own:

- results are non-reproducible because the site can change between checks;
- page budgets and crawl safety rules are duplicated;
- screenshots and DOM snapshots drift;
- LLM review cannot be grounded to the same evidence deterministic checks used;
- external site owners cannot receive a stable report artifact.

## Decision

Introduce a first-class **SiteEvidenceGraph** captured from a `CheckTarget`.

`check.evidence.capture` is the only command that performs crawling, browser rendering, screenshot capture, and well-known artifact fetches. All other check commands consume the resulting graph.

## Architectural fit

- RFC-0293 establishes URL-first truth. This RFC defines the truth artifact.
- RFC-0203 diagnostics use `file` for repository locators; URL checks place URL, selector, screenshot region, and source-hint locators inside `Diagnostic.data`.
- RFC-0233 visual-control tiers are extended: Tier 2 rendered-DOM and screenshots now have a concrete evidence input.
- RFC-0302 owns crawl safety and consent policy; the capture command enforces it.

## Design

### TypeScript Contracts

```ts
export interface CheckRun {
  id: string;
  target: CheckTarget;
  startedAt: string;
  completedAt?: string;
  runner: {
    packageName: "@gogol/check-runner-node";
    version: string;
    playwrightVersion: string;
  };
  graphPath: string;
  graphHash: string;
}

export interface SiteEvidenceGraph {
  schemaVersion: "1.0.0";
  runId: string;
  target: PublicCheckTargetSnapshot;
  capture: CaptureSummary;
  pages: PageEvidence[];
  assets: AssetEvidence[];
  wellKnown: WellKnownEvidence[];
  diagnostics: CaptureDiagnostic[];
  contentHash: string;
}

export interface PageEvidence {
  url: string;
  finalUrl: string;
  status: number;
  language?: string;
  title?: string;
  metaDescription?: string;
  canonical?: string;
  hreflang: Array<{ lang: string; href: string }>;
  robots?: string;
  headings: HeadingEvidence[];
  links: LinkEvidence[];
  forms: FormEvidence[];
  sections: SectionEvidence[];
  text: {
    visible: string;
    normalizedHash: string;
  };
  jsonLd: JsonLdEvidence[];
  screenshots: {
    desktop?: ScreenshotRef;
    mobile?: ScreenshotRef;
    fullPage?: ScreenshotRef;
  };
  network: NetworkSummary;
}

export interface SectionEvidence {
  index: number;
  selector: string;
  role?: string;
  heading?: string;
  textHash: string;
  boundingBox?: ScreenshotBox;
  wgogolHint?: {
    pageId?: string;
    blockId?: string;
    cosmicName?: string;
    source?: SourceAnchor;
  };
}
```

The graph must be serialized as sorted-key JSON. `contentHash` is a SHA-256 hex digest of the graph body excluding `contentHash` and volatile runner timing fields.

### Capture Inputs

The command accepts either a URL or a target file:

```sh
pnpm exec site-kernel run check.evidence.capture --url https://alt.example.invalid --out .check-warpgogol/runs/run-001 --json
pnpm exec site-kernel run check.evidence.capture --target ./check-targets/client.yaml --out .check-warpgogol/runs/run-002 --json
```

### Discovery Order

1. Fetch `robots.txt` and enforce target policy.
2. Fetch `sitemap.xml` and sitemap indexes when allowed.
3. Fetch `/.well-known/warpgogol-check.json` when present.
4. Seed crawl from `startPaths`, sitemap URLs, and same-host links.
5. Stop at `maxPages`, host boundary, and safety-policy limits.

### Rendering Contract

For every page:

- render desktop and mobile viewports;
- wait for network idle with a bounded timeout;
- collect visible text after rendering;
- parse DOM for metadata, links, headings, forms, landmarks, JSON-LD;
- capture screenshots when policy allows;
- redact secrets and known PII patterns from logs and graph fields.

### File System Responsibilities

| Path                                                | Role                                      |
| --------------------------------------------------- | ----------------------------------------- |
| `.check-warpgogol/runs/<runId>/evidence.graph.json` | Captured graph, gitignored.               |
| `.check-warpgogol/runs/<runId>/screenshots/**.png`  | Screenshot evidence, gitignored.          |
| `.check-warpgogol/runs/<runId>/capture.log.jsonl`   | Structured capture log, secrets redacted. |
| `packages/check-core/src/evidence.ts`               | Evidence graph schemas and hash helpers.  |
| `packages/check-runner-node/src/capture.ts`         | Playwright capture implementation.        |

### Validation Rules

`check.evidence.validate` emits canonical diagnostics:

| Rule | Severity | Meaning |
| --- | --- | --- |
| `CW-EVID-01` | error | Evidence graph schema invalid. |
| `CW-EVID-02` | error | Graph contentHash does not match. |
| `CW-EVID-03` | error | Page evidence references a screenshot file that does not exist. |
| `CW-EVID-04` | warning | Capture stopped early due to page budget. |
| `CW-EVID-05` | error | Evidence graph contains a secret-like value or forbidden raw auth data. |

## Rollout

1. Implement schemas and graph hashing in `@gogol/check-core`.
2. Implement `check.evidence.validate` against fixture graphs.
3. Implement `check.evidence.capture` with Playwright in `@gogol/check-runner-node`.
4. Add red/green fixtures: valid graph, stale hash, missing screenshot, secret leak.
5. Integrate capture into `check.run`.

## Alternatives considered

- **Let each validator crawl on demand.** Rejected: non-reproducible and unsafe.
- **Only use static HTML fetches.** Rejected: many deployed failures appear only after rendering and responsive layout.
- **Store HAR files wholesale.** Rejected for MVP: too large and leak-prone. Keep a structured network summary instead.

## Risks

- **Screenshots are large.** Mitigated by per-run artifact directories, retention policy, and optional capture.
- **Crawl gets stuck.** Mitigated by host allowlist, max page budget, timeout, and robots policy.
- **Third-party sites change while crawling.** Mitigated by graph timestamping and hashing; the report describes the captured snapshot.

## Acceptance criteria

- [x] `SiteEvidenceGraph` and nested evidence schemas exist and are unit-tested. (evidence: implemented historically)
- [x] `check.evidence.capture` can capture at least one desktop and one mobile page from a local URL. (evidence: implemented historically)
- [x] Capture writes graph and screenshots under `.check-warpgogol/runs/<runId>/`. (evidence: implemented historically)
- [x] `check.evidence.validate` detects schema, hash, missing-screenshot, and secret-leak failures. (evidence: implemented historically)
- [x] The graph never stores auth secret values. (evidence: implemented historically)
- [x] `check.run` consumes the graph path instead of letting child checks fetch independently. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Do not put crawler logic in `apps/check-warpgogol-com`.
- Do not make a validator refetch the target if an evidence graph is available.
- Keep the graph stable and explicit; adding a new evidence field requires schema tests and contentHash updates.
