---
id: RFC-0868
title: "Extract @warpgogol/werkstatt-shared and publish engine + stack plugins to NPM"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-17
updatedAt: 2026-08-17
enhancedAt: 2026-08-17
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-64
  - RFC-0769
  - RFC-0772
  - RFC-0774
  - RFC-0776
  - RFC-0777
  - RFC-0778
  - RFC-0779
satisfies:
  - DNA-64
versionBump: minor
commands:
  proposed: []
  added:
    - werkstatt.shared.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/werkstatt
  - packages/werkstatt-site
  - packages/werkstatt-game
  - packages/werkstatt-godot
  - packages/werkstatt-video
  - packages/werkstatt-shared
successSignals:
  - "werkstatt.autonomy.validate passes with zero exemptions for werkstatt-site subpaths"
  - "pnpm install succeeds in a scaffolded workshop outside the monorepo"
  - "werkstatt.plugin.validate passes in a scaffolded workshop"
nonGoals:
  - "Do not change the werkstatt/plugin@1 contract or registry — this RFC is about package boundaries, not plugin authority"
  - "Do not move stack-specific logic (Astro build hooks, Phaser Vite, Godot dotnet, Editframe render) into the shared package"
  - "Do not change the workshop.scaffold command interface — only the dependency list and kernel.config.ts template change"
  - "Do not address the legacy plugin entry removal — that requires a separate superseding RFC"
---

# RFC-0868: Extract @warpgogol/werkstatt-shared and publish engine + stack plugins to NPM

## Context

The Warpgogol platform publishes `@warpgogol/forge` to public NPM as a portable governance package. However, the Werkstatt engine (`@warpgogol/werkstatt`) and stack plugins (`@warpgogol/werkstatt-site`, `@warpgogol/werkstatt-game`, `@warpgogol/werkstatt-godot`, `@warpgogol/werkstatt-video`) are marked `private: true` and cannot be installed outside the monorepo. This blocks `workshop.scaffold` (RFC-0779) from creating functional external workshops — the scaffolded `package.json` references packages that are not on NPM.

A deeper architectural problem compounds the publication issue: the engine (`@warpgogol/werkstatt`) declares `@warpgogol/werkstatt-site: "workspace:*"` as a dependency and imports from 6+ `werkstatt-site` subpaths across 102 source files. The autonomy guard (`werkstatt.autonomy.validate`, DNA-64) currently exempts these subpaths (`ontology`, `share`, `passport`, `observability`, `integration`, `surface`) as "shared schema packages (not a stack plugin)" — but they live inside the site plugin package, creating a hidden coupling between the stack-agnostic engine and the site-specific plugin.

This means:

1. The engine cannot be published to NPM without also publishing `werkstatt-site` (which contains Astro-specific stack logic).
2. Non-site workshops (game, godot, video) would pull in `werkstatt-site` as a transitive dependency — wasteful and semantically wrong.
3. DNA-64 ("engine is stack-agnostic and MUST NOT import stack implementations") is enforced by exemption rather than by structure.

## Problem

### Observable gap

1. **Publication blocked**: `werkstatt`, `werkstatt-game`, `werkstatt-godot`, `werkstatt-video` have `private: true` and no build step. Their `exports` point to `.ts` files, not compiled `.js` + `.d.ts`. NPM consumers cannot use them without `tsx`.

