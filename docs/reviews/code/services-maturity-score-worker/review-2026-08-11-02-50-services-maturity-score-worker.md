---
reviewId: REVIEW-CODE-2026-08-11-01
date: 2026-08-11
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 9850ffa0...HEAD
filesReviewed:
  - services/maturity-score-worker/src/index.ts
  - services/maturity-score-worker/package.json
  - services/maturity-score-worker/wrangler.jsonc
  - services/maturity-score-worker/tsconfig.json
  - services/maturity-score-worker/turbo.json
  - services/maturity-score-worker/service.config.yaml
  - services/maturity-score-worker/README.md
  - services/registry.yaml
  - services/AGENTS.md
  - packages/werkstatt-site/src/checks/check-warpgogol/commands/services.ts
  - packages/werkstatt-site/src/checks/services/service-naming-validate.ts
---

# Code Review: 9850ffa0...HEAD (ADR-0042 maturity-score-worker)

## Verdict: Needs revision

The implementation is structurally sound and follows the established `rate-fetcher-worker` pattern. Two findings require fixes: a missing `AGENTS.md` for the new service workspace (ecosystem convention) and an untyped `body` cast in the JSON parsing path.

## Mechanical floor

Pass — `@warpgogol/maturity-score-worker` build:check and `@warpgogol/werkstatt-site` build:check both pass with zero errors.

## Axis A — Structural correctness

- **Finding A-1: Untyped JSON body cast.** `services/maturity-score-worker/src/index.ts:102` casts `await request.json()` directly to `ScoreRequest` without runtime validation. A malformed payload with `{ "url": 123 }` passes the `typeof body.url !== "string"` check at line 107, but the cast itself is unsafe. This is acceptable for a stub Worker but should be noted for the real implementation — use Zod or explicit field validation before the cast.

## Axis B — DNA alignment

- **DNA-40 (Env-example contract):** The stub Worker does not consume environment variables. `service.config.yaml` declares no env vars. DNA-40 exempts services that do not consume environment variables. **Pass.**
- **DNA-64 (Engine/plugin boundary):** The Worker does not import from `@warpgogol/werkstatt` or any engine package. It is a standalone Cloudflare Worker with no package imports. **Pass.**
- **DNA-6 (Kebab-case filenames):** All files use kebab-case. **Pass.**

## Axis C — Ecosystem fit

- **Finding C-1: Missing `services/maturity-score-worker/AGENTS.md`.** Every service workspace in the repo has an `AGENTS.md` file (`check-warpgogol-runner`, `lagebild-sync-worker`, `rate-fetcher-worker`). The new `maturity-score-worker` workspace is missing one. This is an ecosystem convention — agents working in the service need a workspace-scoped guide.
- **Package boundaries:** The Worker has no `@warpgogol/*` dependencies, so no import boundary violations. **Pass.**
- **Registry:** `services/registry.yaml` updated with the new service entry. **Pass.**
- **services/AGENTS.md:** Updated with the new service description. **Pass.**

## Axis D — Forward-only compliance

No issues. The implementation is entirely new code with no legacy paths or compatibility shims.

## Axis E — Agent-facing clarity

- **Compass scaffolding:** `src/index.ts` carries `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks. **Pass.**
- **Readable naming:** Function names are clear (`hashString`, `calculateStubScore`, `isValidUrl`, `createMaturityScoreWorker`). **Pass.**
- **Log-driven development:** The Worker uses `console.log`/`console.error`/`console.warn` with structured prefixes (`[rate-fetcher]` pattern followed). **Pass.**

## Axis F — Pragmatism

- **Minimality:** The stub Worker is minimal — no unnecessary abstractions, no speculative generality. The FNV-1a hash is a standard deterministic hashing approach. **Pass.**
- **Existing patterns:** Follows the `rate-fetcher-worker` pattern closely. **Pass.**
- **Scope discipline:** The diff touches only the new service, registry, AGENTS.md, and two pre-existing bug fixes in `services.ts` and `service-naming-validate.ts`. The bug fixes are justified — they were blocking `services.check.run` from passing. **Pass.**

## Axis G — Blind spots

- **Finding G-1: CORS wildcard on stub.** `access-control-allow-origin: *` is documented in the `MODULE_CONTRACT` non-goals ("Restrict when real scoring is added"). This is acceptable for a stub but should be tightened before production traffic. Noted, not blocking.
- **Security:** The Worker accepts arbitrary URLs and validates them with `new URL()`. No SSRF risk since the stub does not fetch the URL — it only hashes the string. **Pass.**
- **Edge cases:** Empty body, missing `url` field, invalid URL, wrong content-type, wrong method, wrong path — all handled with appropriate error responses. **Pass.**

## Spec compliance

| Requirement from ADR-0042 | Status | Evidence |
| --- | --- | --- |
| New `services/maturity-score-worker/` workspace | Done | `services/maturity-score-worker/` created |
| Cloudflare Worker with `POST /score` endpoint | Done | `src/index.ts:84` — `url.pathname !== "/score"` check |
| Accepts `{ url: string }`, returns `{ score: number }` | Done | `src/index.ts:100-123` |
| Follows `rate-fetcher-worker` pattern | Done | `wrangler.jsonc`, `tsconfig.json`, `package.json` match pattern |
| Stub score (deterministic, URL-hash-based) | Done | `src/index.ts:48-60` — FNV-1a hash, `hash % 101` |
| Thin service — no business logic | Done | No `@warpgogol/*` dependencies, pure request handling |
| `.env.example` per DNA-40 | N/A | Stub consumes no env vars — DNA-40 exempts |
| Deploy scripts per DNA-40 | Missing | `package.json` has no deploy scripts — acceptable for stub, but ADR mentions "deploy scripts per DNA-40" |

## Questions for the author

1. Should the stub Worker have deploy scripts in `package.json` now, or wait until the real scoring logic is added? The ADR mentions "deploy scripts per DNA-40" but the stub has none.
2. When will `services/maturity-score-worker/AGENTS.md` be created? All other service workspaces have one.
