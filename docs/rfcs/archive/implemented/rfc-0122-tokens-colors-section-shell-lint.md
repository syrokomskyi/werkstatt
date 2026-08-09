---
id: RFC-0122
title: "`tokens.colors.section-shell.lint` — close RFC-0108 open work for section-shell token contract"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-28
updatedAt: 2026-06-04
implementedAt: 2026-05-29
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0098
  - RFC-0101
  - RFC-0102
  - RFC-0103
  - RFC-0104
  - RFC-0105
  - RFC-0108
  - RFC-0111
commands:
  proposed:
    - tokens.colors.section-shell.lint
  added:
    - tokens.colors.section-shell.lint
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
  - ui
successSignals:
  - "tokens.colors.section-shell.lint exists under packages/os/site-kernel-checks/src/ and is registered in PACKAGES_CHECK_PIPELINE."
  - "Every CSS file under the eight canonical section-framework component directories is scanned; only --ds-* tokens, color-mix(in srgb, ...) compositions, and the safe keywords (transparent, currentColor, inherit) are accepted."
  - "Raw #hex, rgb(), rgba(), hsl(), hsla() inside the eight directories produce a hard violation with a stable rule id and a fix hint."
  - "The validator emits the canonical KernelCommandResult envelope and supports --json."
nonGoals:
  - "Do not scan <style> blocks inside .astro files in this RFC; CSS files only. AST-grade .astro scanning is RFC-0120 territory and may be added in a follow-up."
  - "Do not lint app-local styles under apps/<id>/src/styles/ — that surface is already covered by tokens.colors.lint."
  - "Do not enforce biome token presence (that is Proposal C of RFC-0108, deferred to its own RFC)."
---

# RFC-0122: `tokens.colors.section-shell.lint` — close RFC-0108 open work for section-shell token contract

## Context

RFC-0108 §"Open work — proposed validators" enumerated ten validators required to make the RFC-0101..RFC-0106 section framework audit-tight. RFC-0111 implemented eight of them as `section.*.contract.validate` and `site.background.contract.validate`; RFC-0116 filled the per-app placeholders. RFC-0120 upgraded those validators to AST-grade.

One proposed validator never landed: `tokens.colors.section-shell.lint`. The existing workspace command `tokens.colors.lint` only walks `src/styles/` inside each app — it does **not** look at `packages/ui/src/components/{section-shell, section-header, section-body, section-cta, section-cta-group, section-image, glass-panel, site-background}`. As a result, a brand-new section primitive can land with a raw `#`, `rgb(...)`, or `hsl(...)` value, ship to every app that consumes `@gogol/ui`, and silently bypass the biome token contract documented in RFC-0098 and assumed by RFC-0101.

## Decision

Add a new workspace-scoped validator `tokens.colors.section-shell.lint` to `packages/os/site-kernel-checks/`.

### Scope of files

The validator walks `.css` files (recursive) under all eight canonical section-framework component directories:

- `packages/ui/src/components/section-shell/`
- `packages/ui/src/components/section-header/`
- `packages/ui/src/components/section-body/` (covers `list/`, `split-list/`, `stats/`, `cards/`, `paragraphs/`, `comparison/`, `rich/`)
- `packages/ui/src/components/section-cta/`
- `packages/ui/src/components/section-cta-group/`
- `packages/ui/src/components/section-image/`
- `packages/ui/src/components/glass-panel/`
- `packages/ui/src/components/site-background/`

### Rules

- **SHELL-TOK-01** — no `#hex` literals (3/4/6/8 hex digits).
- **SHELL-TOK-02** — no `rgb(` or `rgba(` function calls.
- **SHELL-TOK-03** — no `hsl(` or `hsla(` function calls.

Allowed surfaces (not violations):

- `var(--ds-*)` references.
- `color-mix(in srgb, var(--ds-*), ...)` and `color-mix(in oklch, ...)` compositions whose color operands are `--ds-*` vars or one of the safe keywords below.
- Keywords `transparent`, `currentColor`, `inherit`, `unset`, `initial`.
- Content inside CSS `/* ... */` block comments (stripped before scanning, length preserved).
- Content inside `url(...)` (stripped before scanning, length preserved).