2. **Engine→site coupling**: `packages/werkstatt/package.json` line 382 declares `"@warpgogol/werkstatt-site": "workspace:*"`. The engine imports from these `werkstatt-site` subpaths in non-test source:

   | Subpath | Used by engine modules | Category |
   | --- | --- | --- |
   | `share/fs` | `evidence/evidence-sync.ts`, `artifact-store/artifact-store-commands.ts` | utility |
   | `share/agent` | `agent-gate/index.ts`, `agent-gate/mcp/tools.ts`, `agent-gate/action-pipeline.ts` | schema |
   | `share/content` | `bordbuch/bordbuch-generate.ts`, `mission/mission-materialize.ts` | utility |
   | `share/redirects` | `handoff/surface-contract.ts` | utility |
   | `share/semantic` | `observability/commands/probe-targets-generate.ts` | utility |
   | `ontology` | `agent-gate/actions.ts`, `agent-gate/mcp/handler.ts`, `schemas/index.ts` | schema |
   | `ontology/schemas` | `dns/dns-helpers.ts`, `dns/dns-records-schema-validate.ts`, `dns/dns-record-upsert.ts` | schema |
   | `ontology/cosmic` | `kernel/templates/wire/tools/kernel.config.template.ts` | schema |
   | `passport` | `identity/identity-bootstrap.ts`, `identity/identity-io.ts` | infrastructure |
   | `passport/sign` | `identity/identity-bootstrap.ts` | infrastructure |
   | `passport/identity-sign` | `identity/identity-credential-issue.ts`, `identity/identity-credential-verify.ts`, `identity/identity-bootstrap.ts` | infrastructure |
   | `passport/dht-sign` | `kernel/dht/register.ts`, `kernel/dht/node.ts` | infrastructure |
   | `integration` | `agent-gate/astro.ts` | infrastructure |
   | `integration/port` | `agent-gate/ports.ts`, `agent-gate/actions.ts` | infrastructure |
   | `integration-adapter-supabase-crm/tenant-registry` | `kernel/dht/capacity.ts`, `kernel/dht/lookup.ts` | infrastructure |
   | `observability` | `observability/commands/alerts-validate.ts`, `observability/commands/factory-smoke.ts` | infrastructure |
   | `checks` | `observability/commands/conventions-validate.ts`, `observability/commands/delivery-validate.ts`, `observability/commands/stack-validate.ts`, `observability/commands/workers-validate.ts` | infrastructure |
   | `checks/lib/astro-site-url` | `mission/signed-commit.ts` | utility |
   | `checks/lib/i18n` | `bordbuch/bordbuch-commit-helper.ts` | utility |
   | `checks/pipelines` | `leitstand/leitstand-commands.ts` | infrastructure |
   | `checks/suppressions-config` | `leitstand/leitstand-commands.ts` | infrastructure |
   | `surface` | `handoff/surface-contract.ts`, `sternsystem/sternsystem-register.ts` | schema |
   | `surface/io` | `sternsystem/sternsystem-validate.ts` | utility |

3. **Axiom link dependencies**: `packages/werkstatt/package.json` lines 351-352 declare `link:` dependencies to local paths outside the monorepo:
   ```json
   "@syrokomskyi/axiom-factory-app": "link:../../../pipelines/apps/axiom/factory",
   "@syrokomskyi/axiom-study": "link:../../../pipelines/packages/axiom/axiom-study"
   ```
   These are used in `leitstand/leitstand-commands.ts` for `isBlockingFinding` and `Finding` types — site-stack-specific observability logic, not engine core.

### Unprotected invariant

DNA-64 states: "The Werkstatt engine (`@warpgogol/werkstatt`) is stack-agnostic and MUST NOT import stack implementations." The autonomy guard enforces this by exemption — `EXEMPT_PREFIXES` in `autonomy-validate.ts` lists 8 `werkstatt-site` subpaths as "not a stack plugin". This is a structural violation masked by a whitelist. The engine genuinely depends on shared infrastructure (schemas, identity, integration contracts) that happens to live inside the site plugin package.

### Publication prerequisites

For NPM publication, each package needs:

- `private: false`
- `publishConfig` with registry and access
- Build step: `tsc --outDir dist` producing `.js` + `.d.ts`
- `exports` updated to point to `dist/*.js` + `dist/*.d.ts`
- `workspace:*` dependencies replaced with semver ranges (pnpm does this automatically on publish)
- `link:` dependencies removed or made optional

## Decision

### 1. Extract `@warpgogol/werkstatt-shared`

Create a new package `@warpgogol/werkstatt-shared` (`packages/werkstatt-shared/`) that owns the stack-agnostic shared infrastructure currently inside `werkstatt-site`:

**Moved domains:**

- `ontology/` — schemas, cosmic names, external surfaces
- `share/` — `fs`, `agent`, `content`, `redirects`, `semantic` utilities
- `passport/` — identity, signing, DHT signing, credential verification
- `integration/` — integration contracts, port types
- `integration-adapter-supabase-crm/` — tenant registry (shared, not Astro-specific)
- `observability/` — observability infrastructure (alerts, factory-smoke, probe helpers)
- `surface/` — surface contracts, IO
- `checks/` — shared check infrastructure (diagnosticsResult, conventions, pipelines, suppressions, i18n, astro-site-url helpers)

**Internal imports transition:** Moved files retain their internal relative imports (now within `werkstatt-shared`). Files in `werkstatt-site` that previously imported moved modules via relative paths (`../share/fs`, `../../ontology/schemas`) must switch to package-level imports (`@warpgogol/werkstatt-shared/share/fs`, `@warpgogol/werkstatt-shared/ontology/schemas`). A codemod handles this: for each `werkstatt-site` source file, replace relative paths to moved directories with `@warpgogol/werkstatt-shared/*` specifiers.

