---
id: RFC-0124
title: "Section-framework token contract — every consumed `--ds-*` token must exist in `@gogol/tokens`"
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
  - RFC-0108
  - RFC-0122
commands:
  proposed:
    - tokens.section-shell.contract.validate
  added:
    - tokens.section-shell.contract.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
  - ui
  - tokens
successSignals:
  - "tokens.section-shell.contract.validate is registered in PACKAGES_CHECK_PIPELINE and exits zero on the current workspace."
  - "Every --ds-* token referenced under the eight section-framework component directories (CSS + .astro) appears in @gogol/tokens TOKEN_NAME_SET."
  - "Introducing a reference to an unknown --ds-* token in any scoped file fails the validator with SHELL-TOK-CONTRACT-01 (verified locally)."
  - "packages/ui/docs/section-framework-token-contract.md catalogues the currently consumed tokens as a human-readable contract."
nonGoals:
  - "Do not duplicate the token catalog into a hand-maintained YAML. The contract is derived at validate time from the actual code, so it stays in lockstep with reality."
  - "Do not run this validator per-app. Biome overrides cannot un-define a token that exists in the base catalog; the workspace-level check is sufficient."
  - "Do not extend the validator to check token *values* (e.g., colour contrast, scale ratios). That is the job of biome-level audits."
---

# RFC-0124: Section-framework token contract — every consumed `--ds-*` token must exist in `@gogol/tokens`

## Context

RFC-0108 §"Proposal C" called for a contract document marking which `--ds-*` tokens `<SectionShell>` and its body components consume, plus a `biome.contract.validate` cross-check that every consumed token resolves after biome merge.

The current state on 2026-05-28:

- The eight canonical section-framework component directories reference **58 distinct `--ds-*` tokens** across their CSS and `.astro` files (extracted by a recursive grep on `--ds-[a-zA-Z0-9_-]+`).
- All 58 are already defined in `packages/tokens/src/tokens.css` (the workspace base sheet exported via `@gogol/tokens` `TOKEN_NAME_SET`). The contract holds today.
- Biome overrides in `apps/<id>/src/styles/biome.generated.css` only **override** existing tokens; they cannot undefine them, because CSS custom-property cascade falls back to the `:root` declaration in the base sheet.

What is missing is **enforcement**. A contributor can add a new `var(--ds-color-foo)` reference inside `packages/ui/src/components/section-shell/`, ship the change, and have it resolve to the CSS `unset` default at runtime — silently broken on every app that does not happen to define `--ds-color-foo` somewhere in app-level CSS. RFC-0122 catches raw color literals; it does not catch references to nonexistent tokens.

## Decision

Add a workspace-scoped validator `tokens.section-shell.contract.validate` to `packages/os/site-kernel-checks/`.

### Scope of files

The same eight directories covered by RFC-0122:

- `packages/ui/src/components/section-shell/`
- `packages/ui/src/components/section-header/`
- `packages/ui/src/components/section-body/` (recursive)
- `packages/ui/src/components/section-cta/`
- `packages/ui/src/components/section-cta-group/`
- `packages/ui/src/components/section-image/`
- `packages/ui/src/components/glass-panel/`
- `packages/ui/src/components/site-background/`

File types: `.css` and `.astro` (token references appear inside `<style>` blocks in `.astro` too).

### Rule

- **SHELL-TOK-CONTRACT-01** — every `--ds-*` token referenced inside the scoped files MUST exist in `@gogol/tokens` `TOKEN_NAME_SET`.

Allowed surfaces:

- `var(--ds-xyz)` references whose token name is in `TOKEN_NAME_SET`.
- Dynamic concatenations of the form `var(--ds-color-${tone})` — the trailing `--ds-` or `--ds-color-` prefix is detected and skipped, because the suffix is resolved at template render time.
- Content inside CSS `/* ... */` comments (stripped before scanning).
- Content inside `url(...)` (stripped before scanning).

### Result envelope and pipeline membership

Canonical `KernelCommandResult<{ command, status, violations }>` envelope. Registered in `PACKAGES_CHECK_PIPELINE` immediately after `tokens.colors.section-shell.lint` (the two cover related concerns).

### Why workspace-scope, not per-app

CSS custom-property cascade means a biome override cannot make a token "disappear" — the base declaration in `packages/tokens/src/tokens.css` always provides the fallback. The only failure mode is referencing a name that has **never** been declared in the base sheet, which is a workspace-level property. A per-app variant would either duplicate work or chase a non-issue.

## Architectural fit

- **RFC-0098** establishes that all colour tokens flow through `--ds-*`. RFC-0124 extends this from "only `--ds-*` allowed" (RFC-0122) to "only `--ds-*` that actually exist".
- **RFC-0101..RFC-0105** assume tokens are biome-resolvable. RFC-0124 closes the static loop: any token referenced in shell/header/body/cta/image/glass-panel/site-background must be in the catalog every biome inherits from.
- **RFC-0108 §"Proposal C"** is closed by the combination of RFC-0124 (the validator) and `packages/ui/docs/section-framework-token-contract.md` (the documentation contract derived from the live code).

## File system responsibilities

| Path | Action |
| --- | --- |
| `packages/os/site-kernel-checks/src/section-shell-tokens.ts` | Extended with `runSectionShellTokenContractValidate`. |
| `packages/os/site-kernel-checks/src/module.ts` | New `registerCommand` and a `PACKAGES_CHECK_PIPELINE` entry. |
| `packages/ui/docs/section-framework-token-contract.md` | Human-readable contract document listing the categories of tokens consumed (regenerable). |

## Failure modes

- **Initial run is green** — verified on 2026-05-28 by a manual `comm -23 used defined` diff (no unknown token references in scope).
- **Future regression** — a new section-framework primitive that references `--ds-color-foo` without first declaring it in `packages/tokens/src/tokens.css` fails the validator with `SHELL-TOK-CONTRACT-01` and a fix hint pointing at the token sheet.
- **Dynamic token concatenation** — references whose dynamic suffix is interpolated at render time (e.g., `var(--ds-color-${tone})`) are intentionally skipped by the prefix heuristic. If a future section uses a more complex pattern, expand the heuristic or assert the resolved name set explicitly.

## Acceptance criteria

- [x] `tokens.section-shell.contract.validate` is registered in `module.ts` and listed in `PACKAGES_CHECK_PIPELINE`. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run tokens.section-shell.contract.validate` exits zero on the current workspace. (evidence: implemented historically)
- [x] A deliberately introduced `--ds-color-nonexistent` reference in a scoped CSS file makes the validator fail with `SHELL-TOK-CONTRACT-01` (verified locally, reverted before commit). (evidence: implemented historically)
- [x] `packages/ui/docs/section-framework-token-contract.md` exists and reflects the current categories of tokens consumed. (evidence: packages/ directory, package exists)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Reuse the directory walker (`collectFilesByExtensions`), the CSS strippers (`stripBlockCommentsPreserveLength` / `stripUrlsPreserveLength`), and the line/column helper (`getLineColumn`) from `checks.ts`. Do not duplicate them.
- The validator MUST NOT depend on `biome.generated.css` content. Biome overrides cannot un-define a token; the base sheet is the authority.
- Keep the dynamic-suffix heuristic conservative: skip only matches that end with `-` (i.e., the prefix without a concrete suffix). Real token names always have a non-hyphen suffix, so this does not produce false negatives in practice.

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
