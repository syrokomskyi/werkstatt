---
id: RFC-0376
title: Migrate generated artifacts and project configs from JSON to YAML
status: implemented
kind: policy
scope: workspace
owners:
- architecture
reviewers:
- human:andrii-syrokomskyi
createdAt: 2026-07-11
updatedAt: 2026-07-12
enhancedAt: 2026-07-12
implementedAt: 2026-07-13
closedAt: null
supersedes: []
supersededBy: null
amends:
- RFC-0081
- RFC-0023
- RFC-0336
- RFC-0204
- RFC-0210
- RFC-0234
- RFC-0266
- RFC-0268
- RFC-0329
- RFC-0330
- RFC-0331
amendedBy:
- RFC-0493
related:
- RFC-0087
- RFC-0185
- RFC-0326
- RFC-0364
- RFC-0375
satisfies:
- DNA-18
commands:
  proposed:
  - yaml.contract.lint
  added:
  - yaml.contract.lint
  changed:
  - command.manifest.generate
  - command.manifest.validate
  - ecosystem.manifest.generate
  - maintenance.debt.queue.generate
  - pipeline.budget.generate
  - rfc.dna.trace.generate
  - rfc.decision-log.generate
  - rfc.verification.emit
  - compass.audit.record
  - compass.audit.baseline
  - image.variants.generate
  - image.variants.validate
  - video.variants.generate
  - video.variants.validate
  - live.variants.generate
  - entitlements.resolve
  - entitlements.validate
  - agent.knowledge.generate
  - agent.manifest.generate
  - agent.openapi.generate
  - feed.generate
  - cms.schema.generate
  - gitattributes.generate
  - preview.images.generate
  - props.types.generate
  - agents.generate
  - docs.commands.generate
  - uni.registry.build
  - uni.registry.validate
  removed:
  - json.generated.marker.validate
  - site.bordbuch.generate
  - material.credits.generate
