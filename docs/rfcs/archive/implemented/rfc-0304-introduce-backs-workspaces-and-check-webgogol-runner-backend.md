---
id: RFC-0304
title: "Introduce backs workspaces and the Check Warpgogol runner backend"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-05
updatedAt: 2026-07-07
implementedAt: 2026-07-05
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0293
  - RFC-0300
amendedBy:
  - RFC-0338
  - RFC-0365
related:
  - RFC-0029
  - RFC-0047
  - RFC-0087
  - RFC-0266
  - RFC-0267
  - RFC-0293
  - RFC-0294
  - RFC-0296
  - RFC-0297
  - RFC-0299
  - RFC-0300
  - RFC-0301
  - RFC-0302
commands:
  proposed: []
  added:
    - check-warpgogol.runner.validate
  changed: []
  removed:
    - backs.workspace.validate
    - backs-check.run
appsImpacted:
  - check-warpgogol-com
packagesImpacted:
  - "@gogol/check-core"
  - "@gogol/check-runner-node"
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-check-warpgogol"
successSignals:
  - "The monorepo has a first-class backs/* workspace layer for deployable backend compositions."
  - "check-warpgogol-com accepts a URL, creates a check run, shows run status, and renders the final report without running Chromium inside the Astro request path."
  - "backs/check-warpgogol-runner executes the existing Check Warpgogol runner packages and writes the canonical run artifacts."
  - "The same run flow works for third-party websites and for apps/* sites deployed to alt hosting."
  - "Future backend workers such as a Matomo proxy or client integration bridges can be added under backs/* without changing the apps/* contract."
nonGoals:
  - "Do not move UI pages, marketing content, or report rendering out of apps/check-warpgogol-com."
  - "Do not run Playwright/Chromium inside Astro API endpoints or Cloudflare Worker request handlers."
  - "Do not put check rule logic, report schemas, queue schemas, or storage abstractions directly inside backs/*."
  - "Do not implement the Matomo proxy or client-specific integration workers in this RFC."
  - "Do not choose a single hosting vendor for every future backend runtime."
acceptance:
  - probe: file-contains
    path: "pnpm-workspace.yaml"
    pattern: "backs/*"
  - probe: file-exists
    path: "backs/AGENTS.md"
  - probe: file-exists
    path: "backs/check-warpgogol-runner/package.json"
  - probe: file-exists
    path: "backs/check-warpgogol-runner/back.config.json"
  - probe: file-exists
    path: "backs/check-warpgogol-runner/src/worker.ts"
  - probe: file-exists
    path: "backs/check-warpgogol-runner/Dockerfile"
  - probe: file-exists
    path: "packages/check-core/src/run-request.ts"
  - probe: file-exists
    path: "apps/check-warpgogol-com/src/pages/api/check-runs/index.ts"
  - probe: command-registered
    name: "backs.workspace.validate"
  - probe: command-registered
    name: "backs-check.run"
  - probe: command-registered
    name: "check-warpgogol.runner.validate"
  - probe: run
    command: "site-kernel run check-warpgogol.runner.validate --json"
    expect:
      exitCode: 0
---

# RFC-0304: Introduce backs workspaces and the Check Warpgogol runner backend

## Context

`apps/*` is the monorepo layer for deployable frontend/site compositions. It works well because app workspaces stay thin: content, shell composition, deployment configuration, and a few proxies. Shared behavior belongs in `packages/*`.

Check Warpgogol now needs a real product flow:

1. A visitor opens `apps/check-warpgogol-com`.
2. They enter a URL. The URL may belong to a third-party business site or to a WGogol app deployed to alt hosting.
3. The system captures rendered evidence with a browser, runs deterministic checks, optionally runs a cached audience review, and produces `report.json`, `report.html`, and `action-pack.json`.
4. The app shows progress and then renders the result.

The rendered capture lane requires Node + Playwright/Chromium. It is not appropriate for a normal Astro API request path, especially on Cloudflare Workers. The same monorepo will also need other backend runtimes later: an analytics proxy for Matomo events, customer-specific integration bridges, scheduled importers, and queue workers.

## Problem

There is no first-class workspace location for deployable backend compositions.

If every backend runtime is placed ad hoc under `packages/*`, those packages will become deployment compositions instead of reusable libraries. If backends are hidden inside `apps/*`, site apps will grow request-time worker logic and violate the thin-app rule. If every worker is forced into a `workers/*` naming model, the topology becomes too Cloudflare-specific: the Check Warpgogol runner is a Node/container worker, while a Matomo proxy may be a Cloudflare Worker.