### Result envelope

The command returns the canonical `KernelCommandResult<{ command, status, violations: Array<{ file, rule, message, fix? }> }>` shape used by the RFC-0111 sister validators in `section-framework.ts`. Exit code is `0` when zero violations and `1` otherwise. `--json` produces the stable machine-readable form.

### Pipeline membership

The command is registered in `PACKAGES_CHECK_PIPELINE` alongside the existing `tokens.colors.lint` and the RFC-0111 `section.*.contract.validate` block. It runs in `packages-check.run` only — it is not added to any app pipeline because its scope is workspace packages.

## Architectural fit

- RFC-0098 — biome-scoped shadows and gradients establish that all color tokens in shared components flow through `--ds-*`. This validator is the static enforcement counterpart for the section framework subset.
- RFC-0101..RFC-0105 — section shell, header, body, CTA, image, and site-background contracts implicitly assume biome-resolvable tokens. SHELL-TOK-01..03 keep that assumption honest at build time.
- RFC-0108 §"Open work — `tokens.colors.section-shell.lint`" — closes the only outstanding validator from that list.

## File system responsibilities

| Path | Responsibility |
| --- | --- |
| `packages/os/site-kernel-checks/src/section-shell-tokens.ts` | New module exporting `runSectionShellColorTokenLint`. |
| `packages/os/site-kernel-checks/src/checks.ts` | Promote `stripBlockCommentsPreserveLength`, `stripUrlsPreserveLength`, `collectFilesByExtensions`, and `getLineColumn` to named exports so the new module can reuse them without duplication. |
| `packages/os/site-kernel-checks/src/module.ts` | Register `tokens.colors.section-shell.lint` and append it to `PACKAGES_CHECK_PIPELINE` after the RFC-0111 section validator block. |

## CLI surface

```
pnpm exec werkstatt run tokens.colors.section-shell.lint
pnpm exec werkstatt run tokens.colors.section-shell.lint --json
```

Run as part of `pnpm exec werkstatt run packages-check.run`.

## Failure modes

- **Initial run is green** — at the time of writing, no `.css` file under the eight directories contains a forbidden literal, so introducing the validator does not break CI.
- **Future regression** — a new section primitive that hardcodes a brand color is caught at `packages-check.run` time with a stable rule id and a fix hint pointing the author to the biome token catalog.

## Acceptance criteria

- [x] `packages/os/site-kernel-checks/src/section-shell-tokens.ts` exists and exports `runSectionShellColorTokenLint`. (evidence: packages/ directory, package exists)
- [x] `tokens.colors.section-shell.lint` is registered in `module.ts` and listed in `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `--json` output is stable (`{ command, status, violations: [...] }`). (evidence: implemented historically)
- [x] `pnpm exec werkstatt run tokens.colors.section-shell.lint` exits zero on the current workspace. (evidence: implemented historically)
- [x] A deliberately introduced `#ff0000` in one of the scoped CSS files makes the validator fail with `SHELL-TOK-01` (verified locally, reverted before commit). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Reuse helpers in `checks.ts` rather than duplicating regex utilities. The existing `tokens.colors.lint` strips block comments and `url(...)` while preserving length, which keeps reported line/column numbers correct.
- The validator MUST NOT touch `<style>` blocks in `.astro` files — that is RFC-0120 territory and would require the Astro AST cache. CSS-only keeps this RFC small.
- The validator MUST NOT add app-side scope. Workspace-scoped only.
- Do not weaken the rules to accept hex inside CSS custom property _declarations_ — `--ds-*` tokens themselves live in `packages/tokens/` and in app-level `biome.generated.css`, both of which are outside the eight scoped directories.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Problem

See the Context section above for the problem this RFC addresses. (This section is required by the unified RFC template; the original mini-RFC recorded the problem within Context.)

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)

## Alternatives considered

No alternatives were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)

## Risks

No additional risks were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
