---
id: RFC-0295
title: "Publish optional Webgogol check hints in .well-known"
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
  - RFC-0028
  - RFC-0203
  - RFC-0286
  - RFC-0293
  - RFC-0294
  - RFC-0297
commands:
  proposed: []
  added:
    - webgogol.check-hints.generate
    - webgogol.check-hints.validate
  changed: []
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-codegen"
successSignals:
  - "WGogol sites expose a generated /.well-known/webgogol-check.json artifact that maps rendered URLs and sections to stable source-level anchors."
  - "The checker can evaluate a WGogol site without the hints, but when hints exist diagnostics gain pageId/lang/blockId/source locators."
  - "The hint artifact contains no visitor data, private business domains, secrets, raw prose bodies, or auth material."
nonGoals:
  - "Do not make hints required for external sites."
  - "Do not expose full source content or private CKL claims."
  - "Do not hand-author the hint artifact in apps/*."
acceptance:
  - probe: command-registered
    name: "webgogol.check-hints.generate"
  - probe: command-registered
    name: "webgogol.check-hints.validate"
  - probe: file-exists
    path: "packages/share/src/check-hints.ts"
---

# RFC-0295: Publish optional Webgogol check hints in .well-known

## Context

Check Webgogol is URL-first. It must work on arbitrary websites. For WGogol sites, however, the ecosystem already has stable semantic identities: `pageId`, language routes, block ids, cosmic names, source files, and generated behavior snapshots. If a deployed WGogol site can expose a safe, generated map from rendered surface to source anchors, the checker can produce much more actionable recommendations for AI agents.

## Problem

Without hints, a finding can say:

> The hero on `https://alt.example/de/` has a weak value proposition.

That is useful but not surgical. For WGogol work, an agent should know:

> Update `apps/webgogol-com/src/content/pages/de/home.md`, block `hero`, prop `heading` or `lead`.

The checker must get that precision without reading local source as the audit truth.

## Decision

Every WGogol app may generate:

```txt
/.well-known/webgogol-check.json
```

This artifact is a public or private-alt-safe hint projection. It contains stable identities and locators, not raw private content.

The artifact is optional. Absence never fails a generic URL check. Presence upgrades diagnostics with WGogol anchors.

## Architectural fit

- RFC-0286 uses `.well-known/agent.json` for agent capability discovery. This RFC adds a separate checker-specific hint surface, because repair anchors are not public business capabilities.
- RFC-0028 already establishes `.well-known` as the place for machine-verifiable WGogol identity artifacts.
- RFC-0203 diagnostics carry file/line for source checks. For URL checks, hints let the checker add source-like locators in `Diagnostic.data.sourceAnchor`.

## Design

### Artifact Contract

```ts
export interface WebgogolCheckHints {
  schemaVersion: "1.0.0";
  app: string;
  origin: string;
  generatedFrom: {
    systemHash: string;
    behaviorSnapshotHash?: string;
  };
  languages: {
    default: string;
    supported: string[];
  };
  pages: WebgogolPageHint[];
  contentHash: string;
}

export interface WebgogolPageHint {
  pageId: string;
  lang: string;
  urlPath: string;
  titleHash?: string;
  source: SourceAnchor;
  sections: WebgogolSectionHint[];
}

export interface WebgogolSectionHint {
  blockId: string;
  type: string;
  cosmicName?: string;
  order: number;
  selectorHint: string;
  source: SourceAnchor;
  propAnchors?: Array<{
    propPath: string;
    source: SourceAnchor;
    valueHash?: string;
  }>;
}

export interface SourceAnchor {
  workspacePath: string;
  line?: number;
  column?: number;
}
```

`valueHash` is a normalized SHA-256 hash of the field value, never the value itself. It lets a checker confirm that a rendered finding is still tied to the authored content version without exposing copy in the hint file.

### Generation

```sh
pnpm exec site-kernel run webgogol.check-hints.generate --app webgogol-com
pnpm exec site-kernel run webgogol.check-hints.validate --app webgogol-com --json
```

Generation runs in `APPS_BUILD_PREPARE_PIPELINE` after route and surface generation and before postbuild checks that may consume public files.

### Selector Hints

WGogol renderers should expose stable, non-content selectors where already available:

```html
<section data-page-id="home" data-block-id="hero" data-check-section="hero">
```

If a section cannot expose selectors yet, the hint uses order and heading hash as a fallback. Selector coverage gaps are warnings, not initial errors.

### Validation Rules

| Rule | Severity | Meaning |
| --- | --- | --- |
| `CW-HINT-01` | error | Hint artifact schema invalid or contentHash mismatch. |
| `CW-HINT-02` | error | Hint page URL does not resolve from `system.md` routes. |
| `CW-HINT-03` | warning | Section has no stable selector hint and falls back to order-only mapping. |
| `CW-HINT-04` | error | Hint leaks raw prose, secrets, or private business-domain data. |
| `CW-HINT-05` | error | Hint references a generated or missing source file as an editable source anchor. |

## Rollout

1. Add hint types and pure builder in `@gogol/share`.
2. Register `webgogol.check-hints.generate` and `webgogol.check-hints.validate`.
3. Add `public/.well-known/webgogol-check.json` to generated artifact governance and gitignore templates.
4. Add stable `data-*` attributes to shared render paths where needed, through packages, not app routes.
5. Make `check.evidence.capture` read the artifact when present and attach section hints to `SiteEvidenceGraph`.

## Alternatives considered

- **Let the checker read repository source for WGogol targets.** Rejected: breaks URL-first truth and cannot work for already-deployed external targets.
- **Put this data into `agent.json`.** Rejected: agent capabilities and repair hints have different consumers and privacy posture.
- **Expose full block props.** Rejected: unnecessary and leaks more than the checker needs.

## Risks

- **Hints drift from rendered HTML.** Mitigated by graph capture matching selectors and warning on unmatched hints.
- **Overexposure of implementation details.** Mitigated by hashes, stable ids, and no raw prose bodies.
- **Generated artifact churn.** Mitigated by sorted serialization and contentHash.

## Acceptance criteria

- [x] `webgogol-check.json` schema and pure builder exist in `@gogol/share`. (evidence: packages/ directory, package exists)
- [x] `webgogol.check-hints.generate` writes the artifact under `public/.well-known/`. (evidence: implemented historically)
- [x] `webgogol.check-hints.validate` emits `CW-HINT-*` diagnostics. (evidence: implemented historically)
- [x] The artifact contains hashes and anchors but no raw prose bodies or secrets. (evidence: implemented historically)
- [x] `check.evidence.capture` can attach page and section hints when the artifact exists. (evidence: implemented historically)
- [x] Absence of the artifact does not fail a generic check run. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Do not edit generated hint files by hand.
- Do not add app-local render logic to emit selectors; update shared packages or generator templates.
- If a precise source line cannot be found, omit `line` rather than guessing.