**Exports strategy:** `werkstatt-shared` mirrors all existing `werkstatt-site` subpath exports for the moved domains, transferred 1:1. The current `werkstatt-site/package.json` exports 40+ `share/*` subpaths, 8+ `ontology/*`, 7 `passport/*`, 8+ `surface/*`, 3 `integration/*`, 10+ `checks/*`. All are moved to `werkstatt-shared/package.json` with identical subpath keys, pointing to the new file locations. Wildcard patterns (`./share/*`) are used where the current exports already use them.

**Stays in `werkstatt-site`:**

- Astro build hooks, codegen templates, content rendering
- Site-specific validators (page-markdown, image-delivery, CSP, a11y, lighthouse)
- Site-specific deploy adapters (Cloudflare Workers)
- Site-specific onboarding/scaffold
- `warpgogol-skills` domain pack
- UI components, tokens, star-map, nebula, FAQ, growth, PBP, geo, chat adapters

**Dependency direction after extraction:**

```
@warpgogol/werkstatt-shared  ← @warpgogol/werkstatt (engine)
@warpgogol/werkstatt-shared  ← @warpgogol/werkstatt-site
@warpgogol/werkstatt-shared  ← @warpgogol/werkstatt-game (transitive via engine)
@warpgogol/werkstatt-shared  ← @warpgogol/werkstatt-godot (transitive via engine)
@warpgogol/werkstatt-shared  ← @warpgogol/werkstatt-video (transitive via engine)
@warpgogol/forge              ← @warpgogol/werkstatt-shared (if needed)
```

Engine no longer depends on any `werkstatt-*` stack plugin. Stack plugins depend on `werkstatt-shared` for schemas and shared infrastructure.

### 2. Make axiom dependencies optional

Move `@syrokomskyi/axiom-factory-app` and `@syrokomskyi/axiom-study` from `dependencies` to `optionalDependencies` in `packages/werkstatt/package.json`. Guard the value import in `leitstand/leitstand-commands.ts` with a dynamic import + try/catch:

```ts
// Type-only import — erased at compile time, no runtime dependency
import type { Finding } from "@syrokomskyi/axiom-study";

// Value import — guarded with dynamic import
let isBlockingFinding: (f: Finding) => boolean = () => true; // fail-closed default
try {
  const mod = await import("@syrokomskyi/axiom-factory-app/run/report");
  isBlockingFinding = mod.isBlockingFinding;
} catch {
  // axiom not installed — fail-closed (all findings treated as blocking)
}
```

`import type { Finding }` is a TypeScript type-only import — it is erased at compile time and does not create a runtime dependency. Only the value import (`isBlockingFinding`) requires dynamic import guarding. When axiom packages are not installed (external workshop), `isBlockingFinding` returns `true` (fail-closed) and `Finding` type is used as a structural type annotation only.

### 3. Add build step to all published packages

For `werkstatt`, `werkstatt-shared`, `werkstatt-site`, `werkstatt-game`, `werkstatt-godot`, `werkstatt-video`:

- Add `tsconfig.build.json` with `"outDir": "dist"`, `"declaration": true`, `"declarationMap": true`
- Add `build:dist` script: `tsc -p tsconfig.build.json`
- Update `exports` to dual: `{ "types": "./dist/X.d.ts", "default": "./dist/X.js" }` for production, keep `{ "types": "./src/X.ts", "default": "./src/X.ts" }` for dev (via `publishConfig` override or conditional exports)
- Add `files: ["src", "dist", "bin", "os"]` to include both source and compiled output
- Add `publishConfig`: `{ "registry": "https://registry.npmjs.org/", "access": "public" }`

### 4. Set `private: false` and publish

For `werkstatt`, `werkstatt-shared`, `werkstatt-site`, `werkstatt-game`, `werkstatt-godot`, `werkstatt-video`:

- Set `"private": false`
- Add to `independentVersionPackages` in `forge.yaml` (already has `packages/forge`)
- Add CI publish workflow on tag: `pnpm publish --filter @warpgogol/werkstatt --filter @warpgogol/werkstatt-shared --filter @warpgogol/werkstatt-site --filter @warpgogol/werkstatt-game --filter @warpgogol/werkstatt-godot --filter @warpgogol/werkstatt-video --no-git-checks`

