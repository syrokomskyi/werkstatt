---
reviewId: REVIEW-CODE-2026-08-08-01
date: 2026-08-08
reviewer:
  skill: fo-review
  model: unknown
verdict: needs-revision
diffRange: 50a4620d..b4e44c55
filesReviewed:
  - services/matomo-proxy/README.md
  - services/matomo-proxy/package.json
  - services/matomo-proxy/service.config.yaml
  - services/matomo-proxy/src/config.ts
  - services/matomo-proxy/src/proxy.ts
  - services/matomo-proxy/src/worker.ts
  - packages/os/site-kernel-checks/src/analytics-matomo.ts
---

# Code Review: 50a4620d..b4e44c55 (ADR-0034 matomo-proxy multi-tenant activation)

### Verdict: Needs revision

The diff correctly activates the multi-tenant routing and removes dead config.ts, but has one stale CHANGE_SUMMARY entry in worker.ts that references a removed function, and the validator route check loosens from exact match to prefix match without updating the violation message.

### Mechanical floor

Pass — `matomo-proxy` build:check and `@warpgogol/site-kernel-checks` build:check both pass. `adr.validate` and `matomo.proxy.validate` pass.

### Axis A — Structural correctness

1. **Stale CHANGE_SUMMARY entry in worker.ts** — `worker.ts:10` still references "call validateProxyEnv before proxying" in the CHANGE_SUMMARY, but `validateProxyEnv` was deleted with `config.ts`. The entry is a historical record of a past architecture review, but it references a function that no longer exists in the codebase. While CHANGE_SUMMARY entries are historical by nature, this one is misleading because the function it references was removed in the same diff. Consider removing or annotating it as superseded.

### Axis B — DNA alignment

No issues. The diff touches `services/matomo-proxy` (service workspace) and `packages/os/site-kernel-checks` (shared checks). No DNA invariants are violated — the service remains thin runtime composition, no logic was copied into the service, and the validator update is in the correct package.

### Axis C — Ecosystem fit

No issues. Package boundaries are respected — the service imports only from its own `upstreams.generated.ts` (bundled at deploy time). The validator update is in `packages/os/site-kernel-checks`, which is the correct location for check logic per `packages/AGENTS.md`.

### Axis D — Forward-only compliance

No issues. `config.ts` is deleted, not maintained behind a flag. The old `MATOMO_CLOUD_HOST` env-based config is fully removed. README references to `.env.example` and `MATOMO_CLOUD_HOST` are deleted. The `deploy` script is removed from `package.json` (was `wrangler deploy` — deployment is now handled by the service deployment protocol, RFC-0751).

### Axis E — Agent-facing clarity

1. **Stale CHANGE_SUMMARY in worker.ts** — same as Axis A finding #1. The entry "Architecture review: call validateProxyEnv before proxying" references a deleted function. An agent reading this CHANGE_SUMMARY would look for `validateProxyEnv` and not find it. This is an agent-facing clarity issue.

### Axis F — Pragmatism

No issues. The diff is minimal — it removes dead code, updates documentation, and makes the smallest possible validator change (from exact match to prefix match). No over-engineering.

### Axis G — Blind spots

1. **Validator violation message mismatch** — `analytics-matomo.ts:403` still says "routes must include /_wg/analytics/_" but the check now accepts any route starting with `/_wg/analytics/`. The violation message should reflect the actual check, e.g., "routes must include a /\_wg/analytics/ pattern". This is a minor diagnostic accuracy issue — the message is shown when the check fails, and it would confuse an operator who sees "must include /\_wg/analytics/_" when they have `/_wg/analytics/*/matomo.js`.

### Spec compliance

| Requirement from ADR-0034 | Status | Evidence |
| --- | --- | --- |
| Worker renamed to `matomo-proxy` | Done | `wrangler.jsonc:3` — `"name": "matomo-proxy"` |
| Path-based multi-tenant routing | Done | `proxy.ts:31-72` — extracts appId, looks up UPSTREAMS |
| Upstream registry from fleet registry | Done | `gen-upstreams.ts` reads `matomo-fleet.registry.yaml` |
| warpgogol-com in fleet registry | Done | `matomo-fleet.registry.yaml:13-17` |
| proxyBaseUrl in system.md | Done | `missions/warpgogol-com-m000039/workpiece/src/content/system.md:839` |
| No origin validation | Done | `proxy.ts:7` — MODULE_CONTRACT non-goals |
| Dead config.ts removed | Done | File deleted in diff |
| README updated | Done | Multi-tenant routing documented |
| Validator updated for multi-tenant routes | Done | `analytics-matomo.ts:399-405` — prefix match |

### Questions for the author

1. Should the stale "call validateProxyEnv" CHANGE_SUMMARY entry in `worker.ts:10` be removed or annotated as superseded, given that `validateProxyEnv` was deleted in this same diff?
2. Should the validator violation message at `analytics-matomo.ts:403` be updated to match the new prefix-based check rather than referencing the old exact `/_wg/analytics/*` pattern?
