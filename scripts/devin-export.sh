#!/usr/bin/env bash
# devin-export.sh — export current Devin session to docs/sessions/.raw/
# Usage: ./scripts/devin-export.sh [session-id]
#
# Exports the current Devin CLI session as an ATIF file to
# docs/sessions/.raw/ for later conversion by `session.save`.
#
# RFC-0537: Session documentation domain.
set -euo pipefail

SESSIONS_RAW_DIR="docs/sessions/.raw"
mkdir -p "$SESSIONS_RAW_DIR"

TIMESTAMP=$(date +%Y-%m-%d-%H-%M-%S)
OUTPUT_FILE="$SESSIONS_RAW_DIR/${TIMESTAMP}-session.atif"

# Export via Devin CLI --export flag
if command -v devin >/dev/null 2>&1; then
  devin --export "$OUTPUT_FILE"
  echo "Raw session exported to: $OUTPUT_FILE"
  echo "Run 'pnpm exec site-kernel run session.save' to convert to structured markdown."
else
  echo "Error: 'devin' CLI not found in PATH." >&2
  echo "Install the Devin CLI or export your session manually to: $OUTPUT_FILE" >&2
  exit 1
fi
