---
id: RFC-0375
title: "Universal generated-file detection and agent lookup command"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-08
updatedAt: 2026-07-12
enhancedAt: 2026-07-12
implementedAt: 2026-07-12
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0081
  - RFC-0336
amendedBy: []
related:
  - RFC-0087
  - RFC-0185
  - RFC-0224
  - RFC-0266
  - RFC-0326
  - RFC-0330
  - RFC-0334
  - RFC-0376
satisfies: []
commands:
  proposed:
    - generated.file.lookup
    - generated.files.validate
  added:
    - generated.file.lookup
    - generated.files.validate
  changed:
    - generated.marker.validate
    - generated.edit.guard
    - llms.generate
    - page.markdown.generate
    - robots.generate
    - sitemap.generate
    - feed.generate
    - ai.generate
    - humans.generate
    - security.txt.generate
    - public.infrastructure.generate
    - public.icons.generate
    - indexnow.key.generate
    - preview.images.generate
    - image.variants.generate
    - video.variants.generate
    - live.variants.generate
    - cms.schema.generate
    - agent.manifest.generate
    - agent.openapi.generate
    - agent.knowledge.generate
    - surface.generate
    - passport.key.rotate
  removed: []
appsImpacted:
  - apps/*
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
successSignals:
  - "An AI agent can query any file path in the workspace and receive a definitive answer: generated or not, owner command, regenerate command, edit-instead target."
  - "Binary generated files (PNG, WebP, MP4, ICO, HLS segments) are protected by generated.edit.guard exactly like text files — hand edits without owner changes are flagged."
  - "Public-facing generated text files (llms.txt, public/*.md twins, robots.txt, sitemap.xml, feed.xml, ai.txt, humans.txt, security.txt) no longer carry the GENERATED_MARKER comment block, so external consumers (LLMs, search engines, RSS readers) receive clean output."
  - "Internal generated text files (src/pages/*.astro, AGENTS.md, biome.generated.css, *.generated.yaml) continue to carry the embedded marker — self-describing, no external consumer."
  - "GENERATOR_OWNERSHIP_MAP entries carry markerPolicy and module fields, making the categorization and owner-resolution data machine-readable."
  - "generated.files.validate checks that every registry-declared generated file exists on disk, covering both Category A and Category B."
nonGoals:
  - "Do not change the canonical GENERATED_MARKER string or hasGeneratedMarker substring semantics — detection for Category A files is unchanged."
  - "Do not introduce sidecar files for binary generated assets — the registry is the single source of truth for Category B."
  - "Do not create a concrete generated-files.manifest.json listing every individual file — lookup is dynamic via glob-matching against existing registries."
  - "Do not remove linguist-generated=true from .gitattributes for any generated pattern — GitHub collapsing is still desired for all generated files."
  - "Do not change dist.generated-marker.strip behavior — it remains a no-op for files without a marker."
  - "Do not mass-rewrite all generated files in one commit; markers are removed from public files as each generator is next run."
acceptance:
  - probe: command-registered
    name: "generated.file.lookup"
  - probe: command-registered
    name: "generated.files.validate"
  - probe: run
    command: "site-kernel run generated.file.lookup --path apps/webgogol-com/public/robots.txt --json"
    expect:
      exitCode: 0
  - probe: file-contains
    path: "packages/os/site-kernel-checks/src/generator-ownership.ts"
    pattern: "markerPolicy"
---

# RFC-0375: Universal generated-file detection and agent lookup command

## Context

The workspace governs generated files through two layers:

1. **RFC-0081** — a single canonical `GENERATED_MARKER` string embedded in every generated text file, detected by `hasGeneratedMarker(content)`.
2. **RFC-0336** — an advisory block (`buildGeneratedHeader`) wrapping the marker with owner command, edit-instead target, and regenerate command; plus `GENERATOR_OWNERSHIP_MAP` (RFC-0087) and `command.manifest.generated.yaml` (RFC-0266) as machine-readable registries of generated paths. RFC-0376 unified the advisory mechanism: `buildGeneratedJsonAdvisory()` is removed and all generated files use `buildGeneratedHeader()` with `#` comment syntax.

This system works well for **internal text files** (`src/pages/*.astro`, `AGENTS.md`, `*.generated.yaml`, `biome.generated.css`) — the marker is embedded, self-describing, and invisible to end users because Astro renders these files into HTML.

However, two categories of generated files cannot or should not carry an embedded text marker:

### Category B-a: Binary files

PNG, WebP, MP4, WebM, ICO, SVG (as icon), HLS `.ts` segments, `.m3u8` manifests — text cannot be embedded in binary content. These files are already registered in `GENERATOR_OWNERSHIP_MAP` (e.g. `public/favicon.svg`, `public/icon-192.png`, `public/_img/**/*.webp`, `public/_video/**`), but `generated.edit.guard` skips them entirely because `isGeneratedMarkerTextCandidate()` returns `false` for binary extensions.

### Category B-b: Public-facing text files

`public/llms.txt`, `public/llms-full.txt`, `public/*.md` (page markdown twins), `public/robots.txt`, `public/sitemap.xml`, `public/feed.xml`, `public/ai.txt`, `public/humans.txt`, `public/.well-known/security.txt`, `public/_headers`, `public/_redirects` — these files are served directly to external consumers (LLMs, search engines, RSS readers, browsers) without Astro rendering. The `GENERATED_MARKER` comment block is visible in the raw output and pollutes the content that LLMs and crawlers consume.

Currently, `llms.generate` prepends `# GENERATED. Do not change this line...` to `llms.txt`, `page.markdown.generate` prepends `<!-- GENERATED... -->` to every `public/*.md` twin, `robots.generate` prepends the marker to `robots.txt`, and so on. This is actively harmful for the LLM-facing files that the ecosystem produces for AI consumption.

## Problem

Three gaps are unprotected:

1. **No detection for binary generated files.** `generated.edit.guard` filters by `isGeneratedMarkerTextCandidate()` and skips all binary files. A hand-edited `public/favicon.ico` or `public/_img/portrait/320.webp` is invisible to the guard. An AI agent editing a binary generated file has no in-file signal and no programmatic way to ask "is this file generated?"

2. **Marker pollution in public-facing text files.** `llms.txt` starts with `# GENERATED. Do not change this line...` — the exact file designed for LLM consumption begins with an internal governance comment. `public/*.md` twins carry `<!-- GENERATED... -->` blocks. `robots.txt`, `sitemap.xml`, `feed.xml`, `ai.txt`, `humans.txt`, `security.txt` all carry marker blocks that are visible to external consumers.

3. **No agent-facing lookup command.** An AI agent that encounters a file has no programmatic way to ask "is this file generated? who owns it? how do I regenerate it?" The information exists in `GENERATOR_OWNERSHIP_MAP` and `command.manifest.generated.json`, but there is no command that resolves a specific path to its ownership metadata. Agents must reverse-engineer the owner by reading source code.

## Decision

Extend the generated-file governance to cover all file types, remove markers from public-facing files, and add an agent-facing lookup command:

1. **Two marker policies.** Every entry in `GENERATOR_OWNERSHIP_MAP` declares `markerPolicy: "embedded" | "registry-only"` (default `"embedded"` for backward compatibility). `embedded` files carry the in-file marker; `registry-only` files are identified solely through the registry. The rule is: `public/**` → `registry-only`, everything else → `embedded`. Binary files in any location → `registry-only`.

2. **`generated.file.lookup`** (workspace, read-only) — agent-facing command that resolves any file path to its generation metadata: `generated: boolean`, `category`, `ownerCommand`, `regenerateCommand`, `editInstead`, `detectionMethod`. Supports `--path <path>` for single-file lookup and `--diff` for batch lookup of all changed files in the git diff.

3. **`generated.files.validate`** (workspace, read-only) — checks that every registry-declared generated file exists on disk. Covers both Category A (embedded) and Category B (registry-only). Replaces the Category B file-existence checking that `generated.marker.validate` was doing implicitly.

4. **`generated.marker.validate`** (changed) — scoped to Category A files only (embedded marker policy). No longer reports Category B files as "unmarked generated files."

5. **`generated.edit.guard`** (changed) — extended to all file types, not just `isGeneratedMarkerTextCandidate()` files. For Category B files, owner resolution uses the `module` field from `GENERATOR_OWNERSHIP_MAP` instead of the in-file "Edit instead:" advisory line. `GEN-EDIT-02` (marker removal) applies only to Category A files.

6. **`GENERATOR_OWNERSHIP_MAP`** (changed) — `OwnershipEntry` gains `markerPolicy?: "embedded" | "registry-only"` (default `"embedded"`) and `module?: string` (repo-relative path to the command's source module). All `public/**` entries are marked `markerPolicy: "registry-only"` with their corresponding `module` paths.

7. **Generators** (changed) — generators that produce `public/**` files stop emitting `buildGeneratedHeader()` / `GENERATED_MARKER` in their output. The marker is removed from: `llms.generate`, `page.markdown.generate`, `robots.generate`, `sitemap.generate`, `feed.generate`, `ai.generate`, `humans.generate`, `security.txt.generate`, `public.infrastructure.generate`, `public.icons.generate`, `indexnow.key.generate`, `preview.images.generate`, `image.variants.generate` (manifest YAML keeps marker — it's `src/` not `public/`), `video.variants.generate` (same), `live.variants.generate` (same), `public.surface.generate`, `cms.schema.generate`, `bordbuch.generate`, `agent.manifest.generate`, `agent.openapi.generate`, `agent.knowledge.generate`, `surface.generate`, `surface.starmap.generate`, `webgogol.check.hints.generate`, `passport.key.rotate`.

8. **Binary regeneration exemption** — `generated.edit.guard` does not flag `GEN-EDIT-01` for Category B binary files that are deleted and recreated by their owning generator (e.g. `public/og-image.png` regenerated by `preview.images.generate`). The guard detects deletion + recreation in the VCS diff and exempts it when the owner module is unchanged. This prevents false positives for binary regeneration workflows (RFC-0150).

## Architectural fit

- **RFC-0081 (generated-file governance).** This RFC amends the marker policy: Category A files keep the embedded marker; Category B files are identified via registry only. The canonical `GENERATED_MARKER` string and `hasGeneratedMarker` semantics are unchanged for Category A.
- **RFC-0336 (advisory block + edit guard).** This RFC extends the guard to binary and public-facing files. The advisory block (`buildGeneratedHeader`) remains for Category A files. RFC-0376 removed `buildGeneratedJsonAdvisory()` — all generated files, including `.generated.yaml`, use `buildGeneratedHeader()` with `#` comment syntax.
- **RFC-0087 (single owner) / `GENERATOR_OWNERSHIP_MAP`.** The ownership map gains `markerPolicy` and `module` fields. It remains the authoritative file governance registry.
- **RFC-0266 (command manifest).** `command.manifest.generated.yaml` `writes` globs are unchanged. `markerPolicy` lives only in `GENERATOR_OWNERSHIP_MAP` — the manifest describes the command surface, the ownership map governs files.
- **RFC-0185 (strip markers from dist).** `dist.generated-marker.strip` becomes a no-op for Category B files (they never had a marker in `public/`). It still strips markers from Category A files that were copied to `dist/` (e.g. `AGENTS.md` if copied). No change needed.
- **RFC-0326 (files modified reporting).** `generated.file.lookup --diff` reads the same VCS diff as `generated.edit.guard` and `commit.message.lint`. No new diff mechanism.
- **RFC-0376 (JSON→YAML migration).** All `.generated.json` files are now `.generated.yaml`. `buildGeneratedJsonAdvisory()` is removed. `buildGeneratedHeader()` is the sole advisory mechanism for all generated files. This RFC's Category A examples and `GENERATOR_OWNERSHIP_MAP` entries reflect the post-RFC-0376 world.
- **RFC-0224 (accepted→implemented transition).** Agents MUST NOT implement this RFC until it reaches `accepted` status. After implementation, the transition follows RFC-0224.
- **RFC-0330 (verification evidence).** This RFC has acceptance probes; verification evidence must be emitted per RFC-0330 after implementation.
- **RFC-0334 (supersede escalation).** If any invariant conflict arises during implementation, the supersede escalation path in RFC-0334 is followed.

## Design

### CLI surface

```sh
# Agent lookup: is this file generated? who owns it? how to regenerate?
pnpm exec site-kernel run generated.file.lookup --path apps/webgogol-com/public/_img/portrait/320.webp --json
pnpm exec site-kernel run generated.file.lookup --path public/robots.txt --app webgogol-com --json

# Batch lookup: all generated files in the current git diff
pnpm exec site-kernel run generated.file.lookup --diff --json

# Validate that every registry-declared generated file exists on disk
pnpm exec site-kernel run generated.files.validate --json
pnpm exec site-kernel run generated.files.validate --app webgogol-com --json
```

Scope is `workspace` for both commands. `generated.file.lookup` supports `--app <name>` for app-relative path resolution (e.g. `--path public/robots.txt --app webgogol-com` resolves to `apps/webgogol-com/public/robots.txt`). `--app` is **required** when the path does not start with `packages/`, `docs/`, or another workspace-absolute prefix — i.e. app-scoped paths like `public/...` or `src/...` require `--app`. Workspace-absolute paths (e.g. `packages/ui/...`) do not need `--app`.

### Marker policy categorization

| Category | Rule | Detection | Marker in file | Examples |
| --- | --- | --- | --- | --- |
| A (embedded) | `src/**`, `docs/**`, root files, `packages/**` | `hasGeneratedMarker(content)` | Yes | `src/pages/index.astro`, `AGENTS.md`, `biome.generated.css`, `*.generated.yaml` |
| B (registry-only) | `public/**` + all binary extensions anywhere | `GENERATOR_OWNERSHIP_MAP` path-match | No | `public/llms.txt`, `public/robots.txt`, `public/*.md`, `public/*.png`, `public/_img/**/*.webp`, `public/_video/**` |

Binary extensions (Category B regardless of path): `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.ico`, `.svg` (when in `public/` as icon), `.mp4`, `.webm`, `.m3u8`, `.ts` (HLS segment, not TypeScript), `.mov`.

### `OwnershipEntry` extension

```ts
export interface OwnershipEntry {
  path: string;
  command: string;
  /** "embedded" = file carries GENERATED_MARKER in content; "registry-only" = identified via registry only. Default: "embedded". */
  markerPolicy?: "embedded" | "registry-only";
  /** Repo-relative path to the command's source module, for precise owner resolution in generated.edit.guard. */
  module?: string;
}
```

Example entries:

```ts
// Category A — embedded marker, no change needed
{ path: "src/pages/index.astro", command: "routes.generate" },
// markerPolicy defaults to "embedded"

