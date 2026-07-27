# cf-analytics-poller

Scheduled Cloudflare analytics poller (RFC-0343). Polls the Cloudflare GraphQL Analytics API every 5 minutes and pushes `wgogol_delivery_*` / `wgogol_workers_*` metrics to the observability backend.

## How it works

1. Loads the authored zone map from `zones.yaml`
2. Queries the Cloudflare GraphQL Analytics API for the settled window `[now-10m, now-5m)`
3. Transforms the GraphQL responses into metric points (pure function, unit-tested)
4. Persists the watermark before flushing to prevent double-push
5. Pushes metrics through the `@gogol/observability` port

## Configuration

See [.env.example](./.env.example) for all required and optional environment variables.

## Zone map

Authored in `zones.yaml`:

```yaml
- siteId: webgogol-com
  zoneId: <cloudflare zone id>
  workerScripts:
    - webgogol-com
```

Validated by `observability.delivery.validate` (OBS-DLV-01..04).

## Local one-shot run

```sh
cd services/cf-analytics-poller
pnpm run run:once
```

## Deployment

Deployed as a service in `services/observability-stack/compose.extra.yaml` alongside the SigNoz stack.
