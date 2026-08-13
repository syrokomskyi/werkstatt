---
id: RFC-0826
title: "Add service integration testing against dev channel"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
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
  - RFC-0824
  - RFC-0825
satisfies:
  - DNA-66
versionBump: patch
commands:
  proposed:
    - service.integration.run
  added:
    - service.integration.run
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "service.integration.run command registered"
  - "Integration tests for lagebild-sync health endpoint pass against dev channel"
  - "Integration test evidence recorded in deployment state"
nonGoals:
  - "Does not test site-to-service flows — that is L3 contract (RFC-0827) and L4 E2E (RFC-0828)"
  - "Does not mock external services — tests use real external APIs with existing credentials"
  - "Does not add integration tests to CI — integration tests require a dev-deployed target"
  - "Does not introduce a separate .env.test file — integration tests reuse existing .env.dev credentials (RFC-0806) to avoid duplication"
  - "Does not test QStash callback delivery on lagebild-sync — that service is a scheduled worker with no HTTP callback endpoint; QStash callbacks are received by site API routes, not by this service"
batch: testing-architecture
dependsOn:
  - RFC-0823
  - RFC-0824
  - RFC-0825
---

# RFC-0826: Add service integration testing against dev channel

## Context

Services integrate with external APIs: Supabase for data storage, ECB for exchange rates, Telegram for alerts. These integrations are currently tested only manually. The QStash `bad-signature` debugging session (2026-08-13) is a direct example: verifying that a QStash callback reaches the site API route and passes signature verification took an hour of manual work with localtunnel, curl, and log inspection. Note: QStash callbacks are received by site API routes (`packages/werkstatt-site/src/domain/ui/integration-routes/integration-inbound.api.ts`), not by service Workers — service integration tests cover service-specific external API calls (Supabase, ECB, Telegram), not site-to-service QStash flows (those are L3 contract testing, RFC-0827).

L1 unit tests (RFC-0824) test service logic in isolation, but cannot verify that the service correctly interacts with external APIs when deployed. The gap between "unit test passes" and "integration works in production" is where most production issues occur.

## Problem

There is no automated way to verify that a service correctly:

1. Writes to external data stores (Supabase, R2)
2. Fetches from external APIs (ECB, Telegram)
3. Handles authentication/signature verification with real credentials
4. Responds correctly on its health and API endpoints when deployed

DNA-66 requires L2 integration testing against the dev channel. Without it, integration bugs are caught only in production.

## Decision

The workshop adds:

1. **New command `service.integration.run --service <id>`** — runs integration tests for a service against its dev-deployed Worker URL.
2. **Integration test files** in `packages/werkstatt-site/src/testing/integration/services/<service-id>/` — vitest tests that use `fetch` to call the dev-deployed Worker and verify responses.
3. **Reuse `.env.dev` credentials** — integration tests read environment variables from the existing `.env.dev` file (RFC-0806) in the service workspace. No separate `.env.test` file is introduced; `.env.dev` already contains the dev credentials needed for integration testing.
4. **`leitstand.service.dev-deploy` integration** — after smoke tests pass (RFC-0825), `service.integration.run` is called. Integration test failure is a warning on dev-deploy (not fatal) — the operator investigates.

## Architectural fit

- **DNA-66 (testing pyramid):** This RFC implements the L2 layer.
- **RFC-0806 (service dev channel):** The dev channel (`*.workers.dev` URL) is the test environment. Integration tests target this URL.
- **RFC-0824 (L1 unit):** Integration tests build on unit tests — unit tests verify logic, integration tests verify the deployed service end-to-end.
- **RFC-0825 (L5 smoke):** Integration tests run after smoke tests in the `leitstand.service.dev-deploy` pipeline. The pipeline integration acceptance criterion depends on RFC-0825 being implemented.
- **No mocks (operator directive):** Tests use real external APIs with existing credentials. This catches real integration issues (URL construction, signature verification, credential rotation) that mock-based tests miss.

## Design

### CLI surface

```sh
pnpm exec werkstatt run service.integration.run --service lagebild-sync
pnpm exec werkstatt run service.integration.run --service lagebild-sync --json
pnpm exec werkstatt run service.integration.run --service lagebild-sync --url https://lagebild-sync-dev.syrokomskyi.workers.dev
```

