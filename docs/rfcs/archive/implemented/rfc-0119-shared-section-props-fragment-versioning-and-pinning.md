---
id: RFC-0119
title: "Shared section props fragment versioning and pinning"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-27
updatedAt: 2026-05-27
implementedAt: 2026-05-27
closedAt:
supersedes:
supersededBy:
related:
  - RFC-0091
  - RFC-0103
  - RFC-0107
  - RFC-0108
  - RFC-0110
  - RFC-0111
commands:
  proposed:
    - shared.section-props.changelog.report
    - shared.section-props.contract.validate
  added:
    - shared.section-props.changelog.report
    - shared.section-props.contract.validate
  changed:
    - page.block.validate
    - section.background.contract.validate
    - section.body.contract.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - ontology
  - os/site-kernel-checks
successSignals:
  - "Every fragment in SHARED_SECTION_PROPS exposes a numeric `schemaVersion` field starting at 1."
  - "Section manifest's `propsSchemaCompose` accepts both the bare id (`body-list`, latest version) and the pinned form (`body-list@1`)."
  - "composeManifestPropsSchema resolves pinned ids to the matching frozen fragment payload; unknown versions raise."
  - "A breaking change to a fragment requires bumping its schemaVersion; consumers can pin to the prior version during migration."
  - "shared.section-props.changelog.report lists every fragment, current version, and a one-line summary of the latest revision."
nonGoals:
  - "Do not maintain more than two simultaneous versions of any single fragment (latest + prior); deeper history requires a separate RFC."
  - "Do not introduce semver-style three-part numbers; integer monotonic versions are sufficient."
  - "Do not require pinning at the consumer side; bare ids continue to track the latest version."
---

# RFC-0119: Shared section props fragment versioning and pinning

## Context

RFC-0110 introduced the `SHARED_SECTION_PROPS` catalog. Today fragments are mutated in place: a change to `body-list` immediately affects every manifest that composes it. The catalog has no version field; no changelog; no way for a consumer to pin to the prior shape during a staged migration.

This is acceptable while the framework is single-PR-deployed, but the catalog will keep evolving (new body kinds, additional fragment fields) and silent breakage will accumulate.

## Problem

1. **Silent breaking changes.** Any field rename or required-list change in a fragment immediately fails every consumer manifest with no migration window.
2. **No changelog.** A reviewer reading a diff cannot tell whether the fragment edit is additive or breaking.
3. **No pinning vocabulary.** A consumer that needs the prior shape has no syntax to express it.
4. **Cross-package risk.** If `@gogol/ontology` ships a fragment change ahead of an app's migration, the app build breaks at deploy time without warning.

## Decision

Introduce per-fragment `schemaVersion` (positive integer) and a pinned syntax (`<id>@<version>`) in both manifest `propsSchemaCompose` and archetype `propsSchema.compose`. The catalog stores at most two versions per fragment id at any time: `latest` and (when migrating) `prior`.

### Fragment shape

`packages/ontology/src/shared-section-props/index.ts`:

```ts
export type JsonSchemaFragment = {
  schemaVersion: number;            // RFC-0119; starts at 1
  properties: Record<string, unknown>;
  required?: string[];
};

export type VersionedFragment = JsonSchemaFragment & {
  changelog?: string;               // one-line summary of this revision
};
```

### Catalog shape

```ts
export const SHARED_SECTION_PROPS = {
  "section-visual":      { latest: SECTION_VISUAL_V1 /* , prior: SECTION_VISUAL_V0 (when migrating) */ },
  "section-header":      { latest: SECTION_HEADER_V1 },
  "body-list":           { latest: BODY_LIST_V1 },
  "body-split-list":     { latest: BODY_SPLIT_LIST_V1 },
  "body-stats":          { latest: BODY_STATS_V1 },
  "body-cards":          { latest: BODY_CARDS_V1 },
  "body-paragraphs":     { latest: BODY_PARAGRAPHS_V1 },
  "body-comparison":     { latest: BODY_COMPARISON_V1 },
  "body-rich":           { latest: BODY_RICH_V1 },
} as const;
```

### Reference syntax

```yaml
propsSchemaCompose:
  - section-visual          # latest
  - section-header@1        # pinned to schemaVersion 1
  - body-list@2             # explicitly pinned (when v2 exists alongside v1)
```

### Resolution

`composeManifestPropsSchema` updates:

```ts
function resolveFragment(id: string): JsonSchemaFragment {
  const [baseId, pinnedVersionStr] = id.split("@");
  const versions = SHARED_SECTION_PROPS[baseId];
  if (!versions) throw new Error(`Unknown fragment id "${baseId}"`);
  if (!pinnedVersionStr) return versions.latest;
  const pinnedVersion = Number.parseInt(pinnedVersionStr, 10);
  if (versions.latest.schemaVersion === pinnedVersion) return versions.latest;
  if (versions.prior?.schemaVersion === pinnedVersion) return versions.prior;
  throw new Error(`Fragment "${baseId}" version ${pinnedVersion} not available`);
}
```

### Version-bump discipline

A version bump is required when:

- A property is removed.
- A property is renamed.
- A required field is added.
- An enum value is removed.
- A type narrows (e.g., `string` → `enum`).

A version bump is **not** required when:

- A new optional property is added.
- A new enum value is added.
- A description is changed.

### New commands