// Category B — registry-only, module required for edit guard
{
  path: "public/robots.txt",
  command: "robots.generate",
  markerPolicy: "registry-only",
  module: "packages/os/site-kernel-checks/src/robots.ts",
},
{
  path: "public/llms.txt",
  command: "llms.generate",
  markerPolicy: "registry-only",
  module: "packages/os/site-kernel-checks/src/llms.ts",
},
```

### `generated.file.lookup` output

Single-path lookup (`--path`):

```json
{
  "command": "generated.file.lookup",
  "path": "apps/webgogol-com/public/_img/portrait/320.webp",
  "generated": true,
  "category": "B",
  "markerPolicy": "registry-only",
  "ownerCommand": "image.variants.generate",
  "regenerateCommand": "pnpm exec site-kernel run image.variants.generate --app webgogol-com",
  "editInstead": "the image.variants.generate generator source (not this file).",
  "detectionMethod": "registry-pattern-match",
  "markerPresent": false
}
```

Non-generated file:

```json
{
  "command": "generated.file.lookup",
  "path": "apps/webgogol-com/src/content/pages/de/home.md",
  "generated": false
}
```

Diff mode (`--diff`):

```json
{
  "command": "generated.file.lookup",
  "mode": "diff",
  "files": [
    {
      "path": "apps/webgogol-com/public/robots.txt",
      "generated": true,
      "category": "B",
      "ownerCommand": "robots.generate",
      "regenerateCommand": "pnpm exec site-kernel run robots.generate --app webgogol-com",
      "editInstead": "the robots.generate generator source (not this file)."
    },
    {
      "path": "apps/webgogol-com/src/content/pages/de/home.md",
      "generated": false
    }
  ]
}
```

### `generated.files.validate` rules

| Rule | Severity | Meaning |
| --- | --- | --- |
| `GEN-FILES-01` | error | A registry-declared generated file (Category A or B) does not exist on disk. |
| `GEN-FILES-02` | warning | A Category A file exists but does not carry the `GENERATED_MARKER` (delegated from `generated.marker.validate` for unified reporting). |

`GEN-FILES-01` fixHint: `Run the owning generator: pnpm exec site-kernel run <ownerCommand> --app <app>`.

### `generated.files.validate` performance

The command expands glob patterns (e.g. `public/_img/**/*.webp`) using `collectFiles` from `@gogol/share/fs` and checks existence of each matched file. Estimated cost: ~200–400 `stat` calls per app, ~50ms. Acceptable for `build.prepare` pipeline. Excludes `node_modules/`, `dist/`, `.git/` directories. Read-only — safe for concurrent execution.

### `generated.edit.guard` changes

The guard currently filters by `isGeneratedMarkerTextCandidate(relPath)` and skips non-text files. This RFC removes that filter and extends the guard to all files:

1. **For each changed file**, resolve its `OwnershipEntry` from `GENERATOR_OWNERSHIP_MAP` (path-match with placeholder expansion) or `command.manifest.generated.yaml` `writes` globs.
2. **If no entry found** → skip (not a generated file).
3. **If entry found and `markerPolicy === "embedded"`** (Category A):
   - Read file content, check `hasGeneratedMarker`.
   - `GEN-EDIT-02`: marker removed without exemption → error.
   - `GEN-EDIT-01`: marker present, file changed, but owner did not change → error. Owner resolution: extract "Edit instead:" from advisory block, or fall back to `module` field, or coarse `packages/os|ui` check.
4. **If entry found and `markerPolicy === "registry-only"`** (Category B):
   - No marker check (file has no marker by design).
   - `GEN-EDIT-01`: file changed, but owner did not change → error. Owner resolution: use `module` field from `OwnershipEntry` to check if the command's source module changed. If `module` is absent, fall back to coarse `packages/os|ui` check.
   - `GEN-EDIT-02` does not apply (no marker to remove).
   - **Binary regeneration exemption**: if the VCS diff shows the file as deleted and recreated (not modified), and the owner module is unchanged, `GEN-EDIT-01` is not flagged. Binary files are regenerated by deletion + re-run (RFC-0150); this is expected workflow, not a hand-edit.

### Generators updated to stop emitting markers

The following generators currently emit `buildGeneratedHeader()` or `GENERATED_MARKER` into `public/**` files. They are updated to stop:

| Generator | File(s) | Current marker | Change |
| --- | --- | --- | --- |
| `llms.generate` | `public/llms.txt`, `public/llms-full.txt` | `# GENERATED...` header | Remove `LLMS_MARKER` prefix |
| `page.markdown.generate` | `public/index.md`, `public/{route}.md` | `<!-- GENERATED... -->` header | Remove `MARKDOWN_TWIN_MARKER` prefix |
| `robots.generate` | `public/robots.txt` | `# GENERATED...` header | Remove `ROBOTS_MARKER` prefix |
| `sitemap.generate` | `public/sitemap.xml`, `public/sitemap-*.xml` | `<!-- GENERATED... -->` header | Remove marker from `sitemap-helpers.ts` |
| `feed.generate` | `public/feed.xml` | `<!-- GENERATED... -->` header | Remove marker prefix |
| `ai.generate` | `public/ai.txt` | `# GENERATED...` header | Remove `AI_MARKER` prefix |
| `humans.generate` | `public/humans.txt` | `# GENERATED...` header | Remove marker prefix |
| `security.txt.generate` | `public/.well-known/security.txt` | `# GENERATED...` header | Remove `GENERATED_LINE` prefix |
| `public.infrastructure.generate` | `public/_headers`, `public/_redirects`, `public/.assetsignore` | `# GENERATED...` header | Remove marker prefix |
| `public.icons.generate` | `public/favicon.svg`, `public/favicon.ico`, `public/*-icon-*.png`, `public/manifest.webmanifest` | `<!-- GENERATED... -->` / `# GENERATED...` | Remove marker from `icons.ts` |
| `indexnow.key.generate` | `public/{app}-indexnow.txt` | `# GENERATED...` header | Remove marker prefix |
| `preview.images.generate` | `public/og-image.png` | N/A (binary) | No change needed (already no marker) |
| `public.surface.generate` | `public/security.txt`, `public/admin/index.html`, `public/admin/config.yml` | `<!-- GENERATED... -->` / `# GENERATED...` | Remove `GENERATED_LINE` from `shared.ts`, remove marker from `cms.ts` |
| `bordbuch.generate` | `public/bordbuch.html` | `<!-- GENERATED... -->` header | Remove marker from `site-bordbuch.ts` |
| `agent.manifest.generate` | `public/.well-known/agent.json` | N/A (JSON, field-based) | No change needed (already no comment marker — RFC-0376 uses `buildGeneratedHeader()` for `.yaml` outputs, but `.json` files in `public/` are Category B and must not carry comment markers) |
| `agent.openapi.generate` | `public/.well-known/agent.openapi.json` | N/A (JSON, field-based) | No change needed (same as above) |
| `agent.knowledge.generate` | `public/api/agent/v1/*.json` | N/A (JSON, field-based) | No change needed (same as above) |
| `surface.generate` | `public/.well-known/pseo-manifest.json`, `public/**/*.md` | `# GENERATED...` / `<!-- GENERATED... -->` | Remove marker prefix from all outputs |
| `surface.starmap.generate` | `public/.well-known/pseo-star-map.svg` | `<!-- GENERATED... -->` header | Remove marker from SVG output |
| `webgogol.check.hints.generate` | `public/.well-known/webgogol-check.json` | N/A (JSON, field-based) | No change needed (same as above) |
| `passport.key.rotate` | `public/.well-known/cosmic-passport-key.json` | N/A (JSON, field-based) | No change needed (same as above) |
| `feed.generate` (JSON Feed) | `public/feed.json` | N/A (JSON, field-based) | No change needed (same as above) |

