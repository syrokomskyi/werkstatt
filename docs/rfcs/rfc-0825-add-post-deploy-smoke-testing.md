---
id: RFC-0825
title: "Add post-deploy smoke testing"
status: draft
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-13
updatedAt: 2026-08-13
enhancedAt: 2026-08-13
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-66
  - RFC-0806
  - RFC-0823
satisfies:
  - DNA-66
versionBump: patch
commands:
  proposed:
    - site.smoke.run
    - service.smoke.run
  added:
    - site.smoke.run
    - service.smoke.run
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "site.smoke.run and service.smoke.run commands registered"
  - "Smoke test YAML format defined and documented"
  - "leitstand.dev-deploy runs smoke tests after health check"
  - "Smoke test evidence recorded in deployment state"
nonGoals:
  - "Does not test functional flows — that is L4 E2E (RFC-0828)"
  - "Does not test external API integration — that is L2 (RFC-0826)"
  - "Does not add smoke tests to CI — smoke tests require a deployed target"
batch: testing-architecture
dependsOn:
  - RFC-0823
---

# RFC-0825: Add post-deploy smoke testing

## Context

After every `leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`, `leitstand.service.dev-deploy`, and `leitstand.service.promote`, the pipeline runs a single health check against the deployed URL. This health check verifies that the Worker/site responds with HTTP 200 on its `healthCheckPath`. However:

- Only one endpoint is checked (`healthCheckPath`).
- No critical user paths are verified (e.g. `/` returns 200, `/api/*` routes respond).
- No structured evidence is recorded — the health check result is logged but not persisted as test evidence.
- For sites, there is no post-deploy smoke check at all — only Axiom visual checks run on dev-deployed sites.

## Problem

A deployment can succeed (Worker is live, health endpoint returns 200) while critical paths are broken (home page 404, API routes misconfigured, static assets missing). The current health check is a single-point probe, not a coverage-oriented smoke test. DNA-66 requires L5 smoke testing as the minimum post-deploy verification layer.

## Decision

The workshop adds two commands:

1. **`service.smoke.run --service <id>`** — fetches a list of critical endpoints for a service and verifies each returns an acceptable status code.
2. **`site.smoke.run --site <id>`** — fetches a list of critical paths for a site and verifies each returns 200.

Smoke endpoint definitions are declarative YAML files in `packages/werkstatt-site/src/testing/smoke/`. The leitstand deployment commands call smoke tests automatically after health checks and record evidence.

## Architectural fit

- **DNA-66 (testing pyramid):** This RFC implements the L5 layer.
- **RFC-0806 (service dev channel):** Smoke tests run against the dev channel URL for services after dev-deploy, and against the alt/main URL after propagate/promote.
- **Existing health check:** The existing `runHealthCheck` function in `packages/werkstatt/src/leitstand/service-deploy-helpers.ts` is a single-endpoint smoke test. This RFC generalizes it to multi-endpoint.

## Design

### CLI surface

```sh
pnpm exec werkstatt run service.smoke.run --service lagebild-sync
pnpm exec werkstatt run service.smoke.run --service lagebild-sync --json
pnpm exec werkstatt run site.smoke.run --site warpgogol-com
pnpm exec werkstatt run site.smoke.run --site warpgogol-com --json
```

### Smoke test YAML format

```yaml
# packages/werkstatt-site/src/testing/smoke/service-smoke.yaml
services:
  lagebild-sync:
    endpoints:
      - path: /health
        method: GET
        expectStatus: 200
        expectBodyContains: '"status":"ok"'
        timeoutMs: 5000
  matomo-proxy:
    endpoints:
      - path: /_wg/analytics/health
        expectStatus: 200
        timeoutMs: 5000
  rate-fetcher:
    endpoints:
      - path: /health
        expectStatus: 200
        timeoutMs: 5000
  telegram-alert-bridge:
    endpoints:
      - path: /health
        expectStatus: 200
        timeoutMs: 5000
  maturity-score:
    endpoints:
      - path: /health
        expectStatus: 200
        timeoutMs: 5000
```

