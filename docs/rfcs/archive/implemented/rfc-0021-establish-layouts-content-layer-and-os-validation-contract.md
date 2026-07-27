---
id: RFC-0021
title: "Establish layouts content layer and OS validation contract"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-22
updatedAt: 2026-06-04
implementedAt: 2026-04-23
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-1
  - DNA-7
  - DNA-8
  - RFC-0019
  - RFC-0020
commands:
  proposed:
    - content.layouts.validate
    - naming.layouts.lint
  added:
    - content.layouts.validate
    - naming.layouts.lint
  changed:
    - dispatcher.sync.validate
    - mirror.quartet.validate
    - naming.components.lint
  removed: []
appsImpacted:
  - main
  - nicaragua-projekt
packagesImpacted:
  - site-kernel-checks
successSignals:
  - "Layout content files live in `src/content/layouts/[lang]/` mirroring the page content structure"
  - "Layout schemas live in `src/content/schemas/layouts/` without the `-component` suffix"
  - "OS validation commands treat layouts as a distinct artifact layer separate from components"
  - "Layouts are validated for mandatory content files and optional style references"
nonGoals:
  - "Do not change the runtime behavior of existing layout components"
  - "Do not require immediate migration of all apps; `apps/nicaragua-projekt` is the proving target"
  - "Do not rename existing layout component files in `src/layouts/` or `src/components/`"
---

# RFC-0021: Establish layouts content layer and OS validation contract

## Context

The current architecture distinguishes between pages, sections, components, and styles through directory structure and naming conventions. However, layouts occupy an ambiguous position in the content layer.

Today in `apps/nicaragua-projekt`:

- Page content lives in `src/content/pages/[lang]/` with schemas in `src/content/schemas/pages/`
- Component content lives in `src/content/components/[lang]/` with schemas in `src/content/schemas/components/`
- Layout content currently resides at `src/content/components/de/layout.md` — inside the components directory
- The layout schema is named `layout-component.ts` with the `-component` suffix, inconsistent with page schemas that have no suffix

This inconsistency creates three problems:

1. **Layer confusion**: Layouts are shell-level containers, not visitor-facing UI components, yet they share the component content namespace
2. **Naming inconsistency**: The `-component` suffix on `layout-component.ts` breaks the pattern where page schemas are bare names (`home.ts`, `legal.ts`)
3. **Missing validation**: No OS command verifies that layouts have corresponding content files or that they reference the canonical styles location

RFC-0019 established the page → section → component → content hierarchy for visitor-facing bodies. Layouts exist outside this hierarchy (they wrap it), and need their own distinct content layer contract.

## Problem

Several invariants are currently under-protected:

1. **Content location is inconsistent**: `layout.md` lives in `src/content/components/de/` instead of a dedicated `src/content/layouts/` directory
2. **Schema naming breaks convention**: `layout-component.ts` carries a `-component` suffix that no other non-component schema uses
3. **Schema location is wrong**: Layout schemas belong in `src/content/schemas/layouts/`, not mixed with component schemas
4. **No mandatory content validation**: The OS cannot currently fail a build if a layout lacks its corresponding markdown content file
5. **No style reference validation**: Layouts should optionally be validated to ensure they reference `styles/layouts/layout.css` when applicable
6. **Mirror validation is layer-unaware**: The quartet mirror check does not distinguish layout content from component content

As a result, the repository depends on manual discipline to maintain layout content organization, and automated checks cannot catch drift between layout implementations and their content contracts.

## Decision

All apps in `apps/*` adopt a formal layouts content layer with dedicated directories, consistent naming, and OS-level validation.

Specifically:

- Layout content moves to `src/content/layouts/[lang]/*.md` following the same i18n pattern as pages
- Layout schemas move to `src/content/schemas/layouts/*.ts` without the `-component` suffix
- OS validation commands gain layout-awareness and can detect missing content or style references
- The `mirror.quartet.validate` and `dispatcher.sync.validate` commands treat layouts as a distinct artifact type

## Architectural fit

**DNA invariants**: This RFC protects DNA-1 (file location communicates role) by giving layouts their own content directory. It aligns with DNA-7 (naming conventions) by removing the inconsistent `-component` suffix from layout schemas. It supports DNA-8 (content layer separation) by distinguishing layout shell content from visitor-facing component content.

**RFC dependencies**: This builds on RFC-0019's page-section-component hierarchy by formalizing where layouts (the outer shell) fit relative to that hierarchy. It aligns with RFC-0020's suffix contracts by ensuring layout schemas follow the bare-name pattern like pages.

**Site OS model**: New validation logic belongs in `site-kernel-checks` as part of the existing naming and content validation pipelines. Commands should accept `--app` targeting and support `--json` output for agent consumption.

## Design

### CLI surface

```sh
# Validate layout content structure for a specific app
pnpm exec site-kernel run content.layouts.validate --app nicaragua-projekt

# Lint layout naming conventions across all apps
pnpm exec site-kernel run naming.layouts.lint --all --json

# Existing commands gain layout awareness
pnpm exec site-kernel run mirror.quartet.validate --app nicaragua-projekt
pnpm exec site-kernel run dispatcher.sync.validate --app nicaragua-projekt
```

**Flags**:

- `--app <name>`: Target specific app (required unless `--all`)
- `--all`: Run against all apps in `apps/*`
- `--json`: Output machine-parseable results
- `--strict`: Fail on style reference mismatches (optional validation)

### TypeScript contracts

```ts
interface LayoutContentEntry {
  lang: string;
  filename: string;
  fullPath: string;
}

interface LayoutSchemaEntry {
  name: string; // e.g., "layout" not "layout-component"
  fullPath: string;
}

interface LayoutValidationResult {
  command: "content.layouts.validate";
  status: "pass" | "fail";
  app: string;
  layouts: {
    name: string;
    contentFiles: LayoutContentEntry[];
    schemaFile: LayoutSchemaEntry | null;
    styleFile: string | null;
    violations: LayoutViolation[];
  }[];
}

type LayoutViolation =
  | { type: "missing-content"; lang: string; message: string }
  | { type: "missing-schema"; message: string }
  | { type: "wrong-schema-suffix"; found: string; expected: string }
  | { type: "wrong-schema-location"; found: string; expected: string }
  | { type: "style-reference-mismatch"; expected: string; found: string };
```

### File system responsibilities

| Path                               | Role                                  |
| ---------------------------------- | ------------------------------------- |
| `src/content/layouts/[lang]/*.md`  | Layout content files (mandatory)      |
| `src/content/schemas/layouts/*.ts` | Layout schemas (mandatory, no suffix) |

### Output format

```json
{
  "command": "content.layouts.validate",
  "status": "fail",
  "app": "nicaragua-projekt",
  "layouts": [
    {
      "name": "layout",
      "contentFiles": [
        { "lang": "de", "filename": "layout.md", "fullPath": "..." }
      ],
      "schemaFile": { "name": "layout", "fullPath": "..." },
      "styleFile": "src/styles/layouts/layout.css",
      "violations": [
        { "type": "missing-content", "lang": "en", "message": "Missing content for lang 'en'" }
      ]
    }
  ]
}
```

### Failure modes

- **Missing content file**: Fail if a layout has a schema but no content file for a supported language
- **Missing schema**: Fail if content files exist without a corresponding schema
- **Wrong suffix**: Fail if schema has `-component` suffix (should be bare name)
- **Wrong location**: Fail if schema is in `schemas/components/` instead of `schemas/layouts/`
- **Style mismatch**: Warn (or fail with `--strict`) if layout does not reference canonical styles

## Rollout

1. **Proving in `apps/nicaragua-projekt`**:
   - Create `src/content/layouts/` directory
   - Move `src/content/components/de/layout.md` → `src/content/layouts/de/layout.md`
   - Create `src/content/schemas/layouts/` directory
   - Move/rename `src/content/schemas/components/layout-component.ts` → `src/content/schemas/layouts/layout.ts`
   - Update imports in `src/content/schemas/components-dispatcher.ts`

2. **Command implementation**:
   - Add `content.layouts.validate` command to `site-kernel-checks`
   - Add `naming.layouts.lint` command
   - Update `mirror.quartet.validate` to recognize layout content paths
   - Update `dispatcher.sync.validate` to sync layout dispatcher

3. **Cross-app adoption**:
   - Apply same structural changes to `apps/main`
   - Document migration path for future apps

## Alternatives considered

1. **Keep layouts as components**: Rejected because layouts are architecturally distinct (shell vs. visitor-facing body) and deserve their own namespace.

2. **Keep `-component` suffix**: Rejected because it breaks the established pattern where page schemas use bare names, and layouts are not components.

3. **Validate only in proving app**: Rejected because this is a workspace-scoped architectural contract that should apply uniformly to all apps.

## Risks

- **Migration friction**: Moving files may break existing imports. Mitigation: coordinated change with import updates.
- **False positives**: Style reference validation may flag legitimate exceptions. Mitigation: make it a warning by default, opt-in strict mode.
- **Agent confusion**: Agents may reference old paths. Mitigation: update AGENTS.md with new structure rules.

## Acceptance criteria

- [x] `src/content/layouts/[lang]/` directory structure exists in `apps/nicaragua-projekt` and `apps-todo/main` (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Layout content files moved from `src/content/components/` to `src/content/layouts/` (apps/nicaragua-projekt, apps-todo/main) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `src/content/schemas/layouts/` directory created (apps/nicaragua-projekt, apps-todo/main) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Layout schema renamed from `layout-component.ts` to `layout.ts` and moved to layouts directory (apps/nicaragua-projekt, apps-todo/main) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `content.layouts.validate` command implemented in `site-kernel-checks` (evidence: implemented historically)
- [x] `naming.layouts.lint` command implemented (already existed per RFC-0020) (evidence: implemented historically)
- [x] `mirror.quartet.validate` correctly excludes layouts (layouts use separate dispatcher, not quartet mirror) (evidence: implemented historically)
- [x] `--json` output format documented and stable (evidence: implemented historically)
- [x] `AGENTS.md` updated with layout content layer rules (apps/nicaragua-projekt, apps-todo/main) (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted
- Agents MUST NOT change status fields in any RFC
- When implementing, agents MUST reference this RFC ID in commit messages or PR descriptions
- Agents MUST verify layout content exists at the new paths before removing from old locations
- Agents MUST update dispatcher files when schema locations change
- Agents SHOULD run `rfc.check` after file moves to ensure RFC contract references remain valid