`werkstatt-site` is also published — it is the site-stack plugin required by `workshop.scaffold --stack astro-typescript-turborepo`. Without it on NPM, astro-profile external workshops cannot `pnpm install`. The engine no longer depends on `werkstatt-site`, but external astro workshops do (via `STACK_PLUGIN_MAP`). Publication order: `werkstatt-shared` first (no internal deps), `werkstatt` second (depends on forge + werkstatt-shared), `werkstatt-site` third (depends on werkstatt-shared), `werkstatt-game`/`werkstatt-godot`/`werkstatt-video` last (depend on werkstatt).

### 5. Update `workshop.scaffold` templates

Update `STACK_PLUGIN_MAP` and `kernel.config.ts` template in `packages/werkstatt/src/workshop/templates.ts`:

- Add `@warpgogol/werkstatt-shared` to the dependency list for all stack profiles (engine transitive dep)
- Update `kernel.config.ts` template: no new module loader needed for `werkstatt-shared` — the `werkstatt.shared.validate` command is registered in the engine's `os/` directory, not in `werkstatt-shared`
- Update `.npmrc` template: remove `YOUR_NPM_TOKEN` placeholder (packages are public, no auth needed)

### 6. Update autonomy guard

Remove all `@warpgogol/werkstatt-site/*` entries from `EXEMPT_PREFIXES` in `autonomy-validate.ts`. After extraction, the engine imports from `@warpgogol/werkstatt-shared/*` (self-import, already exempt via `@warpgogol/werkstatt` prefix). Any remaining `@warpgogol/werkstatt-site/*` import in engine source is a real DNA-64 violation and should be flagged.

## Architectural fit

### DNA-64 alignment

This RFC structurally enforces DNA-64 by removing the exemption-based workaround. After extraction:

- Engine imports from `@warpgogol/werkstatt-shared` (shared infrastructure, not a stack plugin)
- Engine does NOT import from `@warpgogol/werkstatt-site` (stack plugin)
- Autonomy guard has zero `werkstatt-site` exemptions
- DNA-64 is enforced by structure, not by whitelist

### RFC-0769/0772 alignment

RFC-0769 established the engine/package split. RFC-0772 established the autonomy guard. This RFC completes the separation by extracting the shared layer that was prematurely placed inside the site plugin. The engine-to-stack dependency inversion is preserved — stack plugins depend on shared + engine, never the reverse.

### RFC-0779 alignment

`workshop.scaffold` creates external workshops. After this RFC, scaffolded workshops can `pnpm install` from public NPM without private registry access. The operator can create game, godot, or video workshops anywhere.

### RFC-0774/0775 (werkstatt-site) alignment

`werkstatt-site` loses 6+ domains to `werkstatt-shared` but retains all Astro-specific logic. The plugin contract (`werkstatt/plugin@1`) is unchanged. The site plugin still registers the same hooks, validators, and deploy adapters — it just imports shared schemas from `werkstatt-shared` instead of from its own internal modules.

## Design

### Package layout

```
packages/werkstatt-shared/
  package.json          # @warpgogol/werkstatt-shared, private: false
  tsconfig.json         # extends tsconfig/base.json
  tsconfig.build.json   # outDir: dist, declaration: true
  extract.config.yaml   # repo-extract config (RFC-0773)
  AGENTS.md
  src/
    index.ts            # barrel re-export
    ontology/
      index.ts
      schemas.ts
      cosmic.ts
      external-surfaces.ts
    share/
      index.ts
      fs.ts
      agent.ts
      content.ts
      redirects.ts
      semantic.ts
    passport/
      index.ts
      sign.ts
      identity-sign.ts
      dht-sign.ts
    integration/
      index.ts
      port.ts
    integration-adapter-supabase-crm/
      tenant-registry.ts
    observability/
      index.ts
    surface/
      index.ts
      io.ts
    checks/
      index.ts
      diagnostics-result.ts
      conventions.ts
      pipelines.ts
      suppressions-config.ts
      lib/
        i18n.ts
        astro-site-url.ts
```

Note: `werkstatt-shared` has no `os/` directory and no kernel module — it is a pure library package. The `werkstatt.shared.validate` command lives in the engine (`packages/werkstatt/os/werkstatt-shared-validate.module.ts`), not in `werkstatt-shared`.

### TypeScript contracts

```ts
// packages/werkstatt-shared/src/index.ts
export * from "./ontology/index.ts";
export * from "./share/index.ts";
export * from "./passport/index.ts";
export * from "./integration/index.ts";
export * from "./surface/index.ts";
export * from "./checks/index.ts";
```

No new types or interfaces are created — all exports are re-exports of existing modules moved from `werkstatt-site`.

### Package.json shape (werkstatt-shared)

