---
id: RFC-0527
title: "Content reference index — unified indexing and resolution contour"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-25
updatedAt: 2026-07-25
enhancedAt: 2026-07-25
implementedAt: 2026-07-25
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0045
amendedBy: []
related:
  - RFC-0045
  - RFC-0226
  - RFC-0220
satisfies:
  - DNA-4
  - DNA-22
versionBump: minor
commands:
  proposed:
    - content.ref-index.generate
  added:
    - content.ref-index.generate
  changed:
    - content.references.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/share"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-content"
successSignals:
  - "A single content reference index is built once at the start of build-prepare and consumed by all downstream generators, validators, and Astro components."
  - "Any YAML or Markdown file under src/content/ can reference any field of any other content file using braceless collection.file.field syntax, resolved through the index."
  - "Missing references are caught at build-time with clear diagnostics identifying the source file, the unresolved reference, and the closest matching entry in the index."
nonGoals:
  - "Does not migrate existing brace-delimited references — that is RFC-0529."
  - "Does not embed metadata into media files — that is RFC-0528."
  - "Does not index markdown body content — only frontmatter fields and YAML object keys are indexed."
  - "Does not support references to files outside src/content/."
---

# RFC-0527: Content reference index — unified indexing and resolution contour

## Context

RFC-0045 introduced content data references with `{collection.file.field}` syntax, resolved through `astro:content`'s `getEntry` API. The resolution is scattered across multiple independent implementations:

- `@gogol/share/content-reference.ts` — Astro-based resolver for prose markdown body
- `@gogol/site-kernel-content/content-reference.ts` — filesystem-based resolver for semantic-loader
- `@gogol/share/content/substitute-references-in-string.ts` — regex match/replace for `{...}` tokens
- `@gogol/share/content/substitute-deep.ts` — recursive object walker (framework-agnostic)

Each consumer wires its own resolution path. There is no shared index, no unified validation, and no way for kernel-context commands (which lack `astro:content`) to resolve references without reimplementing filesystem reads.

## Problem

The current architecture has three structural deficiencies:

1. **No shared index.** Every consumer reads content files independently. `semantic-loader.ts` reads `business/legal.md` to resolve `{business.legal.companyName}`; `material.metadata.write` would need to do the same; `prose-pipeline.ts` goes through `astro:content`. Three paths, three cache strategies, three failure modes.

2. **Astro dependency.** `@gogol/share/content-reference.ts` imports `getEntry` from `astro:content`, making it unusable in kernel command context (build-prepare pipeline, `material.metadata.write`). The filesystem-based variant in `site-kernel-content` duplicates the logic with a different API surface.

3. **Brace syntax friction.** The `{collection.file.field}` syntax requires YAML string quoting (`name: "{people.andrii.name}"`), which is noisy and hard to read in sidecar files like `.credits.yaml`.

## Decision

### 1. Content reference index

A single build-time index of all content fields, built once at the start of `build-prepare` and consumed by all downstream generators, validators, and Astro components.

**Coverage:** All `.md` and `.yaml` files under `src/content/`. For `.md` files, the frontmatter object is indexed (body markdown is NOT indexed — it is not addressable by field path). For `.yaml` files, the full YAML object is indexed.

**Index key:** `entries[collection][file][lang]` — three-level nesting matching the RFC-0045 reference syntax without the field path. The value is the resolved frontmatter/YAML object. Field path traversal happens at lookup time via the existing `resolveFieldPath` primitive.

**Language handling:** Each entry is keyed by language: `entries[collection][file][lang] = { ...fields }`. Language is inferred from the file path (directory-based: `pages/de/index.md` → `de`; suffix-based: `impressum.de.md` → `de`). Language-agnostic files (under `assets/`, `media/`) are stored under a `_default` key.

**Artefact:** `src/content-ref-index.generated.yaml` — written to disk for transparency and debuggability. Marked with `GENERATED` marker. Gitignored (derived artefact).

### 2. Braceless reference syntax

References are written without curly braces:

```yaml
# Before (RFC-0045, brace syntax)
name: "{people.andrii-syrokomskyi.name}"
copyrightNotice: "© 2026 {business.legal.companyName}"

# After (RFC-0527, braceless syntax)
name: people.andrii-syrokomskyi.name
copyrightNotice: "© 2026 business.legal.companyName"
```

**Resolution algorithm:**

