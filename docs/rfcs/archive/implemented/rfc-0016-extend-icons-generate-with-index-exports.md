---
id: RFC-0016
title: "Extend icons.generate command with index.ts exports"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-17
updatedAt: 2026-06-04
implementedAt: 2026-04-17
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-1
commands:
  proposed:
    - icons.generate
  added:
    - icons.generate
  changed: []
  removed: []
appsImpacted:
  - main
  - nicaragua-projekt
packagesImpacted:
  - ui
successSignals:
  - icons.generate produces index.ts with all icon exports
  - AI agents use the new import pattern in generated code
  - No manual icon imports needed in apps
nonGoals:
  - Do not change the JSON source format in assets/icons/
  - Do not alter the generated Astro component structure
  - Do not create new icon sets or modify existing ones
---

# RFC-0016: Extend icons.generate command with index.ts exports

## Context

The `@gogol/ui` package has been established as the canonical location for all icon assets and generated components. Icons were migrated from individual apps to this shared package, with:

- Source JSON files in `packages/ui/src/assets/icons/lordicon/`
- Generated Astro components in `packages/ui/src/icons/gen/lordicon/`
- Per-set `index.ts` files (e.g., `doodle-outline/index.ts`)

However, the current `icons.generate` command only generates per-set index files. The main entry point at `packages/ui/src/icons/index.ts` only exports types, not the actual icon components. This means apps must import icons using deep paths like `@gogol/ui/icons/lordicon/doodle-outline/arrow-up`, which is verbose and requires knowing the exact icon name.

## Problem

1. **Inconvenient imports**: Apps must use deep import paths for each icon, making code harder to read and maintain.
2. **No discoverability**: There's no single place to see all available icons or import them from.
3. **Agent friction**: AI agents generating code must construct deep import paths manually instead of using a clean, documented pattern.
4. **Missing barrel export**: The `index.ts` at the icons package root doesn't serve as a proper barrel file for all generated icons.

## Decision

The `icons.generate` command gains the ability to generate a master `index.ts` file at `packages/ui/src/icons/index.ts` that re-exports all icons from all sets. The command will:

1. Continue generating per-set index files (current behavior)
2. Generate a master `index.ts` that exports all icons with predictable naming
3. Update the AI agent documentation to use the new import pattern

## Architectural fit

**Alignment with Architecture DNA:**

- **DNA-1 (Workspace consistency)**: Establishes a single, consistent way to import icons across all apps.
- **DNA-2 (Agent ergonomics)**: Reduces cognitive load for AI agents generating icon imports.

**Site OS operator model:**

- The `icons.generate` command is workspace-scoped, registered in root `tools/kernel.config.ts`.
- This change extends existing command behavior without adding new commands.

**Component Contracts:**

- Formalizes the import contract for `@gogol/ui/icons` as a barrel export.

## Design

### CLI surface

```sh
# Regenerate icons and the master index.ts
pnpm exec site-kernel run icons.generate
```

No new flags are added. The master index generation is part of the default command behavior.

### Generated index.ts structure

The generated `packages/ui/src/icons/index.ts` will contain:

````typescript
/**
 * Icons entry point - GENERATED FILE, DO NOT EDIT
 *
 * Usage:
 * ```astro
 * import { ArrowUpIcon } from "@gogol/ui/icons";
 * import LordIconBase from "@gogol/ui/icons/lord-icon-base";
 * ```
 */

// Re-export all icons from all sets
export { default as ArrowUpIcon } from "./gen/lordicon/doodle-outline/arrow-up.astro";
export { default as ArrowDownIcon } from "./gen/lordicon/doodle-outline/arrow-down.astro";
// ... all icons from all sets

// Re-export types
export type {
  LordIconColor,
  LordIconTrigger,
  LordIconStroke,
  LordIconColors,
  LordIconProps,
} from "./lord-icon-types.js";

// Re-export base component
export { default as LordIconBase } from "./lord-icon-base.astro";
````

### Naming convention

Icon exports use PascalCase with `Icon` suffix:

