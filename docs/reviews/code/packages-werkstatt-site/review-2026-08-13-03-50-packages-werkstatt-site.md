---
reviewId: REVIEW-CODE-2026-08-13-01
date: 2026-08-13
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 5cc5282e...HEAD
filesReviewed:
  - packages/werkstatt-site/src/testing/helpers/dev-url-resolver.ts
  - packages/werkstatt-site/src/testing/helpers/test-env.ts
  - packages/werkstatt-site/src/testing/helpers/wait-for-deploy.ts
  - packages/werkstatt-site/src/testing/helpers/index.ts
  - packages/werkstatt-site/src/testing/unit/services/.gitkeep
  - packages/werkstatt-site/src/testing/integration/services/.gitkeep
  - packages/werkstatt-site/src/testing/contract/.gitkeep
  - packages/werkstatt-site/src/testing/e2e/.gitkeep
  - packages/werkstatt-site/src/testing/smoke/.gitkeep
  - AGENTS.md
  - packages/werkstatt-site/AGENTS.md
  - docs/technology.xml
---

# Code Review: RFC-0823 implementation (5cc5282e...HEAD)

### Verdict: Needs revision

The implementation is structurally sound and DNA-aligned, but has two findings: a hardcoded domain in `resolveSiteDevUrl` and a missing `yaml` dependency declaration.

### Mechanical floor

Pass — `pnpm --filter @warpgogol/werkstatt-site run build:check` (tsc --noEmit) exits zero.

### Axis A — Structural correctness

- **`resolveSiteDevUrl` hardcodes domain**: `dev-url-resolver.ts:94` returns `https://${siteId}.warpgogol.workers.dev` — a hardcoded domain. The service resolver reads from `services/registry.yaml` which has `workersDevUrl` per service. The site resolver should similarly read the dev URL from a registry or config, not construct it from a hardcoded pattern. The `fleet/fleet.sites.yaml` entry is read but only used for existence validation — `entry.path` is unused. This is a **Feature Envy** smell: the function reads the fleet registry but doesn't use its data for the URL.
- **`FleetSitesEntry.path` is unused**: The interface declares `path: string` but it's never read. If the fleet entry is only used for existence validation, the interface should only declare `site: string`.

### Axis B — DNA alignment

No issues. DNA-66 (testing pyramid) is established by this RFC. DNA-64 (engine/plugin boundary) is respected — all code lives in the site plugin. DNA-41 (PBT) is not affected.

### Axis C — Ecosystem fit

- **`yaml` dependency**: `dev-url-resolver.ts` imports `parse as parseYaml from "yaml"`. The `yaml` package must be a direct dependency of `@warpgogol/werkstatt-site` (per pnpm strict isolation rules in `packages/AGENTS.md`). Need to verify it's declared in `package.json` dependencies.

### Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy code maintained.

### Axis E — Agent-facing clarity

No issues. All three helper modules carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding. Error messages include `[module-name]` prefix for debugging. Function names are descriptive.

### Axis F — Pragmatism

- **`parseEnvFile` duplicates existing patterns**: The `.env` parser in `test-env.ts` is a hand-rolled implementation. If the codebase already has an env file parser (e.g. in `@warpgogol/werkstatt` or `dotenv`), this is duplicated logic. However, for a test-only helper with minimal needs (no variable expansion, no multi-line), a 20-line parser is pragmatic.

### Axis G — Blind spots

- **`waitForDeploy` fetch timeout**: The `fetch()` call in `wait-for-deploy.ts:42` has no per-request timeout. If the server hangs (accepts TCP but never responds), the fetch will hang indefinitely, blocking the polling loop. A per-request `AbortSignal.timeout()` would prevent this.

### Spec compliance

| Requirement from RFC-0823 | Status | Evidence |
| --- | --- | --- |
| DNA-66 invariant in architecture-dna.md | Done | docs/architecture-dna.md:279 |
| Testing directory structure with level subdirectories | Done | packages/werkstatt-site/src/testing/{unit,integration,contract,e2e,smoke,helpers}/ |
| dev-url-resolver.ts implemented | Done | packages/werkstatt-site/src/testing/helpers/dev-url-resolver.ts |
| test-env.ts implemented | Done | packages/werkstatt-site/src/testing/helpers/test-env.ts |
| wait-for-deploy.ts implemented | Done | packages/werkstatt-site/src/testing/helpers/wait-for-deploy.ts |
| Downstream RFCs with batch and dependsOn | Done | RFCs 0824-0829 all have batch: testing-architecture |
| rfc.validate passes | Done | 0 errors, 0 warnings |
| AGENTS.md updated | Done | AGENTS.md:779, packages/werkstatt-site/AGENTS.md:126 |

### Questions for the author

1. Should `resolveSiteDevUrl` read the dev URL from a config/registry instead of hardcoding `warpgogol.workers.dev`? Other workshops would need a different domain.
2. Is `yaml` declared as a direct dependency in `packages/werkstatt-site/package.json`? (pnpm strict isolation requires this.)
3. Should `waitForDeploy` add a per-request timeout via `AbortSignal.timeout()` to prevent hanging on unresponsive servers?
