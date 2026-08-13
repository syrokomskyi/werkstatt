#!/bin/bash
# check-clean-trees.sh — verify all git trees are clean after agent work.
#
# Checks:
#   1. Werkstatt monorepo (repo root)
#   2. All active mission workpieces (missions/*/workpiece/ excluding archive/)
#   3. All Sternsystem cache clones (../systems-cache/*/)
#
# Exit codes:
#   0 = all trees clean
#   1 = one or more trees have uncommitted changes
#
# Output: prints dirty tree paths + file lists to stdout for agent/user visibility.

set -euo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || echo "")"
if [ -z "$repo_root" ]; then
  echo "ERROR: not inside a git repository" >&2
  exit 1
fi

dirty=0
output=""

# 1. Check werkstatt monorepo
werkstatt_status="$(git -C "$repo_root" status --short 2>/dev/null || true)"
if [ -n "$werkstatt_status" ]; then
  output+="DIRTY: $repo_root (werkstatt monorepo)\n"
  output+="$(printf '%s\n' "$werkstatt_status" | sed 's/^/  /')\n"
  dirty=1
fi

# 2. Check active mission workpieces (exclude archive)
for workpiece in "$repo_root"/missions/*/workpiece; do
  [ -d "$workpiece/.git" ] || continue
  # Skip archived missions
  case "$workpiece" in
    */archive/*) continue ;;
  esac
  wp_status="$(git -C "$workpiece" status --short 2>/dev/null || true)"
  if [ -n "$wp_status" ]; then
    output+="DIRTY: $workpiece (mission workpiece)\n"
    output+="$(printf '%s\n' "$wp_status" | sed 's/^/  /')\n"
    dirty=1
  fi
done

# 3. Check Sternsystem cache clones
cache_root="$(dirname "$repo_root")/systems-cache"
if [ -d "$cache_root" ]; then
  for cache_clone in "$cache_root"/*/; do
    [ -d "${cache_clone}.git" ] || continue
    cache_status="$(git -C "$cache_clone" status --short 2>/dev/null || true)"
    if [ -n "$cache_status" ]; then
      output+="DIRTY: ${cache_clone%/} (systems-cache)\n"
      output+="$(printf '%s\n' "$cache_status" | sed 's/^/  /')\n"
      dirty=1
    fi
  done
fi

if [ "$dirty" -eq 1 ]; then
  echo -e "$output" | head -40
  echo "---"
  echo "Uncommitted changes detected. Commit via:"
  echo "  - Platform: pnpm exec werkstatt run ecosystem.commit --message=\"<msg>\""
  echo "  - Workpiece: pnpm exec werkstatt run mission.git.commit --mission=<id> --message=\"<msg>\""
  exit 1
fi

exit 0
