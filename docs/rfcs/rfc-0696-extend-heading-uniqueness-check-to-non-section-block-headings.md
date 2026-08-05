---
id: RFC-0696
title: "Extend heading uniqueness check to non-section block headings"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
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
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0690
amendedBy: []
related:
  - RFC-0494
  - RFC-0496
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - surface.heading-uniqueness.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "surface.heading-uniqueness.validate detects duplicate heading text in non-section blocks (div, article, aside)"
  - "No false positives from pages with intentionally repeated non-section headings (e.g. card titles in a grid)"
  - "Existing section-based detection continues to work unchanged"
nonGoals:
  - "Does not check all headings on the page — only headings inside block-level elements that could become landmarks"
  - "Does not check heading hierarchy (h1-h6 order)"
  - "Does not modify bake functions or section-shell.astro"
  - "Does not replace the Axiom landmark-unique check"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0696: Extend heading uniqueness check to non-section block headings

## Context

RFC-0690 implemented `surface.heading-uniqueness.validate` to detect duplicate section heading text on surface pages. The validator scans rendered HTML, finds all `<section>` elements, extracts the first `<h2>` or `<h3>` descendant from each, and reports HEADING-UNIQ-01 when the same normalized heading text appears more than once on the same page.

The `section-shell.astro` component in `packages/ui` always renders a `<section>` wrapper, so all bake function blocks are currently covered. However, surface pages may also contain non-section block-level elements (`<div>`, `<article>`, `<aside>`) with heading text that could become landmarks if an `aria-labelledby` attribute is present. These blocks are not checked by the current validator.

During the RFC-0690 implementation audit (2026-08-05), no non-section block with duplicate headings was found on warpgogol-com surface pages. However, the gap is structural — if a future bake function or content author creates a block outside `section-shell.astro` with a duplicate heading, it would not be caught until the Axiom gate.

## Problem

The heading uniqueness validator only checks `<section>` elements. Non-section block-level elements with `aria-labelledby` and duplicate heading text are not caught at build time. This creates a gap where:

1. A bake function could create a block using a raw `<div>` wrapper (not `section-shell.astro`) with a duplicate heading, bypassing the build-time check.
2. Content authors could add custom HTML blocks with duplicate headings outside `<section>` elements.
3. The Axiom `landmark-unique` check catches these at the end of the pipeline (10+ minutes), but the build-time check does not.

## Decision

The `surface.heading-uniqueness.validate` command extends its scan to include non-section block-level elements that have an `aria-labelledby` attribute. For each such element, the validator extracts the first `<h2>` or `<h3>` descendant and includes it in the heading count. This aligns with the axe `landmark-unique` rule, which checks elements with `aria-labelledby` as potential landmarks.

## Architectural fit

- **RFC-0690 (amended):** This RFC extends the scan scope of the validator introduced by RFC-0690. The HEADING-UNIQ-01 diagnostic, severity, and output format are unchanged.
- **RFC-0494 / RFC-0496 (surface baking):** Bake functions use `section-shell.astro` which renders `<section>`. This RFC is a safety net for blocks that bypass the shell.
- **axe landmark-unique:** This RFC brings the build-time check closer to parity with the Axiom gate's landmark-unique check.

## Design

### CLI surface

No new CLI commands. The existing `surface.heading-uniqueness.validate` extends its scan:

```sh
pnpm exec site-kernel run surface.heading-uniqueness.validate --app warpgogol-com
```

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/surface-heading-uniqueness.ts

const BLOCK_TAGS = new Set(["section", "div", "article", "aside"]);

function findBlockElementsWithAriaLabelledby(
  node: TreeParentNode,
  results: TreeElementNode[] = [],
): TreeElementNode[] {
  const children = node.childNodes;
  if (!children) return results;
  for (const child of children) {
    if (isElementNode(child) && BLOCK_TAGS.has(child.tagName)) {
      const attrs = child.attrs ?? [];
      const hasAriaLabelledby = attrs.some(
        (a) => a.name === "aria-labelledby",
      );
      if (hasAriaLabelledby || child.tagName === "section") {
        results.push(child);
      }
    }
    if (hasChildNodes(child)) {
      findBlockElementsWithAriaLabelledby(child, results);
    }
  }
  return results;
}

