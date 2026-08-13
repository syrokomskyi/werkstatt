---
id: RFC-0823
title: "Establish workshop testing architecture"
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
  - DNA-41
  - DNA-64
  - RFC-0249
  - RFC-0251
  - RFC-0347
  - RFC-0806
satisfies:
  - DNA-41
  - DNA-64
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt-site"
successSignals:
  - "DNA-66 invariant present in docs/architecture-dna.md"
  - "Five testing levels (L1–L5) documented and referenced by downstream RFCs"
  - "Test file placement convention established in packages/werkstatt-site/src/testing/"
nonGoals:
  - "Does not implement individual test levels — each level has its own RFC (0824–0829)"
  - "Does not define test runner configuration — vitest is already the workshop runner"
  - "Does not modify existing package-level unit tests or PBT coverage"
  - "Does not define per-command CLI syntax, --json output format, or failure mode exit codes — these belong to downstream RFCs (0824–0829)"
batch: testing-architecture
dependsOn: []
---

# RFC-0823: Establish workshop testing architecture

## Context

The workshop currently has ~550+ unit tests in `packages/` (vitest, PBT per DNA-41) and a `test.signal.validate` command (RFC-0249) that enforces test posture for packages. However, the testing surface has critical gaps:

- **Services have zero tests.** No `services/*/package.json` has a `test` script. `test.signal.validate` only scans `packages/` — services are completely outside the test signal radar.
- **Sites have zero E2E or integration tests.** Axiom checks visual/SEO invariants on dev-deployed sites, but functional flows (forms, API routes, QStash callbacks, integration delivery) are tested only manually.
- **No contract testing.** Sites call services (QStash, Supabase, lagebild-sync) but API contracts are not validated automatically. The QStash `bad-signature` debugging session (2026-08-13) is a direct example: a URL mismatch between signing and verification took an hour of manual work to diagnose.
- **No test gates in the deployment pipeline.** Between `leitstand.dev-deploy` and `leitstand.propagate` (sites) or `leitstand.service.promote` (services), the only gate is manual operator verification. No automated test evidence is required to promote.

## Problem

The workshop can build and deploy complex sites and services, but cannot automatically verify that they work correctly after deployment. The current pipeline ensures structural correctness (validators, codegen, Axiom visual checks) but not functional correctness. Every integration point (form submission, QStash callback, Supabase write, rate fetcher cron) is a potential failure mode that is only caught in production.

DNA-41 establishes property-based testing for pure functions, but says nothing about integration, E2E, or post-deploy testing. There is no DNA invariant for the testing pyramid as a whole.

## Decision

The workshop establishes a five-level testing pyramid (DNA-66) that covers the full lifecycle from unit to post-deploy smoke:

| Level | What | Where tests live | When they run |
| --- | --- | --- | --- |
| L1 Unit | Pure functions, module internals | `packages/werkstatt-site/src/testing/unit/` | `build.check` pipeline, CI, pre-commit |
| L2 Integration | Service ↔ external API | `packages/werkstatt-site/src/testing/integration/` | CI, `service.dev-deploy` |
| L3 Contract | Site ↔ service API schemas | `packages/werkstatt-site/src/testing/contract/` | `build.check` pipeline, CI, pre-deploy gate |
| L4 E2E | Playwright user flows against dev site | `packages/werkstatt-site/src/testing/e2e/` | `leitstand.dev-deploy` |
| L5 Smoke | Health + critical path post-deploy | `packages/werkstatt-site/src/testing/smoke/` | After every deploy |

**All test definitions live in `packages/werkstatt-site/src/testing/`** — not in `services/*` or mission workpieces. This ensures tests are versioned with the platform, runnable against any deployment, and reusable across missions.

**The dev channel is the canonical test environment.** Tests execute against real deployed artifacts (dev-deployed Workers, dev-deployed sites), not mocks or local simulators. This catches environment-specific issues (URL construction, signature verification, CDN propagation) that mock-based tests miss.

**Deployment pipeline commands verify test evidence.** `leitstand.propagate` and `leitstand.promote` (sites) and `leitstand.service.promote` (services) check test evidence from prior pipeline stages and block promotion when evidence is missing or failed.

## Compass document synchronization

- `docs/technology.xml`: Extend `<testing-stack>` with L1–L5 testing pyramid levels and DNA-66 reference.
- `docs/requirements.xml`: Add testing pyramid requirements if the file tracks per-DNA-invariant requirements.
- Root `AGENTS.md`: Add testing architecture reference section.
- `packages/werkstatt-site/AGENTS.md`: Add testing directory convention and helper module documentation.

## Architectural fit

- **DNA-41 (PBT for pure functions):** This RFC extends the testing surface beyond pure functions to integration, contract, E2E, and smoke. L1 unit tests include the existing PBT tests.
- **DNA-64 (Engine/plugin boundary):** Test infrastructure lives in the site plugin (`@warpgogol/werkstatt-site`), not in the engine. The engine provides pipeline gate hooks that the plugin fills with test commands.
- **RFC-0249 (test signal):** Extended by RFC-0824 to cover `services/*`.
- **RFC-0806 (service dev channel):** The dev channel becomes the test environment for L2 integration tests.
- **Existing pipeline structure:** L4 and L5 tests integrate into the existing `leitstand.dev-deploy → leitstand.propagate → leitstand.promote` sequence as additional gates, not as separate steps.

## Design

### Test directory structure

