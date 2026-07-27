---
id: RFC-0036
title: "Extend blocks-renderer to support shell-level and MoonCatalog components"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-01
updatedAt: 2026-05-03
implementedAt: 2026-05-03
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-21  # Feature-first layout
  - DNA-24  # Block-declarative pages
  - DNA-25  # Page routes ≤ 40 lines
  - RFC-0026  # Block-declarative pages + RuntimeContext
  - RFC-0025  # Cosmic overlay + feature-first layout
  - RFC-0028  # Cosmic Passport (MoonCatalog reference)
commands:
  proposed: []
  added:
    - page.shell.validate
  changed:
    - page.block.validate
  removed: []
appsImpacted:
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ui"
  - "@gogol/site-kernel"
successSignals:
  - "Shell components (Background, Header, Footer) declared in system.md pages[route].shell"
  - "page.shell.validate passes for all apps with shell config"
  - "BlocksRenderer renders shell blocks with layer: shell before content blocks"
  - "buildPage() accepts shellBlocks option (RFC-0036)"
nonGoals:
  - "Do not auto-migrate existing Background imports — migration is manual"
  - "Do not enforce shell config presence — apps without shell continue working"
---

# RFC-0036: Extend blocks-renderer to support shell-level and MoonCatalog components

## Context

The current architecture distinguishes between:

- **Shell components** (Header, Footer, Background) — imported and rendered directly in route files
- **Content blocks** — rendered via `BlocksRenderer` from `page.blocks[]`

This separation creates inconsistency: Background (Atlas) is a MoonCatalog component with manifest, cosmicName, and propsSchema, but it's rendered outside the block-declarative pipeline. This violates the principle that "every `use: X` is a PlanetName/MoonName pinned in system.yaml" (DNA-24).

We need to unify these into a single block-declarative system where shell-level components can be declared in system.yaml and rendered through the standard block pipeline.

## Problem

1. **Inconsistent rendering paths**: Background is imported directly in route files (`import Background from ...`) while sections go through `BlocksRenderer`

2. **No system.yaml visibility**: Background configuration is in page frontmatter (`background.enabled: true`) instead of system.yaml where other block pins live

3. **BlocksRenderer limitation**: Current implementation only supports PlanetCatalog (sections), not MoonCatalog (components)

4. **Route file complexity**: `[...slug].astro` has inline logic for Background while claiming to be "thin route" (DNA-25: ≤ 40 lines)

5. **Client-editable boundary violation**: Background props in frontmatter are outside `clientEditable` surface (DNA-22)

## Decision

The `BlocksRenderer` gains support for MoonCatalog components via a `use` property that accepts both `PlanetName` and `MoonName`. A new `shell` section in `system.yaml pages[]` declares shell-level blocks (Background, Header, Footer) that are automatically prepended to `page.blocks` at build time.

Background moves from page frontmatter to system.yaml, making it a first-class system component like sections. The route file removes all Background-specific logic and renders shell blocks through the standard `BlocksRenderer` pipeline.

## Architectural fit

**DNA-21 (Feature-first layout)**: Shell components move from hardcoded route imports to system.yaml, preserving per-feature colocation.

**DNA-24 (Block-declarative pages)**: Background becomes a proper block with `use: Atlas`, props validation against manifest schema.

**DNA-25 (Page routes ≤ 40 lines)**: Removing Background logic brings `[...slug].astro` closer to the limit.

**DNA-22 (Client-editable surface)**: Background configuration moves to `system.yaml` which is engineering-only, separating concerns from page prose.

**Anti-Pattern prevention**: Eliminates AP-12 (hand-assembled composition in routes) for shell components.

## Design

### system.md format and location

System manifest converts from YAML to MD with frontmatter for Astro content collection compatibility:

```md
<!-- apps/nicaragua-projekt/src/content/assets/system.md -->
---
pages:
  - route: /
    cosmicStar: Vega
    shell:
      background:
        enabled: true
        cosmicMoon: Atlas
        pin: "1.0.0"
        props:
          fit: cover
          quality: high
          loading: eager
    planets:
      - { cosmicPlanet: Europa, pin: "1.2.0" }
      # ...
---

<!-- System configuration loaded via content collection -->
```

### CLI surface

Validation command for shell configuration:

```sh
pnpm exec site-kernel run page.shell.validate --app nicaragua-projekt
pnpm exec site-kernel run page.shell.validate --app nicaragua-projekt --json
```

Checks:

- `shell.background.cosmicMoon` exists in MoonCatalog
- `shell.background.props` conforms to `background-component.manifest.yaml` propsSchema
- `shell.background.pin` matches pinned version in package

### Route file content collection pattern

```ts
// apps/nicaragua-projekt/src/pages/[lang]/[...slug].astro
import { getCollection } from "astro:content";
import type { ShellBlockConfig } from "@gogol/share";

// RFC-0036: Resolve shell blocks from system.md via content collection
const assetEntries = await getCollection("assets");
const systemEntry = assetEntries.find((e) => e.id === "system");
const systemData = systemEntry?.data as { pages?: Array<{ route: string; shell?: { background?: ShellBlockConfig } }> };
const pageSystemConfig = systemData?.pages?.find((p) => p.route === currentRoute);
const shellBlocks = pageSystemConfig?.shell?.background ? [pageSystemConfig.shell.background] : [];

// Pass to buildPage
const page = await buildPage(entry.data, ctx, { shellBlocks });
```

