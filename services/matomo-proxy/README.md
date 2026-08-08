# Matomo Proxy

First-party Cloudflare Worker proxy for RFC-0305. Shared multi-tenant analytics proxy (ADR-0034) — one deployment serves all sites in the workshop.

## Routing

The public route is `/_wg/analytics/<appId>/matomo.js` and `/_wg/analytics/<appId>/matomo.php`. The Worker extracts `appId` from the path, looks up the upstream Matomo Cloud host in the bundled registry (`src/upstreams.generated.ts`), and forwards the request.

- `GET /_wg/analytics/<appId>/matomo.js`
- `GET /_wg/analytics/<appId>/matomo.php`
- `POST /_wg/analytics/<appId>/matomo.php`

Unknown `appId` returns 404. No origin validation — Matomo tracking is write-only.

## Upstream registry

Upstream hosts are generated at deploy time from `packages/ontology/analytics/matomo-fleet.registry.yaml`:

```sh
pnpm run gen:upstreams
```

Each fleet registry entry includes a `matomoCloudHost` field. Only entries with `status: active` are included in the generated bundle. Adding a new site = add fleet registry entry + regenerate + redeploy Worker.

Do not add Matomo Reporting API or admin endpoints to this proxy. Reporting, provisioning, smoke checks, and export use operator-side API clients with explicit secrets, not visitor traffic.