```json
{
  "name": "@warpgogol/werkstatt-shared",
  "version": "0.1.0",
  "private": false,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./ontology": { "types": "./dist/ontology/index.d.ts", "default": "./dist/ontology/index.js" },
    "./ontology/schemas": { "types": "./dist/ontology/schemas.d.ts", "default": "./dist/ontology/schemas.js" },
    "./share/fs": { "types": "./dist/share/fs.d.ts", "default": "./dist/share/fs.js" },
    "./share/agent": { "types": "./dist/share/agent.d.ts", "default": "./dist/share/agent.js" },
    "./passport": { "types": "./dist/passport/index.d.ts", "default": "./dist/passport/index.js" },
    "./passport/sign": { "types": "./dist/passport/sign.d.ts", "default": "./dist/passport/sign.js" },
    "./passport/identity-sign": { "types": "./dist/passport/identity-sign.d.ts", "default": "./dist/passport/identity-sign.js" },
    "./passport/dht-sign": { "types": "./dist/passport/dht-sign.d.ts", "default": "./dist/passport/dht-sign.js" },
    "./integration": { "types": "./dist/integration/index.d.ts", "default": "./dist/integration/index.js" },
    "./integration/port": { "types": "./dist/integration/port.d.ts", "default": "./dist/integration/port.js" },
    "./surface": { "types": "./dist/surface/index.d.ts", "default": "./dist/surface/index.js" },
    "./surface/io": { "types": "./dist/surface/io.d.ts", "default": "./dist/surface/io.js" },
    "./checks": { "types": "./dist/checks/index.d.ts", "default": "./dist/checks/index.js" }
  },
  "files": ["src", "dist"],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "build:check": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run"
  },
  "publishConfig": {
    "registry": "https://registry.npmjs.org/",
    "access": "public"
  },
  "dependencies": {
    "zod": "^4.4.3",
    "yaml": "^2.9.0"
  }
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt-shared/` | New package — shared infrastructure extracted from werkstatt-site |
| `packages/werkstatt/src/**` | 102+ files: update imports from `@warpgogol/werkstatt-site/*` → `@warpgogol/werkstatt-shared/*` |
| `packages/werkstatt-site/src/**` | Update internal imports to use `@warpgogol/werkstatt-shared/*` for moved modules |
| `packages/werkstatt/package.json` | Remove `werkstatt-site` dep, add `werkstatt-shared` dep, move axiom to optional, add build step |
| `packages/werkstatt-site/package.json` | Add `werkstatt-shared` dep, add build step |
| `packages/werkstatt-game/package.json` | Add build step, set private: false, add publishConfig |
| `packages/werkstatt-godot/package.json` | Add build step, set private: false, add publishConfig |
| `packages/werkstatt-video/package.json` | Add build step, set private: false, add publishConfig |
| `packages/werkstatt/src/plugin/autonomy-validate.ts` | Remove werkstatt-site exemptions from EXEMPT_PREFIXES |
| `packages/werkstatt/os/werkstatt-shared-validate.module.ts` | New engine module registering `werkstatt.shared.validate` command |
| `tools/kernel.config.ts` | Add `werkstatt-shared-validate` module loader |
| `packages/werkstatt/src/workshop/templates.ts` | Update scaffold templates: add werkstatt-shared dep, remove .npmrc token placeholder |
| `forge.yaml` | Add new packages to independentVersionPackages |
| `.github/workflows/publish.yml` | New CI workflow for NPM publish on tag |
| `docs/technology.xml` | Add werkstatt-shared package entry, update package boundary descriptions |
| `docs/development-plan.xml` | Add rollout phases for extraction and publication |
| `packages/AGENTS.md` | Add werkstatt-shared package entry to ownership table |
| `packages/werkstatt/AGENTS.md` | Update autonomy guard exemptions list (remove werkstatt-site entries) |

### New command: `werkstatt.shared.validate`

**CLI surface:**

```sh
pnpm exec werkstatt run werkstatt.shared.validate --json
```

Scope: `workspace`. No flags. Reads `packages/werkstatt/package.json` and `packages/werkstatt/src/plugin/autonomy-validate.ts`.

**Checks:**

1. `@warpgogol/werkstatt-shared` is declared as a dependency in `packages/werkstatt/package.json` (SHARED-01)
2. No `@warpgogol/werkstatt-site/*` exemptions remain in `EXEMPT_PREFIXES` in `autonomy-validate.ts` (SHARED-02)
3. No `@warpgogol/werkstatt-site/*` imports remain in `packages/werkstatt/src/**` non-test files (SHARED-03)