### TypeScript contracts

```ts
// packages/share/src/page.ts
interface ShellBlockConfig {
  enabled?: boolean;
  cosmicMoon: MoonName;
  pin: string;
  props?: Record<string, unknown>;
}

interface ShellConfig {
  background?: ShellBlockConfig;
  header?: ShellBlockConfig;
  footer?: ShellBlockConfig;
}

interface PageSystemEntry {
  route: string;
  cosmicStar: StarName;
  shell?: ShellConfig;
  planets: PlanetPin[];
}

// Extended ResolvedBlock to include MoonCatalog components
interface ResolvedBlock {
  id: string;
  use: PlanetName | MoonName;  // Extended union type
  props: Record<string, unknown>;
  layer: 'section' | 'component' | 'shell';
}

// BlocksRenderer props extension
interface BlocksRendererProps {
  blocks: ResolvedBlock[];
  lang: string;
  linkRegistry: LinkRegistry;
  includeShell?: boolean;  // Whether to render shell-level blocks
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/src/content/assets/system.md` | System manifest as MD with frontmatter (RFC-0036 format change) |
| `apps/*/src/content.config.ts` | Assets collection registration for system.md |
| `packages/ui/src/components/*/manifest.yaml` | MoonCatalog manifests (already exist) |
| `packages/ui/src/blocks-renderer.astro` | Extended to support `use: MoonName` and shell block rendering |
| `packages/share/src/page.ts` | `buildPage()` merges shell blocks into ResolvedBlock[] |
| `apps/*/src/pages/[lang]/[...slug].astro` | Imports system.yaml, passes shellBlocks to buildPage |

### Output format

```json
{
  "command": "page.shell.validate",
  "status": "fail",
  "app": "nicaragua-projekt",
  "violations": [
    {
      "page": "/",
      "field": "shell.background.cosmicMoon",
      "expected": "MoonCatalog entry",
      "actual": "AtlasX",
      "message": "AtlasX not found in MoonCatalog"
    },
    {
      "page": "/",
      "field": "shell.background.props.quality",
      "expected": "enum: low, mid, high, max",
      "actual": "ultra",
      "message": "Invalid quality value"
    }
  ]
}
```

### Failure modes

- **Unknown MoonName**: Exit non-zero (blocks cannot render)
- **Props schema violation**: Exit non-zero (validation gate)
- **Version mismatch (pin)**: Warning only (semver compatibility check)
- **Missing shell config**: Silent pass (shell is optional)

Pretty output shows hierarchical page → shell → block → violation structure.

## Rollout

**Phase 1 (MVP)**: `nicaragua-projekt` as proving ground

- Add `shell.background` support only
- Keep Header/Footer hardcoded in route (backward compatible)
- Manual migration: move `background` from page frontmatter to system.yaml

**Phase 2**: Full shell support

- Extend to `shell.header` and `shell.footer`
- Route file becomes pure orchestrator: `<BlocksRenderer blocks={page.blocks} includeShell />`
- Apps migrate on-demand

**Phase 3**: Validation gates

- `page.shell.validate` runs in `build.check` pipeline
- Fail build on schema violations

**Default behavior**: Opt-in per app. Add `shell:` to system.yaml to activate. Apps without `shell` continue working as before.

## Alternatives considered

1. **Keep Background in page frontmatter**
   - Rejected: Mixes content (page prose) with presentation (background config)
   - Violates DNA-22 clientEditable boundaries

2. **Add Atlas to planets[] and treat as regular section**
   - Rejected: Background is shell-layer, not content-layer
   - Would appear in `page.blocks[]` client-editable area

3. **Separate ShellRenderer component**
   - Rejected: Fragmentation of block pipeline
   - BlocksRenderer should handle all block types uniformly

## Risks

- **MoonName vs PlanetName collision**: Both use string union types. Need distinct prefixes or validation
- **Performance**: BlocksRenderer now checks both catalogs on each render
- **Agent confusion**: May try to add shell components to `pages[].planets` instead of `pages[].shell`
- **Migration complexity**: Existing apps with frontmatter `background:` need manual migration
- **Backward compatibility**: Route files must support both old (hardcoded) and new (block-based) patterns during transition

## Acceptance criteria

- [x] TypeScript types and interfaces defined in `@gogol/share` (`ShellBlockConfig`, `ShellConfig`, `ResolvedBlock.layer`) (evidence: packages/ directory, package exists)
- [x] CLI command `page.shell.validate` registered in `site-kernel-checks` with scope `app` (evidence: implemented historically)
- [x] `--json` output format documented and stable (`PageShellResult` with `violations[]`) (evidence: implemented historically)
- [x] Integrated into `STANDARD_CHECK_PIPELINE` after `page.block.validate` (evidence: implemented historically)
- [x] Existing apps pass without changes (`shellBlocks` is optional, backward compatible) (evidence: implemented historically)
- [x] Root `AGENTS.md` updated with shell-level blocks invariants section (evidence: AGENTS.md:1, agent guide updated)
- [x] RFC-0036 added to architectural arc table in root `AGENTS.md` (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST check `rfc.list --status accepted` before making structural changes
  to packages or app tools that relate to this RFC's scope.
- When implementing, agents MUST reference this RFC ID in commit messages or PR descriptions.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
-->