Generators that write to `src/` or `docs/` are **not** changed — they keep the embedded marker:

| Generator (unchanged) | File(s) | Why unchanged |
| --- | --- | --- |
| `image.variants.generate` | `src/image-variants.generated.yaml` | Category A (src/, YAML manifest) |
| `video.variants.generate` | `src/video-manifest.generated.yaml` | Category A (src/, YAML manifest) |
| `live.variants.generate` | `src/live-video-manifest.generated.yaml` | Category A (src/, YAML manifest) |
| `routes.generate` | `src/pages/*.astro`, `src/middleware.ts` | Category A (src/) |
| `agents.generate` | `AGENTS.md`, `src/content/AGENTS.md` | Category A (root/src) |
| `biome.css.generate` | `src/styles/biome.generated.css` | Category A (src/) |
| `props.types.generate` | `packages/ui/**/*.types.generated.ts` | Category A (packages/) |
| `gitattributes.generate` | `.gitattributes` managed block | Category A (root) |
| `funnel.statechart.generate` | `docs/specs/visitor-funnel/state-chart.generated.md` | Category A (docs/) |
| `command.manifest.generate` | `docs/command-manifest.generated.yaml` | Category A (docs/, YAML) |
| `env.example.generate` | `.env.example` | Category A (root) |
| `docs.commands.generate` | `docs/COMMANDS.md` | Category A (docs/) |
| `agent.routes.generate` | `src/pages/api/agent/mcp.ts`, `src/pages/api/agent/actions/[id].ts` | Category A (src/) |
| `open-source.generate` | `src/content/pages/{lang}/open-source.md` | Category A (src/content/) |
| `legal.scaffold` | `src/content/pages/{lang}/impressum.md` | Category A (src/content/) |
| `material.credits.generate` | `src/content/pages/{lang}/credits.md` | Category A (src/content/) |
| `entitlements.resolve` | `src/entitlements.generated.yaml` | Category A (src/, YAML) |

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | `OwnershipEntry` gains `markerPolicy` and `module` fields; all `public/**` entries updated |
| `packages/os/site-kernel-checks/src/generated-file-lookup.ts` | New module: `generated.file.lookup` command |
| `packages/os/site-kernel-checks/src/generated-files-validate.ts` | New module: `generated.files.validate` command |
| `packages/os/site-kernel-checks/src/generated-edit-guard.ts` | Remove `isGeneratedMarkerTextCandidate` filter; add Category B path-match + `module`-based owner resolution |
| `packages/os/site-kernel-checks/src/generated-marker-validate.ts` | Scope to Category A files only (embedded marker policy) |
| `packages/os/site-kernel-checks/src/llms.ts` | Remove `LLMS_MARKER` prefix from output |
| `packages/os/site-kernel-checks/src/page-markdown.ts` | Remove `MARKDOWN_TWIN_MARKER` prefix from output |
| `packages/os/site-kernel-checks/src/robots.ts` | Remove `ROBOTS_MARKER` prefix from output |
| `packages/os/site-kernel-checks/src/sitemap-helpers.ts` | Remove marker from sitemap XML output |
| `packages/os/site-kernel-checks/src/feed.ts` | Remove marker from feed XML output |
| `packages/os/site-kernel-checks/src/ai.ts` | Remove `AI_MARKER` prefix from output |
| `packages/os/site-kernel-checks/src/public-surface/shared.ts` | Remove `GENERATED_LINE` from output |
| `packages/os/site-kernel-checks/src/public-surface/icons.ts` | Remove marker from SVG icon output |
| `packages/os/site-kernel-checks/src/cms.ts` | Remove marker from admin HTML and config.yml |
| `packages/os/site-kernel-checks/src/site-bordbuch.ts` | Remove marker from bordbuch HTML |
| `packages/os/site-kernel-checks/src/module.ts` | Register `generated.file.lookup` and `generated.files.validate` |
| `packages/os/site-kernel-checks/src/command-tables/*.ts` | Add command definitions for the two new commands |
| `packages/os/site-kernel/src/generated-marker.ts` | No change to `GENERATED_MARKER` or `hasGeneratedMarker`; `isGeneratedMarkerTextCandidate` remains for Category A detection |
| `packages/os/site-kernel-checks/src/semantic-parity.ts` | Delete `stripMarker` function; parity check compares raw content directly (forward-only, no legacy no-op) |