1. For pure-string fields (entire value is a reference): if the string matches `^[a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+$` AND the collection exists in the index AND the file exists in the collection — replace with the resolved value.
2. For mixed strings (reference embedded in text): scan for `collection.file.field` patterns using regex `[a-z][a-z-]*\.[a-z0-9-/]+\.[a-zA-Z0-9_.-]+`, validate each match against the index, and replace matches with resolved values. Non-matching text is preserved.
3. If a pattern matches the regex but the collection or file is not in the index — it is NOT a reference (literal string). This prevents false positives on strings that happen to contain dots.

**False-positive mitigation:** The set of valid collections is a closed set derived from the index (`business`, `people`, `pages`, `prose`, `faq`, `surface`, etc.). A string like `example.com.pages.index.title` would only match if `example.com` is a registered collection — which it is not. The resolver checks collection existence before treating a pattern as a reference.

### 3. Index builder command

`content.ref-index.generate` — scans `src/content/`, parses all `.md` frontmatter and `.yaml` files, builds the index, writes `src/content-ref-index.generated.yaml`.

```sh
pnpm exec site-kernel run content.ref-index.generate --site <app-id> [--json]
```

- **Idempotent:** re-running produces identical output.
- **Single owner:** of `src/content-ref-index.generated.yaml` (generator ownership map).
- **Pipeline position:** immediately after `yaml.parse.validate` (line 20 in `build-prepare`), before `kernel.wire` and all other generators. The index must be available to ALL downstream consumers including `overlay.pages.generate`, `routes.generate`, `agent.knowledge.generate`, and `material.credits.generate`.
- **`--json` output:** `{ "command": "content.ref-index.generate", "filesScanned": <n>, "entries": <n>, "outputPath": "src/content-ref-index.generated.yaml" }`.
- **Empty state:** an app with no content produces an empty index (`entries: {}`, `collections: []`). This is valid — all references will be unresolved (REF-01), which is correct behavior for a new app with no content.
- **Performance:** scans all `.md` and `.yaml` under `src/content/` — file count and parse cost are linear in content size. For sites with large content corpora (1000+ files), the scan takes <1s. The index YAML artefact is typically 50–500 KB.
- **Concurrency:** two builds running simultaneously could conflict on writing `src/content-ref-index.generated.yaml`. This is mitigated by the single-builder invariant — only `build-prepare` writes the index, and `build-prepare` is not run concurrently for the same site.

### 4. Updated reference validator

The existing `content.references.validate` command (RFC-0073) is updated to validate braceless references against the index. No new validator command is introduced — `content.references.validate` already runs in `sites-check-author` and is the canonical reference validator.

```sh
pnpm exec site-kernel run content.references.validate --site <app-id> [--json]
```

- **Author-time validation:** runs in `sites-check-author` pipeline (existing position, line 263).
- **Diagnostics:** `REF-01` (unresolved reference: collection not found — error), `REF-02` (unresolved reference: file not found in collection — error), `REF-03` (unresolved reference: field not found in file — error), `REF-04` (ambiguous: pattern matches but could be literal — warning only, exit 0). REF-01..03 cause exit 1; REF-04 is advisory.
- **`--json` output:** `{ "command": "content.references.validate", "violations": [{ "code": "REF-01", "file": "<path>", "line": <n>, "ref": "<ref>", "message": "<msg>" }], "warnings": [...] }`.
- **RFC-0529** further updates this command to add `REF-05` (residual brace tokens from incomplete migration).

### 5. Unified resolver API

A new framework-agnostic resolver in `@gogol/share/content-reference` (replacing the Astro-dependent one):

```typescript
export interface ContentRefIndex {
  version: 1;
  generatedAt: string;
  entries: Record<string, Record<string, Record<string, unknown>>>;
  // entries[collection][file][lang] = { ...fields }
  collections: string[];
}

export function loadContentRefIndex(indexPath: string): ContentRefIndex | null;

export function resolveReference(
  index: ContentRefIndex,
  ref: string,
  lang: string,
  defaultLang: string,
): { value: unknown; resolved: boolean; error?: string };

export function resolveReferencesInString(
  index: ContentRefIndex,
  text: string,
  lang: string,
  defaultLang: string,
): string;

export function resolveReferencesDeep(
  index: ContentRefIndex,
  data: unknown,
  lang: string,
  defaultLang: string,
): Promise<unknown>;
```

