# fleet-probe-runner

Scheduled fleet probe runner (RFC-0341). Probes every fleet site every 5 minutes from the EU VPS and pushes `warpgogol_probe_*` metrics to the observability backend.

## Lane 1 — Pulse (active)

Plain HTTP + TLS probe per target route:

- TTFB (time-to-first-byte)
- HTTP status class (2xx/3xx/4xx/5xx/error)
- Content sentinel (HTML routes: `<title>` and `</html>` present)
- TLS certificate days-to-expiry (once per host per cycle)

## Lane 2 — Deep (Phase 2, deferred)

Daily Playwright-based deep probe. Not yet implemented.

## Configuration

See [.env.example](./.env.example) for all required and optional environment variables.

## Target list

The target list is a **generated artifact** (`targets.generated.json`). To regenerate:

```sh
pnpm exec site-kernel run fleet.probe.targets.generate
```

Authored overrides live in `targets.overrides.jsonc` (routes, sentinels, origin, or `"exclude": true`).

## Local one-shot run

```sh
cd services/fleet-probe-runner
pnpm run run:once
```

## Deployment

Deployed as a service in `services/observability-stack/compose.extra.yaml` alongside the SigNoz stack. The runner uses the compose-internal OTLP endpoint (`http://otel-collector:4318`); the public Caddy edge token guards only external access.
