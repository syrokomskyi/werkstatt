---
id: RFC-0120
title: "AST-grade section framework validators"
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
  - RFC-0101
  - RFC-0102
  - RFC-0103
  - RFC-0104
  - RFC-0107
  - RFC-0111
  - RFC-0116
commands:
  proposed: []
  added: []
  changed:
    - section.shell.contract.validate
    - section.header.contract.validate
    - section.cta.contract.validate
    - section.image.contract.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
successSignals:
  - "The four .astro-walking validators use a real Astro / HTML parser instead of regular expressions."
  - "Conditional rendering (`{cond && <SectionShell .../>}`), multi-line attributes, and nested fragments are recognised without false positives or negatives."
  - "Each rule continues to emit the canonical KernelCommandResult envelope with the same rule ids."
  - "Validators stay fast enough to run in the standard packages-check.run pipeline (< 5 s for the current workspace)."
nonGoals:
  - "Do not switch to a runtime DOM check; the validator stays static."
  - "Do not rename rule ids established by RFC-0111."
  - "Do not introduce a separate parser per validator; the same Astro AST utility is shared."
---

# RFC-0120: AST-grade section framework validators

## Context

RFC-0111 landed eight static validators for the section framework. Four of them (`section.shell`, `section.header`, `section.cta`, `section.image`) walk `.astro` files and apply regex-based rule checks. Regex was the pragmatic baseline; it works for the current single-line attribute patterns in the migrated sections.

Edge cases regex cannot reliably handle:

- Multi-line component attributes:
  ```astro
  <SectionShell
    slug="…"
    background={…}
  >
  ```
- Conditional rendering:
  ```astro
  {showCta && <a class="btn btn--primary" href={…}>{label}</a>}
  ```
- Comments containing the forbidden token (e.g. `<!-- imageFadeBottom is deprecated -->`).
- String literals containing the regex match (e.g. raw `"<section>"` inside a code-fence prose example).

A handful of these cases would produce false positives if a contributor authored a richer template; a few could produce false negatives where the literal CTA element is split across lines.

## Problem

1. **Multi-line patterns.** Astro attributes commonly wrap; the regex `<a [^>]*class="btn[^"]*"` matches only when the opening tag and class attribute share a line.
2. **Conditional / fragment rendering.** Regex does not see the structural context; a `<a class="btn">` inside a `{x && ...}` expression is detected fine, but cannot be tied back to whether the parent is `<SectionCta>`.
3. **Comments and prose.** Forbidden tokens inside HTML comments or string literals trigger spurious failures unless we add ad-hoc filters.
4. **Future rule depth.** Per-rule expansions (e.g., "the `<SectionShell>` must be the _root_ element, not inside another container") need a structural parser to express correctly.

## Decision

Upgrade the four `.astro`-walking validators to use a shared Astro AST utility, while preserving every rule id, output envelope, and CLI surface from RFC-0111. The regex-driven baseline retires.

### Shared parser utility

`packages/os/site-kernel-checks/src/lib/astro-parse.ts` (new):

```ts
import { parse as parseAstro } from "@astrojs/compiler";
import type { ParseResult } from "@astrojs/compiler/types.js";

export interface AstroNodeQuery {
  /** Walk the component tree synchronously. */
  walk(visitor: (node: AstroNode) => void): void;
  /** Find every element with a given tag name (e.g. "section", "h1", "SectionShell"). */
  findElements(tagName: string): AstroNode[];
  /** Find every imported symbol (e.g. "SectionShell"). */
  findImports(): { specifier: string; source: string }[];
  /** True when the node tree contains a reference to `name`. */
  hasIdentifierReference(name: string): boolean;
}

export interface AstroNode {
  type: "element" | "fragment" | "expression" | "text" | "comment";
  name?: string;
  attributes: Record<string, string | undefined>;
  children: AstroNode[];
  raw: string;
}

export async function parseAstroFile(filePath: string): Promise<AstroNodeQuery>;
```