**Parsing algorithm for `resolveReference`:** The `ref` string is split into collection, file, and field path using the regex `^([a-z][a-z-]*)\.([a-z0-9-/]+)\.(.+)$`. The first capture group is the collection name, the second is the file identifier (may contain hyphens and slashes but not dots), and the third is the dotted field path traversed via `resolveFieldPath`. This matches the existing `parseContentReference` logic minus brace delimiters.

**Sync vs async:** `resolveReference` and `resolveReferencesInString` are sync (index is in memory). `resolveReferencesDeep` is async — it delegates to the existing `substituteRefsDeep` walker, which has an async `substituteString` callback (`(value: string) => Promise<string>`). The walker contract is preserved; only the resolver function changes (from Astro-based to index-based).

## Architectural fit

- **RFC-0045 (content references).** This RFC amends RFC-0045 by replacing the scattered resolution implementations with a single index-based contour. The braceless syntax is a new convention; migration of existing brace-delimited references is handled by RFC-0529.
- **RFC-0226 (embedded content credentials).** `material.metadata.write` becomes a consumer of the index — it resolves references in `.credits.yaml` sidecars through the same unified resolver, without needing `astro:content` or filesystem reads.
- **RFC-0220 (material credits).** `.credits.yaml` sidecars can now reference PBP entity fields (people names, legal names, URLs) without duplicating data.
- **Layer C (external surfaces).** No impact — the index is a build-time artefact, never exposed in URLs, JSON-LD, or sitemaps. No `Breaks-C: yes` required.
- **No backward compatibility.** Per platform policy (RFC-0478), layers A and B develop without backward compatibility. The old brace syntax and Astro-based resolver are removed in RFC-0529.

## Design

### Index structure

```yaml
# src/content-ref-index.generated.yaml
version: 1
generatedAt: "2026-07-25T..."
collections:
  - business
  - people
  - pages
  - prose
  - faq
  - surface
entries:
  business:
    legal:
      de:
        companyName: "WGogol Studio GmbH"
        owner:
          fullName: "Andrii Syrokomskyi"
      # ... other languages
    company:
      de:
        brand:
          name: "WGogol"
        description: "..."
  people:
    andrii-syrokomskyi:
      de:
        name: "Andrii Syrokomskyi"
        url: "https://example.com"
        affiliations:
          - founder
  pages:
    index:
      de:
        title: "Startseite"
        blocks: [...]
```

### Collection inference

Collection names are derived from the directory structure under `src/content/`:

| Path | Collection | File | Language |
| --- | --- | --- | --- |
| `src/content/business/de/legal.md` | `business` | `legal` | `de` |
| `src/content/people/de/andrii-syrokomskyi.md` | `people` | `andrii-syrokomskyi` | `de` |
| `src/content/pages/de/index.md` | `pages` | `index` | `de` |
| `src/content/pages/de/assets/promo.credits.yaml` | `pages` | `assets/promo` | `de` |
| `src/content/prose/de/impressum.md` | `prose` | `impressum` | `de` |
| `src/content/faq/de/faq-entry.md` | `faq` | `faq-entry` | `de` |
| `src/content/system.md` | `system` | `system` | `_default` |

### Resolution flow

```
1. content.ref-index.generate (build-prepare, first)
   ├── scan src/content/**/*.md + *.yaml
   ├── parse frontmatter / YAML
   ├── build index object
   └── write src/content-ref-index.generated.yaml

2. All downstream consumers load the index once:
   ├── material.credits.generate
   ├── material.metadata.write (RFC-0528)
   ├── semantic-loader (Astro + kernel)
   ├── prose-pipeline.ts
   ├── section-rich.astro
   └── content.references.validate (updated)

3. resolveReferencesDeep(index, data, lang, defaultLang)
   ├── walk object tree (existing substituteRefsDeep)
   ├── for each string: find collection.file.field patterns
   ├── validate against index
   └── replace with resolved values
```

## Rollout

1. **Implement `content.ref-index.generate`** in `@gogol/site-kernel-codegen` — scans content, builds index, writes artefact.
2. **Update `content.references.validate`** in `@gogol/site-kernel-checks` — validate braceless references against the index (REF-01..04).
3. **Implement unified resolver** in `@gogol/share/content-reference` — `loadContentRefIndex`, `resolveReference`, `resolveReferencesInString`, `resolveReferencesDeep`.
4. **Register `content.ref-index.generate`** in `build-prepare` pipeline, immediately after `yaml.parse.validate`, before `kernel.wire`.
5. **Update `content.references.validate`** in `sites-check-author` pipeline (existing position, no new registration).
6. **Update `packages/share/AGENTS.md`** and `packages/os/site-kernel-content/AGENTS.md` to document the new resolver API and removal of Astro dependency.
7. **Update Compass files:** `docs/source-markup.xml` (source-file contracts for `@gogol/share/content-reference`), `docs/technology.xml` (shared package contracts).
8. **RFC-0529** migrates all existing consumers and brace-delimited references.

