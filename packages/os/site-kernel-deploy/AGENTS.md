# @warpgogol/site-kernel-deploy

Deploy commands: export the workspace to client directories.

## What lives here

| Module                 | Exports                               |
| ---------------------- | ------------------------------------- |
| `src/client-export.ts` | `runClientExport`, `ClientExportData` |

## Commands

| Command name | Function | What it does |
| --- | --- | --- |
| `client.export` | `runClientExport` | Copy workspace root to `../clients/[app-name]`, filtered by `.gitignore` and `.windsurfignore`; sibling app dirs excluded; studio-internal content hard-excluded (see Rules) |

## Rules

- `--dry-run` logs the plan without touching the filesystem.
- Only workspace-root `.gitignore` and `.windsurfignore` are consulted (no subdirectory ignore files).
- **Hard exclusions (RFC-0007)** — always excluded regardless of ignore patterns:
  - `docs/` at workspace root and anywhere under `packages/`
  - `AGENTS.md` at any depth in the tree
  - `.agents/`, `.changelog-system/`, `.claude/`, `.github/` at root depth
  - `.windsurfrules` at root depth
  - Root-level `.env` / `.env.*` (studio secrets)
- **Hard inclusions (RFC-0007)**:
  - `.env.example` at any depth (safe template — no secrets)
  - App-level `.env` / `.env.*` inside `apps/<name>/` are always copied
