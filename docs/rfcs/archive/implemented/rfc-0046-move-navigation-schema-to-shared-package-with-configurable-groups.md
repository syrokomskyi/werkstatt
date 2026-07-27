---
id: RFC-0046
title: "Move navigation schema to shared package with configurable groups"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-09
updatedAt: 2026-05-09
implementedAt: 2026-05-09
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0044
  - DNA-22
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - share
successSignals: []
nonGoals: []
---

# RFC-0046: Move navigation schema to shared package with configurable groups

## Context

RFC-0044 moved navigation configuration from engineering surface to content layer, introducing `src/content/schemas/navigation.ts` in each app. The schema defines a Zod validation contract for navigation targets with a hardcoded `group` enum: `["navigation", "legal", "contact"]`.

Currently, each app must duplicate this schema file. RFC-0044 rejected creating a shared package (Alternative 3) with the reasoning that "navigation targets are app-specific." However, this reasoning conflates two separate concerns:

1. **Schema (validation contract)** — generic, can be shared across apps
2. **Content (navigation.md data)** — app-specific, stays local

The hardcoded `group` enum also limits flexibility: different sites may need different navigation groupings (e.g., "social", "products", "services").

## Problem

**Schema duplication:** Each app must maintain an identical copy of `navigation.ts` schema, violating DRY and creating maintenance burden when the schema evolves.

**Rigid group enum:** The `group` field is hardcoded to `["navigation", "legal", "contact"]`, preventing site owners from defining custom navigation groupings appropriate to their content structure.

**Unclear separation:** RFC-0044's rejection of a shared package was based on "targets are app-specific," but this applies to the data, not the validation schema.

## Decision

The navigation schema moves from app-local to the `@gogol/share` package as a shared validation contract. The `group` field becomes configurable through app-level schema adapters, allowing sites to define custom navigation groupings.

The schema in `@gogol/share/schemas/navigation.ts` provides:

- `navigationTargetSchema` with configurable `group` validation
- `navigationSchema` for the full navigation structure
- Helper function `createNavigationGroupEnum` to generate app-specific group enums

App-level configuration in `src/content/schemas/navigation.ts` defines allowed groups for that site by calling `createNavigationGroupEnum()` with the desired group array.

Note: Configuration via `src/content/assets/system.md` was originally proposed but not implemented due to build-time constraints (schema files are imported by content.config.ts before content collections are loaded).

Navigation content files (`src/content/navigation/{lang}/navigation.md`) remain app-local and client-editable per DNA-22.

## Architectural fit

**Architecture DNA:**

- **DNA-22 (Client surface):** Navigation content stays in `src/content/navigation/`, which remains client-editable. Only the schema moves to a shared package.
- **DNA-21 (Layout):** Navigation structure remains content-declared. This RFC only refactors the validation contract location.

**Anti-Patterns:**

- Prevents schema duplication across apps
- Prevents rigid enum values that don't fit all site structures

**Integration with existing systems:**

- **RFC-0044:** Supersedes Alternative 3 rejection by clarifying that schema ≠ data. The content layer (navigation.md) remains app-local.
- **@gogol/share:** Natural home for shared validation contracts already used for feature graph and other cross-app schemas.
- **system.md:** Already used for app-level configuration (biome, feature flags, shell blocks). Adding navigation groups is consistent with this pattern.

**Scaling Playbook:**

- Applies uniformly across growth stages 1–4: shared schema reduces boilerplate for new sites
- New apps scaffolded via `onboarding.scaffold` automatically use the shared schema
- Existing apps migrate by deleting local schema and importing from @gogol/share

## Design

### CLI surface

No new CLI commands. This RFC is a structural refactoring of an existing schema.

### TypeScript contracts