## Alternatives considered

- **Keep brace syntax, build index only.** Rejected — braces force YAML string quoting, making sidecar files noisy and hard to read. The index makes braceless resolution safe (index-validated), removing the need for braces as disambiguation.

- **Lazy field indexing (only index referenced fields).** Rejected — adds complexity (two-pass scan) for marginal size savings. Full indexing is simpler, and the index artefact size is manageable for the content volumes in this ecosystem.

- **Keep Astro-based resolver alongside index-based.** Rejected — two resolvers with different APIs and capabilities is the current problem. The index-based resolver subsumes the Astro-based one and works in both contexts.

- **Store index in memory only (no artefact).** Rejected — a written artefact enables debugging, transparency, and cross-tool inspection. The `GENERATED` marker and gitignore keep it from polluting the repository.

## Risks

- **Index staleness.** If content files change after `content.ref-index.generate` runs but before a consumer reads the index, references may resolve to stale values. Mitigated by pipeline ordering — index generation is the first command, all mutations happen after.
- **False positives in mixed strings.** A string like `"Visit pages.index.title for help"` would resolve `pages.index.title` if it exists in the index. Mitigated by `REF-04` warning diagnostic and the expectation that such strings are rare in content files. Operators can suppress specific patterns if needed.
- **Index size.** For sites with large content corpora, the index YAML may be several hundred KB. Acceptable — it is a build-time artefact, never shipped to the client.
- **Agent misinterpretation.** Agents authoring content may mistake any dotted string matching `collection.file.field` as a reference. Mitigated by the closed-set collection check — only known collections trigger resolution. Agents should be aware that strings like `config.debug.enabled` will NOT resolve unless `config` is a registered collection.

## Acceptance criteria

- [x] `content.ref-index.generate` scans all `.md` and `.yaml` files under `src/content/` and writes `src/content-ref-index.generated.yaml` (evidence: packages/os/site-kernel-codegen/src/content-ref-index-generate.ts)
- [x] Index contains frontmatter of all `.md` files and full content of all `.yaml` files (evidence: content-ref-index-generate.ts scans .md frontmatter via parseMarkdownFrontmatter and .yaml via yamlParse)
- [x] Index does NOT contain markdown body content (evidence: content-ref-index-generate.ts only indexes frontmatter for .md, not body)
- [x] `content.references.validate` detects unresolved braceless references with `REF-01` through `REF-04` diagnostics (evidence: packages/os/site-kernel-checks/src/content-references.ts)
- [x] `resolveReference` resolves a braceless `collection.file.field` reference against the index (evidence: packages/share/src/content-reference.ts — resolveReference function)
- [x] `resolveReferencesInString` resolves references embedded in mixed strings (evidence: packages/share/src/content-reference.ts — resolveReferencesInString function)
- [x] `resolveReferencesDeep` walks object trees and resolves all string values (evidence: packages/share/src/content-reference.ts — resolveReferencesDeep function)
- [x] Resolver works without `astro:content` (kernel context compatible) (evidence: packages/share/src/content-reference.ts has no astro:content import)
- [x] `content.ref-index.generate` is registered in `build-prepare` immediately after `yaml.parse.validate` (evidence: packages/os/site-kernel-checks/src/pipelines/build-prepare.ts line 23)
- [x] `content.references.validate` is updated in `sites-check-author` (existing position) (evidence: packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts)
- [x] `rfc.validate` passes on this RFC file (evidence: rfc.validate reports zero RFC-0527-specific errors after manifest regeneration)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- The index builder MUST be idempotent — re-running with unchanged content produces identical output.
- The index artefact MUST carry the `GENERATED` marker and be gitignored.
- The resolver MUST NOT import `astro:content` — it is framework-agnostic.
- The existing `substituteRefsDeep` walker in `@gogol/share/content/substitute-deep.ts` is preserved — only the resolver function changes.
- The existing `resolveFieldPath` in `@gogol/share/content/resolve-field-path.ts` is preserved — it is the field traversal primitive used by the new resolver.
- Do not migrate existing brace-delimited references in this RFC — that is RFC-0529.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
