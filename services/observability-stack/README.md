# RFC-0338: SigNoz Observability Stack

Self-hosted SigNoz on a dedicated EU VPS. All configuration is versioned here; the server holds only `.env` secrets and the Foundry-generated `pours/` directory.

## Pinned SigNoz version

**SigNoz v0.85.0** (recorded for `observability.alerts.apply` — RFC-0342).

## Layout

```
services/observability-stack/
  casting.yaml              # Foundry installation declaration
  collector/
    collector-patch.yaml    # gateway enrichment + PII redaction (RFC-0337)
  caddy/
    Caddyfile               # TLS + bearer-token auth for OTLP ingest
  compose.extra.yaml        # caddy + co-located series services
  scripts/
    backup.sh               # nightly ClickHouse + PG → restic
    healthcheck.sh          # local curl checks
  .env.example              # all required env vars (no values)
```

## Cloudflare destination `signoz` (one-time setup, RFC-0339)

1. Go to Cloudflare Dashboard → Workers & Pages → Observability → Traces → Destinations
2. Create a new destination named `signoz`:
   - Type: Traces
   - OTLP endpoint: `https://ingest.observe.webgogol.com/v1/traces`
   - Custom header: `Authorization: Bearer <WGOGOL_OTLP_TOKEN>`
3. This is a one-time account-level setup; all Workers reference it by name in their wrangler `observability.traces.destinations`.
4. After deploying Workers, verify traces appear in SigNoz Services filtered by `service.name`.

## Provisioning runbook

### 1. Provision VPS

- Hetzner Cloud CPX31 (4 vCPU, 8 GB RAM, 160 GB SSD), location `fsn1` or `nbg1`
- Ubuntu 24.04 LTS
- Firewall: inbound 22 (SSH, key-only), 80 (ACME), 443 only
- DNS: A records for `observe.webgogol.com` and `ingest.observe.webgogol.com` → VPS IP (DNS-only, grey-cloud)

### 2. Install runtime

```bash
# Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Foundry (SigNoz CLI)
curl -fsSL https://github.com/SigNoz/foundry/releases/latest/download/foundryctl-linux-amd64 -o /usr/local/bin/foundryctl
chmod +x /usr/local/bin/foundryctl
```

### 3. Deploy

```bash
git clone <repo> /opt/observability
cd /opt/observability/services/observability-stack
cp .env.example .env
# Fill .env: WGOGOL_OTLP_TOKEN (openssl rand -hex 32), SMTP, RESTIC_*

# Cast SigNoz
foundryctl cast -f casting.yaml

# Apply collector patch (merge into generated config)
# See collector-patch.yaml — merge processors into the traces pipeline
# before the exporter, then restart the collector:
docker restart signoz-otel-collector

# Start Caddy + co-located services
docker compose -f compose.extra.yaml up -d
```

### 4. Post-install

1. Create SigNoz admin account at `https://observe.webgogol.com`
2. Set retention: traces **15d**, metrics **30d**, logs **7d** (SigNoz settings)
3. Configure SMTP (SigNoz settings → Notification channels)
4. Enable nightly backup: `crontab -e` → `0 3 * * * /opt/observability/services/observability-stack/scripts/backup.sh`
5. Run health check from a workstation:
   ```bash
   site-kernel run observability.stack.health
   ```
6. Record output in the implementation commit/PR.

## Upgrade runbook

1. Check [SigNoz releases](https://github.com/SigNoz/signoz/releases) for breaking changes
2. `foundryctl upgrade` on the VPS
3. Re-apply collector patch (the upgrade overwrites the collector config)
4. Restart collector: `docker restart signoz-otel-collector`
5. Run `observability.alerts.apply --dry-run` (RFC-0342) to verify API compatibility
6. Run `scripts/healthcheck.sh` on the VPS
7. Update the pinned version in this README if the version changed

## Restore runbook

1. Stop SigNoz: `docker compose -f pours/docker-compose.yaml down`
2. Restore ClickHouse: `clickhouse-backup restore ch_<timestamp>`
3. Restore PostgreSQL: `psql -U signoz signoz < pg_<timestamp>.sql`
4. Start SigNoz: `docker compose -f pours/docker-compose.yaml up -d`
5. Verify via `scripts/healthcheck.sh`
6. **Test this procedure once during initial rollout and document the result.**

## Rotate token runbook

1. Generate new token: `openssl rand -hex 32`
2. Update `.env` on the VPS: `WGOGOL_OTLP_TOKEN=<new>`
3. Restart Caddy: `docker compose -f compose.extra.yaml restart caddy`
4. Update the token in all emitter environments (CI, workers, probe runner, poller)
5. Run `observability.stack.health` to verify the new token works