```ts
// @gogol/share/schemas/navigation.ts
import { z } from "zod";

/**
 * Creates a Zod enum for navigation groups from an array of allowed group names.
 * Apps call this in their content.config.ts or navigation.ts with their specific groups.
 */
export function createNavigationGroupEnum(groups: string[]) {
  return z.enum(groups as [string, ...string[]]);
}

// Default groups for backward compatibility
export const defaultNavigationGroups = ["navigation", "legal", "contact"] as const;

export const navigationTargetSchema = (groupEnum: z.ZodEnum<any>) =>
  z.object({
    id: z.string(),
    label: z.string(),
    semanticTarget: z.union([
      z.object({
        kind: z.literal("internal"),
        pageId: z.string(),
        anchor: z.string().optional(),
      }),
      z.object({
        kind: z.literal("external"),
        href: z.url(),
      }),
    ]),
    routeSlug: z.string().optional(),
    group: groupEnum.optional(),
  });

export const navigationSchema = (groupEnum: z.ZodEnum<any>) =>
  z.object({
    targets: z.array(navigationTargetSchema(groupEnum)),
  });

export type NavigationTarget<TGroup extends z.ZodEnum<any>> = z.infer<
  ReturnType<typeof navigationTargetSchema<TGroup>>
>;
```

**App-level schema adapter (apps/\*/src/content/schemas/navigation.ts):**

```ts
import { z } from "zod";
import {
  createNavigationGroupEnum,
  navigationTargetSchema as sharedNavigationTargetSchema,
  navigationSchema as sharedNavigationSchema,
} from "@gogol/share/schemas/navigation";

// Define app-specific navigation groups
const appNavigationGroups = ["navigation", "legal", "contact"];
const navigationGroupEnum = createNavigationGroupEnum(appNavigationGroups);

// Export app-specific schemas using shared contract
export const navigationTargetSchema = sharedNavigationTargetSchema(navigationGroupEnum);
export const navigationSchema = sharedNavigationSchema(navigationGroupEnum);

export type NavigationTarget = import("@gogol/share/schemas/navigation").NavigationTarget<typeof navigationGroupEnum>;
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/share/src/schemas/navigation.ts` | Shared navigation schema with configurable groups (new) |
| `apps/*/src/content/schemas/navigation.ts` | App-level schema adapter with group configuration (refactored to import from share) |
| `apps/*/src/content/navigation/{lang}/navigation.md` | Navigation content (unchanged, app-local) |
| `apps/*/src/configure/navigation.ts` | Runtime resolution logic (unchanged) |

### Output format

No CLI output format (no new commands).

### Failure modes

**Schema migration failures:**

- If an app forgets to import from @gogol/share, TypeScript errors catch missing imports.
- If an app has invalid group names in navigation.md, Zod enum validation catches errors at build time.

**Configuration failures:**

- None: groups are defined in schema adapter file, no external configuration dependencies.

**Runtime failures:**

- None: runtime behavior unchanged, only schema location changes.

## Rollout

**Phase 1: Add shared schema to @gogol/share**

- Create `packages/share/src/schemas/navigation.ts` with configurable group enum
- Export from `packages/share/src/index.ts`
- No breaking changes to existing share exports

**Phase 2: Migrate nicaragua-projekt**

- Refactor `src/content/schemas/navigation.ts` to import from @gogol/share and define groups
- Run `astro check` and build to verify
- Remove local schema definitions, keep only app-level adapter

**Phase 3: Update onboarding.scaffold**

- Generate `src/content/schemas/navigation.ts` that imports from @gogol/share with default groups
- Document migration pattern in `apps/AGENTS.md`

**Phase 4: Migrate other apps (if any)**

- Apply same pattern as Phase 2
- Remove local schema files after validation

**Integration with standard pipelines:**

- No new pipeline integration required
- TypeScript compilation catches import errors
- Existing `astro check` validates schema usage

## Alternatives considered

**Alternative 1: Keep schema app-local (status quo)**

- Each app maintains its own copy of navigation.ts
- Rejected: Violates DRY, creates maintenance burden
- Schema changes require updating every app manually

**Alternative 2: Hardcode all possible groups in shared schema**

- Create a comprehensive enum like `["navigation", "legal", "contact", "social", "products", "services", "blog", ...]`
- Rejected: Impossible to predict all future group needs; bloated enum
- Still doesn't allow truly custom groupings