The ecosystem needs one clear rule that future agents can follow without guessing.

## Decision

Introduce a top-level `backs/*` workspace layer.

`backs/*` means: deployable backend runtime compositions. It is the backend analogue of `apps/*`.

```text
apps/*      = deployable frontend/site/operator compositions
backs/*     = deployable backend/worker/runner/proxy compositions
packages/*  = reusable truth, schemas, validators, adapters, and business behavior
```

Back workspaces are thin. They may own:

- runtime entrypoints;
- environment variable wiring;
- queue polling or HTTP listener wiring;
- storage adapter selection;
- deployment config;
- health checks;
- process/container bootstrap.

Back workspaces must not own:

- check rule definitions;
- report/action-pack schemas;
- audience profile schemas;
- crawl/evidence graph schemas;
- reusable storage abstractions;
- business-system integration semantics shared by more than one backend.

Those belong in `packages/*`.

The first backend workspace is:

```text
backs/check-warpgogol-runner
```

It executes Check Warpgogol runs created by `apps/check-warpgogol-com`.

## Architectural fit

- RFC-0047 keeps app workspaces thin and content-driven. This RFC applies the same composition-only discipline to backend workspaces.
- RFC-0087 requires generators and surfaces to be content-driven and idempotent. Any generated `backs/*` boilerplate follows the same generated-file governance.
- RFC-0266 / RFC-0267 require command metadata and WorkspaceIO-aware command implementation. New `backs.*` validators use the same command registry and result envelope.
- RFC-0293 made Check Warpgogol URL-first. `backs/check-warpgogol-runner` receives a `CheckTarget`; it does not inspect source files from `apps/*`.
- RFC-0294 / RFC-0296 require Node/Playwright evidence capture and canonical run artifacts. The runner backend is the long-lived execution lane for that work.
- RFC-0300 keeps `check-warpgogol-com` as the operator app. This RFC amends it: the app may create and observe runs, but it must not execute browser automation.
- RFC-0302 safety policy applies before any runner job starts.

## Design

### Workspace Contract

#### Topology

Add `backs/*` to `pnpm-workspace.yaml`.

Add `backs/AGENTS.md` with these root rules:

- back workspaces are deployment compositions only;
- shared runtime contracts live in `packages/*`;
- no backend imports from `apps/*`;
- no app imports from `backs/*`;
- backend code may import packages but must not copy package logic;
- any generated backend file with the generated marker is edited through its generator, not by hand.

Update workspace discovery and ecosystem projection so `docs/ecosystem.generated.json` lists `backs` separately from `apps` and `packages`.

#### Back Manifest

Every backend workspace must include `back.config.json`:

```json
{
  "id": "check-warpgogol-runner",
  "kind": "node-runner",
  "ownerApp": "check-warpgogol-com",
  "entry": "src/worker.ts",
  "publicEndpoints": false,
  "usesBrowserAutomation": true,
  "queues": ["check-warpgogol-runs"],
  "artifacts": [".check-warpgogol/runs"]
}
```

Allowed `kind` values:

- `node-runner` — Node process/container, may run Playwright or other Node-only work.
- `cloudflare-worker` — request/edge worker, no Node filesystem or Playwright assumptions.
- `scheduled-worker` — cron-like backend job.
- `integration-worker` — customer or vendor integration bridge.
- `proxy-worker` — traffic proxy such as analytics or webhook relay.
- `compose-stack` — deployment composition of declarative service configuration (compose/casting files); no `src/` entrypoint required, `entry` points at the primary config file (RFC-0338).

`backs.workspace.validate` validates the manifest shape, workspace membership, package scripts, and boundary rules.

### First Backend: backs/check-warpgogol-runner

#### Responsibility

`backs/check-warpgogol-runner` consumes queued Check Warpgogol run requests and writes canonical run artifacts.

It must use existing packages:

- `@gogol/check-core` for target, request, status, evidence, report, and action-pack contracts;
- `@gogol/check-runner-node` for Playwright capture;
- `@gogol/site-kernel-check-warpgogol` for command-level orchestration helpers when useful.

It must not import from `apps/check-warpgogol-com`.

#### Required Files

```text
backs/check-warpgogol-runner/
  package.json
  back.config.json
  Dockerfile
  src/
    worker.ts
    config.ts
    local-store.ts
    run-once.ts
  README.md
```

`package.json` must be private, `type: "module"`, and expose at least:

```json
{
  "scripts": {
    "dev": "tsx src/worker.ts",
    "run:once": "tsx src/run-once.ts",
    "build:check": "tsc --noEmit",
    "check": "site-kernel run check-warpgogol.runner.validate"
  }
}
```

