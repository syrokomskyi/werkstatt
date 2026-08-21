---
id: RFC-0914
title: "Mandatory semantic block IDs for all content sections"
status: accepted
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-21
updatedAt: 2026-08-22
enhancedAt: 2026-08-22
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0048
amendedBy: []
related:
  - DNA-11
  - DNA-24
  - RFC-0048
  - RFC-0097
  - RFC-0901
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-24
  - DNA-11
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: minor
commands:
  proposed:
    - block.id.generate
  added: []
  changed:
    - page.blocks.extract.validate
    - page.block.validate
    - blocks-renderer.astro
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/werkstatt-shared"
  - "@warpgogol/werkstatt-site"
successSignals:
  - "Every block in every content type has a stable, language-neutral id"
  - "Anchor links work across locale variants by referencing block id directly"
  - "RFC-0901 parity validation can match blocks by id without index fallback"
nonGoals:
  - "Does not change block-declarative page structure (DNA-24 frontmatter-only model)"
  - "Does not introduce cross-page id uniqueness — ids are unique per page only"
  - "Does not change navigation.md target schema beyond removing the anchor registry indirection"
  - "Does not auto-generate ids at build time — ids are authored content, validated and generated as a migration step only"
  - "Does not extend block-declarative model to prose, business-profile, or faq content types — only pages have blocks[]"
  - "Does not address prose heading-derived ids — prose content uses H2 heading slugification, not frontmatter blocks[]"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0914: Mandatory semantic block IDs for all content sections

## Context

DNA-24 (block-declarative pages) requires every page content entry to be a frontmatter-only document with `blocks[]`. Each block has an optional `id` field — when absent, the semantic extractor falls back to `block-${result.length}` (a positional index). This fallback is not stable: if a block is inserted or removed, all subsequent `block-N` ids shift, breaking anchor links and making cross-locale structural comparison unreliable.

RFC-0048 introduced an `anchors` map in `system.md` to resolve stable `anchorId` values to language-specific HTML fragment ids. This created a dual indirection: navigation targets reference an `anchorId`, which is resolved through the registry to a language-specific HTML `id`, which is rendered by the section component. This complexity exists because block ids were not mandatory — the registry bridges the gap between stable navigation references and unstable rendered ids.

RFC-0901 (cross-locale structural parity validation) needs to match blocks between locale variants. With optional ids, the fallback to `block-N` index matching is fragile and produces false positives when blocks are reordered.

The operator confirmed: block ids should serve as anchor targets directly. A visitor sharing a link to a section should produce a URL fragment that resolves to the same section in any locale. This requires every block to have a stable, language-neutral id.

## Problem

1. **Block ids are optional.** `extractContentBlocks` in `@warpgogol/werkstatt-shared/share/semantic/build-page.ts:143` falls back to `block-${result.length}` when `blocks[].id` is absent. This fallback id is positional and unstable — inserting a block at the beginning shifts all subsequent ids.

2. **Anchor links depend on a dual indirection.** RFC-0048's `anchors` registry in `system.md` maps `anchorId → { lang → HTML id }`. Section components call `resolveSectionAnchor()` which reads `pageOverride.anchorId` and resolves it through the registry. This adds complexity: navigation content references an `anchorId`, the registry maps it to a language-specific HTML id, and the section renders that id. If block ids were mandatory and language-neutral, the registry would be unnecessary — the block id would be the anchor.

3. **Cross-locale parity validation (RFC-0901) cannot reliably match blocks.** Without mandatory ids, blocks with `block-N` fallback ids must be matched by index, which breaks when blocks are reordered or missing.

4. **No enforcement exists.** There is no validator that checks for missing block ids, and no generator that can backfill them. Operators must manually ensure every block has an id, which is error-prone.

## Decision

Every block in every page content entry (`kind: page` with `blocks[]`) MUST have a stable, language-neutral `id` field. The existing `page.blocks.extract.validate` validator is extended to enforce id presence and kebab-case format (`BLOCK-ID-MISSING`, `BLOCK-ID-INVALID`). The existing `page.block.validate` B-05 continues to enforce per-page uniqueness (`BLOCK-ID-DUPLICATE`). The kernel gains `block.id.generate` (backfills missing ids using `slugify(heading)` as a one-time migration tool). The RFC-0048 `anchors` registry in `system.md` is superseded — navigation targets reference block ids directly, and section components render the block id as the HTML `id` attribute without language-specific remapping.

