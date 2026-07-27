# @gogol/site-kernel

Framework-free core of the WGogol Site OS. Provides workspace discovery, command registry, pipeline execution, CLI entry-point, and RFC governance.

## Role in the monorepo

`site-kernel` is the portable foundation that every other `packages/os/*` package and every `apps/*/tools/kernel.config.ts` is built on top of. It has no Astro dependency — adapter packages (`site-kernel-astro`, `site-kernel-checks`, …) add framework-specific layers above it.

## What it provides

| Domain | Key exports |
| --- | --- |
| **Discovery** | `findWorkspaceRoot`, `discoverSiteWorkspaces`, `resolveSiteWorkspace`, `loadKernelAppConfig`, `loadWorkspaceConfig` |
| **Runtime / CLI** | `executeKernelCommand`, `executeKernelPipeline`, `parseKernelArgv`, `listSiteWorkspaces` |
| **Registry** | `KernelRegistry` |
| **Config helper** | `defineKernelConfig` |
| **Logging** | `createKernelLogger` |
| **Icon generation** | `iconsModule`, `runIconsGenerate` |
| **RFC governance** | `rfcModule`, `runRfcList`, `runRfcCreate`, `runRfcValidate`, `runRfcCheck` |
| **Compass helpers** | `resolveGraceScanRoot` |

## CLI binary

```sh
# Run any registered command in a workspace site
pnpm exec site-kernel run <command> [--site <name>] [--flags]

# List all sites discovered in the workspace
pnpm exec site-kernel sites list
```

## Registering a module in an app

```typescript
// apps/my-app/tools/kernel.config.ts
import { defineKernelConfig } from "@gogol/site-kernel";
import { rfcModule } from "@gogol/site-kernel";
import { checkModule } from "./modules/check.module";

export default defineKernelConfig({
  app: { name: "my-app", directory: new URL("..", import.meta.url).pathname },
  modules: [rfcModule, checkModule],
  pipelines: {
    check: [{ command: "content.validate" }, { command: "compass.validate" }],
  },
});
```

## RFC governance commands

| Command        | What it does                                                        |
| -------------- | ------------------------------------------------------------------- |
| `rfc.list`     | List all RFCs with optional `--status` filter                       |
| `rfc.create`   | Create a new RFC draft in `docs/rfcs/`                              |
| `rfc.validate` | Validate frontmatter of all RFC files                               |
| `rfc.check`    | Verify that files declared in accepted/implemented RFCs still exist |

Flags must use inline assignment syntax: `--title="…" --kind=architecture`.

## Validation

```sh
pnpm --filter @gogol/site-kernel build:check
pnpm --filter @gogol/site-kernel test
```

## Related packages

| Package                         | Role                                                          |
| ------------------------------- | ------------------------------------------------------------- |
| `@gogol/site-kernel-astro`      | Astro-specific path helpers                                   |
| `@gogol/site-kernel-content`    | Markdown file discovery and frontmatter parsing               |
| `@gogol/site-kernel-checks`     | Shared validation commands for all Astro apps                 |
| `@gogol/site-kernel-integrity`  | File hash tracking, build provenance, Ed25519 signing         |
| `@gogol/site-kernel-codegen`    | Code generation (icons, Compass skeleton backfill, biome CSS) |
| `@gogol/site-kernel-changelog`  | AI-powered changelog generation                               |
| `@gogol/site-kernel-deploy`     | Client workspace export                                       |
| `@gogol/site-kernel-onboarding` | New-app scaffold and readiness checklist                      |