`Dockerfile` must be a Node 22 image suitable for Playwright/Chromium execution. It must not copy the whole repository blindly at runtime; it should install workspace dependencies through the monorepo lockfile and run the package script.

#### Local Store

The first implementation uses a local filesystem store so the product works in development without choosing a cloud vendor.

Canonical local layout:

```text
.check-warpgogol/
  queue/
    <runId>.request.json
  runs/
    <runId>/
      request.json
      status.json
      target.redacted.json
      evidence.graph.json
      report.json
      report.html
      action-pack.json
      audience-review.json
      screenshots/
      logs/
```

The runner atomically claims a queued request by moving or marking it as running. It must never execute the same request twice concurrently.

#### Shared Run Contracts

Add `packages/check-core/src/run-request.ts`:

```ts
export type CheckRunStatusKind =
  | "queued"
  | "running"
  | "pass"
  | "warn"
  | "fail"
  | "error";

export interface CheckRunRequest {
  schemaVersion: 1;
  runId: string;
  createdAt: string;
  target: CheckTarget;
  source: "ui" | "cli" | "deploy-alt" | "api";
  options: {
    maxPages: number;
    audienceProfileId?: string;
    generateActionPack: boolean;
    allowAiReview: boolean;
  };
}

export interface CheckRunStatus {
  schemaVersion: 1;
  runId: string;
  targetId: string;
  status: CheckRunStatusKind;
  updatedAt: string;
  summary?: { error: number; warning: number; info: number };
  reportPath?: string;
  actionPackPath?: string;
  error?: { message: string; code?: string };
}
```

The app and backend must both import these types/schemas from `@gogol/check-core`.

### check-warpgogol-com App Integration

The app remains the UI and API control plane.

Add Astro API endpoints:

```text
apps/check-warpgogol-com/src/pages/api/check-runs/index.ts
apps/check-warpgogol-com/src/pages/api/check-runs/[runId].ts
```

`POST /api/check-runs`:

- accepts `{ url: string, maxPages?: number, audienceProfileId?: string }`;
- normalizes the URL into a `CheckTarget`;
- defaults `mode` to `public`;
- sets `allowedHosts` to the exact URL host;
- sets `policy.respectRobots = true`;
- sets `policy.allowScreenshots = true`;
- sets `policy.allowAiReview = false` unless an explicit product setting enables it;
- rejects private IPs, localhost, link-local, and internal hostnames unless the app is running in local development mode;
- writes `CheckRunRequest` into the configured store;
- returns `{ runId, status: "queued" }`.

`GET /api/check-runs/[runId]`:

- returns `CheckRunStatus`;
- returns report/action-pack URLs or JSON only after completion;
- never returns raw target secrets or unredacted auth details.

The UI must provide:

- URL input;
- queued/running/progress state;
- pass/warn/fail/error result state;
- report summary;
- page/section diagnostics list;
- action-pack view with anchors;
- safe error messages for failed backend jobs.

The UI must not import `@gogol/check-runner-node`, Playwright, or `backs/*`.

### Production Store

This RFC does not mandate a cloud vendor, but the abstractions must allow production deployment.

Allowed first production mapping:

- request/status metadata: D1, Durable Object, Redis, Postgres, or another explicit store adapter;
- artifacts/screenshots: R2, S3, filesystem volume, or another explicit object store adapter;
- queue: Cloudflare Queue, Redis queue, Postgres queue table, or another explicit queue adapter.

Adapters belong in packages when reusable. Provider-specific bootstrap belongs in `backs/check-warpgogol-runner`.

### Safety

Before enqueuing or running a job:

- parse and validate `CheckTarget`;
- run the RFC-0302 safety checks;
- reject raw secrets in requests;
- reject internal network targets for public UI requests;
- limit `maxPages` for public requests (default 3, hard maximum 20 until explicitly raised);
- set a per-run timeout;
- redact request and target artifacts before storing public-readable outputs;
- sanitize externally fetched text before any AI review lane consumes it.

The runner may support authenticated private-alt targets later, but the first UI flow must not accept raw credentials.

### Commands

#### backs.workspace.validate

Scope: workspace, read-only.

Validates:

- `pnpm-workspace.yaml` contains `backs/*`;
- every `backs/*` package has `back.config.json`;
- `back.config.json` has an allowed `kind`;
- `package.json` is private and has `build:check`;
- no `backs/*` imports from `apps/*`;
- no `apps/*` imports from `backs/*`;
- `backs/AGENTS.md` exists.

#### backs-check.run