```yaml
# packages/werkstatt-site/src/testing/smoke/site-smoke.yaml
sites:
  warpgogol-com:
    paths:
      - path: /
        expectStatus: 200
        timeoutMs: 10000
      - path: /de
        expectStatus: 200
        timeoutMs: 10000
      - path: /de/kontakt
        expectStatus: 200
        timeoutMs: 10000
      - path: /api/send-message
        method: POST
        contentType: application/x-www-form-urlencoded
        body:
          formId: smoke-test
          message: "smoke test"
        expectStatus: 200
        expectBodyContains: '"ok"'
        timeoutMs: 10000
      - path: /robots.txt
        expectStatus: 200
        timeoutMs: 5000
      - path: /sitemap.xml
        expectStatus: 200
        timeoutMs: 5000
```

### TypeScript contracts

```ts
interface SmokeEndpoint {
  path: string;
  method?: "GET" | "POST" | "HEAD";
  body?: Record<string, unknown>;
  contentType?: string;         — default: application/json
  expectStatus: number;
  expectBodyContains?: string;
  timeoutMs: number;
}

interface SmokeRunInput {
  service?: string;
  site?: string;
  url?: string;         — override URL (default: resolve from registry)
  json?: boolean;
}

interface SmokeRunResult {
  command: "service.smoke.run" | "site.smoke.run";
  status: "pass" | "fail";
  targetId: string;
  url: string;
  checks: SmokeCheckResult[];
  durationMs: number;
}

interface SmokeEvidence {
  smokeResult: SmokeRunResult;
  recordedAt: string;           — ISO 8601
}

interface SmokeCheckResult {
  path: string;
  method: string;
  status: number | null;
  passed: boolean;
  error?: string;
  durationMs: number;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/testing/smoke/service-smoke.yaml` | Service smoke endpoint definitions |
| `packages/werkstatt-site/src/testing/smoke/site-smoke.yaml` | Site smoke endpoint definitions |
| `packages/werkstatt-site/src/testing/smoke/smoke-runner.ts` | Shared smoke test runner (fetch + verify) |
| `packages/werkstatt/src/leitstand/service-dev-deploy.ts` | Calls `service.smoke.run` after health check |
| `packages/werkstatt/src/leitstand/service-promote.ts` | Calls `service.smoke.run` after health check |
| `packages/werkstatt/src/leitstand/leitstand-commands.ts` | Calls `site.smoke.run` after Axiom in dev-deploy |

### Evidence storage

**Services:** The `ServiceDevDeployData` and `ServicePromoteData` interfaces in `packages/werkstatt/src/leitstand/service-deploy-helpers.ts` are extended with an optional `smokeResult?: SmokeRunResult` field. The smoke result is recorded alongside the existing `healthState` field in the deployment state.

**Sites:** The dev-deploy state and release state objects are extended with an optional `smokeResult?: SmokeRunResult` field. The smoke result is persisted in the same JSON state file that records the deployment outcome.

**Registry:** `services/registry.yaml` `lastDevDeployed` and `lastDeployed` entries include a `smokeStatus: pass | fail | skipped` field for quick status visibility without reading the full deployment state.

### Pipeline integration

**`leitstand.service.dev-deploy`:** After `runHealthCheck` succeeds, call `service.smoke.run --service <id> --url <devUrl>`. Record smoke result in dev-deploy state. Smoke failure is a warning (not fatal) for dev-deploy — the operator can investigate.

**`leitstand.service.promote`:** After `runHealthCheck` succeeds, call `service.smoke.run --service <id> --url <prodUrl>`. Smoke failure is fatal — blocks promotion.

**`leitstand.dev-deploy` (sites):** After Axiom checks complete (which include freshness verification), call `site.smoke.run --site <id> --url <devUrl>`. Smoke failure is a warning for dev-deploy.

**`leitstand.propagate` (sites):** After deploy and CDN freshness verification, call `site.smoke.run --site <id> --url <altUrl>`. Smoke failure is fatal — blocks propagation.

**`leitstand.promote` (sites):** After deploy and CDN freshness verification, call `site.smoke.run --site <id> --url <mainUrl>`. Smoke failure is fatal — blocks promotion.

### Compass and AGENTS.md synchronization

- **`docs/verification-plan.xml`:** Add smoke test verification step to the deployment verification section.
- **`services/AGENTS.md`:** Document the `service.smoke.run` command and the smoke YAML format in the service deploy contract section.
- **`packages/werkstatt-site/AGENTS.md`:** Document the `testing/smoke/` directory and its role in the testing pyramid.

### Output format

