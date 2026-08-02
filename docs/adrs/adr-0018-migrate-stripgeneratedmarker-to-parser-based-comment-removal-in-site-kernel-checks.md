---
id: ADR-0018
title: "Migrate stripGeneratedMarker to parser-based comment removal in site-kernel-checks"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: proposed
scope: package
decider: architecture
createdAt: 2026-08-02
updatedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0185
  - DNA-1
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0018: Migrate stripGeneratedMarker to parser-based comment removal in site-kernel-checks

## Context

`stripGeneratedMarker` in `packages/os/site-kernel/src/generated-marker.ts` uses regex to remove RFC-0081 GENERATED_MARKER comments from HTML and CSS artifacts. The original regex (`<!--[ \t]*\n[\s\S]*?GENERATED...[\s\S]*?-->`) did not respect HTML comment boundaries — it could match from an unrelated `<!--` to a distant `-->` containing the marker, swallowing everything in between (including `<main>`, `<header>`, and other structural elements).

A fix was applied using negative lookahead (`(?:(?!-->)[\s\S])*?`) to constrain the match within a single comment block. However, the root cause remains: regex is fundamentally unsuitable for HTML structure manipulation. HTML is not a regular language, and future edge cases (nested comments, CDATA sections, malformed comments) could still produce bugs.

`@warpgogol/site-kernel` is a framework-free package (DNA-1). Adding `parse5` (an HTML parser) as a direct dependency would violate this constraint. `@warpgogol/site-kernel-checks` is not framework-free — it already depends on Playwright, Crawlee, and other heavy dependencies for Axiom checks.

## Decision

The HTML comment stripping logic in `stripGeneratedMarker` is migrated from `@warpgogol/site-kernel` to `@warpgogol/site-kernel-checks`, where it uses `parse5` to parse HTML and remove only the comment node containing the GENERATED marker.

- The `dist.generated-marker.strip` command handler in `site-kernel-checks` calls the new parser-based implementation for `.html` files.
- CSS comment stripping (`.css` files) remains regex-based in `site-kernel` — CSS comments are structurally simpler (`/* */`, no nesting, no edge cases).
- The legacy `stripGeneratedMarker` function in `site-kernel` is retained for non-HTML use cases (CSS, markdown, line-comment formats) but the HTML block-comment path is delegated to the new parser-based implementation.

## Justification

- **Root cause elimination**: parse5 parses HTML into a DOM tree, finds the comment node containing the marker, and removes only that node. It is structurally impossible to accidentally remove non-comment content.
- **Framework-free constraint**: `site-kernel` cannot depend on parse5. `site-kernel-checks` already has heavy dependencies (Playwright, Crawlee). Adding parse5 there has zero marginal cost.
- **Proven bug**: the regex approach caused a real accessibility bug (`landmark-one-main` violations on `/open-source/`). The negative lookahead fix is correct but fragile — it fixes one edge case without addressing the fundamental mismatch between regex and HTML.
- **CSS is safe**: CSS comments (`/* */`) are structurally simple — no nesting, no self-closing, no ambiguity. Regex with negative lookahead is sufficient.

## Consequences

- **Positive**: HTML comment removal is structurally correct — no future regex edge cases can swallow content between separate comments.
- **Positive**: `site-kernel` remains framework-free (DNA-1).
- **Negative**: `parse5` becomes a direct dependency of `site-kernel-checks`. This is a minor cost — parse5 is already in the dependency tree via Astro.
- **Negative**: Two code paths for comment stripping (parse5 for HTML, regex for CSS/MD/line-comments). This is acceptable — the complexity is low and each path is optimized for its file type.
- **Technical debt**: the regex-based `stripGeneratedMarker` in `site-kernel` remains as a fallback for non-HTML files. If future file types need parser-based stripping, they should be added to `site-kernel-checks`.

## Evolution

- **Revisit if**: a similar cross-comment swallowing bug appears in CSS stripping (unlikely given CSS comment simplicity).
- **Revisit if**: `site-kernel` drops its framework-free constraint (would allow consolidating all stripping logic in one package).
- **Implementation reference**: the original regex fix was committed in `794fd609` with negative lookahead. The parse5 migration supersedes that approach for HTML files.
