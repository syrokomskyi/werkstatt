---
id: RFC-0263
title: "Derive section numbering behavior from the archetype registry"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-02
implementedAt: 2026-07-02
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0025
  - RFC-0091
  - RFC-0097
commands:
  proposed:
    - cosmic.literals.lint
  added:
    - cosmic.literals.lint
  changed:
    - archetype.registry.build
  removed: []
appsImpacted:
  - warpgogol-com
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/share"
  - "@gogol/ontology"
  - "@gogol/site-kernel-checks"
successSignals:
  - "packages/share/src/page.ts contains zero cosmic-catalog names as string literals; the UNNUMBERED_HERO_PLANETS set is deleted."
  - "Adding or renaming a hero-role section automatically carries the unnumbered behavior with no dispatcher edit."
  - "cosmic.literals.lint fails when any catalog name reappears as a string literal in packages/share/src."
nonGoals:
  - "Do not change which sections are unnumbered today — rendered output must be byte-identical before and after."
  - "Do not move other prop-injection logic into the registry in this RFC; only the numbering behavior."
---

# RFC-0263: Derive section numbering behavior from the archetype registry

## Context

Part D of the 2026-07-02 AEO audit series (manifest-authoritative UI contracts; see rfc-0258 for series order).

`packages/share/src/page.ts` — the module whose own `@ai-invariant` declares the archetype registry as the single source of truth (RFC-0091) — contains a hardcoded behavior table:

```ts
const UNNUMBERED_HERO_PLANETS = new Set(["Europa", "Phobos"]);
```

`buildPage` silently injects `hideSectionNumber: true` into blocks whose planet is in this set. The knowledge it encodes already exists in the manifests: `hero-section.manifest.yaml` carries `role: hero`. The set duplicates manifest data as invisible dispatcher state.

## Problem

The unprotected invariant is: **rendering behavior keyed on a cosmic name must derive from the manifest/registry, never from literals in dispatch code.** An agent renaming a hero planet, or adding a third hero-family section, updates the manifests and `system.md` (as `AGENTS.md` instructs) — and silently loses the numbering behavior, because no documented rule points at this set. An agent reading manifests as the source of truth cannot discover the behavior at all. This is exactly the bug class RFC-0091 eliminated for import paths (the fallback that shadowed the chat-widget section as a hero).

## Decision

1. `archetype.registry.build` propagates each manifest's `role` field into `packages/ontology/archetypes/index.json`; `@gogol/ontology/archetypes` exports a derived `roleByCosmicName: Record<string, string>` map alongside the existing import-path maps.
2. `buildPage` replaces the set membership test with `roleByCosmicName[planetName] === "hero"`. The `UNNUMBERED_HERO_PLANETS` set is deleted.
3. A new `cosmic.literals.lint` (rule `COSMIC-LIT-01`) fails when any name from the Star/Planet/Moon catalogs appears as a string literal in `packages/share/src/**` — the dispatch layer must stay name-free.

## Architectural fit

- Completes the RFC-0091/RFC-0097 arc: import paths and block-type maps are already registry-derived; this moves the last hardcoded name-keyed behavior into the same channel.
- `cosmic.literals.lint` joins the existing cosmic guards (`cosmic.catalog.validate`, `cosmic.name.unique`) in `PACKAGES_CHECK_PIPELINE`.
- Prepares rfc-0262: with roles in the registry, future role-conditional behaviors have a sanctioned home.

## Design

### CLI surface

```sh
pnpm exec site-kernel run archetype.registry.build      # now also emits roles
pnpm exec site-kernel run cosmic.literals.lint --json
```

### TypeScript contracts

```ts
// packages/ontology/archetypes/index.json gains per-entry:
// { "cosmicName": "Europa", "importPath": "…", "role": "hero", … }

// @gogol/ontology/archetypes
export const roleByCosmicName: Record<string, string>;

// packages/share/src/page.ts (after)
const role = roleByCosmicName[planetName];
const props = role === "hero" ? { ...block.props, hideSectionNumber: true } : block.props;
```