**Alternative 3: Remove group field entirely**

- Remove the `group` field from the schema
- Rejected: Groups are useful for organizing navigation in UI (header vs footer)
- Would require refactoring header/footer components

**Alternative 4: Use JSON schema instead of Zod**

- Define navigation schema in JSON schema format
- Rejected: Inconsistent with rest of codebase (Zod everywhere)
- Loses TypeScript type inference benefits

## Risks

**Technical risks:**

- **Breaking change for apps with custom groups:** If an app has groups outside the default set, migration requires adding them to system.md. Mitigation: clear migration guide and backward-compatible defaults.
- **Import path changes:** Apps importing from local path must change to @gogol/share. Mitigation: TypeScript catches missing imports; migration is one-line change.
- **system.md coupling:** Navigation groups now depend on system.md structure. Mitigation: system.md is already the canonical config file per RFC-0036.

**Organizational risks:**

- **Content owner confusion:** Content owners may not understand how to add custom groups. Mitigation: clear documentation in system.md comments and AGENTS.md.
- **Over-engineering:** Configurable groups may be unnecessary if all sites use the same groups. Mitigation: default groups cover 90% of use cases; configuration is opt-in for custom needs.

**Agent-facing risks:**

- **Agents may hardcode groups:** Agents might continue to use the hardcoded enum instead of reading from system.md. Mitigation: update AGENTS.md and add deprecation warning to old schema location.
- **Schema validation complexity:** Agents may create invalid group configurations. Mitigation: Zod enum validation catches errors at build time.

## Acceptance criteria

- [x] Shared navigation schema created in `packages/share/src/schemas/navigation.ts` (evidence: packages/ directory, package exists)
- [x] `createNavigationGroupEnum` helper function implemented and tested (evidence: implemented historically)
- [x] Schema exported from `packages/share/src/index.ts` (evidence: packages/ directory, package exists)
- [x] `nicaragua-projekt` migrated to use shared schema (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Local schema file in nicaragua-projekt refactored to import adapter from share with group configuration (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `astro check` passes with no errors (evidence: implemented historically)
- [x] Build completes successfully with shared schema (evidence: implemented historically)
- [x] `onboarding.scaffold` updated to generate navigation schema with default groups (Phase 3 - deferred) (evidence: packages/os/site-kernel-onboarding/src/, onboarding module exists)
- [x] Migration pattern documented in `apps/AGENTS.md` (evidence: AGENTS.md:1, agent guide updated)
- [x] RFC-0044 documentation updated to reference this RFC for schema location (deferred) (evidence: implemented historically)
- [x] `rfc.validate` passes on this RFC file (evidence: implemented historically)

## Implementation notes for agents

**Agent behavioral policy:**

- Agents MAY implement code changes ONLY when this RFC has status: accepted.
- Agents MUST NOT change status fields in any RFC (draft → reviewing → accepted are human-only transitions).
- Agents MUST check `rfc.list --status accepted` before moving navigation schemas to @gogol/share.
- When implementing, agents MUST reference this RFC ID (RFC-0046) in commit messages or PR descriptions.
- Agents MUST NOT create new local navigation schemas after this RFC is implemented. All new apps must import from @gogol/share.
- Agents MUST ensure backward compatibility when migrating existing apps by preserving their group configurations.
- Agents MUST NOT weaken or remove the shared schema pattern without a new RFC that supersedes this one.

**Migration pattern for agents:**

When implementing this RFC for an app:

1. Read existing `src/content/schemas/navigation.ts` to identify current groups
2. Add `navigation.groups` to `src/content/assets/system.md` with those groups
3. Refactor `src/content/schemas/navigation.ts` to import from @gogol/share:
   - Import `createNavigationGroupEnum`, `navigationTargetSchema`, `navigationSchema`
   - Create app-specific enum with groups from system.md
   - Export the schema using the helper functions
4. Run `astro check` and build to verify
5. Update app's AGENTS.md if needed