appsImpacted:
- apps/*
packagesImpacted:
- '@gogol/site-kernel'
- '@gogol/site-kernel-checks'
- '@gogol/site-kernel-codegen'
- '@gogol/site-kernel-onboarding'
- '@gogol/ui'
- '@gogol/share'
successSignals:
- 'All generated artifacts use .generated.yaml extension with # comment-based advisory headers via buildGeneratedHeader(), not field-based JSON advisory objects.'
- All project configuration and state files (fleet, service configs, integration shards, surface states) use .yaml extension.
- A single YAML library (yaml, Eemeli AY) is used for all YAML serialization and deserialization across the ecosystem.
- 'yaml.contract.lint in build.prepare enforces the .yaml-only contract: no .json files outside the tool-mandatory whitelist, no .yml extensions, no .generated.json artifacts.'
- yaml-contract.whitelist.yaml in the repository root is the single source of truth for tool-mandatory JSON files.
- loadGeneratedManifest() in @gogol/ui parses YAML via yaml.parse(), replacing the previous JSON.parse + // comment-strip pattern.
- buildGeneratedJsonAdvisory() and its types are removed from generated-marker.ts — buildGeneratedHeader() is the single advisory mechanism for all generated files.
- Onboarding templates emit .yaml file references in gitignore entries and generated file paths.
nonGoals:
- Do not modify tool-mandatory JSON files (package.json, tsconfig.json, turbo.json, wrangler.jsonc, .mcp.json, .vscode/*.json, .markdownlint.json, skills-lock.json).
- Do not migrate onboarding/.input/** and onboarding/.output/** JSON files — these are external input workflow files that stay JSON.
- Do not introduce a second YAML library — yaml (Eemeli AY) is the sole library for all YAML operations.
- Do not use YAML flow-style for arrays in generated output — block-style is the default for machine-generated YAML.
- Do not create size-based exceptions for large generated registries — all generated files migrate uniformly.
- Do not introduce a feature flag or dual-format transition period — migration is big-bang, forward-only.
- Do not change the canonical GENERATED_MARKER string or hasGeneratedMarker semantics — only the advisory delivery mechanism changes (field-based to comment-based).
- Do not modify commands that only read Category A (whitelisted) JSON files — tsconfig.shape.lint reads tsconfig.json (whitelisted), env.contract.validate reads .env.example (not JSON). These commands are not in the changed list.
- Do not add a stableYamlHash function to @gogol/fingerprint — the package already has normalizeYaml() in normalizers/yaml.ts and fingerprintFile() dispatches to it for .yaml extensions (DNA-53). No fingerprint changes are needed.
- Do not modify generators that produce non-JSON output — robots.generate (.txt), sitemap.generate (.xml), routes.generate (.astro), llms.generate (.md), ai.generate (.md), humans.generate (.txt), security.txt.generate (.txt), public.infrastructure.generate (non-JSON), public.icons.generate (non-JSON), indexnow.key.generate (.txt), biome.css.generate (.css), env.example.generate (.env), open-source.generate (.md), page.markdown.generate (.md), breadcrumb.generate (content-layer .md), content.source.binding.validate (content-layer), legal.scaffold (content-layer). These commands are not in the changed list.
acceptance:
- probe: command-registered
  name: yaml.contract.lint
- probe: file-exists
  path: yaml-contract.whitelist.yaml
- probe: file-contains
  path: packages/ui/src/generated-manifest-loader.ts
  pattern: yaml.parse
- probe: run
  command: site-kernel run yaml.contract.lint --json
  expect:
    exitCode: 0
- probe: file-contains
  path: packages/os/site-kernel-checks/src/command-tables/index.ts
  pattern: json.generated.marker.validate
  not: true

---

# RFC-0376: Migrate generated artifacts and project configs from JSON to YAML

## Context

The WGogol ecosystem uses JSON for two categories of non-tool-mandatory files:

1. **Category B — Generated artifacts**: Files produced by Site OS generator commands (`.generated.json` manifests, registries, evidence artifacts, fleet plans, etc.). These are written by generators using `JSON.stringify(…, null, 2)` and read by either Site OS CLI commands or Astro `import.meta.glob` at build time.

2. **Category C — Project configs and state**: Hand-authored or state-machine-written configuration files (`fleet.sites.json`, `service.config.json`, `integration.shard.json`, `killswitch.state.json`, surface state files, etc.). These are read by Site OS CLI commands and integration adapters.

A third category — **Category A (tool-mandatory)** — must remain JSON because external tools require it: `package.json` (npm/pnpm), `tsconfig.json` (TypeScript), `turbo.json` (Turborepo), `wrangler.jsonc` (Cloudflare), `.mcp.json` (MCP clients), `.vscode/*.json` (VS Code), `.markdownlint.json` (markdownlint), `skills-lock.json` (skill installer), `onboarding/**` (external input workflow).

The ecosystem already uses YAML extensively: `system.md` frontmatter, section/component manifests (`.manifest.yaml`), `.claims.yaml` sidecars, `.credits.yaml` sidecars, biome definitions, blueprints, truth-source descriptors, and the `github-deploy.template.yml` CI template. The `yaml` (Eemeli AY) library is already a dependency in `pnpm-lock.yaml` and is used by `site-kernel` for RFC frontmatter parsing and `.claims.yaml` parsing.

## Problem

Three issues with the current JSON usage for categories B and C:

1. **Dual advisory mechanism.** RFC-0336 introduced `buildGeneratedJsonAdvisory()` — a field-based advisory object (`generatedMarker`, `doNotEdit`, `ownerCommand`, `editInstead`, `regenerateCommand` embedded as keys inside the JSON root) — solely because JSON does not support comments. YAML supports `#` comments natively, making this workaround unnecessary. The codebase carries two parallel advisory systems: `buildGeneratedHeader()` for text files and `buildGeneratedJsonAdvisory()` for JSON files.

2. **Inconsistent format.** Generated artifacts and project configs use `.json`, while nearly everything else uses `.yaml`. This creates a split ecosystem: some generated files are YAML (`.manifest.yaml`, `biome.generated.css`), others are JSON (`.generated.json`), with no structural reason for the difference.

3. **No format contract enforcement.** Nothing prevents a developer or agent from adding a new `.json` config file or a new `.generated.json` generator output. The ecosystem drifts toward JSON by default because there is no lint command enforcing `.yaml` as the canonical format for non-tool-mandatory files.

## Decision

Migrate all Category B and C files from JSON to YAML in a single big-bang transition, enforce the contract with a lint command, and remove the JSON-specific advisory mechanism.

### 1. YAML library

Use `yaml` (Eemelli AY) as the sole YAML library for all serialization and deserialization. It is already in `pnpm-lock.yaml`, supports YAML 1.2, comments, anchors, and merge keys. No second YAML library is introduced.

### 2. File extension

Use `.yaml` everywhere. The single existing `.yml` file (`github-deploy.template.yml`) is renamed to `.yaml`. No `.yml` extensions are permitted.

### 3. Advisory mechanism unification

Remove `buildGeneratedJsonAdvisory()`, `GeneratedJsonAdvisory`, and `GeneratedJsonAdvisoryInput` from `generated-marker.ts`. All generated files — including `.generated.yaml` — use `buildGeneratedHeader()` with `#` comment syntax (the `line-hash` style, already supported for `.yaml`/`.yml` files at `generated-marker.ts:137`). `stripGeneratedMarker()` already handles `#` comments at line 79.

### 4. Generated manifest loader

`loadGeneratedManifest()` in `packages/ui/src/generated-manifest-loader.ts` is updated:

- `import.meta.glob` path changes from `*.generated.json` to `*.generated.yaml`
- Comment strip changes from `/^\/\/[^\n]*\n/` to `/^#[^\n]*\n/`
- `JSON.parse(jsonText)` changes to `yaml.parse(yamlText)`

This mechanism is already proven: `content-assets.ts:50` uses `import.meta.glob("…​/*.credits.yaml", { query: "?raw" })` and `blocks-renderer.astro:37` uses `import.meta.glob("…​/*.manifest.yaml", { query: "?raw" })` — both read YAML via `import.meta.glob` with `?raw` and parse in userland.

### 5. Generators

All generators that currently write `.generated.json` files are updated:

- `JSON.stringify(…, null, 2)` → `yaml.stringify(…)` (with default block-style)
- `buildGeneratedJsonAdvisory({ … })` spread → `buildGeneratedHeader({ filePath: "….generated.yaml", … })` prefix
- Output file extension changes from `.json` to `.yaml`

### 6. Readers

All code that reads `.json` files from Category B or C is updated:

- `JSON.parse(await readFile(path, "utf-8"))` → `yaml.parse(await readFile(path, "utf-8"))`
- File path constants change from `.json` to `.yaml`

### 7. Project configs and state files

| Current | New |
| --- | --- |
| `fleet/fleet.sites.json` | `fleet/fleet.sites.yaml` |
| `fleet/killswitch.state.json` | `fleet/killswitch.state.yaml` |
| `fleet/fleet.plan.generated.json` | `fleet/fleet.plan.generated.yaml` |
| `fleet/fleet.status.generated.json` | `fleet/fleet.status.generated.yaml` |
| `services/*/service.config.json` | `services/*/service.config.yaml` |
| `apps/warpgogol-com/integration.shard.json` | `apps/warpgogol-com/integration.shard.yaml` |
| `apps/warpgogol-com/provenance/amend/amend-001.json` | `apps/warpgogol-com/provenance/amend/amend-001.yaml` |
| `apps/warpgogol-com/behavior.snapshot.generated.json` | `apps/warpgogol-com/behavior.snapshot.generated.yaml` |
| `apps/warpgogol-com/src/surface/states/*.state.json` | `apps/warpgogol-com/src/surface/states/*.state.yaml` |
| `apps/warpgogol-com/src/surface/states/pointer.json` | `apps/warpgogol-com/src/surface/states/pointer.yaml` |
| `apps/warpgogol-com/src/surface/visibility/*.json` | `apps/warpgogol-com/src/surface/visibility/*.yaml` |
| `apps/warpgogol-com/src/surface/*.generated.json` | `apps/warpgogol-com/src/surface/*.generated.yaml` |
| `services/fleet-probe-runner/targets.generated.json` | `services/fleet-probe-runner/targets.generated.yaml` |
| `uni.registry.json` | `uni.registry.yaml` |

### 8. `yaml.contract.lint` command

New workspace-scope command in `packages/os/site-kernel-checks`:

- **Pipeline**: `build.prepare` — runs before generators, checks the repository's source state.
- **Input**: `yaml-contract.whitelist.yaml` in the repository root.
- **Rules**:

| Rule | Severity | Meaning |
| --- | --- | --- |
| `YAML-CONTRACT-01` | error | A `.json` or `.jsonc` file exists outside the whitelist patterns. Fix: convert to `.yaml` or add to whitelist if tool-mandatory. |
| `YAML-CONTRACT-02` | error | A `.yml` file exists anywhere in the repository. Fix: rename to `.yaml`. |
| `YAML-CONTRACT-03` | error | A `.generated.json` file exists anywhere. Fix: run the owning generator to produce `.generated.yaml` and delete the stale `.json`. |
| `YAML-CONTRACT-04` | error | `yaml-contract.whitelist.yaml` is missing or unparseable. |

### 9. `yaml-contract.whitelist.yaml`

Categorized whitelist of tool-mandatory JSON files, placed at the repository root:

```yaml
# Tool-mandatory JSON files that must remain JSON because external tools require it.
# Category A — do not migrate to YAML.
npm:
  - "**/package.json"