### Test file structure

```
packages/werkstatt-site/src/testing/integration/services/
  lagebild-sync/
    health.test.ts              — verify /health responds with correct schema
  matomo-proxy/
    health.test.ts              — verify /_wg/analytics/health
    proxy.test.ts               — verify proxy forwards to Matomo correctly
  rate-fetcher/
    health.test.ts              — verify /health
    rate-fetch.test.ts          — trigger cron → verify rates written to Supabase
  telegram-alert-bridge/
    health.test.ts              — verify /health
  maturity-score/
    health.test.ts              — verify /health
    score.test.ts               — POST /score → verify response schema
```

### Integration test pattern

```ts
// packages/werkstatt-site/src/testing/integration/services/lagebild-sync/health.test.ts
import { describe, it, expect } from "vitest";
import { resolveDevUrl } from "../../helpers/dev-url-resolver.ts";
import { loadTestEnv } from "../../helpers/test-env.ts";

describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)("lagebild-sync health integration", () => {
  const url = resolveDevUrl("lagebild-sync");
  const env = loadTestEnv("lagebild-sync");

  it("/health returns ok with correct schema", async () => {
    const response = await fetch(`${url}/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("lagebild-sync");
  }, 30_000);

  it("/health is reachable with dev credentials", async () => {
    // Verify the dev Worker is deployed and responding
    expect(env.SUPABASE_URL).toBeDefined();
    const response = await fetch(`${url}/health`);
    expect(response.ok).toBe(true);
  }, 30_000);
});
```

### `.env.dev` reuse convention

Integration tests read credentials from the existing `.env.dev` file (RFC-0806) in each service workspace. No separate `.env.test` file is introduced — `.env.dev` already contains the dev credentials needed for integration testing, and introducing a parallel file with identical values creates unnecessary duplication.

```
# services/lagebild-sync/.env.dev (existing, gitignored)
# Already contains dev credentials per RFC-0806:
SUPABASE_URL=<existing dev URL>
SUPABASE_SERVICE_KEY=<existing dev key>
WARPGOGOL_OTLP_ENDPOINT=<existing dev endpoint>
WARPGOGOL_OTLP_TOKEN=<existing dev token>
```

The `loadTestEnv` helper reads from `<service-dir>/.env.dev`. This file is already gitignored per RFC-0806.

### TypeScript contracts

```ts
interface ServiceIntegrationRunInput {
  service: string;
  url?: string;         — override URL (default: resolve from registry)
  json?: boolean;
  timeout?: number;     — per-test timeout in ms (default: 60000)
  globalTimeout?: number; — global run timeout in ms (default: 180000 = 3 min)
}

