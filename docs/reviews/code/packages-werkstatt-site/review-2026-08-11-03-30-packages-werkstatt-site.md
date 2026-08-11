---
reviewId: REVIEW-CODE-2026-08-11-01
date: 2026-08-11
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: de6dedd6...HEAD
filesReviewed:
  - packages/werkstatt-site/src/checks/services/service-naming-validate.ts
  - packages/werkstatt-site/src/checks/tests/service-validate-0751.test.ts
  - packages/werkstatt-site/src/checks/lagebild.ts
  - packages/werkstatt-site/src/checks/env/env-example.ts
  - packages/werkstatt-site/src/checks/test-signal.ts
  - packages/werkstatt-site/src/checks/command-tables/infra-contracts.ts
  - packages/werkstatt-site/src/domain/integration/crm-buffer.ts
  - packages/werkstatt-site/src/domain/pbp-rate-adapters/adapters/ecb.ts
  - packages/werkstatt-site/src/domain/pbp-rate-adapters/adapters/frankfurter.ts
  - packages/werkstatt/src/kernel/lagebild/env.ts
  - packages/werkstatt/src/kernel/lagebild/handlers.ts
  - services/registry.yaml
  - services/lagebild-sync/package.json
  - services/lagebild-sync/wrangler.jsonc
  - services/lagebild-sync/service.config.yaml
  - services/lagebild-sync/AGENTS.md
  - services/maturity-score/package.json
  - services/maturity-score/wrangler.jsonc
  - services/maturity-score/service.config.yaml
  - services/maturity-score/AGENTS.md
  - services/maturity-score/README.md
  - services/rate-fetcher/package.json
  - services/rate-fetcher/wrangler.jsonc
  - services/rate-fetcher/service.config.yaml
  - services/AGENTS.md
  - docs/technology.xml
  - docs/PACKAGE_GRAPH.md
  - docs/policies/integration-hub.md
  - docs/ecosystem.generated.yaml
  - docs/rfcs/rfc-0805-rename-cloudflare-worker-services-to-drop-worker-suffix-and-add-service-naming-validate.md
  - docs/rfcs/archive/implemented/rfc-0751-establish-service-deployment-protocol.md
---

# Code Review: de6dedd6...HEAD (RFC-0805 implementation)

## Verdict: Needs revision

The implementation is architecturally sound and all mechanical checks pass. One finding requires revision: an unrelated formatting change in `test-signal.ts` was introduced outside the RFC scope.

## Mechanical floor

Pass — `build:check` passes for both `@warpgogol/werkstatt-site` and `@warpgogol/werkstatt`. `service.naming.validate` passes with 0 violations. `rfc.validate --id RFC-0805` passes. Unit tests for SVC-NAME-06 pass (12/13, 1 pre-existing failure in registry.validate).

## Axis A — Structural correctness

No issues. The SVC-NAME-06 rule follows the existing diagnostic pattern exactly. The `id.endsWith("-worker")` check is placed before SVC-NAME-01, which is correct — the suffix diagnostic is more actionable when reported first. The `suggestedName` computation via `id.slice(0, -"-worker".length)` is correct.

## Axis B — DNA alignment

No issues. DNA-40 (env-and-deploy contract) is preserved — `wrangler.jsonc` names and deploy scripts are updated consistently. DNA-6 (kebab-case) is not affected — the rename maintains kebab-case. The RFC correctly does not extend DNA-6 to `services/`.

## Axis C — Ecosystem fit

No issues. Package boundaries are respected — `services/*` imports from `packages/*` only. The validator is already integrated in `services.check.run` via RFC-0751. AGENTS.md files are updated at the correct nesting level (`services/AGENTS.md` and per-service `AGENTS.md`). `docs/technology.xml` and `docs/PACKAGE_GRAPH.md` are updated.

## Axis D — Forward-only compliance

No issues. No compatibility shims or dual-paths. Old service names are fully replaced — no legacy references remain in active code. The test file intentionally uses `rate-fetcher-worker` as a test fixture for SVC-NAME-06, which is correct behavior testing, not a legacy reference.

## Axis E — Agent-facing clarity

No issues. `MODULE_CONTRACT` and `CHANGE_SUMMARY` in `service-naming-validate.ts` are updated with RFC-0805 reference. All comment references to old service names are updated.

## Axis F — Pragmatism

**Finding F-1:** Unrelated formatting change in `packages/werkstatt-site/src/checks/test-signal.ts` — the `if` statement at line 103 was reformatted (multi-line wrap) in addition to the regex change. This formatting change is outside RFC-0805 scope and should be reverted to keep the diff minimal.

## Axis G — Blind spots

No issues. The validator has no false positives — it only flags the exact suffix `-worker`. Services like `check-warpgogol-runner` are unaffected. Edge case: empty registry is already handled by SVC-NAME-01.

## Spec compliance

| Requirement from RFC-0805 | Status | Evidence |
| --- | --- | --- |
| Rename 3 service directories | Done | `git mv` committed in 3486f422 |
| Update package.json name fields | Done | All 3 services updated |
| Update wrangler.jsonc name fields | Done | All 3 services updated |
| Update service.config.yaml id fields | Done | All 3 services updated |
| Update registry.yaml entries | Done | id, workerName, url updated |
| Update hardcoded references in packages/* | Done | 8 files updated |
| Add SVC-NAME-06 rule | Done | `service-naming-validate.ts:98-107` |
| Validator passes with 0 violations | Done | `service.naming.validate` exits 0 |
| Update AGENTS.md and docs | Done | 5 doc files updated |
| Old Cloudflare Workers deleted | Missing | Operational task — requires manual Cloudflare Dashboard access |
| rfc.validate passes | Done | Exit 0, all V-19/V-20/V-27 fixed |

## Questions for the author

1. The formatting change in `test-signal.ts:103-107` (multi-line `if` wrap) is unrelated to the RFC-0805 rename. Should this be reverted to keep the diff minimal, or was it an intentional cleanup?
2. The `lagebild.worker.deploy` handler in `handlers.ts:434` still uses the old CLI name `site-kernel` (pre-existing issue noted in the RFC). Should a follow-up RFC address the `site-kernel` → `werkstatt` CLI rename, or is this tracked elsewhere?
3. The `services/lagebild-sync/AGENTS.md` file has a generated marker but was hand-edited. Should `forge.agents.generate` be re-run to regenerate it, or is the hand-edit intentional?