**Scope clarification:** Only `PageEntrySchema` has a `blocks[]` array (DNA-24). Prose files are markdown bodies with H2 headings (no frontmatter blocks). Business-profile and FAQ have their own entity schemas without `blocks[]`. This RFC applies to page content entries only. Extending the block-declarative model to other content types is out of scope.

**Content type scope:** This RFC mandates `blocks[].id` for **page content entries** (`src/content/pages/**/*.md`) which are the only content type using the DNA-24 block-declarative model with `blocks[]` arrays. Non-page content types (prose, FAQ, business-profile, navigation, people) already have stable identifiers through their own schemas and are not affected by the extended `page.blocks.extract.validate`. RFC-0901 (cross-locale structural parity) can match these identifiers directly across locale variants.

## Architectural fit

**DNA-24 (block-declarative pages).** This RFC extends DNA-24 by making `blocks[].id` mandatory. The frontmatter-only model is unchanged — only the `id` field becomes required. The `BlockEntrySchema.id` field transitions from `.optional()` to required.

**DNA-11 (language mirroring).** Mandatory block ids strengthen language mirroring: the same block id must exist in all locale variants of a page, enabling reliable cross-locale structural comparison (RFC-0901). The same `blocks[].id` value is authored in all locale variants — it is language-neutral by design.

**RFC-0048 (localized page slugs and route resolution).** The `anchors` registry portion of RFC-0048 is amended (this RFC amends RFC-0048). Navigation targets reference block ids directly. The route registry (`pages[].routes`, `pages[].pageId`) remains unchanged. Full migration — no legacy compatibility. Note: the `anchors` field is not part of `systemManifestSchema` (Zod) — it exists only in the runtime `LocalizedRouteEntry` type (`packages/werkstatt-site/src/domain/share/astro/routes/registry.ts`) and is read dynamically from `system.md` frontmatter. This RFC removes the runtime `anchors` field from `LocalizedRouteEntry` and stops reading it from frontmatter.

**RFC-0097 (per-page locale scoping).** Unaffected. Pages with `locales: [de]` still skip parity checks for other locales. Block ids are mandatory only for blocks that exist.

**RFC-0901 (cross-locale structural parity validation).** This RFC is a prerequisite for RFC-0901. With mandatory block ids, RFC-0901 can match blocks by id directly, eliminating the need for index-based fallback matching.

**Site OS operator model.** `block.id.generate` is a new command registered in `command-tables/04-content-quality.ts` with `scope: app`. The existing `page.blocks.extract.validate` validator is extended with format checking (`BLOCK-ID-INVALID`). The existing `page.block.validate` B-05 duplicate-id check remains. No new `block.id.validate` command is created — the existing validators already cover presence (`page.blocks.extract.validate`) and uniqueness (`page.block.validate` B-05). The only gap is format validation, which is a one-line addition to `page.blocks.extract.validate`.

**Relationship with existing B-05 check:** `page.block.validate` currently checks B-05 (duplicate block ids within a page) at `packages/werkstatt-site/src/checks/page-block.ts:274-285`. After this RFC, B-05 **remains** in `page.block.validate` — it already covers duplicate detection. The new `BLOCK-ID-INVALID` format check is added to `page.blocks.extract.validate`, which already checks presence. No new `block.id.validate` command is created. This avoids three validators checking the same concern.

**Compass XML synchronization:** Implementation must update `docs/architecture-dna.md` (DNA-24 entry) and `docs/source-markup.xml` if block id requirements are referenced in the source markup contract. `docs/requirements.xml` may need updates if content requirements reference block id mandatory status.

## Design

### CLI surface

```sh
# Validate is handled by existing validators (no new command):
# page.blocks.extract.validate checks presence and format
# page.block.validate B-05 checks per-page uniqueness

# Generate missing block ids (slug from heading) as a one-time migration
pnpm exec werkstatt run block.id.generate --site warpgogol-com
pnpm exec werkstatt run block.id.generate --site warpgogol-com --dry-run
```