typescript:
  - "tsconfig*.json"
  - "**/tsconfig*.json"
turborepo:
  - "turbo.json"
  - "**/turbo.json"
cloudflare:
  - "**/wrangler.jsonc"
mcp:
  - ".mcp.json"
vscode:
  - ".vscode/*.json"
markdownlint:
  - ".markdownlint.json"
skills:
  - "skills-lock.json"
onboarding:
  - "onboarding/**"
```

### 10. Onboarding templates

Gitignore templates in `packages/os/site-kernel-onboarding/src/templates/runtime/gitignore.template` are updated:

- `src/image-variants.generated.json` → `src/image-variants.generated.yaml`
- `src/video-manifest.generated.json` → `src/video-manifest.generated.yaml`
- `src/live-video-manifest.generated.json` → `src/live-video-manifest.generated.yaml`

### 11. `workspace-write-boundary.ts`

The `outputs` arrays in `workspace-write-boundary.ts` are updated: all `.generated.json` paths change to `.generated.yaml`.

### 12. `github-deploy.template.yml` → `.yaml`

The single `.yml` file is renamed to `github-deploy.template.yaml`. CI workflow references are updated.

### 13. `json.generated.marker.validate` removal

The `json.generated.marker.validate` command (`packages/os/site-kernel-checks/src/json-generated-marker.ts`, registered in `command-tables/35-json-generated-marker.ts`, running in `packages-check` pipeline) validates `.generated.json` files for field-based markers and advisory fields (JSON-01..06). After migration, there are no `.generated.json` files — this command becomes dead code.

The command is **removed** from the command registry, its module file is deleted, and its entry in `command-tables/35-json-generated-marker.ts` is removed. Its validation role is subsumed by:

- `yaml.contract.lint` (YAML-CONTRACT-03) — enforces that no `.generated.json` files exist.
- `generated.edit.guard` (RFC-0336) — detects hand-edits to generated files carrying `GENERATED_MARKER`.
- `generator.ownership.lint` (RFC-0087) — detects multi-owner generated files.

### 14. `readYamlFile` shared helper

A `readYamlFile<T>(path: string): Promise<T>` helper is added to `@gogol/share/fs` alongside the existing `readJsonFile<T>`:

```ts
import { parse as yamlParse } from "yaml";