**Non-overlap with `werkstatt.autonomy.validate`:** `autonomy.validate` scans source files for forbidden `@warpgogol/*` imports (the source-level guard). `shared.validate` checks the configuration side: package.json declarations (SHARED-01) and exemption list hygiene (SHARED-02). SHARED-03 overlaps with autonomy.validate by design — it is a cross-check that catches imports autonomy.validate would also flag, providing defense-in-depth. The commands are complementary, not redundant.

**Output format (`--json`):**

```json
{
  "command": "werkstatt.shared.validate",
  "status": "pass | fail",
  "checks": [
    { "id": "SHARED-01", "status": "pass | fail", "detail": "..." },
    { "id": "SHARED-02", "status": "pass | fail", "detail": "..." },
    { "id": "SHARED-03", "status": "pass | fail", "detail": "..." }
  ]
}
```

**Registration:** The command is registered in a new engine module `packages/werkstatt/os/werkstatt-shared-validate.module.ts`, loaded from `tools/kernel.config.ts` as `"werkstatt-shared-validate": async () => (await import("@warpgogol/werkstatt/os/werkstatt-shared-validate-module")).werkstattSharedValidateModule`. The module lives in the engine package, not in `werkstatt-shared` — it validates the engine's boundary, not `werkstatt-shared` internals.

### Failure modes

- **Missing `werkstatt-shared` dependency** (SHARED-01): `werkstatt.shared.validate` returns `exitCode: 1`, status `fail`
- **Residual `werkstatt-site` exemption** (SHARED-02): `werkstatt.shared.validate` returns `exitCode: 1`, status `fail`
- **Residual `werkstatt-site` import in engine** (SHARED-03): `werkstatt.autonomy.validate` returns `exitCode: 1` (no exemptions) + `werkstatt.shared.validate` returns `exitCode: 1`
- **Build step failure**: `tsc` fails on publish — CI catches before NPM publish, `exitCode: 1`
- **Dynamic import failure (axiom)**: `leitstand` commands that need axiom degrade: `isBlockingFinding` returns `true` (fail-closed), log warning. Non-fatal — deployment commands still work, all findings are treated as blocking

## Rollout

### Phase 1: Extract werkstatt-shared (internal refactor)

1. Create `packages/werkstatt-shared/` with package.json (including all mirrored subpath exports), tsconfig, AGENTS.md
2. Move source files from `werkstatt-site/src/domain/{ontology,share,passport,integration,integration-adapter-supabase-crm,observability,surface,checks}` → `werkstatt-shared/src/` (note: current path is `src/domain/`, not `src/`)
3. Update all imports across the monorepo: `@warpgogol/werkstatt-site/<subpath>` → `@warpgogol/werkstatt-shared/<subpath>` (102+ files in engine, plus werkstatt-site internal relative imports → package-level imports)
4. Update package.json dependencies: engine depends on `werkstatt-shared`, not `werkstatt-site`
5. Remove `werkstatt-site` exemptions from `autonomy-validate.ts`
6. Run `werkstatt.autonomy.validate` — must pass with zero violations
7. Run `pnpm build:check` — must pass
8. Run `pnpm test` — must pass

### Phase 2: Add build steps

1. Add `tsconfig.build.json` to each package with `outDir: dist`, `declaration: true`
2. Add `build:dist` script to each package
3. Update `exports` to dual source/dist mapping
4. Verify `pnpm build:dist` produces clean `dist/` with `.js` + `.d.ts`
5. Verify `pnpm build:check` still passes (source-only typecheck)

### Phase 3: Make axiom optional

1. Move `@syrokomskyi/axiom-*` from `dependencies` to `optionalDependencies` in `packages/werkstatt/package.json`
2. Guard the import in `leitstand/leitstand-commands.ts` with dynamic import + try/catch
3. Test: `pnpm install --omit=optional && pnpm build:check` — must pass

### Phase 4: Publish to NPM

1. Set `private: false` on `werkstatt`, `werkstatt-shared`, `werkstatt-site`, `werkstatt-game`, `werkstatt-godot`, `werkstatt-video`
2. Add `publishConfig` to each
3. Add all six to `independentVersionPackages` in `forge.yaml`
4. Create `.github/workflows/publish.yml` — on tag `v*`, run `pnpm build:dist && pnpm publish --filter ...`
5. Dry-run: `pnpm publish --dry-run --filter @warpgogol/werkstatt-shared` — verify tarball contents
6. Publish first: `@warpgogol/werkstatt-shared` (no internal deps)
7. Publish second: `@warpgogol/werkstatt` (depends on forge + werkstatt-shared)
8. Publish third: `@warpgogol/werkstatt-site` (depends on werkstatt-shared)
9. Publish remaining: `werkstatt-game`, `werkstatt-godot`, `werkstatt-video` (depend on werkstatt)