```
packages/werkstatt-site/src/testing/
  unit/
    services/
      <service-id>/
        *.test.ts          — unit tests for service internals
  integration/
    services/
      <service-id>/
        *.test.ts          — integration tests against dev-deployed Worker
  contract/
    <contract-name>.contract.ts — Zod schemas for site-service API boundaries
    *.test.ts              — bidirectional contract validation tests
  e2e/
    *.test.ts              — Playwright tests against dev-deployed site
  smoke/
    site-smoke.yaml        — smoke endpoint definitions for sites
    service-smoke.yaml     — smoke endpoint definitions for services
  helpers/
    dev-url-resolver.ts    — resolves dev channel URLs from registry
    test-env.ts            — loads test environment variables
    wait-for-deploy.ts     — waits for Worker/site to be reachable
```

### Downstream RFCs

| RFC      | Level | Scope                                                     |
| -------- | ----- | --------------------------------------------------------- |
| RFC-0824 | L1    | Service unit test foundation, extend test.signal.validate |
| RFC-0825 | L5    | Post-deploy smoke testing, smoke test format              |
| RFC-0826 | L2    | Service integration testing against dev channel           |
| RFC-0827 | L3    | Site-service contract testing with Zod schemas            |
| RFC-0828 | L4    | Site E2E testing with Playwright against dev channel      |
| RFC-0829 | —     | Test evidence gates in deployment pipeline                |

### TypeScript contracts

```ts
interface TestLevel {
  level: "L1" | "L2" | "L3" | "L4" | "L5";
  name: string;
  runner: "vitest" | "playwright" | "fetch";
  environment: "local" | "dev-channel";
}

interface TestEvidence {
  testRunId: string;
  level: TestLevel["level"];
  targetId: string;       — site-id or service-id
  commitSha: string;
  passed: boolean;
  durationMs: number;
  timestamp: string;      — ISO 8601
  failures?: TestFailure[];
}

interface TestFailure {
  testName: string;
  message: string;
  expected?: string;
  actual?: string;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-site/src/testing/` | All test definitions (unit, integration, contract, E2E, smoke) |
| `packages/werkstatt-site/src/testing/helpers/` | Shared test utilities (URL resolution, env loading, deploy waiting) |
| `docs/architecture-dna.md` | DNA-66 invariant (added by this RFC) |
| `services/registry.yaml` | Extended by RFC-0829 with test evidence fields |

## Rollout

1. **RFC-0823 (this RFC):** Establish DNA-66, create `packages/werkstatt-site/src/testing/` directory structure with `helpers/` and empty level directories.
2. **RFC-0824 (L1):** Add `test` scripts to all services, extend `test.signal.validate`, add `service.test.run` command.
3. **RFC-0825 (L5):** Add smoke test format and `site.smoke.run` / `service.smoke.run` commands. Integrate into leitstand dev-deploy as post-deploy step.
4. **RFC-0826 (L2):** Add integration test infrastructure, `.env.test` contract, `service.integration.run` command.
5. **RFC-0827 (L3):** Add contract schema registry, `contract.validate` command.
6. **RFC-0828 (L4):** Add Playwright E2E test infrastructure, `site.e2e.run` command.
7. **RFC-0829 (pipeline gates):** Add test evidence verification to `leitstand.propagate`, `leitstand.promote`, `leitstand.service.promote`.

Command details (CLI syntax, flags, --json output format, exit codes) are defined by downstream RFCs 0824–0829, not this architectural RFC.

Each RFC is independently implementable in a single session. RFCs 0824–0828 can be implemented in any order after 0823. RFC-0829 depends on all others.

## Alternatives considered

- **Mocks instead of dev channel:** Rejected. The QStash debugging session proved that mock-based tests miss environment-specific issues (URL construction, signature verification). Dev channel testing catches these.
- _*Tests in services/* instead of packages:_* Rejected by operator directive. Tests in packages are versioned with the platform and reusable across missions.
- **Single monolithic RFC:** Rejected. Each level has distinct implementation concerns and can be implemented independently. Separate RFCs allow parallel implementation tracks.
- **Extend Axiom instead of new test layers:** Rejected. Axiom is a visual/SEO check system, not a functional test framework. Conflating the two would dilute both.

## Risks

- **Dev channel availability:** Tests depend on dev-deployed Workers being reachable. Mitigated by `wait-for-deploy` helper with retry logic.
- **Test credentials:** Integration tests need real credentials for external services (QStash, Supabase). Using existing dev credentials (operator directive) reduces complexity but means tests can mutate dev data. Mitigated by using test-specific QStash topics and Supabase tables where possible.
- **Pipeline latency:** Adding test gates to leitstand commands increases deployment time. L5 smoke (~2s per endpoint) is negligible. L4 E2E (~30s per flow) adds meaningful time but only runs on dev-deploy.
- **False sense of security:** Five levels of tests do not guarantee correctness. Tests verify specific flows, not exhaustive behavior. Mitigated by starting with critical paths and expanding coverage incrementally.

## Acceptance criteria

- [ ] DNA-66 invariant added to `docs/architecture-dna.md`
- [ ] `packages/werkstatt-site/src/testing/` directory structure created with level subdirectories
- [ ] `packages/werkstatt-site/src/testing/helpers/dev-url-resolver.ts` implemented
- [ ] `packages/werkstatt-site/src/testing/helpers/test-env.ts` implemented
- [ ] `packages/werkstatt-site/src/testing/helpers/wait-for-deploy.ts` implemented
- [ ] Downstream RFCs (0824–0829) created with `batch: testing-architecture` and correct `dependsOn` chains
- [ ] `rfc.validate` passes on all created RFCs
- [ ] `AGENTS.md` updated with testing architecture reference

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Implementation of this RFC creates the directory structure and helpers but does NOT add any test definitions — those belong to downstream RFCs.
