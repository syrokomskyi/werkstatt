---
id: RFC-0914
title: "Mandatory semantic block IDs for all content sections"
status: draft
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
reviewers: []
createdAt: 2026-08-21
updatedAt: 2026-08-21
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
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
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - block.id.validate
    - block.id.generate
  added: []
  changed:
    - page.block.validate
    - onboarding.scaffold
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

Every block in every content type (pages, prose, business-profile, faq) MUST have a stable, language-neutral `id` field. The kernel gains `block.id.validate` (enforces presence and per-page uniqueness) and `block.id.generate` (backfills missing ids using `slugify(heading)`). The RFC-0048 `anchors` registry in `system.md` is superseded — navigation targets reference block ids directly, and section components render the block id as the HTML `id` attribute without language-specific remapping.

## Architectural fit

**DNA-24 (block-declarative pages).** This RFC extends DNA-24 by making `blocks[].id` mandatory. The frontmatter-only model is unchanged — only the `id` field becomes required.

**DNA-11 (language mirroring).** Mandatory block ids strengthen language mirroring: the same block id must exist in all locale variants of a page, enabling reliable cross-locale structural comparison (RFC-0901).

**RFC-0048 (localized page slugs and route resolution).** The `anchors` registry portion of RFC-0048 is superseded. Navigation targets reference block ids directly. The route registry (`pages[].routes`, `pages[].pageId`) remains unchanged. Full migration — no legacy compatibility.

**RFC-0097 (per-page locale scoping).** Unaffected. Pages with `locales: [de]` still skip parity checks for other locales. Block ids are mandatory only for blocks that exist.

**RFC-0901 (cross-locale structural parity validation).** This RFC is a prerequisite for RFC-0901. With mandatory block ids, RFC-0901 can match blocks by id directly, eliminating the need for index-based fallback matching.

**Site OS operator model.** Two new commands (`block.id.validate`, `block.id.generate`) registered in `command-tables/04-content-quality.ts`. `block.id.validate` is integrated into `SITES_CHECK_AUTHOR_PIPELINE` after `page.block.validate`. Both commands have `scope: app`.

## Design

### CLI surface

```sh
# Validate that every block has a stable id and ids are unique per page
pnpm exec werkstatt run block.id.validate --app warpgogol-com
pnpm exec werkstatt run block.id.validate --all --json

# Generate missing block ids (slug from heading) as a one-time migration
pnpm exec werkstatt run block.id.generate --app warpgogol-com
pnpm exec werkstatt run block.id.generate --all
```

**Flags:**

- `--app <name>` — scope to a single app (required unless `--all`)
- `--all` — run across all apps
- `--json` — machine-readable output
- `--dry-run` — (generate only) preview changes without writing

**Scope:** `app` — both commands operate on site content files.

### TypeScript contracts

```ts
interface BlockIdValidationResult {
  command: "block.id.validate";
  exitCode: 0 | 1;
  summary: string;
  diagnostics: Diagnostic[];
  nextSteps?: NextStep[];
}

interface BlockIdGenerateResult {
  command: "block.id.generate";
  exitCode: 0 | 1;
  summary: string;
  filesModified: string[];
  blocksGenerated: number;
  nextSteps?: NextStep[];
}
```

**Rule IDs:**

