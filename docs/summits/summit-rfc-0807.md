---
rfc: RFC-0807
createdAt: 2026-08-11
personas: [architect, security, qa, pm, dev-advocate]
consensusFindings: 2
uniqueFindings: 3
---

# Design Summit: RFC-0807

## Architect

- **A1 (concern):** `lagebild-sync` delegates to `createLagebildSharedSyncWorker` in `packages/werkstatt-site/src/domain/integration-adapter-supabase-crm/worker.ts`. The `LagebildSharedWorkerEnv` interface lives in the package, not the service. Adding OTLP env vars requires updating this package file too. Missing from RFC's file system table.
- **A2 (concern):** `matomo-proxy` fetch handler has no `env` parameter — `async fetch(request: Request)`. Adding OTLP push requires signature change to `async fetch(request: Request, env: Env)`.

## Security Engineer

- **S1 (concern):** Node services using internal `http://otel-collector:4318` need no token. If misconfigured to public endpoint without token, `createMetricsPusher` returns `null` silently. Safe but should be documented.

## QA Engineer

- **Q1 (concern):** "Metric visible in SigNoz UI" criterion requires running SigNoz. Plan should include unit tests verifying `createMetricsPusher` calls, not just UI queries.

## Product Manager

No concerns. Problem grounded, scope bounded, nonGoals explicit.

## Developer Advocate

- **D1 (concern):** Same as A1 — implementing agent would miss the package-level env interface for lagebild-sync.

## Consensus findings

- **A1 + D1:** `lagebild-sync` shared worker env interface in package needs updating. Add to file system table.
- **A2 + Q1:** `matomo-proxy` signature change + testability. Document signature change; add unit-testable evidence.

## Unique findings

- **S1:** Document Node internal endpoint no-token behavior as intentional.
- **A2:** `matomo-proxy` fetch handler signature change.
- **Q1:** Unit test strategy for metric push verification.

## Recommendation

Proceed to plan with minor revisions — add package-level env interface for lagebild-sync, document matomo-proxy signature change, add unit test strategy. No RFC revision needed; plan will capture these.

*No findings does not mean no issues — it means no issues were found from these five perspectives.*
