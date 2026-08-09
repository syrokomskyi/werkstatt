---
id: RFC-0301
title: "Gate deploy:main on alt URL checks"
status: implemented
kind: command
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
  - RFC-0269
  - RFC-0293
  - RFC-0294
  - RFC-0297
  - RFC-0298
  - RFC-0299
  - RFC-0302
commands:
  proposed: []
  added:
    - check.deploy-alt.run
    - check.deploy-main.gate
  changed: []
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/site-kernel-check-warpgogol"
  - "@gogol/site-kernel-deploy"
successSignals:
  - "A WGogol app can deploy to alt, run URL-first checks against that alt URL, and block deploy:main on error diagnostics."
  - "AI audience findings are reported but do not block deploy:main unless the app explicitly opts into stricter policy."
  - "The deploy gate stores the report artifact path and summary so a human or agent can review failures."
nonGoals:
  - "Do not replace existing build.check, apps-check, app.contract.full, or behavior snapshot validation."
  - "Do not auto-deploy main after a passing check unless the existing deploy workflow already does so."
  - "Do not require third-party sites to use deploy gates."
acceptance:
  - probe: command-registered
    name: "check.deploy-alt.run"
  - probe: command-registered
    name: "check.deploy-main.gate"
---

# RFC-0301: Gate deploy:main on alt URL checks

## Context

WGogol already reviews sites on a closed alt host before main deployment. Check Warpgogol makes that review structured and repeatable. The gate should check the deployed URL, not the source tree, and should preserve the existing source/build validators.

## Problem

Without a formal gate:

- alt-host review remains manual and inconsistent;
- deploy-only failures may reach main;
- AI agents do not know which report blocked publication;
- subjective AI findings could accidentally block deploys before calibration.

## Decision

Add a deploy gate:

```sh
pnpm exec werkstatt run check.deploy-alt.run --app warpgogol-com --json
pnpm exec werkstatt run check.deploy-main.gate --app warpgogol-com --json
```

`check.deploy-alt.run` discovers or receives the alt URL, runs `check.run`, and writes a check report artifact.

`check.deploy-main.gate` reads the latest eligible alt check report and exits non-zero only for configured gate failures.

## Architectural fit

- Existing app validators remain source/build gates.
- RFC-0269 behavior snapshots catch public behavior drift in built output; this RFC catches deployed URL reality.
- RFC-0298 deterministic checks are the default deploy gate input.
- RFC-0299 AI audience checks are warning-only by default.

## Design

### Gate Policy

Each app may declare a check policy in `src/content/system.md`:

```yaml
checkWarpgogol:
  deployGate:
    enabled: true
    altUrlEnv: WEBGOGOL_ALT_URL
    failOn:
      deterministicErrors: true
      audienceWarnings: false
    requiredProfiles:
      - handwerk-owner-de
```

Absent config means the commands are available but not wired into deployment.

### Gate Inputs

`check.deploy-alt.run` resolves:

1. explicit `--url`;
2. `checkWarpgogol.deployGate.altUrlEnv`;
3. deploy module output metadata if available.

It writes artifacts under:

```txt
.check-warpgogol/deploy/<app>/<timestamp-or-git-sha>/
```

### Gate Rules

| Rule         | Severity | Meaning                                                            |
| ------------ | -------- | ------------------------------------------------------------------ |
| `CW-GATE-01` | error    | Deploy gate enabled but no alt URL resolved.                       |
| `CW-GATE-02` | error    | No eligible alt check report exists for the current build/git sha. |
| `CW-GATE-03` | error    | Deterministic error diagnostics present.                           |
| `CW-GATE-04` | warning  | Audience warnings present but not configured to block.             |
| `CW-GATE-05` | error    | Check report target URL does not match the configured alt URL.     |

### CI/Script Order

Recommended flow:

```txt
pnpm build
deploy:alt
check.deploy-alt.run
check.deploy-main.gate
deploy:main
```

The gate does not perform `deploy:main`; it only authorizes the next step.

## Rollout

1. Add schema for `checkWarpgogol.deployGate`.
2. Implement alt URL resolution and report writing.
3. Implement gate command and fixtures.
4. Add optional scripts to `warpgogol-com` for dogfood only.
5. Once stable, update deploy docs/templates so new apps can opt in.

## Alternatives considered

- **Run checks before deploy:alt.** Rejected: URL-first checks need the deployed target.
- **Block on AI warnings from day one.** Rejected: subjective findings need calibration.
- **Merge into existing deploy command.** Rejected: separate gate command is easier to run and debug.

## Risks

- **Alt URL unavailable in CI.** Mitigated by explicit `--url` and env var resolution.
- **Stale report used for gate.** Mitigated by build/git sha metadata and `CW-GATE-02`.
- **Slower deploys.** Mitigated by page budgets and deterministic-only gate mode.

## Acceptance criteria

- [x] `checkWarpgogol.deployGate` schema exists and is optional. (evidence: implemented historically)
- [x] `check.deploy-alt.run` runs `check.run` against a resolved alt URL and stores artifacts. (evidence: implemented historically)
- [x] `check.deploy-main.gate` fails on deterministic errors and stale/missing reports. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] AI audience warnings do not block by default. (evidence: implemented historically)
- [x] `warpgogol-com` can opt in without affecting other apps. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Do not remove or weaken existing source/build gates.
- Do not assume the alt URL format; resolve it through config/env.
- Always include the report path in failure summaries.
