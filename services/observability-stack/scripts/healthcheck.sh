#!/usr/bin/env bash
# RFC-0338: Local health checks used by the runbook.
# Run on the VPS to verify the stack is operational.
set -euo pipefail

echo "=== SigNoz UI ==="
curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://observe.webgogol.com

echo "=== OTLP ingest (no token, expect 401) ==="
curl -sS -o /dev/null -w "HTTP %{http_code}\n" \
  -X POST https://ingest.observe.webgogol.com/v1/metrics \
  -H "Content-Type: application/json" \
  -d '{"resourceMetrics":[]}'

echo "=== Collector patch active? ==="
docker exec signoz-otel-collector cat /etc/otel-collector/config.yaml | \
  grep -q "transform/wgogol-enrich" && echo "enrich: OK" || echo "enrich: MISSING"
docker exec signoz-otel-collector cat /etc/otel-collector/config.yaml | \
  grep -q "transform/wgogol-redact" && echo "redact: OK" || echo "redact: MISSING"

echo "=== Container status ==="
docker compose -f /opt/observability/compose.extra.yaml ps