`role` is read from the manifest's existing `role` field; entries without a role are omitted from the map (no default injected).

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/archetype.ts` | registry build emits `role` |
| `packages/ontology/archetypes/index.json` | regenerated with roles |
| `packages/ui/src/sections/hero-decision-card/*.manifest.yaml` | Verify/add `role: hero` (Phobos) — parity precondition |
| `packages/share/src/page.ts` | Set deleted; registry lookup |
| `packages/os/site-kernel-checks/src/cosmic-literals-lint.ts` | New lint |

### Output format

Standard RFC-0203 `CheckResult`. `COSMIC-LIT-01` (error): file, line, the literal name, and which catalog it belongs to; fixHint points to the registry-derivation pattern.

### Failure modes

Lint exits 1 on any occurrence; no baseline needed (after this RFC the count is zero). String matching is word-boundary exact against the three catalogs; comments and the ontology package itself are excluded.

## Rollout

Single change, three commits: (1) manifest verification + registry build change + regenerated index.json; (2) page.ts swap with parity test; (3) lint. Both apps' `build:check` green after each.

## Alternatives considered

- **A `hideSectionNumber` default inside each hero manifest's propsSchema**: rejected — the behavior is an interaction between the dispatcher and section numbering, not a per-instance authored prop; authors may still override per block.
- **Keeping the set with a louder comment**: rejected — comments do not travel to the manifests where agents actually work.

## Risks

- If `hero-decision-card` (Phobos) does not currently carry `role: hero`, adding it might affect other role consumers. Mitigation: grep all consumers of `role` before landing; the parity test (below) is the gate.
- Catalog names that are also common words could false-positive in the lint; the catalogs are astronomically named (Europa, Hyperion, Desdemona) so collisions are unlikely; exact word-boundary matching plus per-line disable comment (`// cosmic-literals-ignore: <reason>`) covers the residue.

## Acceptance criteria

- [x] Parity test written BEFORE the swap: `buildPage` fixture snapshots for a page containing Europa and Phobos blocks — `hideSectionNumber` injection identical before/after the change; a non-hero block never receives the prop. (evidence: implemented historically)
- [x] `archetype.registry.build` emits `role`; `roleByCosmicName` exported from `@gogol/ontology/archetypes` with a unit test. (evidence: packages/ directory, package exists)
- [x] `UNNUMBERED_HERO_PLANETS` deleted from `page.ts`; no cosmic literals remain in `packages/share/src`. (evidence: packages/ directory, package exists)
- [x] `cosmic.literals.lint` registered in `PACKAGES_CHECK_PIPELINE` with red/green fixtures (satisfies rfc-0261 `check.fixture.lint`). (evidence: implemented historically)
- [x] `COSMIC-LIT-01` registered in the RFC-0203 rule registry with fixHint. (evidence: implemented historically)
- [x] Both apps `build:check` green; home pages' rendered HTML for hero sections unchanged (diff dist HTML of one hero page before/after). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

**As-built, 2026-07-02:** `hero-decision-card-section.manifest.yaml`'s `role` was `hero-with-decision-card` (not `hero`) prior to this RFC — this was the precondition risk flagged in the Risks section. Verified no other consumer reads that string literal (only the archetype's own `semanticRole` and the manifest's `role`), then changed it to `role: hero`; `archetype.registry.validate`'s RFC-0084 role/semanticRole cross-check stayed green because that check validates membership in the full section-role set, not equality to the section's own archetype `semanticRole` (multiple existing manifests already share roles across archetypes, e.g. `approach`). `cosmic.literals.lint` additionally found two pre-existing literals outside `page.ts` — `page-handler.ts`'s `BREADCRUMBS_COSMIC_NAME` registry-lookup fallback and its hardcoded default-site-background `cosmicMoon` — both are legitimate defensive/authored values rather than the dispatch-duplication anti-pattern this RFC targets, so they were kept and annotated with the `cosmic-literals-ignore` escape hatch the RFC itself specifies; the same marker was used for cosmicName literals in test fixtures (`Europa`/`Phobos`/`Callisto`) that legitimately need to reference real catalog entries. Byte-identical rendered output was confirmed two ways: the parity test runs the exact production `buildPage` code path, and `warpgogol-com`'s built home page shows the hero section's `section-header` lacking `section-header--with-number` while every other section carries it.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Write the parity test first and run it against the CURRENT code to capture today's behavior; only then swap the implementation.
- Verify by inspection which manifests carry `role: hero` today; if Phobos's manifest lacks it, add it in commit 1 and note it in the PR.
- Do not generalize beyond `role === "hero"` in this RFC even if other role-conditional ideas appear — file a follow-up RFC instead.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions only; reference `rfc-0263` in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a superseding RFC.