### Output format

```json
{
  "command": "generated.files.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "GEN-FILES-01",
      "severity": "error",
      "file": "apps/webgogol-com/public/robots.txt",
      "message": "Registry-declared generated file is missing on disk.",
      "fixHint": "Run: pnpm exec site-kernel run robots.generate --app webgogol-com"
    }
  ]
}
```

### Failure modes

- `generated.file.lookup` exits 0 always (it is a read-only query, not a check). Non-generated files return `generated: false` with exit 0.
- `generated.files.validate` exits non-zero on any `error` diagnostic, zero on warnings only.
- `generated.edit.guard` with no VCS diff available reports a single `info` diagnostic and exits zero (unchanged from RFC-0336).
- `generated.edit.guard` for Category B files with no `module` field in `OwnershipEntry` falls back to coarse `packages/os|ui` check and emits a warning that the entry should have a `module` field for precise resolution.

## Rollout

This is a **one-shot rollout** — all changes land in a single coordinated transition:

1. **Extend `OwnershipEntry`** with `markerPolicy` and `module` fields. Update all `public/**` entries in `GENERATOR_OWNERSHIP_MAP` to `markerPolicy: "registry-only"` with their `module` paths. **Register all missing generators** that write to `public/` but are not yet in `GENERATOR_OWNERSHIP_MAP` (e.g. `agent.manifest.generate`, `agent.openapi.generate`, `agent.knowledge.generate`, `surface.generate`, `surface.starmap.generate`, `webgogol.check.hints.generate`, `passport.key.rotate`, `preview.images.generate`, `image.variants.generate` (public outputs), `video.variants.generate` (public outputs), `live.variants.generate` (public outputs), `bordbuch.generate` (public outputs), `cms.schema.generate` (public outputs)).
2. **Implement `generated.file.lookup`** — path-matching against `GENERATOR_OWNERSHIP_MAP` (with placeholder expansion) + `command.manifest.generated.yaml` `writes` globs.
3. **Implement `generated.files.validate`** — check existence of all registry-declared files.
4. **Update `generated.marker.validate`** — filter to Category A entries only (`markerPolicy === "embedded"` or absent).
5. **Update `generated.edit.guard`** — remove `isGeneratedMarkerTextCandidate` filter; add Category B path-match + `module`-based owner resolution; scope `GEN-EDIT-02` to Category A only; add binary regeneration exemption for deletion + recreation by unchanged owner.
6. **Update generators** — remove marker emission from all `public/**` generators listed above.
7. **Regenerate all public files** — run `build.prepare` for each app to regenerate public files without markers.
8. **Update `AGENTS.md`** — document the two-category system, the lookup command, and the agent guidance.
9. **Register commands** in `command-tables` and `module.ts`; run `command.manifest.generate` and `gitattributes.generate`.