// Heading extraction must skip child block elements to prevent
// double-counting the same heading element. See "Nested block
// double-counting" in Failure modes.
function findFirstHeadingSkippingChildBlocks(
  node: TreeParentNode,
  tagNames: Set<string>,
): TreeElementNode | null {
  const children = node.childNodes;
  if (!children) return null;
  for (const child of children) {
    if (isElementNode(child) && tagNames.has(child.tagName)) {
      return child;
    }
    // Skip child block elements (section, div, article, aside with
    // aria-labelledby) — their headings are counted separately.
    if (isElementNode(child) && BLOCK_TAGS.has(child.tagName)) {
      const attrs = child.attrs ?? [];
      const hasAriaLabelledby = attrs.some(
        (a) => a.name === "aria-labelledby",
      );
      if (hasAriaLabelledby || child.tagName === "section") {
        continue;
      }
    }
    if (hasChildNodes(child)) {
      const found = findFirstHeadingSkippingChildBlocks(child, tagNames);
      if (found) return found;
    }
  }
  return null;
}
```

The existing `findAllSections` function is replaced by `findBlockElementsWithAriaLabelledby`, which includes:

- All `<section>` elements (always checked, regardless of `aria-labelledby`)
- `<div>`, `<article>`, `<aside>` elements with `aria-labelledby` attribute

The exported `extractSectionHeadings` function is renamed to `extractBlockHeadings` to reflect the broader scan scope. The test file imports `extractSectionHeadings` by name — the import must be updated to `extractBlockHeadings`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/surface-heading-uniqueness.ts` | Modified: extend scan to non-section blocks with `aria-labelledby`; rename `extractSectionHeadings` → `extractBlockHeadings`; replace `findAllSections` with `findBlockElementsWithAriaLabelledby`; add `findFirstHeadingSkippingChildBlocks` to prevent nested block double-counting; update `MODULE_CONTRACT` non-goal from "Do not check non-section headings" to "Do not check headings outside block-level elements with `aria-labelledby`"; update diagnostic message from "section heading" to "block heading"; update `fixHint` to be context-neutral |
| `packages/os/site-kernel-checks/src/tests/surface-heading-uniqueness.test.ts` | Modified: update import from `extractSectionHeadings` to `extractBlockHeadings`; add test cases for non-section block headings (duplicate, unique, no `aria-labelledby`, nested block double-counting prevention) |
| `packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts` | Modified: update `HEADING-UNIQ-01` rule description from "Duplicate section heading text on the same surface page" to "Duplicate block heading text on the same surface page" |

### Output format

Same `Diagnostic[]` shape as RFC-0690. The diagnostic message text is updated from `Duplicate section heading "${headingText}" appears ${count} times on ${route}` to `Duplicate block heading "${headingText}" appears ${count} times on ${route}` to reflect the broader scan scope. The `fixHint` is updated from `"Use distinct labels for each block in the bake function — see SURFACE_LABELS in bake-helpers.ts"` to `"Use distinct heading text for each block-level element with aria-labelledby on this page"` — the original fixHint assumed bake function labels, but non-section blocks may come from custom HTML, not bake functions.

### Failure modes