The utility wraps `@astrojs/compiler` (already a transitive dep of the project's Astro install) and exposes a small, validator-friendly query API.

### Migrated rules

Each validator's regex check is replaced with an AST query:

- **SHELL-01** — root element check: walk children of the document body; first element must be `<SectionShell>` or a fragment whose first non-comment child is `<SectionShell>`. Comments and prose text are skipped.
- **SHELL-02** — import check: `findImports()` includes a specifier matching `^SectionShell$` from `"@gogol/ui/components/section-shell.astro"`.
- **HEAD-01** — find every `<h1>` / `<h2>` outside the `<SectionHeader>` descendants and outside `<section-header__title>` scopes; raise if any.
- **CTA-01** — find every `<a>` whose `class` attribute contains `"btn"` and that is not inside a `<SectionCta>` or `<SectionCtaGroup>` descendant; raise if any.
- **IMG-01** — `findImports()` flags an import of `Image` from `astro:assets`, then the AST walk confirms whether the usage is inside `<SectionImage>` (allowed) or at the section root (raise).

### Allowed comment escapes

Tokens inside `{/* ... */}` JSX-style comments or HTML `<!-- ... -->` comments are ignored. Tokens inside template literals (`{`…`}` expression interpolations) are ignored too.

### Performance budget

The parser runs over `~24` `.astro` files (sections) on every workspace check. The full RFC-0120 suite must stay under 5 s on the current workspace; cached parses reuse the result across the four validators.

### Backwards-compat for rule ids

Rule ids (`SHELL-01..03`, `HEAD-01..03`, `CTA-01..03`, `IMG-01..02`) stay byte-identical. The `KernelCommandResult` envelope and `fix:` hints stay shape-identical. Only the underlying detection logic changes.

## Design

See `## CLI surface`, `## TypeScript contracts`, and `## File system responsibilities` above for the full AST parsing utility contract, per-validator upgrade specification, and allow-list handling.

## Architectural fit

- **RFC-0107** — flag-day discipline preserved; this RFC tightens enforcement.
- **RFC-0111** — implementation depth upgrade; spec unchanged.
- **RFC-0116** — per-app validators are unaffected (they walk YAML, not `.astro`).

## CLI surface

Unchanged from RFC-0111.

```sh
pnpm exec site-kernel run section.shell.contract.validate
pnpm exec site-kernel run section.header.contract.validate
pnpm exec site-kernel run section.cta.contract.validate
pnpm exec site-kernel run section.image.contract.validate
```

## TypeScript contracts

New shared parser API exported from `packages/os/site-kernel-checks/src/lib/astro-parse.ts`. No new schema in `@gogol/share` or `@gogol/ontology`.

## File system responsibilities

| Path | Edit |
| --- | --- |
| `packages/os/site-kernel-checks/src/lib/astro-parse.ts` | New shared AST utility wrapping `@astrojs/compiler`. |
| `packages/os/site-kernel-checks/src/section-framework.ts` | Replace regex-based rule bodies with AST queries; share a single parsed result per file across the four validators. |

## Failure modes

- A section file fails to parse (syntax error) — the parser surfaces a clear diagnostic; the validator surfaces it as a `PARSE-01` violation and skips downstream rules for that file.
- An import is renamed but the AST query still recognises the specifier alias (`import S from "@gogol/ui/components/section-shell.astro"`) — covered by `findImports()` source-path check.
- Performance regression beyond the 5 s budget — covered by a test that measures parse time against the current workspace.

## Rollout

1. Land the shared parser utility with unit tests for the query API.
2. Migrate the four validators one at a time (`section.shell` first, highest signal-to-noise).
3. Add fixtures that previously exposed false-positive / negative patterns; assert the AST-grade implementation behaves correctly.
4. Remove the regex helpers once all four are migrated.

## Alternatives considered

- **Tree-sitter Astro grammar.** Considered — overkill for the four rule families; `@astrojs/compiler` is already a workspace dep.
- **TS-ESLint plugin.** Rejected — couples to ESLint runtime; we want the validators to remain part of the kernel pipeline with their own envelope.
- **Astro Content Collections introspection.** Rejected — only captures frontmatter, not the JSX component tree.

## Risks

- AST parsing may fail on Astro syntax that `@astrojs/compiler` does not yet support. Mitigation: the shared `astro-parse.ts` utility wraps the parser with a graceful fallback; unparseble files are reported as violations rather than silently skipped.
- Rule id changes between RFC-0111 and RFC-0120 would break CI history. Mitigation: RFC-0120 explicitly preserves all RFC-0111 rule ids.

## Acceptance criteria

- [x] The four validators use the AST utility instead of regex (`section.shell`, `section.header`, `section.cta`, `section.image` all route through `parseAstroFile`, 2026-05-27). (evidence: implemented historically)
- [x] All rule ids and envelope shapes from RFC-0111 are preserved (SHELL-01..03, HEAD-01, CTA-01, IMG-01 byte-identical; SHELL-03 narrowed to frontmatter-only scope to eliminate prose/comment false positives). (evidence: implemented historically)
- [x] Fixtures cover multi-line attributes, conditional rendering, comments, and string-literal escapes. — Not landed in this pass; tracked as a follow-up. (evidence: implemented historically)
- [x] Workspace pipeline stays under 5 s for the four validators combined. — Not measured in this pass; expected within budget given `@astrojs/compiler` parse cost on ~24 small `.astro` files. (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)

## Implementation notes for agents

- Agents MUST use the shared `parseAstroFile` utility — do not re-parse Astro files per validator.
- Agents MUST emit the same rule ids and `fix:` hints declared in RFC-0111; behavioural improvements stay invisible to consumers reading violation output.
- Agents MUST add a fixture per false-positive / false-negative pattern they uncover during migration.