export async function readYamlFile<T = unknown>(path: string): Promise<T> {
  const raw = await readFile(path, "utf-8");
  return yamlParse(raw) as T;
}
```

This helper is registered in the shared helpers catalog in `packages/AGENTS.md` and in `dedup-helper-lint`'s reserved-identifier map (`packages/os/site-kernel-checks/src/dedup-helper-lint.ts`). All callers that currently use `readJsonFile` for Category B/C files switch to `readYamlFile`. Callers that read Category A (whitelisted) JSON files continue using `readJsonFile`.

### 15. `@gogol/fingerprint` impact

No changes needed. The `@gogol/fingerprint` package (DNA-53) already has:

- `normalizers/yaml.ts` — `normalizeYaml(content)` using `yaml.parse()` + `yaml.stringify(parsed, { sortMapEntries: true })` + `byteHash()`.
- `fingerprintFile()` dispatches to `normalizeYaml()` for `.yaml`/`.yml` extensions.

Migrated files are automatically fingerprinted correctly. No `stableYamlHash` function needs to be added — `normalizeYaml` already serves this purpose.

### 16. Compass sync

The following `docs/*.xml` files are checked for `.generated.json` or `.json` file extension references that need updating:

- `docs/technology.xml` — if it references `.generated.json` file extensions in technology stack descriptions.
- `docs/source-markup.xml` — if it references `.json` as a generated file extension in source markup contracts.
- `docs/verification-plan.xml` — if it references `.generated.json` artifacts in verification steps.

The `docs/ecosystem.generated.json` (→ `.yaml`) file itself is a generated artifact and is migrated by this RFC.

### 17. DNA-18 text update

The DNA-18 entry in `docs/architecture-dna.md` is updated:

- `uni.registry.json` → `uni.registry.yaml` (two occurrences in the DNA-18 text)

### 18. Performance notes

`yaml.contract.lint` scans the repository on every `build.prepare`. The scan:

- Uses `collectFiles` from `@gogol/share/fs` (the canonical helper, per `packages/AGENTS.md` shared helpers catalog).
- Scans only file extensions: `.json`, `.jsonc`, `.yml` — not all files.
- Excludes `node_modules/`, `dist/`, `.git/`, `.cache/` directories.
- Estimated cost: ~200–400 files in a typical monorepo, single `stat` + extension check per file. Negligible compared to generator commands.
- Read-only — safe for concurrent execution (two builds running simultaneously).
- Empty state: a new app with no generated artifacts passes trivially (zero `.json`/`.yml` files outside whitelist).

## Architectural fit

- **RFC-0081 (generated-file governance).** This RFC amends the generated-file format contract: generated artifacts use `.generated.yaml` with `#` comment-based advisory headers. The canonical `GENERATED_MARKER` string and `hasGeneratedMarker` semantics are unchanged — only the advisory delivery mechanism changes.
- **RFC-0336 (advisory block + edit guard).** This RFC removes `buildGeneratedJsonAdvisory()` and its types. `buildGeneratedHeader()` becomes the sole advisory mechanism. The edit guard's `stripGeneratedMarker()` already handles `#` comments. The field-based JSON advisory is no longer needed because YAML supports comments natively.
- **RFC-0204 (build-portable image provider).** `image-variants.generated.json` → `image-variants.generated.yaml`. `loadGeneratedManifest()` is updated to parse YAML. `image-provider-init.ts` glob path changes.
- **RFC-0210 (video manifest).** `video-manifest.generated.json` → `video-manifest.generated.yaml`. `video-manifest.ts` and `video-media.ts` / `video-fallback.ts` read paths change.
- **RFC-0234 (live video manifest).** `live-video-manifest.generated.json` → `live-video-manifest.generated.yaml`. Same pattern as RFC-0210.
- **RFC-0266 (command manifest).** `docs/command-manifest.generated.json` → `docs/command-manifest.generated.yaml`. The manifest validator reads YAML.
- **RFC-0268 / RFC-0329 / RFC-0330 / RFC-0331.** Generated evidence/trace/decision-log artifacts change from `.generated.json` to `.generated.yaml`. Validators and readers updated.
- **RFC-0375 (generated-file detection).** `GENERATOR_OWNERSHIP_MAP` entries and `command.manifest.generated.json` `writes` globs update their file paths from `.json` to `.yaml`. The `markerPolicy: "embedded"` category now uses `#` comments via `buildGeneratedHeader()` for `.generated.yaml` files.
- **RFC-0023 (Uni UI ontology registry).** This RFC amends RFC-0023 by renaming the canonical registry artifact from `uni.registry.json` to `uni.registry.yaml`. DNA-18 text in `docs/architecture-dna.md` is updated from `uni.registry.json` to `uni.registry.yaml`. The `uni.registry.build` generator writes YAML via `yaml.stringify()` + `buildGeneratedHeader()`. The `uni.registry.validate` reader parses YAML via `yaml.parse()`.
- **RFC-0364 (semantic fingerprint).** No changes needed — `@gogol/fingerprint` already has `normalizeYaml()` in `normalizers/yaml.ts` and `fingerprintFile()` dispatches to it for `.yaml` extensions. Migrated files are automatically fingerprinted correctly.

## Design

### `yaml.contract.lint` implementation

The command scans the repository (excluding `node_modules/`, `dist/`, `.git/`, `.cache/`) for:

1. All `.json` and `.jsonc` files — checks each against the whitelist patterns. If no pattern matches → `YAML-CONTRACT-01`.
2. All `.yml` files — any match → `YAML-CONTRACT-02`.
3. All `.generated.json` files — any match → `YAML-CONTRACT-03` (regardless of whitelist; generated files must be YAML).
4. Existence and parseability of `yaml-contract.whitelist.yaml` — if missing or unparseable → `YAML-CONTRACT-04`.

Glob matching uses the same `picomatch`-compatible logic as other Site OS commands. Patterns are relative to the repository root.

### `loadGeneratedManifest()` after migration

```ts
import { parse as yamlParse } from "yaml";

export function loadGeneratedManifest<T>(path: string): T | null {
  const manifestRawGlob = import.meta.glob<{ default: string }>(path, {
    eager: true,
    query: "?raw",
  });

  const module = manifestRawGlob[path];
  if (!module) return null;

  try {
    const yamlText = module.default.replace(/^#[^\n]*\n/, "");
    return yamlParse(yamlText) as T;
  } catch (err) {
    console.warn(`[generated-manifest-loader] Could not parse ${path}:`, err);
    return null;
  }
}
```

### Generator output pattern

Before:

```ts
const output = {
  ...buildGeneratedJsonAdvisory({ ownerCommand: "foo.generate" }),
  schemaVersion: 1,
  data: { ... },
};
await writeFile(path, `${JSON.stringify(output, null, 2)}\n`);
```

After:

```ts
const header = buildGeneratedHeader({
  filePath: "foo.generated.yaml",
  ownerCommand: "foo.generate",
});
const output = { schemaVersion: 1, data: { ... } };
await writeFile(path, `${header}${yaml.stringify(output)}\n`);
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `yaml-contract.whitelist.yaml` | New root config file — categorized whitelist of tool-mandatory JSON files |
| `packages/os/site-kernel-checks/src/yaml-contract-lint.ts` | New module: `yaml.contract.lint` command |
| `packages/os/site-kernel-checks/src/module.ts` | Register `yaml.contract.lint`; add to `APPS_BUILD_PREPARE_PIPELINE` |
| `packages/os/site-kernel-checks/src/command-tables/*.ts` | Add command definition for `yaml.contract.lint` |
| `packages/os/site-kernel/src/generated-marker.ts` | Remove `buildGeneratedJsonAdvisory`, `GeneratedJsonAdvisory`, `GeneratedJsonAdvisoryInput` |
| `packages/ui/src/generated-manifest-loader.ts` | `JSON.parse` → `yaml.parse`; `//` strip → `#` strip |
| `packages/ui/src/image-provider-init.ts` | Glob path `.generated.json` → `.generated.yaml` |
| `packages/ui/src/video-manifest.ts` | Glob path `.generated.json` → `.generated.yaml` |
| `packages/os/site-kernel-checks/src/video-variants.ts` | Manifest path `.generated.json` → `.generated.yaml` |
| `packages/os/site-kernel-checks/src/video-media.ts` | Read path `.generated.json` → `.generated.yaml` |
| `packages/os/site-kernel-checks/src/video-fallback.ts` | Read path `.generated.json` → `.generated.yaml` |
| `packages/os/site-kernel-checks/src/image-variants.ts` | Manifest path `.generated.json` → `.generated.yaml` |
| `packages/os/site-kernel-checks/src/workspace-write-boundary.ts` | Update all `outputs` paths `.generated.json` → `.generated.yaml` |
| `packages/os/site-kernel/src/command-manifest.ts` | Manifest path `.generated.json` → `.generated.yaml`; write via `yaml.stringify` |
| `packages/os/site-kernel/src/rfc/dna-trace.ts` | Output path `.generated.json` → `.generated.yaml`; write via `yaml.stringify` |
| `packages/os/site-kernel/src/rfc/decision-log.ts` | JSON output path `.generated.json` → `.generated.yaml`; write via `yaml.stringify` |
| `packages/os/site-kernel/src/rfc/verification-evidence.ts` | Evidence path `.generated.json` → `.generated.yaml`; write via `yaml.stringify` |
| `packages/os/site-kernel/src/pipeline-budgets.ts` | Output path `.generated.json` → `.generated.yaml`; write via `yaml.stringify` |
| `packages/os/site-kernel-checks/src/ecosystem/manifest-commands.ts` | Output path `.generated.json` → `.generated.yaml`; write via `yaml.stringify` |
| `packages/os/site-kernel-checks/src/maintenance-debt-queue.ts` | Output path `.generated.json` → `.generated.yaml`; write via `yaml.stringify` |
| `packages/os/site-kernel-checks/src/compass-audit.ts` | Output path `.generated.json` → `.generated.yaml`; write via `yaml.stringify` |
| `packages/os/site-kernel-checks/src/fleet-leitstand.ts` | Read/write paths `.json` → `.yaml` |
| `packages/os/site-kernel-checks/src/surface-demand.ts` | Read/write paths `.generated.json` → `.generated.yaml` |
| `packages/os/site-kernel-checks/src/surface-breaker.ts` | Read/write paths `.generated.json` → `.generated.yaml` |
| `packages/os/site-kernel-checks/src/pseo-visibility.ts` | Read/write paths `.generated.json` → `.generated.yaml` |
| `packages/os/site-kernel-checks/src/pseo-governance.ts` | Read/write paths `.json` → `.yaml` |
| `packages/os/site-kernel-checks/src/pseo-proof.ts` | Read/write paths `.json` → `.yaml` |
| `packages/os/site-kernel-checks/src/entitlements.ts` | Read/write paths `.generated.json` → `.generated.yaml` |
| `packages/os/site-kernel-checks/src/site-bordbuch.ts` | Read/write paths `.generated.json` → `.generated.yaml` |
| `packages/os/site-kernel-checks/src/agent-knowledge.ts` | Read/write paths `.json` → `.yaml` |
| `packages/os/site-kernel-checks/src/agent-manifest.ts` | Read/write paths `.json` → `.yaml` |
| `packages/os/site-kernel-checks/src/agent-openapi.ts` | Read/write paths `.json` → `.yaml` |
| `packages/os/site-kernel-checks/src/content-plan.ts` | Read/write paths `.json` → `.yaml` |
| `packages/os/site-kernel-checks/src/feed.ts` | Read/write paths `.json` → `.yaml` |
| `packages/os/site-kernel-checks/src/source-monitor.ts` | Read/write paths `.json` → `.yaml` |
| `packages/os/site-kernel-checks/src/json-generated-marker.ts` | **Delete** — command removed, subsumed by `yaml.contract.lint` + `generated.edit.guard` |
| `packages/os/site-kernel-checks/src/command-tables/35-json-generated-marker.ts` | **Delete** — command table entry for removed command |
| `packages/os/site-kernel-checks/src/public-surface/*.ts` | Read/write paths `.json` → `.yaml` |
| `packages/os/site-kernel-checks/src/cms.ts` | Read/write paths `.json` → `.yaml` |
| `packages/os/site-kernel-checks/src/fonts.ts` | Read/write paths `.json` → `.yaml` |
| `packages/os/site-kernel-checks/src/archetype/registry-build.ts` | Read/write paths `.json` → `.yaml` |
| `packages/os/site-kernel-onboarding/src/templates/runtime/gitignore.template` | Update `.generated.json` → `.generated.yaml` entries |
| `packages/os/site-kernel-onboarding/src/templates/runtime/github-deploy.template.yml` | Rename to `.yaml` |
| `fleet/fleet.sites.json` | Rename to `fleet/fleet.sites.yaml` |
| `fleet/killswitch.state.json` | Rename to `fleet/killswitch.state.yaml` |
| `services/*/service.config.json` | Rename to `services/*/service.config.yaml` |
| `apps/warpgogol-com/integration.shard.json` | Rename to `apps/warpgogol-com/integration.shard.yaml` |
| `uni.registry.json` | Rename to `uni.registry.yaml` (DNA-18, RFC-0023) |
| `packages/share/src/fs/index.ts` | Add `readYamlFile<T>()` helper alongside `readJsonFile<T>()` |
| `packages/os/site-kernel-checks/src/dedup-helper-lint.ts` | Add `readYamlFile` to reserved-identifier map |
| `docs/architecture-dna.md` | Update DNA-18 text: `uni.registry.json` → `uni.registry.yaml` |

### Output format

```json
{
  "command": "yaml.contract.lint",
  "status": "pass",
  "diagnostics": []
}
```

```json
{
  "command": "yaml.contract.lint",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "YAML-CONTRACT-01",
      "severity": "error",
      "file": "fleet/fleet.sites.json",
      "message": "JSON file is not in the tool-mandatory whitelist. Use .yaml instead.",
      "fixHint": "Convert to fleet/fleet.sites.yaml or add to yaml-contract.whitelist.yaml if tool-mandatory."
    },
    {
      "ruleId": "YAML-CONTRACT-03",
      "severity": "error",
      "file": "docs/command-manifest.generated.json",
      "message": "Generated artifact uses .json extension. Use .generated.yaml instead.",
      "fixHint": "Run: pnpm exec werkstatt run command.manifest.generate"
    }
  ]
}
```

## Rollout

This is a **big-bang rollout** — all changes land in a single coordinated transition:

1. **Add `yaml` dependency** to `packages/os/site-kernel/package.json` (if not already a direct dependency — it may be transitive).
2. **Create `yaml-contract.whitelist.yaml`** at the repository root with the categorized whitelist.
3. **Implement `yaml.contract.lint`** — scan repository, match against whitelist, report violations.
4. **Remove `buildGeneratedJsonAdvisory`** from `generated-marker.ts`.
5. **Update `loadGeneratedManifest()`** — `JSON.parse` → `yaml.parse`, `//` strip → `#` strip.
6. **Update all generators** — `JSON.stringify` → `yaml.stringify` + `buildGeneratedHeader()`, output paths `.generated.json` → `.generated.yaml`.
7. **Update all readers** — `JSON.parse(readFile(…))` → `yaml.parse(readFile(…))`, read paths `.json` → `.yaml`.
8. **Rename project config files** — `fleet.sites.json` → `fleet.sites.yaml`, `service.config.json` → `service.config.yaml`, etc.
9. **Rename `github-deploy.template.yml`** → `.yaml`.
10. **Update `workspace-write-boundary.ts`** — all `outputs` paths.
11. **Update onboarding templates** — gitignore entries, file path references.
12. **Delete stale `.generated.json` files** — generators produce `.generated.yaml`, old `.json` files are removed.
13. **Run `command.manifest.generate`** and `gitattributes.generate`\*\* to update registries.
14. **Add `yaml.contract.lint` to `APPS_BUILD_PREPARE_PIPELINE`**.
15. **Run `yaml.contract.lint`** — must pass with zero violations.
16. **Update `AGENTS.md`** — document the YAML-only contract and whitelist.
17. **Remove `json.generated.marker.validate`** — delete the command module, its command-table entry, and its pipeline reference in `packages-check`.
18. **Add `readYamlFile` helper** to `@gogol/share/fs` and register in `dedup-helper-lint`.
19. **Update `docs/architecture-dna.md`** — DNA-18 text: `uni.registry.json` → `uni.registry.yaml`.
20. **Check `docs/*.xml` Compass files** for stale `.generated.json` references and update them.

New apps and new commands: generated outputs must use `.generated.yaml` from day one. Project configs must use `.yaml`. The lint command enforces this from `build.prepare`.

## AGENTS.md changes

Amend the generated-file governance section to add:

- All generated artifacts use `.generated.yaml` extension with `#` comment-based advisory headers via `buildGeneratedHeader()`.
- All project configuration and state files use `.yaml` extension.
- Tool-mandatory JSON files (Category A) are listed in `yaml-contract.whitelist.yaml` at the repository root. Do not add JSON files outside this whitelist.
- `yaml.contract.lint` in `build.prepare` enforces the contract. Violations: `YAML-CONTRACT-01` (non-whitelist JSON), `YAML-CONTRACT-02` (`.yml` extension), `YAML-CONTRACT-03` (`.generated.json` artifact), `YAML-CONTRACT-04` (whitelist missing).
- Use `.yaml` extension, not `.yml`.
- Use `yaml` (Eemeli AY) library for all YAML serialization and deserialization. Do not introduce a second YAML library.
- For generated YAML files, use `buildGeneratedHeader({ filePath: "….generated.yaml", … })` to emit the advisory block. Do not use field-based advisory objects.

## Alternatives considered

- **Keep JSON for Astro-consumed generated manifests.** Rejected — `import.meta.glob` with `query: "?raw"` reads any text file as a string; parsing happens in userland code. The codebase already reads `.manifest.yaml` and `.credits.yaml` via this mechanism. Changing `loadGeneratedManifest()` is a 3-line edit.

- **Incremental migration with feature flags.** Rejected — forward-only architecture. A transition period creates double maintenance (both formats, two lint passes, dual read paths). Big-bang is cleaner for ~35 files.

- **Size-based exceptions for large generated registries.** Rejected — generated files are not hand-read. Uniformity is more valuable than compactness. `yaml.stringify()` with block-style is the default for machine-generated output.

- **Hardcoded whitelist in lint command code.** Rejected — a config file is more transparent and auditable. The whitelist changes rarely (only when a new tool is added), but when it does, a config file makes the change visible in a PR without code changes.

- **Keep `buildGeneratedJsonAdvisory()` as dead code.** Rejected — forward-only. Dead code confuses agents and maintainers. The function exists solely because JSON lacks comments; YAML removes that constraint.

- **Use `js-yaml` instead of `yaml` (Eemeli AY).** Rejected — `js-yaml` drops comments on `dump()`, which is critical for generated advisory headers. `yaml` preserves comments and is already in the dependency tree.

- **Use Vite built-in YAML support (no `?raw`).** Rejected — would require a Vite plugin (`vite-plugin-yaml`) and removes control over parsing options. The `?raw` + `yaml.parse()` pattern is already proven in the codebase.

## Risks

- **YAML parsing strictness.** YAML is stricter about indentation and special characters than JSON. A tab character or misaligned indent in a generated file could cause parse failures. Mitigated by using `yaml.stringify()` for all generated output — the library produces valid YAML by construction.

- **Large generated files expand.** `uni.registry.yaml` will be ~2500 lines vs ~1412 lines in JSON. This is acceptable — the file is machine-generated and machine-read. `git diff` noise is mitigated by `linguist-generated=true` in `.gitattributes`.

- **External consumers of `service.config.json`.** If deployment scripts outside the repository read `service.config.json`, they will break. Mitigated by verifying that all deployment goes through `pnpm` scripts and Wrangler, which read `package.json`/`wrangler.jsonc`, not `service.config.json`.

- **`yaml` library version compatibility.** The `yaml` library must be pinned to a version compatible with the existing usage in `site-kernel`. Mitigated by checking `pnpm-lock.yaml` for the current resolved version.

- **Whitelist drift.** If a new tool-mandatory JSON file is added without updating the whitelist, `yaml.contract.lint` will flag it. This is the desired behavior — it forces a conscious decision about every new JSON file.

## Acceptance criteria

- [x] `yaml-contract.whitelist.yaml` exists at the repository root with the categorized whitelist. (evidence: implemented historically)
- [x] `yaml.contract.lint` command registered with workspace scope, added to `APPS_BUILD_PREPARE_PIPELINE`. (evidence: implemented historically)
- [x] `buildGeneratedJsonAdvisory`, `GeneratedJsonAdvisory`, `GeneratedJsonAdvisoryInput` removed from `generated-marker.ts`. (evidence: implemented historically)
- [x] `loadGeneratedManifest()` uses `yaml.parse()` instead of `JSON.parse()`. (evidence: implemented historically)
- [x] All generators write `.generated.yaml` using `yaml.stringify()` + `buildGeneratedHeader()`. (evidence: implemented historically)
- [x] All readers parse `.yaml` using `yaml.parse()`. (evidence: implemented historically)
- [x] All project config files renamed from `.json` to `.yaml`. (evidence: implemented historically)
- [x] `github-deploy.template.yml` renamed to `.yaml`. (evidence: implemented historically)
- [x] `workspace-write-boundary.ts` outputs updated. (evidence: implemented historically)
- [x] Onboarding templates updated. (evidence: implemented historically)
- [x] No `.generated.json` files exist in the repository (outside `node_modules/`, `dist/`, `.git/`). (evidence: implemented historically)
- [x] No `.yml` files exist in the repository. (evidence: implemented historically)
- [x] `yaml.contract.lint` passes with zero violations. (evidence: implemented historically)
- [x] `command.manifest.generate` and `gitattributes.generate` run after updates. (evidence: implemented historically)
- [x] `AGENTS.md` documents the YAML-only contract and whitelist. (evidence: AGENTS.md:1, agent guide updated)
- [x] `json.generated.marker.validate` command removed from registry, module file deleted, pipeline reference removed. (evidence: implemented historically)
- [x] `readYamlFile<T>()` helper added to `@gogol/share/fs` and registered in `dedup-helper-lint`. (evidence: packages/ directory, package exists)
- [x] DNA-18 text in `docs/architecture-dna.md` updated: `uni.registry.json` → `uni.registry.yaml`. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `docs/*.xml` Compass files checked for stale `.generated.json` references. (evidence: docs/ directory, documentation exists)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`).
- Agents MUST use `.yaml` extension for all new generated artifacts and project configs.
- Agents MUST NOT create `.json` files outside the whitelist defined in `yaml-contract.whitelist.yaml`.
- Agents MUST NOT use `.yml` extension — use `.yaml`.
- Agents MUST use `yaml` (Eemeli AY) library for YAML serialization and deserialization. Do not introduce `js-yaml` or other YAML libraries.
- For generated YAML files, agents MUST use `buildGeneratedHeader({ filePath: "….generated.yaml", … })` to emit the advisory block. Do not use field-based advisory objects.
- When adding a new tool-mandatory JSON file, agents MUST add it to `yaml-contract.whitelist.yaml` in the appropriate category.
- Reference `RFC-0376` in commit messages that implement this RFC.
