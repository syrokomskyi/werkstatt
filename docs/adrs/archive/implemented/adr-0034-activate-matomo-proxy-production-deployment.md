---
id: ADR-0034
title: "Activate matomo-proxy as shared multi-tenant Worker for analytics"
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt: 2026-08-08
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0305
  - RFC-0751
  - RFC-0752
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0034: Activate matomo-proxy as shared multi-tenant Worker for analytics

## Context

RFC-0305 established the first-party Matomo analytics proxy architecture and the `services/matomo-proxy` Cloudflare Worker. The Worker code, proxy logic, validators, and fleet registry schema are all implemented and validated. However, the Worker was initially deployed as a single-tenant proxy with a placeholder upstream host.

The operator decided that all services in `services/*` are **shared infrastructure** — one deployment serves all sites in the workshop. This means:

- Worker names must be bare (no client prefix).
- Services are hosted on the studio domain (e.g. `matomo-proxy.warpgogol.com`).
- The proxy must be multi-tenant: one Worker, many sites, potentially different Matomo Cloud upstreams.

RFC-0751 establishes the service deployment protocol. RFC-0752 establishes the subdomain management protocol. This ADR records the concrete production activation decisions for the matomo-proxy service.

## Decision

- The Worker is renamed from `warpgogol-matomo-proxy` to `matomo-proxy` (bare name, RFC-0751 naming convention).
- The proxy uses **path-based multi-tenant routing**: `/_wg/analytics/<appId>/matomo.js` and `/_wg/analytics/<appId>/matomo.php`. The Worker extracts `appId` from the path, looks up the upstream Matomo Cloud host in a bundled registry, and forwards the request.
- The upstream registry is generated at deploy time from `packages/ontology/analytics/matomo-fleet.registry.yaml` via a pre-deploy codegen step (`gen:upstreams`). Each fleet registry entry includes a `matomoCloudHost` field. The generated file `src/upstreams.generated.ts` is bundled into the Worker.
- warpgogol-com is registered in `matomo-fleet.registry.yaml` with `appId: warpgogol-com`, `siteId: "1"`, `matomoCloudHost: warpgogol.matomo.cloud`, `status: active`.
- warpgogol-com's `system.md` growth block uses `adapter: matomo` with `proxyBaseUrl: "https://matomo-proxy.warpgogol.com/_wg/analytics/warpgogol-com/"` — an absolute URL pointing to the shared proxy on the studio domain.
- The proxy subdomain `matomo-proxy.warpgogol.com` is registered via RFC-0752 (`subdomain.register`), creating a DNS CNAME + Workers route.
- No origin validation — the proxy trusts the path. Unknown `appId` → 404 from the upstream lookup. Matomo tracking endpoints are write-only (accept events, return no sensitive data).

## Justification

- **Shared Worker over per-client Workers**: One deployment, one DNS record, one Workers route. Adding a new site = add fleet registry entry + redeploy Worker (~5 seconds). No per-client infrastructure.
- **Path-based routing**: Works for both `matomo.js` (script tag, no custom headers) and `matomo.php` (tracking endpoint). `appId` in path is stateless and deterministic.
- **Bundle over KV**: Fleet registry is small (dozens of entries). Bundle at deploy time is simpler than KV namespace — no additional Cloudflare binding, no sync script. Redeploy on new site is trivial.
- **Bare Worker name**: Enforces the shared infrastructure principle. `matomo-proxy` not `warpgogol-matomo-proxy`. Enforced by `service.naming.validate` (RFC-0751).
- **Absolute proxyBaseUrl**: The proxy is on a different subdomain (`matomo-proxy.warpgogol.com`) than the site (`warpgogol.com`). Relative paths won't work cross-origin. The absolute URL ensures the Matomo adapter loads the script from the correct proxy host.
- **No origin validation**: Matomo tracking is write-only. Cross-site "attack" = sending fake events to someone else's Matomo — an annoyance, not a security breach. Unknown `appId` returns 404 from the upstream lookup. Simplicity over unnecessary complexity.

## Consequences

- **Positive**: All sites get privacy-preserving, first-party analytics through a single shared Worker. Events flow through `emit()` → `GrowthAdapter` → `_paq` queue → proxy → Matomo Cloud.
- **Positive**: Adding a new site to Matomo = add fleet registry entry + `pnpm --filter matomo-proxy run gen:upstreams` + redeploy Worker.
- **Positive**: The proxy Worker is reusable across all sites — no per-client deployment.
- **Negative**: New sites require a Worker redeploy to update the bundled upstream registry. This is acceptable given the low frequency (new sites are rare).
- **Negative**: The proxy is a single point of failure for analytics. If the Worker goes down, all sites lose tracking. The site itself continues to function — the adapter gracefully handles failures.
- **Technical debt**: The `/_wg/analytics/<appId>/*` route is served by the Worker at `matomo-proxy.warpgogol.com`. Site-specific routes (`/_wg/analytics/*` without appId) are not supported — all sites must use the absolute URL with appId.

## Evolution

- When RFC-0751 is implemented, the deploy will use `leitstand.service.deploy --service matomo-proxy` instead of manual `wrangler deploy`.
- When RFC-0752 is implemented, the subdomain will be registered via `subdomain.register --service matomo-proxy`.
- If the fleet registry grows large (hundreds of sites), the bundle approach can be migrated to KV namespace without changing the proxy logic.
- If per-site origin validation becomes necessary, a CORS-based check can be added without changing the routing logic.