New apps and new commands: registering outputs in `GENERATOR_OWNERSHIP_MAP` with the correct `markerPolicy` and `module` is mandatory from day one. `public/**` outputs default to `registry-only`; the generator must not emit a marker.

## AGENTS.md changes

Amend the "Generated-file governance protocol" section to add:

- Generated files are categorized into two marker policies:
  - **Category A (embedded)**: `src/**`, `docs/**`, root files, `packages/**` — carry the `GENERATED_MARKER` in-file. Detected by `hasGeneratedMarker(content)`.
  - **Category B (registry-only)**: `public/**` and all binary files — no in-file marker. Detected by `GENERATOR_OWNERSHIP_MAP` path-match.
- **`generated.file.lookup --path <path>`** — AI agents MUST use this command to determine if a file is generated, who owns it, and how to regenerate it. Never assume a file is or is not generated based on path heuristics alone.
- **`generated.file.lookup --diff`** — batch lookup for all changed files in the current git diff. Use before editing to identify generated files in your change set.
- **`generated.files.validate`** — checks that every registry-declared generated file exists on disk.
- `generated.edit.guard` now protects binary and public-facing files too. Hand-editing a `public/*.png` or `public/llms.txt` without changing its owning generator will fail the guard.
- Public-facing generated files (`llms.txt`, `public/*.md`, `robots.txt`, etc.) no longer carry the `GENERATED_MARKER` — this is by design. Do not add markers to these files.
- **For future commands:** any command that writes generated files MUST declare its outputs in `GENERATOR_OWNERSHIP_MAP` with `markerPolicy` (`"embedded"` for `src/`/`docs/`/root, `"registry-only"` for `public/`/binary) and `module` (repo-relative path to the command source). Run `gitattributes.generate` after adding entries.