- `BLOCK-ID-MISSING` — error — block has no `id` field
- `BLOCK-ID-DUPLICATE` — error — two blocks on the same page share an `id`
- `BLOCK-ID-INVALID` — error — `id` contains characters other than `[a-z0-9-]` or is empty

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/content/pages/{lang}/**/*.md` | Scanned for `blocks[].id` presence, uniqueness, format |
| `src/content/prose/{slug}.{lang}.md` | Prose heading-derived ids checked for uniqueness within page |
| `src/content/business-profile/{lang}/*.md` | Scanned for block ids |
| `src/content/faq/{lang}/*.md` | Scanned for block ids |
| `src/content/system.md` | `pages[].anchors` map removed (superseded) |
| `src/content/navigation/{lang}/navigation.md` | `targets[].semanticTarget.anchor` now references block id directly |
| `packages/werkstatt-shared/src/share/semantic/build-page.ts` | `extractContentBlocks` removes `block-N` fallback, requires `id` |
| `packages/werkstatt-site/src/domain/share/astro/routes/anchors.ts` | `resolveAnchorFragment` and `resolveSectionAnchor` simplified — block id used directly as HTML id |
| `packages/werkstatt-site/src/codegen/section-scaffold.ts` | Scaffolded sections render `sectionId` from block id directly |

### Output format

```json
{
  "command": "block.id.validate",
  "status": "fail",
  "exitCode": 1,
  "summary": "[block.id.validate] 3 violations across 2 files",
  "diagnostics": [
    {
      "ruleId": "BLOCK-ID-MISSING",
      "severity": "error",
      "file": "src/content/pages/de/impressum.md",
      "message": "Block at index 2 (type: markdown) has no id",
      "fixHint": "Add an id field to blocks[2]. Run block.id.generate to auto-fill from heading."
    },
    {
      "ruleId": "BLOCK-ID-DUPLICATE",
      "severity": "error",
      "file": "src/content/pages/de/preise.md",
      "message": "Duplicate block id 'hero' at indices 0 and 3",
      "fixHint": "Rename one of the blocks to have a unique id within this page."
    }
  ],
  "nextSteps": [
    {
      "action": "Run block.id.generate --app warpgogol-com to auto-fill missing ids",
      "kind": "recommended"
    }
  ]
```

### Failure modes

- **Missing id** → `BLOCK-ID-MISSING` error. `block.id.generate` can auto-fix.
- **Duplicate id within page** → `BLOCK-ID-DUPLICATE` error. Manual fix required — generator will not overwrite existing ids.
- **Invalid id format** → `BLOCK-ID-INVALID` error. Ids must match `/^[a-z0-9]+(-[a-z0-9]+)*$/`. Manual fix required.
- **No content directory** → `passResult` (nothing to validate).
- **No blocks in file** → `passResult` (empty frontmatter is valid).
- **`block.id.generate` with `--dry-run`** → reports files that would be modified without writing.
- **`block.id.generate` encounters duplicate heading slugs** → appends `-2`, `-3` suffix to ensure uniqueness within the page.
- All return paths set `exitCode` explicitly, prefix `summary` with `[command.name]`, and include `nextSteps` on failure (DNA-82).

## Rollout

- **Fail-hard from introduction.** `block.id.validate` emits errors for missing ids. No grace period — the operator confirmed full migration with no legacy compatibility.
- **Migration path:**
  1. Run `block.id.generate --app <app>` to backfill missing ids in all existing content.
  2. Manually resolve any `BLOCK-ID-DUPLICATE` violations (rename blocks with duplicate ids).
  3. Run `block.id.validate --app <app>` to confirm zero violations.
  4. Remove `pages[].anchors` from `system.md` (superseded by direct block id references).
  5. Update `navigation.md` targets to reference block ids directly (remove `anchorId` indirection).
  6. Simplify `resolveSectionAnchor` to use block id directly as HTML id.
- **New apps** automatically comply: `onboarding.scaffold` generates `blocks[].id` for all scaffolded pages.
- **Pipeline integration:** `block.id.validate` runs in `SITES_CHECK_AUTHOR_PIPELINE` after `page.block.validate`.
- **RFC-0048 anchor registry removal:** `resolveAnchorFragment` and `resolveSectionAnchor` in `packages/werkstatt-site/src/domain/share/astro/routes/anchors.ts` are simplified. The `anchors` map in `system.md` is no longer read. Navigation `targets[].semanticTarget.anchor` is a block id, used directly as the HTML `id` attribute.

## Alternatives considered

1. **Keep RFC-0048 anchor registry, make block ids mandatory alongside it.** Rejected — the anchor registry becomes redundant when block ids are mandatory and language-neutral. Keeping it adds complexity without value. The operator confirmed: no legacy structures, full migration.

2. **Auto-generate ids at build time instead of requiring authored ids.** Rejected — build-time generation produces non-deterministic ids when headings change, breaking anchor links in previously shared URLs. Authored ids are stable and survive heading rewording.

3. **Use `block-type + index` as id format (e.g., `hero-0`, `markdown-1`).** Rejected — not human-readable, breaks when blocks are reordered, and doesn't serve as a meaningful anchor fragment in URLs.

4. **Make block ids mandatory only for pages with `semanticType` (semantic pages).** Rejected — the operator confirmed all content types should have mandatory block ids, not just semantic pages. This ensures consistent anchor link behavior across the entire site.

## Risks

- **Migration burden.** Existing content files without block ids must be migrated. Mitigation: `block.id.generate` automates the backfill. Operator runs it once per app.
- **Duplicate heading slugs.** Two blocks with the same heading produce the same slugified id. Mitigation: `block.id.generate` appends `-2`, `-3` suffixes for uniqueness. `block.id.validate` catches duplicates that arise from manual editing.
- **RFC-0048 anchor registry removal.** Navigation content and section components that reference `anchorId` through the registry must be updated. Mitigation: full migration with no legacy compatibility — all references are updated in one pass.
- **Agent misinterpretation.** Agents may create blocks without ids, assuming the fallback is still active. Mitigation: `block.id.validate` runs in the authoring pipeline and fails the build. The `block-N` fallback in `extractContentBlocks` is removed — missing ids cause a runtime error, not a silent fallback.
- **False positive rate.** Low — the validator checks for presence, uniqueness, and format. These are deterministic checks with no heuristic ambiguity.

## Acceptance criteria

- [ ] `block.id.validate` command is registered in `command-tables/04-content-quality.ts` with `scope: app` and detects missing, duplicate, and invalid block ids across all content types (pages, prose, business-profile, faq)
- [ ] `block.id.generate` command is registered in `command-tables/04-content-quality.ts` with `scope: app` and backfills missing ids using `slugify(heading)` with `-2`, `-3` suffix deduplication
- [ ] `block.id.validate` is integrated into `SITES_CHECK_AUTHOR_PIPELINE` after `page.block.validate`
- [ ] `extractContentBlocks` in `packages/werkstatt-shared/src/share/semantic/build-page.ts` removes the `block-${result.length}` fallback and requires `blocks[].id`
- [ ] RFC-0048 `anchors` registry in `system.md` is removed; `resolveAnchorFragment` and `resolveSectionAnchor` in `packages/werkstatt-site/src/domain/share/astro/routes/anchors.ts` use block id directly as HTML id
- [ ] `onboarding.scaffold` generates `blocks[].id` for all scaffolded pages
- [ ] Each command handler returns `KernelCommandResult` with `exitCode` explicitly set on every return path, `summary` prefixed with `[command.name]`, and `nextSteps` non-empty on failure (DNA-82)
- [ ] Unit tests cover: missing id detection, duplicate id detection, invalid format detection, generate backfill, generate deduplication, all content types, no-content pass, DNA-82 compliance
- [ ] Existing site content migrated: `block.id.generate` run on all apps, `block.id.validate` passes with zero violations
- [ ] `AGENTS.md` updated with block id requirement and migration instructions
- [ ] `docs/architecture-dna.md` DNA-24 entry updated to reference this RFC for mandatory `blocks[].id`
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST run `block.id.generate --app <app>` on all existing apps as the first implementation step to backfill missing ids before removing the `block-N` fallback.
- Agents MUST remove the `block-${result.length}` fallback in `extractContentBlocks` — missing ids must cause a hard error, not a silent positional fallback.
- Agents MUST update `resolveSectionAnchor` to return the block id directly as the HTML `id` attribute, without language-specific remapping through the RFC-0048 anchor registry.
- Agents MUST remove the `anchors` map from `system.md` content and from the `systemManifestSchema` (or its local view) — no legacy compatibility.
- Agents MUST update `onboarding.scaffold` to generate `blocks[].id` (slug from heading) for all scaffolded pages.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose --id RFC-0914 --reason "..." --invariant "DNA-N" instead of working around it (RFC-0334).
- This RFC is a prerequisite for RFC-0901 (cross-locale structural parity validation). RFC-0901 implementation should follow this RFC's implementation.
