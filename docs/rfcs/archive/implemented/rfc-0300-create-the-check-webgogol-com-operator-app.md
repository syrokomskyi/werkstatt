---
id: RFC-0300
title: "Create the check-warpgogol-com operator app"
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
  - RFC-0029
  - RFC-0047
  - RFC-0293
  - RFC-0296
  - RFC-0297
  - RFC-0299
  - RFC-0301
commands:
  proposed: []
  added:
    - check-warpgogol.app.validate
  changed: []
  removed: []
appsImpacted:
  - check-warpgogol-com
packagesImpacted:
  - "@gogol/check-core"
  - "@gogol/site-kernel-check-warpgogol"
successSignals:
  - "check-warpgogol-com exists as a thin app created by onboarding.scaffold and consumes reusable check packages."
  - "The app can run locally against local run artifacts and can be deployed as a report/operator surface."
  - "The app never owns crawling, scoring, prompt, or report schema logic."
nonGoals:
  - "Do not copy warpgogol-com or any existing app."
  - "Do not implement Playwright in the app."
  - "Do not require persistent cloud storage for the MVP."
acceptance:
  - probe: file-exists
    path: "apps/check-warpgogol-com/package.json"
  - probe: command-registered
    name: "check-warpgogol.app.validate"
---

# RFC-0300: Create the check-warpgogol-com operator app

## Context

The checker should itself be a WGogol-built site so the studio can dogfood its own ecosystem. It should be locally runnable for development and deployable as a product surface. At the same time, it must remain a thin app: reusable logic belongs in packages.

## Problem

Without a dedicated app, reports remain CLI artifacts. Without strict boundaries, the app may become the checker engine, making the product hard to reuse from CI or future integrations.

## Decision

Create `apps/check-warpgogol-com` via `onboarding.scaffold`.

The app is an operator/report UI. It consumes check artifacts and package APIs. It does not crawl sites, run Playwright, define diagnostics, or own prompt logic.

## Architectural fit

- RFC-0029 requires new apps to be scaffolded, never copied.
- RFC-0047 keeps apps thin and content-driven.
- RFC-0296 separates runner execution from the operator app.
- RFC-0297 defines the report/action-pack artifacts the app renders.

## Design

### App Responsibilities

The app provides:

- target entry form for local/dev mode;
- report import and run history view;
- report detail page;
- page/section diagnostics view;
- before/after comparison view;
- action-pack view for AI agents and humans;
- product pages explaining the checker.

### Non-Responsibilities

The app must not:

- import Playwright;
- define check rule ids;
- call LLM providers directly;
- parse arbitrary websites directly;
- store secrets in content files;
- mutate reports by hand.

### Local Mode

Local development may run:

```sh
pnpm exec werkstatt run check.run --url https://alt.example.invalid --out .check-warpgogol/runs/demo
pnpm --filter check-warpgogol-com dev
```

The app reads local `.check-warpgogol/runs/**` through a dev-only adapter. Production builds must not depend on local filesystem artifacts.

### Deployed Mode

The first deployed version may be report-first:

- static product pages;
- uploaded or committed sample report artifacts for demos;
- no live remote check execution.

A future RFC may add a remote runner queue and persistent storage. This RFC deliberately does not.

### Validation Command

`check-warpgogol.app.validate` verifies:

- the app exists and follows RFC-0047 surface rules;
- it does not import runner-only packages;
- report UI imports schemas from `@gogol/check-core`;
- sample reports validate against current schemas.

## Rollout

1. Scaffold `apps/check-warpgogol-com` through onboarding.
2. Add package dependencies on `@gogol/check-core` only.
3. Build initial report UI from fixture artifacts.
4. Add local dev adapter for `.check-warpgogol/runs`.
5. Add app-specific validation command.
6. Deploy the operator app only after local fixture reports render cleanly.

## Alternatives considered

- **No app; CLI only.** Rejected: product needs a human-facing surface.
- **Put the runner in the app.** Rejected by RFC-0296.
- **Build outside apps/\*.** Rejected: dogfooding the ecosystem matters.

## Risks

- **App grows into product backend.** Mitigated by validation forbidding runner imports and rule definitions.
- **Local dev and deployed mode diverge.** Mitigated by rendering the same report schema in both modes.
- **Premature storage design.** Mitigated by artifact-first MVP.

## Acceptance criteria

- [x] `apps/check-warpgogol-com` exists and was created by onboarding, not copying. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] The app passes `apps-check.run --app check-warpgogol-com`. (evidence: implemented historically)
- [x] The app renders a fixture `CheckReport` and `AgentActionPack`. (evidence: implemented historically)
- [x] The app does not depend on `@gogol/check-runner-node`. (evidence: packages/ directory, package exists)
- [x] `check-warpgogol.app.validate` is registered and passes. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Use onboarding workflow; never copy `apps/warpgogol-com`.
- Keep the first screen useful: a checker/report operator interface, not a generic marketing landing page.
- Store product copy in content domains like any other WGogol app.