## Compass sync

The following `docs/*.xml` files may need synchronization after this RFC is implemented:

- `docs/source-markup.xml` — if it references the generated-file marker protocol or `.generated.json` file extensions.
- `docs/technology.xml` — if it references generated-file detection or marker policies.
- `docs/verification-plan.xml` — if it references `generated.marker.validate` scope or generated-file verification steps.

The `GENERATOR_OWNERSHIP_MAP` changes and the two-category marker policy are repository-wide governance changes that fall under the Compass document duties in root `AGENTS.md`.

## Alternatives considered

- **Sidecar files for binary assets** (e.g. `foo.webp.generated.json`). Rejected — creates thousands of sidecar files next to image/video variants. The registry already knows every generated path; sidecars duplicate that information at filesystem cost.

- **Concrete `generated-files.manifest.json` listing every individual file.** Rejected — would be enormous (hundreds of image variants, HLS segments), needs constant regeneration, and drifts. Dynamic lookup via glob-matching against existing registries is always current.

- **Path-based heuristic without `markerPolicy` field.** Rejected — `public/**` → B is a clean default, but explicit `markerPolicy` in `OwnershipEntry` allows exceptions and is machine-readable without ambiguity. The field is the source of truth; the path rule is the convention for populating it.

- **Keep markers in public files, move to footer.** Rejected — `llms.txt` and `public/*.md` are consumed by LLMs that read the full file. A footer marker is still pollution, just at the end. The registry-only approach eliminates the marker entirely from external-facing output.

