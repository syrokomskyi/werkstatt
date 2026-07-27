#!/bin/bash
# WGogol platform worktree setup hook.
# Copies gitignored .env files from the original workspace and installs dependencies.
# Invoked by Windsurf after creating a git worktree at ~/.windsurf/worktrees/<repo_name>.
# $ROOT_WORKSPACE_PATH points to the original workspace root.

set -euo pipefail

echo "=== WGogol worktree setup ==="

# --- Copy .env files from the original workspace ---

ENV_FILES=(
  ".env"
  "apps/webgogol-com/.env"
  "apps/webgogol-com/.env.production"
  "apps/nicaragua-projekt/.env"
  "apps/nicaragua-projekt/.env.production"
  "apps/check-webgogol-com/.env"
  "apps/check-webgogol-com/.env.production"
)

for rel in "${ENV_FILES[@]}"; do
  src="$ROOT_WORKSPACE_PATH/$rel"
  dst="$rel"
  if [ -f "$src" ]; then
    mkdir -p "$(dirname "$dst")"
    cp "$src" "$dst"
    echo "Copied $rel"
  fi
done

# --- Git LFS (repo tracks media files under apps/**) ---

if command -v git &>/dev/null; then
  git lfs install 2>/dev/null && echo "Git LFS installed" || echo "Git LFS not available (skipping)"
fi

# --- Install dependencies (pnpm monorepo) ---

if [ -f "package.json" ] && command -v pnpm &>/dev/null; then
  echo "Installing pnpm dependencies..."
  pnpm install
  echo "Dependencies installed"
else
  echo "WARNING: pnpm not found in PATH — skipping dependency install"
fi

echo "=== Worktree setup complete ==="
