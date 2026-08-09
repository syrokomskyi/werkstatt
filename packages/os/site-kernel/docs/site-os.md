# Site OS — Operator and Extension Guide

> **Scope.** This document covers the site OS built from `@warpgogol/site-kernel` and `@warpgogol/site-kernel-astro`. It explains how to operate any site in `apps/*`, how to extend the OS with cross-site features, and how to add site-specific features to a single app.

---

## Table of contents

1. [What the site OS is](#1-what-the-site-os-is)
2. [Repository layout](#2-repository-layout)
3. [Making the CLI available](#3-making-the-cli-available)
4. [Running commands for any site](#4-running-commands-for-any-site)
5. [Running pipelines](#5-running-pipelines)
6. [Discovering all sites](#6-discovering-all-sites)
7. [Existing commands — apps/main](#7-existing-commands--appsmain)
8. [How the kernel resolves an app](#8-how-the-kernel-resolves-an-app)
9. [Onboarding a new site to the OS](#9-onboarding-a-new-site-to-the-os)
10. [Extending with a cross-site feature (shared module)](#10-extending-with-a-cross-site-feature-shared-module)
11. [Adding a site-specific feature](#11-adding-a-site-specific-feature)
12. [Key types and contracts](#12-key-types-and-contracts)
13. [Flags reference](#13-flags-reference)
14. [Validation cheatsheet](#14-validation-cheatsheet)

---

## 1. What the site OS is

The site OS is a thin runtime layer that lets every app in `apps/*` register typed commands and pipelines that can be invoked uniformly through the `site-kernel` CLI bin.

```
monorepo root
├── packages/
│   ├── site-kernel          @warpgogol/site-kernel   ← framework-free OS core
│   └── site-kernel-astro    @warpgogol/site-kernel-astro  ← Astro path helpers
└── apps/
    ├── main/
    │   └── tools/
    │       ├── kernel.config.ts   ← registers modules + pipelines for main
    │       ├── modules/           ← domain modules (check, service, sync, integrity)
    │       └── runtime/           ← command handler implementations
    └── my-app/
        └── tools/
            └── kernel.config.ts  ← same pattern
```

**Core concepts:**

| Concept | What it is |
| --- | --- |
| **Command** | A named, typed function `execute(input, context) → result`. |
| **Module** | A group of related commands that registers itself with the kernel. |
| **Pipeline** | An ordered list of command names that run sequentially, failing fast. |
| **Config** | `tools/kernel.config.ts` in each app — exports `defineKernelConfig(...)`. |
| **Discovery** | The kernel scans `apps/*/tools/` for a `kernel.config.ts` on startup. |
| **Context** | Every command receives `workspaceRoot`, `app`, `logger`, `dryRun`, `outputFormat`. |

---

## 2. Repository layout

```
packages/os/site-kernel/src/
  types.ts        ← all shared interfaces and the defineKernelConfig helper
  discovery.ts    ← app scanning, config loading, workspace root detection
  registry.ts     ← KernelRegistry (registerCommand, registerPipeline)
  runtime.ts      ← parseKernelArgv, executeKernelCommand, executeKernelPipeline
  logger.ts       ← createKernelLogger (pretty / JSON modes)
  cli/index.ts    ← site-kernel bin (apps list | run | pipeline)
  index.ts        ← public package exports

packages/os/site-kernel-astro/src/
  index.ts        ← getAstroSitePaths, requireAstroSitePaths

apps/<site>/tools/
  kernel.config.ts          ← defineKernelConfig({ modules, pipelines })
  modules/
    check.module.ts         ← registers content/funding/thin-copy/token validators
    service.module.ts       ← registers icon generator and open-source page generator
    sync.module.ts          ← registers funding program hash sync
    integrity.module.ts     ← registers all integrity tracking commands
    deploy.module.ts        ← registers client.export (workspace snapshot to ../clients/)
  runtime/
    app.ts                  ← helpers for accessing AstroSitePaths in a handler
    check.ts                ← handler implementations for check commands
    service.ts              ← handler implementations for service commands
    sync.ts                 ← handler implementations for sync commands
    integrity.ts            ← handler implementations for integrity commands
    client-export.ts        ← thin re-export of runClientExport from site-kernel-deploy
```

---

## 3. Making the CLI available

The `site-kernel` CLI bin is provided by `@warpgogol/site-kernel`. For it to be callable by name from anywhere in the monorepo, the root `package.json` must declare it as a `devDependency` and `pnpm install` must have been run.

**Root `package.json` requirement:**

```json
{
  "devDependencies": {
    "@warpgogol/site-kernel": "workspace:*"
  }
}
```

After `pnpm install`, pnpm links the bin into `node_modules/.bin/`:

```
node_modules/.bin/site-kernel        ← POSIX shell script
```

**Invoking the bin:**

| Context                                  | Command                                      |
| ---------------------------------------- | -------------------------------------------- |
| POSIX shells (bash, zsh) — monorepo root | `site-kernel run <command>`                  |
| Explicit `pnpm exec` (works everywhere)  | `pnpm exec site-kernel run <command>`        |
| Via npm script alias                     | `pnpm --filter @warpgogol/main site-os:apps` |

---

## 4. Running commands for any site

All commands run through the `site-kernel` CLI bin. The kernel discovers the workspace root automatically from any directory inside the monorepo.

```sh
pnpm exec site-kernel run content.validate --site main
```

```sh
pnpm exec site-kernel run content.validate --site main --json
```

**Flags accepted by every `run` invocation:**

| Flag            | Effect                                                                        |
| --------------- | ----------------------------------------------------------------------------- |
| `--site <name>` | Target a specific app by its directory name.                                  |
| `--all`         | Run the command for every app that has a `kernel.config.ts`.                  |
| `--dry-run`     | Log what would happen for state-mutating commands without persisting changes. |
| `--json`        | Emit structured JSON instead of pretty output.                                |
| `-- ...args`    | Pass extra positional arguments through to the command handler.               |

---

## 5. Running pipelines

A pipeline runs a named sequence of commands in order, failing fast on the first error.

```sh
pnpm exec site-kernel pipeline build.check --site main
```

Pipelines are declared in `kernel.config.ts` under the `pipelines` key (example):

```ts
"pipelines": {
  "build.check": [
    { "command": "open-source.generate" },
    { "command": "icons.generate" },
    { "command": "content.validate" },
    { "command": "thin-copy.validate" },
    { "command": "tokens.ds.lint" },
    { "command": "tokens.colors.lint" }
  ]
}
```

---

## 6. Discovering all sites

List all apps the kernel discovers (pretty):

```sh
pnpm exec site-kernel apps list
```

Machine-readable JSON:

```sh
pnpm exec site-kernel apps list --json
```

Sample output:

```
Workspace: /projects/warpgogol-3
- main -> /projects/warpgogol-3/apps/main/tools/kernel.config.ts
- my-app -> no config
```

Apps without a `tools/kernel.config.ts` are listed but not executable through the OS.

---

## 7. Existing commands — apps/main

### check domain

| Command | Description |
| --- | --- |
| `content.validate` | Validate page frontmatter for `title` and `metaDescription`. |
| `compass.inventory` | Generate `docs/compass-inventory.xml` for the current repository state. |
| `compass.validate` | Validate authored source files against the current Compass scaffolding policy. |
| `compass.annotate` | Add Compass headers (MODULE_CONTRACT, MODULE_MAP, CHANGE_SUMMARY) using AI. Requires `OPENAI_API_KEY`. |
| `compass.anchors` | Add Compass headers, COMPASS_BLOCK anchors, and @ai-invariant comments deterministically. |
| `compass.clear` | Remove Compass headers, COMPASS_BLOCK anchors, and @ai-invariant lines added by the codegen Compass commands. Accepts `--history <N>` to target only newly added files in the last `N` commits. |
| `funding.validate` | Check funding program entries for freshness and verification state. |
| `thin-copy.validate` | Detect hardcoded visitor-facing copy in Astro templates. |
| `tokens.ds.lint` | Enforce `--ds-*` naming for all CSS custom properties. |
| `tokens.colors.lint` | Reject raw `rgba(...)` and `#hex` colors in CSS files. |

**Compass backfill commands:**

Two commands are available for adding Compass scaffolding to source files:

| Command | Approach | What it adds | Requirements |
| --- | --- | --- | --- |
| `compass.annotate` | AI-powered (OpenAI GPT-4o-mini) | Headers only (MODULE_CONTRACT, MODULE_MAP, CHANGE_SUMMARY) — higher quality, file-specific descriptions | `OPENAI_API_KEY` |
| `compass.anchors` | Deterministic (no AI) | Headers + COMPASS_BLOCK anchors + @ai-invariant — template-based, generic descriptions | None |
| `compass.clear` | Deterministic cleanup | Removes headers, anchors, and @ai-invariant lines added by `compass.annotate` / `compass.anchors` | None |

**When to use which:**

- **Only `compass.anchors`** — Recommended for complete Compass markup with anchors and invariant markers. Fast, deterministic, no API key needed. Headers use simple templates.
- **`compass.annotate` then `compass.anchors`** — For highest quality: AI-generated descriptive headers plus anchors/invariant. The second pass will skip files that already have headers.
- **Only `compass.annotate`** — When you want AI-generated headers but don't need anchors or invariant markers.
- **`compass.clear`** — When you want to remove generated Compass markup for a specific app before a fresh pass or manual cleanup. Can also be scoped to only newly added files via `--history <DEPTH>`.

### service domain

| Command | Description |
| --- | --- |
| `icons.generate` | Generate Astro icon wrapper components from LordIcon JSON assets. |
| `icons.clean` | Remove the generated icon `gen/` directory. |
| `open-source.generate` | Build `open-source.md` from production dependencies via pnpm-licenses. Supports `--show-versions` to include package versions (default: hidden). |

### sync domain

| Command        | Description                                                                 |
| -------------- | --------------------------------------------------------------------------- |
| `funding.sync` | Fetch official funding program pages, detect changes, update source hashes. |

### integrity domain

| Command | Description |
| --- | --- |
| `integrity.init` | Initialize integrity tracking for the app. |
| `integrity.update` | Update manifests after file additions, deletions, moves, or edits. |
| `integrity.verify` | Verify tracked file integrity against stored manifests. |
| `integrity.build-record` | Collect build output hashes and store provenance data. |
| `integrity.sign` | Sign the latest build record with an Ed25519 private key. |
| `integrity.verify-release` | Verify a signed release manifest against a public key. |
| `integrity.keys.generate` | Generate an Ed25519 signing keypair. |
| `integrity.backfill-revisions` | Back-fill revision counts from Git history. |

### deploy domain

| Command | Description |
| --- | --- |
| `client.export` | Copy the entire workspace to `../clients/[app-name]`, filtered by root `.gitignore` and `.windsurfignore`. `.env` / `.env.*` files are always copied; `.git` is never copied. The target directory is cleared (preserving its own `.git`) before copying. |

**Exclusion rules for `client.export`:**

| Rule                                | Behaviour                                               |
| ----------------------------------- | ------------------------------------------------------- |
| Patterns in root `.gitignore`       | Excluded (directory patterns prune the entire subtree). |
| Patterns in root `.windsurfignore`  | Excluded (same semantics).                              |
| `.env` and `.env.*` files           | **Always copied**, regardless of any ignore pattern.    |
| `.git` folder                       | **Never copied**, regardless of anything else.          |
| Target `../clients/[app-name]/.git` | **Preserved** during the pre-copy clear step.           |

**Usage:**

```sh
pnpm exec site-kernel run client.export --site main
```

Or directly:

```sh
site-kernel run client.export --site main
```

The target path is always `<workspace-root>/../clients/<app-name>` — one level above the monorepo root. If the directory does not exist it is created automatically.

### Pipelines

| Pipeline | Steps |
| --- | --- |
| `build.prepare` | `open-source.generate` → `icons.generate` |
| `build.check` | `open-source.generate` → `icons.generate` → all `check.*` → `tokens.*` |
| `compass` | `compass.annotate` → `compass.anchors` → `compass.inventory` → `compass.validate` |
| `integrity.release` | `integrity.build-record` → `integrity.sign` → `integrity.verify-release` |

**Compass backfill pipeline:**

The `compass` provides complete, high-quality Compass markup generation:

1. `compass.annotate` — Adds AI-generated headers (MODULE_CONTRACT, MODULE_MAP, CHANGE_SUMMARY)
2. `compass.anchors` — Adds COMPASS_BLOCK anchors and @ai-invariant comments (skips headers if already present)
3. `compass.inventory` — Generates `docs/compass-inventory.xml` with current state
4. `compass.validate` — Validates files against Compass scaffolding policy

Usage:

```sh
pnpm exec site-kernel pipeline compass --site <name>
```

`compass.inventory` and `compass.validate` are also available as standalone commands but are intentionally kept out of the mandatory `build.check` pipeline until the corresponding rollout wave has completed for the targeted source surface.

---

## 8. How the kernel resolves an app

When a command runs, the kernel resolves the target app in this order:

1. **`--site <name>` flag** — uses the named app directly.
2. **`--all` flag** — uses every app that has a `kernel.config.ts`.
3. **Current working directory** — if `cwd` is inside one of the discovered app directories, that app is used automatically.
4. **Single app** — if only one app has a kernel config, it is used as a default.
5. **Error** — no target can be resolved; the command exits with an error.

Config loading happens lazily at execution time via `tsx` dynamic import, so adding or editing a `kernel.config.ts` never requires a build step.

---

## 9. Onboarding a new site to the OS

Follow these steps to make a new app in `apps/<name>` a full OS participant.

### Step 1 — add the kernel dependency

In `apps/<name>/package.json`:

```json
{
  "dependencies": {
    "@warpgogol/site-kernel": "workspace:*"
  }
}
```

Run `pnpm install` from the repository root.

### Step 2 — create `tools/kernel.config.ts`

```ts
// apps/<name>/tools/kernel.config.ts
import { defineKernelConfig } from "@warpgogol/site-kernel";
import { checkModule } from "./modules/check.module";

export default defineKernelConfig({
  name: "<name>",
  description: "<name> site OS",
  modules: [checkModule],
  pipelines: {
    "build.check": [
      { command: "content.validate" },
    ],
  },
});
```

### Step 3 — create at least one module

```ts
// apps/<name>/tools/modules/check.module.ts
import type { KernelModule } from "@warpgogol/site-kernel";
import { runContentValidation } from "../runtime/check";

export const checkModule: KernelModule = {
  name: "check",
  version: "0.1.0",
  register(registry) {
    registry.registerCommand({
      name: "content.validate",
      description: "Validate page frontmatter.",
      scope: "app",
      execute: runContentValidation,
    });
  },
};
```

### Step 4 — implement the command handlers

```ts
// apps/<name>/tools/runtime/check.ts
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

export async function runContentValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
) {
  const { app, logger } = context;
  // use app.directory to find content
  logger.success("Content OK");
}
```

### Step 5 — verify

```sh
site-kernel apps list  # new app should appear with its config path
```

```sh
site-kernel run content.validate --site <name>
```

```sh
site-kernel pipeline build.check --site <name>
```

---

## 10. Extending with a cross-site feature (shared module)

Cross-site features go into a new module inside an existing or new package, then are imported into each site's `kernel.config.ts`. The kernel itself needs no changes.

### Option A — add to `site-kernel-astro` (Astro-specific shared logic)

Suitable when the feature is re-usable across all Astro sites in `apps/` and depends on the standard Astro directory layout.

1. Add helpers to `packages/os/site-kernel-astro/src/`.
2. Export from `packages/os/site-kernel-astro/src/index.ts`.
3. Import in each `apps/<name>/tools/modules/<domain>.module.ts`.

### Option B — add a new shared package (framework-agnostic)

Suitable when the feature has no Astro dependency.

1. Create `packages/<pkg>/` following the same `src/index.ts` + `package.json` pattern.
2. Add it to `pnpm-workspace.yaml` if it is not auto-discovered.
3. Import in each `apps/<name>/tools/modules/`.

### Option C — inline a new module in a single app, then promote later

When the scope is unclear, start inside one app's `tools/modules/`, make it work, then move it to a package once the API stabilises.

### Practical example — a shared `a11y.validate` command

1. Add a `runA11yValidation` handler to `packages/os/site-kernel-astro/src/a11y.ts`.
2. Export it from the package index.
3. Create `tools/modules/a11y.module.ts` in each app:

```ts
import { runA11yValidation } from "@warpgogol/site-kernel-astro";
import type { KernelModule } from "@warpgogol/site-kernel";

export const a11yModule: KernelModule = {
  name: "a11y",
  version: "0.1.0",
  register(registry) {
    registry.registerCommand({
      name: "a11y.validate",
      description: "Check accessibility compliance.",
      scope: "app",
      execute: runA11yValidation,
    });
  },
};
```

4. Add `a11yModule` to `modules: [...]` in each `kernel.config.ts`.

---

## 11. Adding a site-specific feature

Site-specific features stay entirely inside `apps/<name>/tools/`. They are invisible to other sites and are never promoted to packages unless explicitly needed elsewhere.

### Example — a `legal.validate` command only for apps/main

The command checks legal pages for a `pageTitle` field, which is a `main`-only convention not shared with other sites.

1. **Add the handler** in `apps/main/tools/runtime/check.ts`:

```ts
export async function runLegalPageValidation(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
) {
  const paths = requireAstroSitePaths(context);
  // ... read files under paths.contentPagesDirectory
  context.logger.success("Legal pages OK");
}
```

2. **Register it** in `apps/main/tools/modules/check.module.ts`:

```ts
registry.registerCommand({
  name: "legal.validate",
  description: "Validate legal page required fields.",
  scope: "app",
  execute: runLegalPageValidation,
});
```

3. **Optionally add to a pipeline** in `apps/main/tools/kernel.config.ts`:

```ts
"build.check": [
  // ...existing steps...
  { command: "legal.validate" },
],
```

---

## 12. Key types and contracts

### KernelCommandDefinition

```ts
interface KernelCommandDefinition<TData = unknown> {
  name: string;           // dot-separated namespace, e.g. "content.validate"
  description: string;
  scope: "app" | "workspace";
  mutatesState?: boolean;    // enables dry-run warning from the kernel
  requiresNetwork?: boolean; // informational metadata
  execute(
    input: KernelCommandInput,
    context: KernelRuntimeContext,
  ): Promise<void | KernelCommandResult<TData>> | void | KernelCommandResult<TData>;
}
```

### KernelRuntimeContext

```ts
interface KernelRuntimeContext {
  workspaceRoot: string;       // absolute path to the pnpm workspace root
  app?: DiscoveredKernelApp;   // present when scope === "app"
  logger: KernelLogger;        // section / info / warn / error / success
  dryRun: boolean;
  outputFormat: "pretty" | "json";
}
```

### KernelCommandResult

```ts
interface KernelCommandResult<TData = unknown> {
  data?: TData;         // returned to the report for JSON consumers
  exitCode?: number;    // defaults to 0
  summary?: string;     // logged as success when exitCode === 0
}
```

### KernelModule

```ts
interface KernelModule {
  name: string;
  version: string;
  register(registry: KernelModuleRegistry): void | Promise<void>;
}
```

### KernelAppConfig

```ts
interface KernelAppConfig {
  name?: string;
  description?: string;
  modules: KernelModule[];
  pipelines?: Record<string, KernelPipelineStep[]>;
}
```

Use `defineKernelConfig(config)` as the export helper — it is a typed identity function that gives editors full autocomplete for the config shape.

---

## 13. Flags reference

### site-kernel CLI global flags

| Flag | Applies to | Effect |
| --- | --- | --- |
| `--site <name>` | `run`, `pipeline` | Target a specific app. |
| `--all` | `run`, `pipeline` | Run across all apps with a kernel config. |
| `--dry-run` | `run`, `pipeline` | Skip state mutations; print what would change. |
| `--json` | `run`, `pipeline`, `apps list` | Emit machine-readable JSON. |

### Command-level passthrough

Everything after `--` is forwarded verbatim to the command handler's `input.args` array. Flags before `--` that start with `--` and are not consumed by the CLI dispatcher are forwarded as `input.flags`.

---

## 14. Validation cheatsheet

Kernel packages (use `pnpm` for package-level type/test checks):

```sh
pnpm --filter @warpgogol/site-kernel build:check
```

```sh
pnpm --filter @warpgogol/site-kernel test
```

```sh
pnpm --filter @warpgogol/site-kernel-astro build:check
```

Single app via OS:

```sh
pnpm exec site-kernel run content.validate --site main
```

```sh
pnpm exec site-kernel pipeline build.check --site main
```

All apps:

```sh
pnpm exec site-kernel run content.validate --all
```

```sh
pnpm exec site-kernel pipeline build.check --all
```