interface ServiceIntegrationRunResult {
  command: "service.integration.run";
  status: "pass" | "fail";
  service: string;
  url: string;
  testFiles: number;
  testsPassed: number;
  testsFailed: number;
  durationMs: number;
  failures?: {
    testName: string;
    message: string;
    file: string;
  }[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/testing/integration/services/<id>/*.test.ts` | Integration test files |
| `packages/werkstatt-site/src/testing/helpers/dev-url-resolver.ts` | Created by RFC-0823; consumed by this RFC to resolve dev URLs from `services/registry.yaml` |
| `packages/werkstatt-site/src/testing/helpers/test-env.ts` | Created by RFC-0823; consumed by this RFC to load `.env.dev` for a service |
| `packages/werkstatt/src/leitstand/service-dev-deploy.ts` | Calls `service.integration.run` after smoke tests (RFC-0825) |
| `services/AGENTS.md` | Updated with integration test requirement and `.env.dev` reuse convention |

### Compass sync

This RFC does not modify repository-wide requirements, shared package contracts, or app-package relationships. No `docs/*.xml` synchronization is needed.

### Pipeline integration

**`leitstand.service.dev-deploy`:** After `service.smoke.run` passes, call `service.integration.run --service <id> --url <devUrl>`. Integration test failure is a warning (not fatal) for dev-deploy. Record integration test evidence in dev-deploy state.

**`leitstand.service.promote`:** Does NOT run integration tests (promote targets production URL, and we don't want to mutate production data). Instead, `leitstand.service.promote` verifies that integration test evidence from the most recent dev-deploy exists and passed (enforced by RFC-0829, not yet created — see RFC-0823 downstream table).

### Output format

```json
{
  "command": "service.integration.run",
  "status": "pass",
  "service": "lagebild-sync",
  "url": "https://lagebild-sync-dev.syrokomskyi.workers.dev",
  "testFiles": 3,
  "testsPassed": 8,
  "testsFailed": 0,
  "durationMs": 45000
}
```

### Failure modes

- **No test files found:** Warning (not error). Allows incremental adoption.
- **No `.env.dev` file:** Error. Integration tests need credentials. Services without env vars (e.g. `maturity-score` stub) are exempt.
- **External API unreachable:** Test fails with timeout error. This is a real issue — the service depends on the external API.
- **Dev Worker unreachable:** `wait-for-deploy` helper retries for 30s, then test fails with connection error.
- **Test timeout:** Per-test timeout default 60s. Global run timeout default 180s (3 min) — if all tests combined exceed this, the run is aborted with a timeout error.
- **`RUN_INTEGRATION_TESTS` not set:** Tests are skipped via `describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)`. The `service.integration.run` command sets this env var when executing.

## Rollout

- **Default behavior:** `service.integration.run` is available immediately. `leitstand.service.dev-deploy` calls it after smoke tests (RFC-0825).
- **Initial tests:** Start with `lagebild-sync` (health endpoint) — this is the service we manually tested during the QStash debugging session.
- **Other services:** Add integration tests incrementally. Each service gets at least a health integration test.
- **Credentials:** Integration tests reuse existing `.env.dev` files (RFC-0806). No new credential files are created.

## Alternatives considered

- **Mock QStash/Supabase:** Rejected by operator directive. Use existing credentials.
- **Miniflare/local Worker for integration tests:** Rejected. Dev-deployed Workers are the real environment. Local simulators miss CDN, DNS, and Cloudflare runtime differences.
- **Integration tests in CI:** Rejected for now. Integration tests require a dev-deployed target, which CI doesn't have. Future: a CI job that dev-deploys, runs integration tests, then tears down.

## Risks

- **Test data mutation:** Integration tests that write to Supabase mutate the dev environment. Mitigated by using test-specific identifiers and cleaning up test data where possible.
- **External API rate limits:** Running integration tests frequently may hit Supabase or ECB rate limits. Mitigated by keeping tests minimal and using reasonable timeouts.
- **Flaky tests:** External APIs can have transient failures. Mitigated by retry logic in tests for known-flaky operations.
- **Credential leakage:** `.env.dev` contains real credentials. Already gitignored per RFC-0806. Integration tests do not log env values.

## Acceptance criteria

- [x] `service.integration.run` command registered and functional
- [x] `dev-url-resolver.ts` helper resolves dev URLs from `services/registry.yaml` (created by RFC-0823)
- [x] `test-env.ts` helper loads `.env.dev` files (created by RFC-0823)
- [x] Integration tests for `lagebild-sync` (health) pass against dev channel
- [x] Integration tests for `matomo-proxy` (health, proxy) pass against dev channel
- [x] `leitstand.service.dev-deploy` calls `service.integration.run` after smoke tests (requires RFC-0825)
- [x] Integration test evidence recorded in dev-deploy state
- [x] `services/AGENTS.md` updated with integration test requirement and `.env.dev` reuse convention
- [x] `rfc.validate` passes on this file

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Implementation should start with the `service.integration.run` command (helpers `dev-url-resolver.ts` and `test-env.ts` are created by RFC-0823), then lagebild-sync tests, then pipeline integration.
- Integration tests use `vitest` — the same runner as unit tests. The difference is that integration tests make real HTTP requests to dev-deployed Workers.
- Integration tests should be tagged with `describe.skipIf(!process.env.RUN_INTEGRATION_TESTS)` to allow skipping in environments without dev access. The `service.integration.run` command sets `RUN_INTEGRATION_TESTS=1` when executing.
- **Operator prerequisite:** Integration tests require a dev-deployed target and existing `.env.dev` credentials. The agent can implement the command, helpers, and test files, but cannot run integration tests without operator-provided credentials and a dev-deployed Worker.
