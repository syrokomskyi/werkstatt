---
id: RFC-0206
title: "Add content link, path, and anchor validation to Site OS checks"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-18
updatedAt: 2026-06-18
implementedAt: 2026-06-18
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0048
  - RFC-0160
commands:
  proposed:
    - content.links.validate
  added:
    - content.links.validate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
  - warpgogol-com
packagesImpacted:
  - site-kernel-checks
  - site-kernel-content
successSignals:
  - content.links.validate fails on broken same-page anchor references (LINK-01)
  - content.links.validate fails on legacy language-prefixed anchors (LINK-02)
  - content.links.validate fails on unresolved internal page paths without anchor (LINK-03)
  - content.links.validate fails on unresolved internal page paths with anchor (LINK-03)
  - content.links.validate validates anchor against target page when path+anchor is used
  - No false positives on external URLs or valid semantic targets
nonGoals:
  - Do not perform live HTTP requests to external sites at build time
  - Do not validate rendered HTML hrefs post-build (APPS_CHECK_POSTBUILD already covers rendered output)
  - Do not introduce new content schemas or frontmatter fields
---

# RFC-0206: Add content link, path, and anchor validation to Site OS checks

## Context

Author-facing content in `apps/*/src/content/**` contains explicit and implicit URL values:

- Page block props: `ctaPrimaryUrl`, `ctaSecondaryUrl`, `ctaGroup[].url`
- Prose markdown: `[label](path)` and `[label](#anchor)` links
- Navigation entries: `routeSlug`, semantic targets resolved via `resolveSemanticTarget`
- Business content: `pulseUrl`, `heartbeatUrl`, external references

Currently, no Site OS command validates that these URLs and anchors resolve to real pages or section IDs. A typo in an anchor (`#unser-ansatz` when the section renders as `#our-approach` on EN) or a stale language-prefixed path (`/de/#anchor` on the default-language home page) goes undetected until a visitor clicks a broken link.

This gap was exposed today in `apps/nicaragua-projekt` where:

- `ctaSecondaryUrl: "/de/#unser-ansatz"` on the DE home page used a redundant language prefix for a same-page anchor
- `ctaSecondaryUrl: "/en/#unser-ansatz"` on the EN home page pointed to a non-existent anchor because `resolveAnchorFragment` localizes the section ID to `#our-approach`

Both errors were invisible to all existing checks (`apps-check`, `build.check`, `seo.internal-linking.validate`).

## Problem

**Specific invariants unprotected:**

1. **Anchor mismatch**: Content-authored `#anchor` strings must match either:
   - A raw `id` on a `blocks[].id` in the same page, OR
   - A resolved anchor fragment from `system.md pages[].anchors` via `resolveAnchorFragment`
2. **Legacy language prefix in same-page anchors**: Anchors on the current page must never carry a `/<lang>/` prefix (e.g., `/de/#anchor` or `/en/#anchor`). Browsers treat `/de/#anchor` as a navigation to `/de/` with hash `#anchor`, which fails when the default language has no prefix.
3. **Unresolved internal paths**: Relative paths like `/de/some-page` must resolve to a known route in the app's route registry.

## Decision

The kernel gains a `content.links.validate` command that reads authored content files (`pages/**/*.md`, `prose/**/*.md`, `business/**/*.md`, `navigation/**/*.md`, `site/**/*.md`) and reports three classes of violations:

- `LINK-01` — Anchor reference (`#...`) does not match any block `id` or anchor registry entry for the page
- `LINK-02` — Same-page anchor carries a redundant language prefix (`/<lang>/#...`)
- `LINK-03` — Internal path (with or without anchor) does not resolve to a known route in the app's route registry

Both bare internal paths (`/en/donate-contact`) and paths with anchors (`/en/donate-contact#contact`) are covered under `LINK-03`.

The command runs in `APPS_CHECK_AUTHOR_PIPELINE` because it validates authored source, not rendered build artifacts.

## Architectural fit

- **Site OS operator model**: App-scoped command (`--app <id>` or `--all`), registered in `packages/os/site-kernel-checks/src/command-tables/04-content-quality.ts`, integrated into `APPS_CHECK_AUTHOR_PIPELINE` after `content.validate`.
- **RFC-0048 / RFC-0160**: Uses the canonical route registry and anchor fragment resolution already provided by `@gogol/share/astro/routes.ts` (`resolveAnchorFragment`, `getRouteRegistry`). No new resolution logic.
- **Scaling**: Uniform across all `apps/*`. No app-specific code. New apps comply automatically.

## Design

### CLI surface

```sh
# Per-app check
pnpm exec werkstatt run content.links.validate --app nicaragua-projekt

# Workspace-wide check (all apps)
pnpm exec werkstatt run content.links.validate --all

# JSON output for CI
pnpm exec werkstatt run content.links.validate --app nicaragua-projekt --json
```

**Flags:**

- `--app <id>`: target app (required unless `--all`)
- `--all`: run across all apps in `apps/*`
- `--json`: emit machine-readable output
- `--strict`: treat warnings as failures (e.g., external URLs with suspicious patterns)

### TypeScript contracts

```ts
interface ContentLinkViolation {
  /** LINK-01 | LINK-02 | LINK-03 */
  rule: string;
  /** Path to the authored content file, relative to app root */
  file: string;
  /** YAML path or markdown line context */
  path: string;
  /** The raw URL/anchor string from content */
  value: string;
  /** Human-readable explanation with fix hint */
  message: string;
}

interface ContentLinksValidateResult {
  command: "content.links.validate";
  status: "pass" | "fail";
  app: string;
  violations: ContentLinkViolation[];
  stats: {
    filesScanned: number;
    anchorsChecked: number;
    pathsChecked: number;
  };
}
```