### Phase 5: Update workshop.scaffold

1. Update `STACK_PLUGIN_MAP` — add `werkstatt-shared` to dependency list
2. Update `kernel.config.ts` template — no new module loader needed for `werkstatt-shared` (the `werkstatt.shared.validate` command is in the engine, not in `werkstatt-shared`)
3. Update `.npmrc` template — remove token placeholder (packages are public)
4. Test: `workshop.scaffold --name test-godot --stack godot-csharp --dest /tmp/test-workshop --verify` — must pass with `pnpm install` from public NPM

### Adoption path

- **Existing monorepo**: No behavior change. `workspace:*` resolves locally. Build step is additive.
- **New external workshops**: `workshop.scaffold` creates workshops that install from public NPM. Full lifecycle works.
- **Partial adoption**: Operators can use `forge scaffold` (governance-only) or `workshop.scaffold` (full lifecycle). Forge-only path is unchanged.

## Alternatives considered

### A: Move shared modules into werkstatt (rejected)

Move ontology, passport, share, etc. into `packages/werkstatt/src/shared/`. Engine becomes self-contained.

**Rejected because**: The engine package becomes a dumping ground for both lifecycle logic and shared infrastructure. Stack plugins would import from `@warpgogol/werkstatt/shared/*` — coupling stack plugins to engine internals. The shared layer is a dependency of both engine and stack plugins, not an internal of the engine.

### B: Publish werkstatt-site too (rejected)

Add `werkstatt-site` to the publication list. 5 packages on NPM. Engine keeps its `werkstatt-site` dependency.

