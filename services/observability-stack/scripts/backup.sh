#!/usr/bin/env bash
# RFC-0338: Nightly backup — ClickHouse + SigNoz metastore → restic.
# Run via systemd-timer or cron at 03:00 daily. Keep 14 snapshots.
set -euo pipefail

BACKUP_DIR="/opt/observability/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

# 1. ClickHouse backup via clickhouse-backup
docker exec signoz-clickhouse clickhouse-backup create "ch_${TIMESTAMP}"

# 2. PostgreSQL dump of the SigNoz metastore
docker exec signoz-schema-registry pg_dump -U signoz signoz > "$BACKUP_DIR/pg_${TIMESTAMP}.sql"

# 3. Upload to restic
restic backup "$BACKUP_DIR" --tag observability --tag "ch_${TIMESTAMP}"
restic forget --keep-last 14 --prune

# 4. Cleanup local backups older than 3 days
find "$BACKUP_DIR" -name "*.sql" -mtime +3 -delete

echo "Backup completed: ${TIMESTAMP}"