### File system responsibilities

| Path                             | Role                                                 |
| -------------------------------- | ---------------------------------------------------- |
| `src/content/pages/**/*.md`      | Scanned for block props containing URL/anchor values |
| `src/content/prose/**/*.md`      | Scanned for markdown link syntax `[text](url)`       |
| `src/content/business/**/*.md`   | Scanned for external/internal URL fields             |
| `src/content/navigation/**/*.md` | Scanned for route/semantic target references         |
| `src/content/site/**/*.md`       | Scanned for footer/header URL props                  |
| `src/content/system.md`          | Read for anchor registry and route registry          |

### Resolution rules

1. **Same-page anchor** (`#foo`):
   - Resolve against current page's `blocks[].id` values
   - If not found, resolve via `resolveAnchorFragment(anchorId, pageId, lang)` using `system.md` anchor registry
   - If still not found → `LINK-01`

2. **Language-prefixed anchor** (`/de/#foo`, `/en/#foo`):
   - If the path prefix matches the current page's language AND the page is the same logical page → `LINK-02`
   - Suggested fix: strip prefix to `#foo` (or localized anchor from registry)

3. **Internal path** (with or without anchor: `/de/spenden-kontakt`, `/en/donate-contact#contact`):
   - Strip anchor fragment to get path (`/en/donate-contact`)
   - Look up path in route registry (`getRouteRegistry()`)
   - If path not found → `LINK-03`
   - If path found but anchor is present: additionally validate the anchor against the target page's `blocks[].id` and anchor registry (same as rule 1)

4. **External URL** (`https://...`):
   - Not validated by default (non-goal)
   - With `--strict`: flag suspicious patterns (e.g., hardcoded `alt.nicaragua-projekt.org` in content)

### Output format

```json
{
  "command": "content.links.validate",
  "status": "fail",
  "app": "nicaragua-projekt",
  "violations": [
    {
      "rule": "LINK-02",
      "file": "src/content/pages/de/home.md",
      "path": "blocks[0].props.ctaSecondaryUrl",
      "value": "/de/#unser-ansatz",
      "message": "Same-page anchor must not carry language prefix. Use '#unser-ansatz'."
    },
    {
      "rule": "LINK-01",
      "file": "src/content/pages/en/home.md",
      "path": "blocks[0].props.ctaSecondaryUrl",
      "value": "#unser-ansatz",
      "message": "Anchor '#unser-ansatz' not found on page 'home' for lang 'en'. Did you mean '#our-approach'?"
    }
  ],
  "stats": {
    "filesScanned": 24,
    "anchorsChecked": 12,
    "pathsChecked": 8
  }
}
```

### Failure modes

- **Exit code**: non-zero when any `LINK-01`/`LINK-02`/`LINK-03` violation exists
- `--json`: stable JSON output for CI parsing
- Pretty output: one line per violation with file path, rule ID, and fix hint

## Rollout

1. **Phase 1 (draft)**: Command implemented in `site-kernel-checks`, opt-in via `pnpm exec werkstatt run content.links.validate --app <id>`
2. **Phase 2 (adoption)**: Wire into `APPS_CHECK_AUTHOR_PIPELINE` as a non-blocking step (warnings only) for one week
3. **Phase 3 (enforcement)**: Switch to fail-hard in `APPS_CHECK_AUTHOR_PIPELINE` after all existing apps are clean
4. **New apps**: Comply automatically from day one via pipeline inheritance

## Alternatives considered

- **Post-build HTML crawler**: Rejected. The bug is in authored content, not in rendering. Catching it after build is too late and produces less actionable diagnostics (line numbers in YAML are lost).
- **Per-app manual testing**: Rejected. Relies on human discipline, which already failed.
- **Extending `seo.internal-linking.validate`**: Rejected. That command audits rendered HTML for SEO structure (orphaned pages, crawl depth). It does not inspect authored content YAML/markdown and cannot report `LINK-02` prefix violations.

## Risks

- **False positives on dynamic/generated anchors**: Some anchors may be injected by client-side scripts. Mitigation: only validate anchors explicitly authored in content files.
- **Anchor registry drift**: If `system.md` anchor registry is outdated, `LINK-01` may fire incorrectly. Mitigation: `resolveAnchorFragment` falls back to raw `id` matching; registry is already validated by `page.block.validate`.
- **Performance**: Scanning all content files is O(n) with small n (~50 files per app). No performance concern.

## Acceptance criteria

- [x] `content.links.validate` command registered in `site-kernel-checks` command table (evidence: implemented historically)
- [x] `--json` output format stable and documented (evidence: implemented historically)
- [x] Integrated into `APPS_CHECK_AUTHOR_PIPELINE` (fail-hard from introduction) (evidence: implemented historically)
- [x] `LINK-01`, `LINK-02`, `LINK-03` rules documented with examples (evidence: implemented historically)
- [x] Existing apps pass after fixing any pre-existing violations (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this command ONLY when this RFC has status: accepted.
- Agents MUST use existing `@gogol/share/astro/routes.ts` utilities (`resolveAnchorFragment`, `getRouteRegistry`) instead of duplicating resolution logic.
- Agents MUST NOT invent new URL resolution logic outside of shared packages.
- When implementing, agents MUST reference this RFC ID (`RFC-0206`) in commit messages.
- Agents MUST NOT weaken or remove the `LINK-02` rule without a superseding RFC.