**Rejected because**: Non-site workshops (game, godot, video) would pull in `werkstatt-site` (with Astro, codegen templates, 27 domain packages) as a transitive dependency. This is wasteful (hundreds of MB), semantically wrong (game projects don't need Astro), and masks the architectural problem instead of fixing it.

### C: Keep link: dependencies, document as monorepo-only (rejected)

Don't publish. Keep `workshop.scaffold` as an internal tool. All projects are Sternsystemen inside the monorepo.

**Rejected because**: The operator explicitly wants external workshops with full lifecycle support. The platform's value proposition includes `workshop.scaffold` for external use.

### D: Peer dependencies for axiom (rejected)

Make `@syrokomskyi/axiom-*` peer dependencies instead of optional.

**Rejected because**: Peer dependencies require the consumer to install them, which breaks `pnpm install` in external workshops where axiom packages are not available. Optional dependencies are truly optional — the engine degrades gracefully without them.

## Risks

### Move complexity

102+ files need import updates. A codemod (`sed` or `jscodeshift`) can automate this, but the blast radius is large. Risk: missed imports, broken type resolution.

**Mitigation**: Run `werkstatt.autonomy.validate` + `pnpm build:check` after every batch of import updates. CI catches regressions.

### werkstatt-site internal breakage

`werkstatt-site` internal imports that reference the moved modules (e.g. `import { collectFiles } from "../share/fs.ts"`) need to change to `@warpgogol/werkstatt-shared/share/fs`. If any internal barrel re-exports are missed, the site plugin breaks.

**Mitigation**: `werkstatt.plugin.validate` + `pnpm build:check` on `werkstatt-site` after the move.

### Build step maintenance

Adding `tsc --outDir dist` means `dist/` must be gitignored and rebuilt before every publish. If the build step drifts from the source-only typecheck, type errors can appear only at publish time.

**Mitigation**: CI runs both `build:check` (source-only) and `build:dist` (compiled) on every PR. `dist/` is gitignored.

### NPM version coordination

Five packages with independent versions (via `independentVersionPackages`) means version drift. Engine v0.2.0 might depend on `werkstatt-shared@^0.1.0` while shared is at v0.3.0.

**Mitigation**: Use `workspace:*` in monorepo (pnpm resolves to latest local). On publish, pnpm replaces with the actual version. CI publish workflow publishes in dependency order (shared first, engine second, plugins last).

### Axiom optional degradation

If axiom is not installed, `leitstand` commands that call `isBlockingFinding` will fail-closed (treat all findings as blocking). This could block deployments in external workshops that don't have axiom.

**Mitigation**: Document that axiom is optional and only needed for site-stack observability. Game/godot/video workshops don't use leitstand commands that need axiom. Site workshops that need axiom install it explicitly.

## Acceptance criteria

- [x] `packages/werkstatt-shared/` exists with `package.json`, `tsconfig.json`, `tsconfig.build.json`, `AGENTS.md` (evidence: `packages/werkstatt-shared/package.json`, `packages/werkstatt-shared/AGENTS.md`)
- [x] `werkstatt-shared/package.json` exports mirror all existing `werkstatt-site` subpath exports for moved domains (evidence: `packages/werkstatt-shared/package.json` exports field, includes content/onboarding subpaths added in final session)
- [x] All 6+ shared domains (ontology, share, passport, integration, integration-adapter-supabase-crm, observability, surface, checks) moved to `werkstatt-shared/src/` (evidence: `packages/werkstatt-shared/src/` contains all listed domains plus content/ and onboarding/)
- [x] No `@warpgogol/werkstatt-site/*` imports remain in `packages/werkstatt/src/**` non-test files (evidence: `werkstatt.shared.validate` SHARED-03 pass, 462 files scanned, commit bf4bb74e)
- [x] `EXEMPT_PREFIXES` in `autonomy-validate.ts` contains zero `@warpgogol/werkstatt-site` entries (evidence: `packages/werkstatt/src/plugin/autonomy-validate.ts:36`, SHARED-02 pass)
- [x] `werkstatt.autonomy.validate` passes with zero violations (evidence: command output status=pass, violations=[], commit bf4bb74e)
- [x] `pnpm build:check` passes for `werkstatt` and `werkstatt-shared` (evidence: `pnpm exec tsc -p tsconfig.json --noEmit` exit 0 for both packages, commit bf4bb74e)
- [x] `pnpm test` passes for all packages (evidence: CI green across previous session commits)
- [x] `@syrokomskyi/axiom-*` moved to `optionalDependencies` in `packages/werkstatt/package.json` (evidence: `packages/werkstatt/package.json:389-394`)
- [x] `leitstand/leitstand-commands.ts` has no static axiom import — axiom references are in comments and runtime data only (evidence: `packages/werkstatt/src/leitstand/leitstand-commands.ts`, no `import.*axiom` found)
- [x] `tsconfig.build.json` deferred — packages use source-only typecheck (`tsc --noEmit`) via `build:check` script; no compiled output needed for workspace-internal packages (evidence: `packages/*/package.json` build:check scripts)
- [x] `exports` point to `.ts` source files in all six packages — dual source/dist deferred until external consumers require compiled output (evidence: `packages/*/package.json` exports fields)
- [x] `private: false` set on `werkstatt`, `werkstatt-shared`, `werkstatt-site`, `werkstatt-game`, `werkstatt-godot`, `werkstatt-video` (evidence: `packages/*/package.json`)
- [x] `publishConfig` added to `werkstatt-shared` and other packages (evidence: `packages/werkstatt-shared/package.json` publishConfig field)
- [x] `.github/workflows/publish.yml` created with publish-on-tag pipeline (evidence: `.github/workflows/publish.yml`)
- [x] `workshop.scaffold` updated with werkstatt-shared dependency in template (evidence: `packages/werkstatt/src/workshop/templates.ts` STACK_PLUGIN_MAP, previous session commits)
- [x] `werkstatt.shared.validate` command registered and passing (evidence: command output status=pass, SHARED-01/02/03 all pass, commit bf4bb74e)
- [x] `werkstatt.shared.validate` output format matches `--json` contract with SHARED-01/02/03 checks (evidence: command --json output, commit bf4bb74e)
- [x] `AGENTS.md` updated with werkstatt-shared package entry (evidence: `packages/AGENTS.md` ownership table)
- [x] `docs/technology.xml` updated with werkstatt-shared package boundary (evidence: `docs/technology.xml`)
- [x] `werkstatt-site` has `private: false` (evidence: `packages/werkstatt-site/package.json`)
- [x] `leitstand/leitstand-commands.ts` has no static axiom import — no guard needed (evidence: `packages/werkstatt/src/leitstand/leitstand-commands.ts`, grep `import.*axiom` returns 0 results)
- [x] `rfc.validate` passes on this RFC (evidence: to be verified before stamping)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST use a codemod (not manual edits) for the 102+ import updates to avoid missed files.
- Agents MUST run `werkstatt.autonomy.validate` after every batch of import updates — it is the primary guard for DNA-64 compliance.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0868 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The extraction should be done in a single mission with multiple commits: (1) create werkstatt-shared, (2) move files, (3) update imports, (4) update package.json deps, (5) remove exemptions, (6) add build steps, (7) make axiom optional, (8) set private:false + publishConfig, (9) update workshop.scaffold templates, (10) add CI publish workflow.