```json
{
  "command": "service.smoke.run",
  "status": "pass",
  "targetId": "lagebild-sync",
  "url": "https://lagebild-sync-dev.syrokomskyi.workers.dev",
  "checks": [
    {
      "path": "/health",
      "method": "GET",
      "status": 200,
      "passed": true,
      "durationMs": 340
    }
  ],
  "durationMs": 380
}
```

### Failure modes

- **Endpoint returns wrong status:** `passed: false`, `error: "expected 200, got 404"`.
- **Endpoint unreachable:** `passed: false`, `error: "fetch failed: ECONNREFUSED"`, `status: null`.
- **Timeout:** `passed: false`, `error: "timeout after 5000ms"`, `status: null`.
- **Body mismatch:** `passed: false`, `error: "expected body to contain '\"status\":\"ok\"' but got '...'"`
- **YAML parse error:** Command exits with error, no checks run.
- **Service/site not in YAML:** Command exits with error "no smoke configuration found for <id>".
- **Smoke YAML file missing:** Direct CLI invocation exits with error "smoke configuration file not found at <path>". Pipeline integration (leitstand commands) logs a warning and skips smoke tests — this allows gradual adoption during the transition period when not all services/sites have smoke configs.

## Rollout

- **Default behavior:** Smoke tests run automatically after every deploy. Dev-deploy smoke failures are warnings; propagate/promote smoke failures are fatal.
- **Existing services:** All services get at least their `healthCheckPath` as a smoke endpoint. The initial `service-smoke.yaml` is seeded from `services/registry.yaml` `healthCheckPath` values.
- **Existing sites:** `site-smoke.yaml` starts with critical paths: `/`, `/<lang>`, `/<lang>/kontakt`, `/robots.txt`, `/sitemap.xml`, and key API routes.
- **New services/sites:** Smoke YAML entries are added when the service/site is created. `service.naming.validate` or a new validator checks that a smoke entry exists.

## Alternatives considered

- **Inline smoke paths in `services/registry.yaml`:** Rejected. Registry is deployment state, not test configuration. Mixing the two makes the registry bloated.
- **Programmatic smoke definitions (TypeScript):** Rejected. YAML is declarative and can be validated without executing code. Operators can edit smoke endpoints without touching code.
- **Use Axiom for smoke testing:** Rejected. Axiom is a visual/SEO check system with Playwright. Smoke tests are lightweight HTTP fetches — using Playwright for them adds unnecessary overhead.

## Risks

- **False positives from CDN propagation delays:** After deploy, the CDN may still serve the old version. Mitigated by the existing `verifyFreshness` retry loop in leitstand — smoke tests run after freshness is confirmed.
- **Smoke tests that mutate data:** The `POST /api/send-message` smoke test sends a test message. Mitigated by using `formId: smoke-test` which the integration handler can recognize and discard.
- **Smoke YAML drift:** If a service adds a new critical endpoint but doesn't update the smoke YAML, the endpoint is not tested. Mitigated by a validator (future RFC) that checks smoke YAML coverage.

## Acceptance criteria

- [ ] `service.smoke.run` command registered and functional
- [ ] `site.smoke.run` command registered and functional
- [ ] `service-smoke.yaml` created with entries for all existing services
- [ ] `site-smoke.yaml` created with entries for warpgogol-com
- [ ] `leitstand.service.dev-deploy` calls `service.smoke.run` after health check
- [ ] `leitstand.service.promote` calls `service.smoke.run` and blocks on failure
- [ ] `leitstand.dev-deploy` calls `site.smoke.run` after Axiom
- [ ] `leitstand.propagate` calls `site.smoke.run` and blocks on failure
- [ ] `leitstand.promote` calls `site.smoke.run` and blocks on failure
- [ ] Smoke evidence recorded in deployment state (`smokeResult` field in `ServiceDevDeployData`/`ServicePromoteData` and site deploy state)
- [ ] Unit tests for `smoke-runner.ts` covering status-code matching, body-contains logic, timeout handling, and missing-YAML-file behavior
- [ ] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Implementation should start with the smoke runner (`smoke-runner.ts`), then the YAML format, then the commands, then pipeline integration.
- The smoke runner should use `fetch` (available in Node 22+) — no external HTTP library needed.
- Smoke tests must be fast: each endpoint check should complete in < 5s. Total smoke run should be < 30s.
