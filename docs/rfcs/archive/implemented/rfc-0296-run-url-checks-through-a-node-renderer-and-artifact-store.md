---
id: RFC-0296
title: "Run URL checks through a Node renderer and artifact store"
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
amendedBy: []
related:
  - RFC-0149
  - RFC-0179
  - RFC-0293
  - RFC-0294
  - RFC-0300
  - RFC-0301
commands:
  proposed: []
  added:
    - check.runner.info
    - check.artifact.validate
  changed: []
  removed: []
appsImpacted:
  - check-warpgogol-com
packagesImpacted:
  - "@gogol/check-runner-node"
  - "@gogol/site-kernel-check-warpgogol"
successSignals:
  - "Long-running browser checks execute in Node local, CI, or a dedicated runner context, never in a normal deployed site request."
  - "All run artifacts have a stable directory layout and can be loaded by the check-warpgogol-com app without re-running the crawl."
  - "The runner can operate locally first and later be replaced or supplemented by a remote runner without changing report schemas."
nonGoals:
  - "Do not introduce Cloudflare KV, Queues, or long-running Worker jobs for the MVP."
  - "Do not require a SaaS backend to run local checks."
  - "Do not define the operator UI; RFC-0300 owns the app."
acceptance:
  - probe: command-registered
    name: "check.runner.info"
  - probe: command-registered
    name: "check.artifact.validate"
  - probe: file-exists
    path: "packages/check-runner-node/src/index.ts"
---

# RFC-0296: Run URL checks through a Node renderer and artifact store

## Context

`check-warpgogol-com` should be deployable and locally runnable. But browser-based site evaluation requires capabilities that a normal Cloudflare Worker request path does not provide: Playwright, long timeouts, large screenshots, and multi-page crawling.

The architecture must therefore separate the **operator app** from the **check runner**.

## Problem

If the deployed app tries to execute checks directly:

- it will exceed request-time and runtime limits;
- it will lack a real browser environment;
- it will be hard to secure against arbitrary crawl abuse;
- reports will disappear unless a persistence layer is designed prematurely.

If the runner and artifact layout are not specified, each implementation will invent a different local/CI/deployed behavior.

## Decision

Introduce a Node runner and a stable artifact store contract.

The MVP execution modes are:

1. **Local CLI mode:** developer runs `check.run`; artifacts are written to `.check-warpgogol/runs/`.
2. **Local operator mode:** `apps/check-warpgogol-com` is run locally and reads local artifacts.
3. **CI gate mode:** CI runs `check.run` after `deploy:alt`; artifacts are uploaded as CI artifacts and the summary gates `deploy:main`.
4. **Deployed app mode:** the deployed app displays imported or published report artifacts. It does not run Playwright in the request path.

A future remote runner may consume the same target and artifact schemas.

## Architectural fit

- RFC-0149 keeps WGogol sites on Cloudflare Workers with static output and limited on-demand routes. This RFC avoids violating that runtime model.
- RFC-0179 budget discipline avoids one Worker per capability. The check runner is outside client sites and can be operated separately.
- RFC-0294 evidence graphs are the primary artifact the runner produces.
- RFC-0300 builds the operator app on top of this contract.

## Design

### Artifact Directory Layout

```txt
.check-warpgogol/
  runs/
    <runId>/
      run.json
      target.redacted.json
      evidence.graph.json
      report.json
      report.html
      action-pack.json
      screenshots/
        desktop/
        mobile/
      logs/
        capture.log.jsonl
        checks.log.jsonl
```

All files are gitignored. `run.json` contains the run metadata and hashes of every other artifact.

### Run Metadata

```ts
export interface CheckArtifactManifest {
  schemaVersion: "1.0.0";
  runId: string;
  targetId: string;
  createdAt: string;
  status: "pending" | "running" | "pass" | "warn" | "fail" | "error";
  artifacts: Array<{
    kind: "target" | "evidence" | "report" | "action-pack" | "screenshot" | "log";
    path: string;
    sha256: string;
    bytes: number;
  }>;
  summary?: {
    errors: number;
    warnings: number;
    info: number;
    score?: number;
  };
}
```

### Commands

```sh
pnpm exec site-kernel run check.runner.info --json
pnpm exec site-kernel run check.artifact.validate --run .check-warpgogol/runs/<runId> --json
```

`check.runner.info` prints browser availability, Playwright version, timeout defaults, supported viewport profiles, and whether AI review credentials are configured.

`check.artifact.validate` verifies:

- `run.json` schema;
- artifact file existence;
- hashes;
- secret redaction;
- report/evidence graph hash linkage.

### Validation Rules

| Rule | Severity | Meaning |
| --- | --- | --- |
| `CW-ART-01` | error | Run manifest schema invalid. |
| `CW-ART-02` | error | Listed artifact missing or hash mismatch. |
| `CW-ART-03` | error | Artifact contains raw auth or secret-like data. |
| `CW-ART-04` | warning | Runner environment lacks optional AI review capability. |
| `CW-ART-05` | error | Report references an evidence graph hash different from the captured graph. |

## Rollout

1. Implement artifact manifest types in `@gogol/check-core`.
2. Implement `@gogol/check-runner-node` entrypoints and `check.runner.info`.
3. Implement `check.artifact.validate` with red/green fixtures.
4. Make `check.run` write the standard layout.
5. Make `apps/check-warpgogol-com` read/import runs only through this manifest.

## Alternatives considered

- **Run checks inside the deployed app.** Rejected for MVP due to browser/runtime limits.
- **Immediately build a remote runner service.** Rejected: local and CI modes are enough to dogfood alt deployments, and the artifact contract preserves the upgrade path.
- **Store runs in app source.** Rejected: screenshots/reports are generated artifacts and often target-specific.

## Risks

- **Deployed app cannot launch checks at first.** Accepted. It can display imported reports; remote execution is a follow-up that keeps the same artifact schema.
- **Artifact directories grow large.** Mitigated by retention commands in a later RFC or by local cleanup; not part of MVP.
- **CI artifact UX is clunky.** Mitigated by generating `report.html` and concise JSON summaries.

## Acceptance criteria

- [x] `@gogol/check-runner-node` exists and reports its capabilities through `check.runner.info`. (evidence: packages/ directory, package exists)
- [x] Every run writes a `run.json` manifest with hashes. (evidence: implemented historically)
- [x] `check.artifact.validate` detects missing files, hash drift, and secret leaks. (evidence: implemented historically)
- [x] `check.run` uses the standard artifact layout. (evidence: implemented historically)
- [x] The operator app does not import Playwright. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Keep runner code out of `apps/check-warpgogol-com`.
- Do not introduce persistent cloud storage in this RFC.
- Use sorted JSON and SHA-256 hex for all artifact hashes.