- **Registry-only for all files (remove marker everywhere).** Rejected — internal text files benefit from self-describing markers. An agent reading `src/pages/index.astro` sees the advisory block immediately, without running a command. The marker also enables `dist.generated-marker.strip` to clean copied files. Category A files keep the marker.

- **Incremental rollout (binary first, then public text).** Rejected — creates a transition period where two mechanisms work in parallel and `generated.marker.validate` behavior is ambiguous. One-shot rollout is cleaner and forward-only.

- **Two separate RFCs.** Rejected — the lookup command, edit guard extension, and marker removal are tightly coupled. The lookup command needs `markerPolicy` to report category; the edit guard needs `module` for Category B resolution; the marker removal needs `markerPolicy` to know which files to update. Splitting would create intermediate states where the pieces don't compose.

## Risks

- **Category B file not in registry.** If a generated `public/` file is not registered in `GENERATOR_OWNERSHIP_MAP`, `generated.file.lookup` will report it as non-generated, and `generated.edit.guard` will not protect it. Mitigated by `GITATTR-03` (marker scan warns on unregistered marked files) and by the mandatory registration rule for new commands. For Category B files that never had a marker, `generated.files.validate` will catch missing files if they are registered.

- **`module` field drift.** If a command's source module is renamed but the `module` field in `GENERATOR_OWNERSHIP_MAP` is not updated, `generated.edit.guard` will check the wrong path and may under-flag. Mitigated by making `module` a repo-relative path that is easy to verify, and by the coarse `packages/os|ui` fallback when `module` is absent or points to a non-existent file.