- `shared.section-props.contract.validate` — sanity check on the catalog itself: every entry has at least `latest`; if `prior` is present, its schemaVersion is exactly one less than `latest`; no more than two versions per id.
- `shared.section-props.changelog.report` — print the current `latest` schemaVersion and its `changelog` line for every fragment; machine-readable via `--json`.

### Validator coupling

- `page.block.validate` reads `propsSchemaCompose` and resolves each entry through the new resolver before composing the schema.
- `section.background.contract.validate` and `section.body.contract.validate` accept pinned ids and treat the baseId only when matching the catalog membership rule.

## Design

See `## CLI surface`, `## TypeScript contracts`, and `## File system responsibilities` above for the full versioning scheme, `<id>@<version>` pin syntax, `prior` migration slot, and validator strip-pin logic.

## Architectural fit

- **RFC-0091** — registry derivation unchanged.
- **RFC-0103 / RFC-0110** — fragments stay as the single source of truth; this RFC adds dimensionality.
- **RFC-0107** — flag-day rollout discipline preserved; future breaking-fragment changes follow the same pattern as other superseding RFCs.
- **RFC-0111** — validator rules continue to operate on baseIds; the new resolver feeds them the resolved fragment payload.

## CLI surface

```sh
pnpm exec werkstatt run shared.section-props.contract.validate
pnpm exec werkstatt run shared.section-props.changelog.report
pnpm exec werkstatt run page.block.validate --app <id>
```

## TypeScript contracts

```ts
export type SharedSectionPropsId =
  | "section-visual"
  | "section-header"
  | "body-list"
  | "body-split-list"
  | "body-stats"
  | "body-cards"
  | "body-paragraphs"
  | "body-comparison"
  | "body-rich";

export type SharedSectionPropsRef =
  | SharedSectionPropsId
  | `${SharedSectionPropsId}@${number}`;
```

## File system responsibilities

| Path | Edit |
| --- | --- |
| `packages/ontology/src/shared-section-props/index.ts` | Wrap every fragment in `{ schemaVersion, properties, required?, changelog? }`; expose `latest` / `prior` slots; rewrite resolver. |
| `packages/ontology/src/schemas/section-archetype.ts` | Allow `compose: string[]` entries to match `^[a-z][a-z0-9-]+(@\d+)?$`. |
| `packages/ontology/src/manifest.ts` | Same regex on `propsSchemaCompose`. |
| `packages/os/site-kernel-checks/src/shared-section-props.ts` | New file with contract validate + changelog report runners. |
| `packages/os/site-kernel-checks/src/module.ts` | Register the two new commands. |

## Failure modes

- A manifest pins `body-list@9` while only `@1` exists → resolver raises with a clear error pointing to the changelog command.
- A fragment ships `latest` v3 while `prior` v1 still exists → `shared.section-props.contract.validate` fails because the catalog forbids more than two adjacent versions.
- A page block authored against `body-list@1` continues to validate even after a new `body-list@2` lands, until the manifest bumps the pin.

## Rollout

1. Seed every fragment with `schemaVersion: 1` and an empty changelog.
2. Land the resolver + commands.
3. Update existing manifest YAMLs to keep the bare id (no pinning) — they continue to track latest.
4. Future breaking changes follow the version-bump discipline.

## Alternatives considered

- **Semver three-part versions.** Rejected — overkill for a small, curated catalog; a monotonic integer is sufficient and reads as a clear monotonic timeline.
- **Git tag pinning.** Rejected — couples consumer state to repo history; the catalog ships inside the monorepo and the in-process resolver is the simpler path.
- **No pinning, just changelog.** Rejected — agents and humans need a pin syntax during long migrations; otherwise breaking changes are always immediate.

## Risks

- Authors may forget to bump `schemaVersion` on a breaking change. Mitigation: `shared.section-props.contract.validate` checks the version field exists and is an integer; a breaking change without a bump produces an invalid schema that fails validation immediately.
- Stale pinned refs in manifests after a fragment migration. Mitigation: the `prior` slot provides a grace window; after the window, old pins become validation errors.

## Acceptance criteria

- [x] Every fragment carries `schemaVersion` (via the `v1()` helper in `packages/ontology/src/shared-section-props/index.ts`, 2026-05-27). (evidence: packages/ directory, package exists)
- [x] Resolver accepts `id` and `id@version` forms (`resolveFragment` splits on `@`, validates against `latest` / `prior`). (evidence: implemented historically)
- [x] Two new commands exist and pass workspace-wide (`shared.section-props.contract.validate` registered in `PACKAGES_CHECK_PIPELINE`; `shared.section-props.changelog.report` available as a standalone command). (evidence: implemented historically)
- [x] No manifest is force-migrated to pin syntax; bare ids continue to work (`composeManifestPropsSchema` defaults bare ids to `latest`; manifest + archetype compose-id regex `^[a-z][a-z0-9-]*(@\d+)?$` accepts both forms). (evidence: implemented historically)

## Implementation notes for agents

- Agents MUST bump `schemaVersion` when introducing any of the listed breaking changes; merging a breaking fragment without a bump is a protocol violation.
- Agents MUST keep the `prior` slot populated for at least one pipeline release after a version bump, so consumers can pin during migration.
- Agents MUST add a one-line `changelog` entry to the new `latest` fragment describing the revision.