- **HEADING-UNIQ-01 (error):** Same as RFC-0690 — duplicate heading text in block-level elements with `aria-labelledby` is an error.
- **False positive — card grid titles:** A card grid may have multiple cards with the same title inside `<div>` wrappers. However, card titles are typically `<h3>` or `<h4>` inside individual card components, not the first heading of a block with `aria-labelledby`. The `aria-labelledby` requirement filters out most non-landmark blocks.
- **Nested block double-counting (prevented):** If a `<section>` contains a `<div>` with `aria-labelledby`, both are scanned as separate blocks. However, `findFirstHeadingSkippingChildBlocks` skips child block elements during heading extraction — the `<section>` heading is extracted from non-child-block descendants, and the `<div>` heading is extracted independently. Without this skip, `findFirstDescendantByTag` (DFS) would find the same heading element from both the section and the div, counting it twice and creating a false positive. The skip ensures each heading is counted exactly once, attributed to its nearest ancestor block.
- **Nested blocks with shared text:** If a `<section>` and its child `<div aria-labelledby>` each have their own heading with the same normalized text, HEADING-UNIQ-01 fires — this is a real violation (two landmarks with the same accessible name), not a false positive.

## Rollout

- **Default behavior on introduction:** The validator now scans `<section>` + `<div>/<article>/<aside>` with `aria-labelledby`. Pages that passed before may now fail if they have duplicate headings in non-section blocks.
- **Backward compatibility:** Pages with unique headings in all blocks continue to pass. The new scan only adds coverage — it does not change existing diagnostics.
- **Pipeline integration:** `surface.heading-uniqueness.validate` in `sites-check-postbuild` pipeline. No pipeline change needed.

## Alternatives considered

1. **Scan all block-level elements (no `aria-labelledby` requirement).** Rejected — this would produce false positives from layout `<div>` wrappers that have headings but are not landmarks. The `aria-labelledby` requirement aligns with the axe landmark-unique rule.

2. **Scan only `<article>` and `<aside>` (not `<div>`).** Rejected — `<div>` with `aria-labelledby` is a valid landmark role in ARIA. Excluding it would miss potential violations.

3. **Add a separate HEADING-UNIQ-02 diagnostic for non-section blocks.** Rejected — the violation is the same (duplicate heading text on the same page). A separate diagnostic adds complexity without value.

## Risks

- **False positives from `<div>` with `aria-labelledby`:** Some `<div>` elements may have `aria-labelledby` for non-landmark purposes (e.g. form field groups). If such a `<div>` has a heading that duplicates another heading, HEADING-UNIQ-01 fires. Mitigation: the `aria-labelledby` requirement is restrictive — most layout `<div>`s do not have it.
- **Performance:** Scanning more elements increases parse time. Mitigation: the validator already parses the full HTML tree with parse5; the additional scan is O(n) where n is the number of elements. Negligible impact.

## Acceptance criteria

- [ ] `surface.heading-uniqueness.validate` scans `<section>` + `<div>/<article>/<aside>` with `aria-labelledby`
- [ ] HEADING-UNIQ-01 fires for duplicate headings in non-section blocks with `aria-labelledby`
- [ ] Existing section-based detection continues to work unchanged
- [ ] Test cases added for non-section block headings (duplicate, unique, no `aria-labelledby`)
- [ ] No false positives on warpgogol-com surface pages after implementation
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST use `BLOCK_TAGS = new Set(["section", "div", "article", "aside"])` for the scan.
- Agents MUST require `aria-labelledby` attribute on non-section block elements.
- Agents MUST NOT scan `<div>` elements without `aria-labelledby` — they are layout wrappers, not landmarks.
- Agents MUST use `findFirstHeadingSkippingChildBlocks` (not `findFirstDescendantByTag`) for heading extraction to prevent nested block double-counting.
- Agents MUST rename `extractSectionHeadings` to `extractBlockHeadings` and update all imports in the test file.
- Agents MUST update the `MODULE_CONTRACT` non-goal in `surface-heading-uniqueness.ts` from "Do not check non-section headings" to "Do not check headings outside block-level elements with `aria-labelledby`".
- Agents MUST update the `HEADING-UNIQ-01` rule description in `content-surface.ts` from "section heading" to "block heading".
- Agents MUST update the diagnostic message text from "section heading" to "block heading".
- Agents MUST update the `fixHint` to be context-neutral (not bake-function-specific).
- Agents MUST add test cases for non-section blocks in `surface-heading-uniqueness.test.ts`, including a nested block double-counting prevention test.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