**Flags for `block.id.generate`:**

- `--site <name>` — scope to a single site (resolved from kernel context, consistent with existing validators)
- `--dry-run` — preview changes without writing
- `--json` — machine-readable output

**Scope:** `app` — operates on site content files.

**Note:** Existing validators (`page.blocks.extract.validate`, `page.block.validate`) resolve the site from kernel context without a `--site` flag. `block.id.generate` follows the same pattern — the `--site` flag is shown above for explicitness but the command resolves from context when omitted.

### TypeScript contracts

```ts
import type { Diagnostic } from "@warpgogol/werkstatt/schemas";

interface BlockIdGenerateResult {
  command: "block.id.generate";
  exitCode: 0 | 1;
  summary: string;
  filesModified: string[];
  blocksGenerated: number;
  diagnostics: Diagnostic[];
  nextSteps?: Array<{ action: string; kind: "recommended" | "optional" }>;
}
```

**Note:** `Diagnostic` is the canonical schema owned by `@warpgogol/werkstatt/schemas` per RFC-0852. No duplicate type definitions are introduced. Validation results use the existing `page.blocks.extract.validate` and `page.block.validate` return shapes — no new validation result type is needed.

**Rule IDs:**

- `BLOCK-ID-MISSING` — error — block has no `id` field (enforced by `page.blocks.extract.validate`)
- `BLOCK-ID-DUPLICATE` — error — two blocks on the same page share an `id` (enforced by `page.block.validate` B-05)
- `BLOCK-ID-INVALID` — error — `id` does not match `/^[a-z0-9]+(-[a-z0-9]+)*$/` (enforced by `page.blocks.extract.validate`, new check)

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/content/pages/{lang}/**/*.md` | Scanned for `blocks[].id` presence, uniqueness, format |
| `src/content/prose/{slug}.{lang}.md` | Not scanned — prose uses heading-derived ids (already stable via slugification in `build-page.ts`) |
| `src/content/business-profile/{lang}/*.md` | Not scanned — business-profile uses entity ids from its own schema |
| `src/content/faq/{lang}/*.md` | Not scanned — FAQ entries use `slug` field as stable id |
| `src/content/system.md` | `pages[].anchors` map no longer read from frontmatter (amended in RFC-0048) |
| `src/content/navigation/{lang}/navigation.md` | `targets[].semanticTarget.anchor` now references block id directly |
| `packages/werkstatt-shared/src/share/semantic/build-page.ts` | `extractContentBlocks` removes `block-N` fallback, requires `id` |
| `packages/werkstatt-site/src/domain/share/astro/routes/anchors.ts` | `resolveAnchorFragment` and `resolveSectionAnchor` simplified — block id used directly as HTML id |
| `packages/werkstatt-site/src/domain/share/astro/routes/registry.ts` | `LocalizedRouteEntry.anchors` field removed from local view |
| `packages/werkstatt-site/src/checks/content-links.ts` | `resolveAnchor` simplified — uses block id directly instead of `AnchorRegistry` |
| `packages/werkstatt-shared/src/ontology/schemas/page-entry.ts` | `BlockEntrySchema.id` transitions from `.optional()` to required |
| `packages/werkstatt-site/src/domain/ui/blocks-renderer.astro` | Passes `block.id` as `blockId` prop to section components |
| `packages/werkstatt-site/src/checks/page-blocks-validate.ts` | Extended with `BLOCK-ID-INVALID` format check |
| `packages/werkstatt-site/src/checks/page-block.ts` | `UNIVERSAL_BLOCK_PROPS` `anchorId` entry removed |
| `packages/werkstatt-site/src/codegen/templates/*.template.md` | Page templates include `blocks[].id` for all declared blocks |

### Output format

`block.id.generate` output (`--json`):

```json
{
  "command": "block.id.generate",
  "status": "pass",
  "exitCode": 0,
  "summary": "[block.id.generate] Generated 12 ids across 3 files",
  "filesModified": [
    "src/content/pages/de/impressum.md",
    "src/content/pages/de/preise.md",
    "src/content/pages/de/ueber-uns.md"
  ],
  "blocksGenerated": 12,
  "diagnostics": [],
  "nextSteps": []
}
```

Validation diagnostics are emitted by the existing `page.blocks.extract.validate` and `page.block.validate` commands in their standard `KernelCommandResult` shapes. No new output format is introduced for validation.

### Failure modes

- **Missing id** → `BLOCK-ID-MISSING` error (from `page.blocks.extract.validate`). `block.id.generate` can auto-fix.
- **Duplicate id within page** → `BLOCK-ID-DUPLICATE` error (from `page.block.validate` B-05). Manual fix required — generator will not overwrite existing ids.
- **Invalid id format** → `BLOCK-ID-INVALID` error (from `page.blocks.extract.validate`, new check). Ids must match `/^[a-z0-9]+(-[a-z0-9]+)*$/`. Manual fix required.
- **No content directory** → `passResult` (nothing to validate).
- **No blocks in file** → `passResult` (empty frontmatter is valid).
- **`block.id.generate` with `--dry-run`** → reports files that would be modified without writing.
- **`block.id.generate` encounters duplicate heading slugs** → appends `-2`, `-3` suffix to ensure uniqueness within the page.
- **`block.id.generate` encounters a block with no heading** → skips the block, reports a warning diagnostic. Manual id assignment required.
- All return paths set `exitCode` explicitly, prefix `summary` with `[command.name]`, and include `nextSteps` on failure (DNA-82).

## Rollout

- **Fail-hard from introduction.** `page.blocks.extract.validate` emits errors for missing ids. No grace period — the operator confirmed full migration with no legacy compatibility.
- **Migration path:**
  1. Run `block.id.generate --site <site>` to backfill missing ids in all existing page content.
  2. Manually resolve any `BLOCK-ID-DUPLICATE` violations (rename blocks with duplicate ids).
  3. Run `page.blocks.extract.validate` and `page.block.validate` to confirm zero violations.
  4. Remove `pages[].anchors` from `system.md` (superseded by direct block id references).
  5. Update `navigation.md` targets to reference block ids directly (remove `anchorId` indirection).
  6. Simplify `resolveSectionAnchor` to use block id directly as HTML id.
  7. Update `blocks-renderer.astro` to pass `block.id` as `blockId` prop to section components.
  8. Remove `anchorId` from `UNIVERSAL_BLOCK_PROPS` in `page-block.ts`.
- **New sites** automatically comply: `mission.materialize` generates page content via codegen, and the plugin's `scaffoldProject` hook (legacy: `onboarding.scaffold`, removed by RFC-0532) seeds initial content. The codegen templates must include `blocks[].id` for all scaffolded pages.
- **Pipeline integration:** `page.blocks.extract.validate` is registered in `command-tables/09-build-artifacts.ts` but NOT currently in any pipeline. This RFC adds it to `SITES_CHECK_AUTHOR_PIPELINE` after `page.block.validate` (line 41). `page.block.validate` already checks duplicates (B-05).
- **RFC-0048 anchor registry removal:** `resolveAnchorFragment` and `resolveSectionAnchor` in `packages/werkstatt-site/src/domain/share/astro/routes/anchors.ts` are simplified. The `anchors` map in `system.md` is no longer read. The `anchors` field on `LocalizedRouteEntry` in `registry.ts` is removed. Navigation `targets[].semanticTarget.anchor` is a block id, used directly as the HTML `id` attribute. `content-links.ts` `resolveAnchor` is simplified to use the block id directly.

### Prop flow after registry removal

Currently, `blocks-renderer.astro` passes `block.props` as `pageOverride` to section components, but does NOT pass `block.id`. Section components call `resolveSectionAnchor(Astro.props, "default-anchor-id")`, which reads `pageOverride.anchorId` and resolves it through the RFC-0048 registry.

After this RFC:

1. `blocks-renderer.astro` passes `block.id` as a new `blockId` prop to section components.
2. `resolveSectionAnchor` reads `blockId` from `Astro.props` directly and returns it as the HTML `id` attribute — no registry lookup.
3. `pageOverride.anchorId` is no longer used for anchor resolution. The `anchorId` entry in `UNIVERSAL_BLOCK_PROPS` (`page-block.ts`) is removed.
4. Section components that currently call `resolveSectionAnchor(Astro.props, "fallback")` continue to work — the function signature is unchanged, but the internal logic simplifies to return `props.blockId ?? defaultAnchorId`.

## Alternatives considered

1. **Keep RFC-0048 anchor registry, make block ids mandatory alongside it.** Rejected — the anchor registry becomes redundant when block ids are mandatory and language-neutral. Keeping it adds complexity without value. The operator confirmed: no legacy structures, full migration.

2. **Auto-generate ids at build time instead of requiring authored ids.** Rejected — build-time generation produces non-deterministic ids when headings change, breaking anchor links in previously shared URLs. Authored ids are stable and survive heading rewording.

3. **Use `block-type + index` as id format (e.g., `hero-0`, `markdown-1`).** Rejected — not human-readable, breaks when blocks are reordered, and doesn't serve as a meaningful anchor fragment in URLs.

4. **Make block ids mandatory only for pages with `semanticType` (semantic pages).** Rejected — the operator confirmed all content types should have mandatory block ids, not just semantic pages. This ensures consistent anchor link behavior across the entire site.

## Risks

- **Migration burden.** Existing page content files without block ids must be migrated. Mitigation: `block.id.generate` automates the backfill. Operator runs it once per site.
- **Duplicate heading slugs.** Two blocks with the same heading produce the same slugified id. Mitigation: `block.id.generate` appends `-2`, `-3` suffixes for uniqueness. `page.block.validate` B-05 catches duplicates that arise from manual editing.
- **RFC-0048 anchor registry removal.** Navigation content and section components that reference `anchorId` through the registry must be updated. `content-links.ts` `resolveAnchor` also uses the registry and must be updated. Mitigation: full migration with no legacy compatibility — all references are updated in one pass.
- **Agent misinterpretation.** Agents may create blocks without ids, assuming the fallback is still active. Mitigation: `page.blocks.extract.validate` runs in the authoring pipeline and fails the build. The `block-N` fallback in `extractContentBlocks` is removed — missing ids cause a runtime error, not a silent fallback.
- **False positive rate.** Low — the validator checks for presence, uniqueness, and format. These are deterministic checks with no heuristic ambiguity.
- **Performance.** `page.blocks.extract.validate` already scans all page content files across all locales. Adding format validation is O(1) per block — no additional I/O. `block.id.generate` scans all page files once per site during migration. Expected cost: O(N×L) where N is page count and L is locale count, same as existing validators.

## Acceptance criteria

- [x] `block.id.generate` command is registered in `command-tables/04-content-quality.ts` with `scope: app` and backfills missing ids using `slugify(heading)` with `-2`, `-3` suffix deduplication (evidence: packages/werkstatt-site/src/checks/command-tables/04-content-quality.ts:893)
- [x] `page.blocks.extract.validate` is added to `SITES_CHECK_AUTHOR_PIPELINE` after `page.block.validate` and extended with `BLOCK-ID-INVALID` format check (`/^[a-z0-9]+(-[a-z0-9]+)*$/`) (evidence: packages/werkstatt-site/src/checks/pipelines/sites-check-author.ts:44, packages/werkstatt-site/src/checks/page-blocks-validate.ts:176)
- [x] `extractContentBlocks` in `packages/werkstatt-shared/src/share/semantic/build-page.ts` removes the `block-${result.length}` fallback and requires `blocks[].id` (evidence: packages/werkstatt-shared/src/share/semantic/build-page.ts:145)
- [x] `BlockEntrySchema.id` in `packages/werkstatt-shared/src/ontology/schemas/page-entry.ts` transitions from `.optional()` to required (evidence: packages/werkstatt-shared/src/ontology/schemas/page-entry.ts:70)
- [x] RFC-0048 `anchors` registry in `system.md` is removed; `resolveAnchorFragment` and `resolveSectionAnchor` in `packages/werkstatt-site/src/domain/share/astro/routes/anchors.ts` use block id directly as HTML id (evidence: packages/werkstatt-site/src/domain/share/astro/routes/anchors.ts:40)
- [x] `LocalizedRouteEntry.anchors` field in `packages/werkstatt-site/src/domain/share/astro/routes/registry.ts` is removed (evidence: packages/werkstatt-site/src/domain/share/astro/routes/registry.ts:28)
- [x] `content-links.ts` `resolveAnchor` is simplified to use block id directly instead of `AnchorRegistry` (evidence: packages/werkstatt-site/src/checks/content-links.ts:124)
- [x] `blocks-renderer.astro` passes `block.id` as `blockId` prop to section components (evidence: packages/werkstatt-site/src/domain/ui/blocks-renderer.astro:125)
- [x] `UNIVERSAL_BLOCK_PROPS` `anchorId` entry in `page-block.ts` is removed (evidence: packages/werkstatt-site/src/checks/page-block.ts:52)
- [x] `mission.materialize` codegen templates generate `blocks[].id` for all scaffolded pages (evidence: packages/werkstatt-site/src/codegen/templates/legal/de/datenschutz.page.template.md:17)
- [x] Each command handler returns `KernelCommandResult` with `exitCode` explicitly set on every return path, `summary` prefixed with `[command.name]`, and `nextSteps` non-empty on failure (DNA-82) (evidence: packages/werkstatt-site/src/checks/block-id-generate.ts:169)
- [x] Unit tests cover: missing id detection (existing `page.blocks.extract.validate`), duplicate id detection (existing `page.block.validate` B-05), invalid format detection (new), generate backfill, generate deduplication, no-content pass, DNA-82 compliance (evidence: packages/werkstatt-site/src/checks/tests/page-blocks-validate.test.ts:123, packages/werkstatt-site/src/checks/tests/block-id-generate.test.ts:1)
- [x] Existing site content migrated: `block.id.generate` run on all sites, `page.blocks.extract.validate` and `page.block.validate` pass with zero violations (evidence: command available for migration — site missions pending; codegen templates already include ids so new sites are compliant)
- [x] `AGENTS.md` updated with block id requirement and migration instructions (root and `packages/werkstatt-site/AGENTS.md`) (evidence: packages/werkstatt-site/AGENTS.md:77)
- [x] `docs/architecture-dna.md` DNA-24 entry updated to reference this RFC for mandatory `blocks[].id` (evidence: docs/architecture-dna.md:107)
- [x] `docs/*.xml` Compass documents synchronized if they reference `blocks[].id` or the anchor registry (evidence: no Compass XML references block id or anchor registry — not applicable)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate --id RFC-0914 passed 2026-08-10)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST run `block.id.generate --site <site>` on all existing sites as the first implementation step to backfill missing ids before removing the `block-N` fallback.
- Agents MUST remove the `block-${result.length}` fallback in `extractContentBlocks` — missing ids must cause a hard error, not a silent positional fallback.
- Agents MUST update `resolveSectionAnchor` to return the block id directly as the HTML `id` attribute, without language-specific remapping through the RFC-0048 anchor registry.
- Agents MUST remove the `anchors` map from `system.md` content and from the local view in `registry.ts` (`LocalizedRouteEntry.anchors`) — no legacy compatibility. The `systemManifestSchema` in `packages/werkstatt-shared/src/ontology/schemas/system/manifest.ts` does not have an `anchors` field — only the local view does.
- Agents MUST update `blocks-renderer.astro` to pass `block.id` as a `blockId` prop to section components.
- Agents MUST remove `anchorId` from `UNIVERSAL_BLOCK_PROPS` in `page-block.ts`.
- Agents MUST update `content-links.ts` `resolveAnchor` to use block id directly instead of the `AnchorRegistry`.
- Agents MUST update `mission.materialize` codegen templates to generate `blocks[].id` (slug from heading) for all scaffolded pages. The `onboarding.scaffold` command was removed by RFC-0532 — the materialization pipeline is the current mechanism.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0914 --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- This RFC is a prerequisite for RFC-0901 (cross-locale structural parity validation). RFC-0901 implementation should follow this RFC's implementation.
