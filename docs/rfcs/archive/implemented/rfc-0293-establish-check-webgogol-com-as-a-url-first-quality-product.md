---
id: RFC-0293
title: "Establish check-webgogol-com as a URL-first quality product"
status: implemented
kind: architecture
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
amendedBy:
  - RFC-0304
related:
  - RFC-0074
  - RFC-0203
  - RFC-0233
  - RFC-0286
  - RFC-0294
  - RFC-0295
  - RFC-0296
  - RFC-0297
  - RFC-0298
  - RFC-0299
  - RFC-0300
  - RFC-0301
  - RFC-0302
commands:
  proposed: []
  added:
    - check.run
    - check.target.validate
  changed: []
  removed: []
appsImpacted:
  - check-webgogol-com
  - apps/*
packagesImpacted:
  - "@gogol/check-core"
  - "@gogol/check-runner-node"
  - "@gogol/site-kernel-check-webgogol"
  - "@gogol/site-kernel-checks"
successSignals:
  - "Every checked target, including apps/* deployed to alt hosting, is audited from its public or private URL rather than from repository source files."
  - "The same check pipeline can evaluate a WGogol site and a third-party site; WGogol hints only improve locator precision."
  - "The product app check-webgogol-com is a thin WGogol app that displays and manages check runs, while reusable check logic lives in packages/*."
  - "deploy:main can be gated on a successful check of the deploy:alt URL without adding app-specific source validators."
nonGoals:
  - "Do not build a source-first app validator for apps/*; repository validators already exist for source contracts."
  - "Do not require third-party sites to expose WGogol metadata."
  - "Do not run Playwright or heavy browser crawling inside a Cloudflare Worker request path."
  - "Do not make LLM perception checks a mandatory build dependency."
acceptance:
  - probe: command-registered
    name: "check.run"
  - probe: command-registered
    name: "check.target.validate"
  - probe: file-exists
    path: "packages/check-core/src/target.ts"
  - probe: file-exists
    path: "packages/os/site-kernel-check-webgogol/package.json"
---

# RFC-0293: Establish check-webgogol-com as a URL-first quality product

## Context

The studio needs a system that judges whether a business website feels complete, trustworthy, culturally appropriate, translated, technically sound, and actionable. The initial temptation is to add more validators for `apps/*`, because WGogol sites are thin and structured. That would solve the dogfood case but would not create the intended product: a checker for any business website, including sites not built by the studio.

The deployment workflow also points away from source-first checking. Before publishing to the main host, a WGogol site is deployed to a closed alt host and visually reviewed there. The artifact that matters is therefore the rendered deployed website: redirects, headers, metadata, images, scripts, forms, language alternates, and perceived page quality as a visitor or crawler sees them.

## Problem

- A source-first checker would create two mental models: internal app checks and external site checks.
- It would miss deployment-only failures: broken alt-host assets, wrong headers, CDN redirects, stale generated files, robots behavior, missing well-known artifacts, and rendering regressions.
- It would make the product less portable because findings would assume WGogol source paths.
- A deployed `check-webgogol-com` app cannot safely execute heavy browser automation inside the normal Cloudflare Worker request path.

## Decision

Build **check-webgogol-com** as a URL-first site-quality product.

Every target is checked through a `CheckTarget` whose primary identity is a URL. This applies equally to:

- a WGogol site deployed to `deploy:alt`;
- a WGogol site deployed to `deploy:main`;
- a third-party business website;
- a local preview server URL.

WGogol source knowledge is optional. A WGogol site may expose a `.well-known/webgogol-check.json` hint file (RFC-0295). The checker still crawls and renders the URL, but when hints exist it can translate findings into precise `pageId`, `lang`, `blockId`, and source-locator suggestions. Without hints, the same rules run with URL, DOM, screenshot, and text locators.

The product is split into three layers:

1. **Core package:** evidence graph, target schema, report schema, scoring and shared types.
2. **Runner package:** Node/Playwright execution lane that captures rendered evidence and runs checks.
3. **Operator app:** `apps/check-webgogol-com`, a thin WGogol site that launches, displays, compares, and explains reports. It does not own check logic.

## Architectural fit

- RFC-0203 already gives the ecosystem a canonical `Diagnostic` model. Check Webgogol extends it with URL and screenshot locators in `data`, not by inventing a parallel finding shape.
- RFC-0233 already separates deterministic, heuristic, and perceptual visual checks. Check Webgogol applies the same tiering to rendered websites.
- RFC-0074 already defines deterministic audits plus cached LLM audits. Check Webgogol uses the same split: deterministic URL checks first, cached AI audience reviews second.
- RFC-0286 establishes well-known agent surfaces. Check Webgogol does not replace that surface; it consumes public artifacts such as `llms.txt`, `ai.txt`, JSON-LD, cosmic passport, and the new optional check hints.

## Design

### Target Contract

```ts
export interface CheckTarget {
  id: string;
  baseUrl: string;
  label?: string;
  expectedBrand?: string;
  mode: "public" | "private-alt" | "local";
  allowedHosts: string[];
  startPaths?: string[];
  maxPages?: number;
  localeHints?: string[];
  auth?: CheckTargetAuthRef | null;
  policy?: CheckTargetPolicy;
}

export interface CheckTargetAuthRef {
  kind: "header" | "basic" | "cookie-file";
  secretRef: string;
}

export interface CheckTargetPolicy {
  respectRobots: boolean;
  allowScreenshots: boolean;
  allowAiReview: boolean;
  allowExternalLinks: boolean;
}
```

`auth.secretRef` is never serialized into reports. The runner resolves it from environment variables or an injected secret bag.

### Commands

```sh
pnpm exec site-kernel run check.target.validate --target ./check-targets/webgogol-alt.yaml --json
pnpm exec site-kernel run check.run --url https://alt.example.invalid --profile handwerk-de --json
pnpm exec site-kernel run check.run --target ./check-targets/webgogol-alt.yaml --json
```

`check.run` orchestrates the child commands introduced by RFC-0294 through RFC-0299:

1. validate target and safety policy;
2. capture the evidence graph;
3. load optional WGogol hints;
4. run deterministic checks;
5. run AI audience review only when enabled;
6. write report and agent action pack.

When child RFCs are not yet implemented, `check.run` must fail with a clear missing-capability diagnostic, not silently skip the requested phase.

### Workspace Shape

| Path | Role |
| --- | --- |
| `packages/check-core/` | Framework-neutral types and pure scoring/report helpers. |
| `packages/check-runner-node/` | Node + Playwright crawler, screenshot, DOM extraction, and AI-review execution harness. |
| `packages/os/site-kernel-check-webgogol/` | Kernel command registration for check commands. |
| `apps/check-webgogol-com/` | Thin operator app created via onboarding, never by copying another app. |
| `.check-webgogol/runs/` | Local gitignored run artifacts for CLI/local app development. |

### Invariants

- **CW-1 URL-first truth.** A check result is derived from fetched/rendered URL evidence, never from source files alone.
- **CW-2 Internal equals external.** `apps/*` targets and third-party targets use the same pipeline and report schema.
- **CW-3 Hints are optional.** WGogol hints improve repair precision but may never be required for pass/fail.
- **CW-4 Heavy execution stays off request path.** Playwright crawling runs in Node local/CI/runner contexts, not inside a Cloudflare Worker request.
- **CW-5 Advisory before gating.** Perceptual/AI findings are warning-class by default until calibrated and explicitly gated.

## Rollout

1. Implement `@gogol/check-core` target types and `check.target.validate`.
2. Add `@gogol/check-runner-node` and the evidence graph capture command (RFC-0294).
3. Add optional WGogol `.well-known` hints (RFC-0295).
4. Add reports, diagnostics, and action packs (RFC-0297).
5. Add deterministic and AI review lanes (RFC-0298, RFC-0299).
6. Scaffold `apps/check-webgogol-com` using onboarding (RFC-0300).
7. Wire the deploy-alt gate before `deploy:main` (RFC-0301).

## Alternatives considered

- **Source-first validator for WGogol apps.** Rejected: useful internally, but duplicates existing validators and does not become a product for arbitrary sites.
- **Make `check-webgogol-com` itself run browser checks in production.** Rejected for the first implementation: Cloudflare Worker request paths are not a safe place for Playwright or long crawls.
- **Third-party SaaS checker integration.** Rejected as the spine. External APIs may be adapters later, but the core evidence graph and diagnostics must be first-party and reproducible.

## Risks

- **Loss of precise source anchors.** Mitigated by optional `.well-known` hints for WGogol sites and robust DOM/screenshot locators for external sites.
- **Runner complexity.** Mitigated by making the runner a Node package with CLI commands first; the operator app consumes artifacts.
- **False confidence from screenshots only.** Mitigated by combining DOM, metadata, network, structured data, text, and screenshots into one evidence graph.

## Acceptance criteria

- [x] `@gogol/check-core` exists and exports `CheckTarget`, `CheckRun`, and target policy types. (evidence: packages/ directory, package exists)
- [x] `check.target.validate` validates URL, allowed hosts, mode, auth refs, and policy defaults. (evidence: implemented historically)
- [x] `check.run` is registered and orchestrates implemented child phases, failing explicitly for missing phases. (evidence: implemented historically)
- [x] A WGogol alt URL and a third-party URL can be represented by the same target schema. (evidence: implemented historically)
- [x] No command reads `apps/<site>/src/content/**` as the primary truth for pass/fail. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] The implementation docs state that Playwright execution is Node-runner only. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Implement this RFC before implementing the product app. The app consumes the command/report surface; it must not invent its own checker.
- Do not add app-specific source readers to satisfy a check. If a WGogol-only mapping is needed, add it through RFC-0295 hints.
- Reference RFC-0293 in commits that create the check package spine.
