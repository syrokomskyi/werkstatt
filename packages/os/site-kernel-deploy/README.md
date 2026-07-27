# @gogol/site-kernel-deploy

Client workspace export command for the WGogol Site OS. Copies the monorepo workspace to a sibling `clients/<app-name>/` directory, filtered for safe client delivery (RFC-0007).

## Commands

| Command | Function | What it does |
| --- | --- | --- |
| `client.export` | `runClientExport` | Copy workspace root to `../clients/<app-name>/`, respecting `.gitignore` / `.windsurfignore` exclusion rules, then run `pnpm install` in the target to regenerate `pnpm-lock.yaml` |

## Usage

```sh
pnpm exec site-kernel run client.export --site my-app
pnpm exec site-kernel run client.export --site my-app --dry-run
```

`--dry-run` logs the planned file operations without touching the filesystem.

## What is excluded (hard, regardless of ignore files)

- `docs/` at workspace root and anywhere under `packages/`
- `AGENTS.md` at any depth
- `.agents/`, `.changelog-system/`, `.claude/`, `.github/` at root depth
- `.windsurfrules` at root depth
- `onboarding/` at workspace root (onboarding workspace)
- Root-level `.env` / `.env.*` (studio secrets)

## What is always included

- `.env.example` at any depth (safe template)
- `apps/<name>/.env` and `apps/<name>/.env.*` (app-scoped, safe to copy)

## Wiring

```typescript
// apps/my-app/tools/kernel.config.ts
import { runClientExport } from "@gogol/site-kernel-deploy";

export default defineKernelConfig({
  modules: [
    {
      name: "deploy",
      version: "0.1.0",
      register(registry) {
        registry.registerCommand({
          name: "client.export",
          description: "Export workspace to client directory",
          scope: "workspace",
          mutatesState: true,
          execute: runClientExport,
        });
      },
    },
  ],
});
```

## Validation

```sh
pnpm --filter @gogol/site-kernel-deploy build:check
```