- `arrow-up.json` → `ArrowUpIcon`
- `user-profile.json` → `UserProfileIcon`

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/ui/src/assets/icons/lordicon/*.json` | Source JSON files (canonical) |
| `packages/ui/src/icons/gen/lordicon/*/` | Generated Astro components and per-set index files |
| `packages/ui/src/icons/lord-icon-base.astro` | Shared runtime wrapper (manual) |
| `packages/ui/src/icons/lord-icon-types.ts` | Type definitions (manual) |

### Output format

The command outputs JSON when `--json` is passed:

```json
{
  "command": "icons.generate",
  "status": "success",
  "generated": {
    "components": 1167,
    "sets": 4,
    "masterIndex": "packages/ui/src/icons/index.ts"
  }
}
```

### Failure modes

- If a JSON source file is malformed, the command logs a warning and skips it.
- If the master index cannot be written, the command fails with exit code 1.
- Existing apps continue to work because deep imports remain valid.

## Rollout

**Phase 1: Command extension (this RFC)**

- Extend `icons.generate` to write master `index.ts`
- Validate that existing per-set imports still work
- Update `AGENTS.md` in root and `packages/ui/`

**Phase 2: Documentation**

- Add AI agent documentation section about the new import pattern
- Update existing import examples in docs

**Phase 3: Adoption**

- Apps can gradually migrate from deep imports to barrel imports at their own pace
- No breaking changes; old import paths remain valid

## Alternatives considered

1. **Separate command**: Add `icons.index.generate` instead of extending `icons.generate`.
   - _Rejected_: Would fragment the workflow; index generation should happen automatically when icons change.

2. **Named exports only from per-set index files**:
   - _Rejected_: Still requires knowing which set an icon belongs to; doesn't solve the discoverability problem.

3. **Keep current state (manual deep imports)**:
   - _Rejected_: Poor developer experience and agent ergonomics.

## Risks

- **Name collisions**: Two sets might have icons with the same base name. The command will detect this and fail with a clear error message, requiring manual resolution.
- **File size**: The master index could become large (1000+ exports). This is mitigated by tree-shaking in the build process.
- **Agent confusion**: Agents might need time to adapt to the new pattern. Clear documentation and examples will help.

## Acceptance criteria

- [x] `icons.generate` creates `packages/ui/src/icons/index.ts` with all icon exports (evidence: packages/ directory, package exists)
- [x] Export names follow PascalCase with `Icon` suffix convention (evidence: implemented historically)
- [x] Command detects and reports naming collisions (evidence: implemented historically)
- [x] `--json` output includes master index path (evidence: implemented historically)
- [x] Root `AGENTS.md` updated with new import examples (evidence: AGENTS.md:1, agent guide updated)
- [x] `packages/ui/AGENTS.md` updated with agent-specific guidance (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes

**Collision handling strategy:**

1. First pass: Detect icons with the same name across different sets
2. Second pass: Prefix colliding names with set name (e.g., `ArrowUpIcon` → `DoodleColorArrowUpIcon`)
3. Third pass: If collisions persist within same set (same name, different IDs), append ID suffix (e.g., `ShareHoverPinchIcon` → `ShareHoverPinchIcon_109`)

This ensures all 1170 icons have unique exports while keeping names readable.

## Implementation notes for agents

**Import pattern to use (new):**

```astro
---
import { ArrowUpIcon, UserProfileIcon } from "@gogol/ui/icons";
---

<ArrowUpIcon size={24} color="primary" trigger="hover" />
<UserProfileIcon size={32} color="secondary" />
```

**When to use deep imports (legacy, avoid in new code):**

```astro
---
import { arrowUpIcon as ArrowUpIcon } from "@gogol/ui/icons/lordicon/doodle-outline";
---
```

**When implementing this RFC:**

- Agents MAY run `icons.generate` after adding new JSON source files
- Agents MUST NOT hand-edit generated files under `src/icons/gen/**` or `src/icons/index.ts`
- Agents SHOULD use the new barrel import pattern (`@gogol/ui/icons`) in all new code
- When converting existing imports, preserve functionality; the component props are identical
- Agents MUST check for naming collisions when adding new icons; the command will warn and disambiguate automatically