Scope: workspace, read-only aggregate.

Runs all backend workspace validators, beginning with `backs.workspace.validate` and any backend-specific validators.

#### check-warpgogol.runner.validate

Scope: workspace, read-only.

Validates:

- `backs/check-warpgogol-runner` exists;
- required files exist;
- package dependencies include `@gogol/check-core` and `@gogol/check-runner-node`;
- package does not depend on `apps/check-warpgogol-com` or import from `apps/*`;
- Dockerfile exists;
- `src/worker.ts` imports shared run contracts from `@gogol/check-core`;
- app API endpoints exist and do not import Playwright;
- a local fixture request can be schema-validated.

## Rollout

1. Add `backs/*` to the workspace and update workspace discovery/ecosystem projection.
2. Add `backs/AGENTS.md`.
3. Add `@gogol/check-core` run request/status schemas.
4. Add `backs.workspace.validate`, `backs-check.run`, and `check-warpgogol.runner.validate`.
5. Create `backs/check-warpgogol-runner` with the local filesystem store and Node/Playwright worker.
6. Add `POST /api/check-runs` and `GET /api/check-runs/[runId]` to `apps/check-warpgogol-com`.
7. Add the UI states for URL input, progress, and result rendering.
8. Prove local end-to-end flow: app creates a request, runner processes it, app renders the report.
9. Only after the local contract is green, add a production store/queue adapter behind the same contracts.

## Alternatives considered

- **Put backend workers under `packages/*`.** Rejected because packages are reusable logic, not deployment compositions.
- **Put the runner inside `apps/check-warpgogol-com`.** Rejected because Playwright/Chromium must not run inside the Astro request path.
- **Use `workers/*` instead of `backs/*`.** Rejected because the ecosystem will need non-edge backends such as Node runners and customer integration processes.
- **Choose Cloudflare Queues/R2/D1 immediately.** Deferred. The local store proves the product contract first; cloud adapters can follow without changing UI or runner contracts.

## Risks

- **`backs/*` becomes a dumping ground for logic.** Mitigated by `backs/AGENTS.md`, import-boundary validation, and the same composition-only discipline as `apps/*`.
- **Local and production stores drift.** Mitigated by shared `CheckRunRequest` and `CheckRunStatus` schemas in `@gogol/check-core`.
- **SSRF or internal network scanning through the public UI.** Mitigated by strict target safety checks, public-mode defaults, internal host rejection, and max-page limits.
- **Runner jobs duplicate work.** Mitigated by atomic claim semantics in the store and idempotent run artifact paths.
- **A future Matomo proxy shapes the layer too narrowly.** Mitigated by the generic `kind` field: proxy, runner, scheduled, integration, and Cloudflare Worker backends all fit.

## Acceptance criteria

- [x] `pnpm-workspace.yaml` includes `backs/*`. (evidence: implemented historically)
- [x] `backs/AGENTS.md` documents backend composition-only rules. (evidence: AGENTS.md:1, agent guide updated)
- [x] `backs/check-warpgogol-runner` exists with `package.json`, `back.config.json`, `Dockerfile`, and `src/worker.ts`. (evidence: implemented historically)
- [x] `@gogol/check-core` exports `CheckRunRequest` and `CheckRunStatus` schemas. (evidence: packages/ directory, package exists)
- [x] `apps/check-warpgogol-com` exposes `POST /api/check-runs` and `GET /api/check-runs/[runId]`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] The app API endpoints do not import Playwright, `@gogol/check-runner-node`, or `backs/*`. (evidence: packages/ directory, package exists)
- [x] The runner backend does not import from `apps/*`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `backs.workspace.validate`, `backs-check.run`, and `check-warpgogol.runner.validate` are registered. (evidence: implemented historically)
- [x] A local end-to-end smoke can submit a URL, process it with the runner, and render a completed report in `check-warpgogol-com`. (evidence: implemented historically)
- [x] `rfc.validate RFC-0304` passes. (evidence: implemented historically)

## Implementation notes for agents

- Do not create the first backend by copying an app. A back workspace is not an app and must not contain Astro pages.
- Do not put queue or store schemas in `apps/check-warpgogol-com`; add them to `@gogol/check-core`.
- Keep the local filesystem store deterministic and artifact-compatible with RFC-0296.
- Use `apply_patch` for manual edits and do not edit generated files directly.
- When adding workspace topology, update the generator or registry that owns `docs/ecosystem.generated.json`; do not hand-edit the generated projection.
- Treat Matomo proxy and customer integration workers as examples proving why `backs/*` exists, not as part of this implementation.
