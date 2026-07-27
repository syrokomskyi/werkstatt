---
id: RFC-0045
title: "Enable content data references in markdown files"
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
amends: []
amendedBy:
  - RFC-0187
  - RFC-0527
  - RFC-0529
related:
  # Reference DNA invariants, anti-patterns, spec docs, or other RFCs:
  - DNA-20
  - RFC-0024
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/ui"
  - "@gogol/business"
successSignals: []
nonGoals: []
---

# RFC-0045: Enable content data references in markdown files

## Context

The `@gogol/business` package (DNA-20, RFC-0024) provides canonical schemas for business data including `legal`, `contact`, `location`, `web`, and `compliance`. These files exist in `src/content/business/{lang}/` with structured frontmatter.

However, prose content files (e.g., `src/content/components/prose/impressum.de.md`, `datenschutz.de.md`) currently duplicate this data manually:

- Company name, address, and representative from `legal.md`
- Email from `contact.md`
- Location data from `location.md`

This creates maintenance burden and synchronization risk. When business data changes, prose files must be manually updated, leading to potential inconsistencies.

## Problem

No mechanism exists to reference data from other markdown files within the content layer. Prose files are rendered as static markdown without access to:

- Business collection data (`src/content/business/**`)
- Other prose files
- Section or component frontmatter

Current workarounds require code changes (e.g., using `@gogol/business/loaders` in components), which violates the client-editable surface contract (DNA-22). Client editors should be able to reuse content data by editing markdown files only, without touching TypeScript code.

## Decision

Markdown files in the content layer support a data reference syntax `{path.to.data}` that resolves to frontmatter values from other content files. References are resolved at build time by a content preprocessor that runs before markdown rendering.

Reference format: `{collection.file.field}` where:

- `collection`: content collection name (business, pages, sections, components, etc.)
- `file`: filename without extension
- `field`: dot-notation path to frontmatter value

Language is automatically inferred from the referencing file's path (e.g., a reference in `src/content/components/prose/impressum.de.md` resolves to `src/content/business/de/legal.md`).

Examples:

- `{business.legal.companyName}` → "Nicaragua-Projekt e.V." (when referenced from a German file)
- `{business.contact.email}` → "Nicaragua-Projekt@gmx.org"
- `{business.location.city.name}` → "Bremerhaven"

Invalid references (missing files, missing fields) cause build-time errors with clear error messages.

## Architectural fit

- **Architecture DNA (DNA-20)**: Extends the business layer by enabling data reuse without code changes, strengthening the canonical source-of-truth principle.
- **Client-editable surface (DNA-22)**: Enables content editors to reference business data from prose files without touching TypeScript code, preserving the client-editable boundary.
- **Content collections (RFC-0024)**: Works with existing Astro content collection infrastructure; references resolve against registered collections.
- **Build-time resolution**: References are resolved during Astro build, maintaining static site guarantees with no runtime overhead.

## Design

### CLI surface

No new CLI commands. This is a build-time content preprocessing feature integrated into Astro's markdown rendering pipeline.

### TypeScript contracts

```ts
interface ContentReference {
  collection: string;  // e.g., "business"
  file: string;       // e.g., "legal"
  fieldPath: string[]; // e.g., ["companyName"] or ["owner", "fullName"]
  inferredLang: string; // Automatically inferred from referencing file path
}

interface ReferenceResolutionError {
  reference: string;  // Original reference like "{business.legal.companyName}"
  reason: "missing_collection" | "missing_file" | "missing_field" | "invalid_syntax";
  details: string;
  resolvedPath?: string; // The resolved path including inferred language, e.g., "business/de/legal"
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/content/**/*.md` | Scanned for `{...}` reference patterns in body and frontmatter |
| `src/content/business/{lang}/*.md` | Source of business data for references |
| `packages/ui/src/sections/markdown/markdown-section.astro` | Enhanced with reference resolution logic |
| `packages/business/src/schemas/*.ts` | Used for type validation of resolved values |

### Output format

Build-time errors are reported in Astro's build output with file paths and line numbers. Example:

```
Error: Invalid content reference in src/content/components/prose/impressum.de.md:5
  Reference: {business.legal.nonexistent}
  Reason: missing_field
  Field "nonexistent" not found in business/de/legal.md frontmatter
  Resolved path: business/de/legal
```

### Failure modes

- **Missing collection**: Build fails with clear error message indicating which collection is not registered
- **Missing file**: Build fails with error indicating which file could not be found
- **Missing field**: Build fails with error showing the field path that does not exist
- **Circular references**: Build fails with error detecting circular reference chains
- **Invalid syntax**: Build fails with error showing malformed reference pattern

## Rollout

- **Phase 1 (Validation)**: Add reference validation to build pipeline. Invalid references cause build errors with clear messages. No substitution yet.
- **Phase 2 (Substitution)**: Enable actual value substitution in markdown rendering. Existing prose files can be migrated incrementally.
- **Phase 3 (Cleanup)**: Remove duplicated data from prose files after migration is complete.

No flag day required. Existing prose files continue to work with hardcoded values. New references can be added incrementally. New apps can use references from day one.

## Alternatives considered

1. **Use `@gogol/business/loaders` in components**: Requires TypeScript code changes, violating client-editable surface contract (DNA-22). Rejected because content editors should not need to edit code.

2. **YAML anchors/aliases across files**: Not supported by Astro's frontmatter parsing. Would require custom YAML loader. Rejected due to complexity and lack of native support.

3. **Runtime data fetching**: Would break static site guarantees and add runtime overhead. Rejected to maintain performance and static generation.

4. **Build-time script to generate prose files**: Would create generated files that are hard to maintain and edit. Rejected to keep prose files directly editable.

## Risks

- **Performance impact**: Reference resolution adds build-time overhead. Mitigation: cache resolved values per file, parallel resolution where possible.
- **Circular references**: Could cause infinite loops. Mitigation: detect and error on circular reference chains during validation.
- **Complexity**: Reference syntax adds cognitive load for content editors. Mitigation: clear error messages, documentation, and examples.
- **Breaking changes**: If business schema changes, references may break. Mitigation: build-time errors with clear migration guidance.

## Acceptance criteria

- [x] Reference syntax `{collection.file.field}` implemented in markdown preprocessor (evidence: implemented historically)
- [x] Build-time validation detects missing collections, files, and fields (evidence: implemented historically)
- [x] Circular reference detection implemented (evidence: implemented historically)
- [x] Error messages include file path, line number, and resolution guidance (evidence: implemented historically)
- [x] Integration with `packages/ui/src/sections/markdown/markdown-section.astro` (evidence: packages/ directory, package exists)
- [x] Migration guide for existing prose files documented (evidence: implemented historically)
- [x] Examples in `apps/nicaragua-projekt/src/content/components/prose/` updated to use references (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `AGENTS.md` updated with reference syntax rules for agents (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

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