- **Public file content change is visible to external consumers.** Removing the marker from `llms.txt` changes its content — external LLMs that previously saw the marker will now see clean content. This is the desired outcome, but it is a content change in committed public files. The diff is visible in PRs.

- **`semantic.parity.validate` `stripMarker` removed.** The `stripMarker` function in `semantic-parity.ts` stripped the `# GENERATED...` prefix from `llms.txt` before comparison. After marker removal, the function is deleted (forward-only, no legacy no-op). The parity check compares raw content directly — the result is identical since stripped content was already the same as raw content when no marker is present.

- **Agents confused by absence of marker in public files.** An agent familiar with the old system might see `public/robots.txt` without a marker and assume it is hand-authored. Mitigated by `AGENTS.md` guidance and the `generated.file.lookup` command. Agents MUST use the lookup command, not rely on marker presence alone.

## Acceptance criteria

- [x] `OwnershipEntry` interface extended with `markerPolicy` and `module` fields in `generator-ownership.ts`. (evidence: implemented historically)
- [x] All `public/**` entries in `GENERATOR_OWNERSHIP_MAP` marked `markerPolicy: "registry-only"` with `module` paths. (evidence: implemented historically)
- [x] `generated.file.lookup` command registered with workspace scope, supports `--path` and `--diff` modes. (evidence: command registered in kernel module)
- [x] `generated.files.validate` command registered with workspace scope, checks existence of all registry-declared files. (evidence: command registered in kernel module)
- [x] `generated.marker.validate` scoped to Category A files only (no Category B in expected list). (evidence: implemented historically)
- [x] `generated.edit.guard` extended to all file types; Category B owner resolution via `module` field. (evidence: implemented historically)
- [x] `GEN-EDIT-02` scoped to Category A files only. (evidence: implemented historically)
- [x] All listed generators stop emitting markers in `public/**` output. (evidence: implemented historically)
- [x] `stripMarker` function deleted from `semantic-parity.ts`; parity check compares raw content directly. (evidence: implemented historically)
- [x] `semantic.parity.validate` passes after marker removal from `llms.txt`. (evidence: implemented historically)
- [x] `AGENTS.md` documents the two-category system, lookup command, and agent guidance. (evidence: AGENTS.md:1, agent guide updated)
- [x] `command.manifest.generate` reflects the two new commands and their IO. (evidence: implemented historically)
- [x] All missing generators that write to `public/` are registered in `GENERATOR_OWNERSHIP_MAP` with `markerPolicy: "registry-only"` and `module` paths. (evidence: implemented historically)
- [x] `generated.edit.guard` binary regeneration exemption implemented for Category B deletion + recreation. (evidence: implemented historically)
- [x] `gitattributes.generate` run after `GENERATOR_OWNERSHIP_MAP` updates. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`).
- Agents MUST use `generated.file.lookup --path <path>` to determine if a file is generated before editing it. Never assume based on path or marker presence alone.
- Agents MUST NOT add `GENERATED_MARKER` to `public/**` files. These files are Category B (registry-only) by design.
- Agents MUST NOT remove `GENERATED_MARKER` from Category A files (`src/**`, `docs/**`, root, `packages/**`) without a documented conversion.
- When adding a new generator, register its outputs in `GENERATOR_OWNERSHIP_MAP` with the correct `markerPolicy` (`"registry-only"` for `public/` or binary, `"embedded"` or absent for `src/`/`docs/`/root) and `module` (repo-relative path to the command source). Run `gitattributes.generate` after.
- For Category A generators, continue using `buildGeneratedHeader()` to emit the advisory block for all generated files, including `.generated.yaml` (RFC-0376 removed `buildGeneratedJsonAdvisory()` — `buildGeneratedHeader()` with `#` comment syntax is the sole advisory mechanism).
- For Category B generators, do NOT use `buildGeneratedHeader()` or `GENERATED_MARKER` — emit clean content only.
- After implementation, emit verification evidence per RFC-0330 (this RFC has acceptance probes).
- If any invariant conflict arises during implementation, follow the supersede escalation path in RFC-0334.
- The accepted→implemented transition follows RFC-0224.
- Reference `RFC-0375` in commit messages that implement this RFC.
