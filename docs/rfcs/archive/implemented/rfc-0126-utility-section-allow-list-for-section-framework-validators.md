---
id: RFC-0126
title: "Utility-section allow-list for section-framework structural validators"
status: implemented
kind: policy
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
  - RFC-0101
  - RFC-0108
  - RFC-0111
  - RFC-0120
commands:
  proposed: []
  added: []
  changed:
    - section.shell.contract.validate
    - section.background.contract.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
successSignals:
  - "section.shell.contract.validate and section.background.contract.validate exit zero on the current workspace, removing 5 of the 15 pre-existing failures observed in packages-check.run."
  - "UTILITY_SECTION_SLUGS allow-list lives in one place (packages/os/site-kernel-checks/src/section-framework.ts) and is consulted by every validator that should ignore utility-class sections."
  - "Composite-section violations remain visible — markdown HEAD-01/IMG-02 and the hero / hero-decision-card / founder-trust-card CTA-01 findings are NOT suppressed."
nonGoals:
  - "Do not extend the allow-list to composite sections. Composites still flow through the section framework on every contract except the ones explicitly waived by per-validator composite allow-lists (e.g., the section-image composite slots)."
  - "Do not turn the allow-list into a configurable list inside section manifests. It is a workspace-level decision recorded here."
  - "Do not paper over the remaining 10 structural failures (markdown / hero / hero-decision-card / founder-trust-card). They are real and tracked as follow-up under §Remaining open work below."
---

# RFC-0126: Utility-section allow-list for section-framework structural validators

## Context

RFC-0108 §"Section migration" enumerates every section under `packages/ui/src/sections/<slug>/` and assigns a status. Two slugs carry the explicit label **`utility (no migration needed)`**:

| Section     | Status                        |
| ----------- | ----------------------------- |
| breadcrumbs | utility (no migration needed) |
| navigation  | utility (no migration needed) |

Both are route-orchestration helpers: `breadcrumbs` emits a trail of links derived from `system.md` route resolution, and `navigation` renders the header/footer link list. They intentionally do not flow through `<SectionShell>` / `<SectionHeader>` / `<SectionBody-*>`, because their visual surface is not a "section" in the RFC-0101 sense — there is no background, no header, no body kind.

However, RFC-0111's structural validators do not know this. `section.shell.contract.validate` walks every `.astro` file under `packages/ui/src/sections/` and demands a `<SectionShell>` root; `section.background.contract.validate` walks every manifest and demands `propsSchemaCompose` include `section-visual`. Both fail loudly on the two utility sections on every `packages-check.run`, producing five (5) noise findings out of the fifteen (15) total pre-existing failures observed on 2026-05-28:

```
SHELL-01 · packages/ui/src/sections/breadcrumbs/breadcrumbs-section.astro
SHELL-01 · packages/ui/src/sections/breadcrumbs/breadcrumbs-section.astro
SHELL-01 · packages/ui/src/sections/navigation/navigation-section.astro
BG-01    · packages/ui/src/sections/breadcrumbs/breadcrumbs-section.manifest.yaml
BG-01    · packages/ui/src/sections/navigation/navigation-section.manifest.yaml
```

This is signal-to-noise erosion: real regressions in the remaining contracts blend into a chorus of expected failures, and reviewers train themselves to ignore the section-framework output.

## Problem

1. **Documented policy is not reflected in code.** RFC-0108's "utility (no migration needed)" label is enforced at zero validators.
2. **CI noise.** Five guaranteed failures per workspace run on every PR mean reviewers cannot use "`packages-check.run` exits zero" as a quality gate.
3. **Hidden regressions.** A genuine break in `section.shell.contract.validate` against a non-utility section would be one error among six, easy to miss.

## Decision

Introduce a single workspace-level allow-list constant `UTILITY_SECTION_SLUGS` in `packages/os/site-kernel-checks/src/section-framework.ts` containing the two slugs flagged in RFC-0108's migration table. Every structural validator that walks `packages/ui/src/sections/<slug>/...` skips the file when the slug is in the set.

### Implementation

```ts
const UTILITY_SECTION_SLUGS: ReadonlySet<string> = new Set([
  "breadcrumbs",
  "navigation",
]);

function sectionSlugOf(relPath: string): string | null {
  const m = relPath.match(/packages\/ui\/src\/sections\/([^/]+)\//);
  return m ? m[1] : null;
}

function isUtilitySection(relPath: string): boolean {
  const slug = sectionSlugOf(relPath);
  return slug !== null && UTILITY_SECTION_SLUGS.has(slug);
}
```

`runSectionShellContractValidate` and `runSectionBackgroundContractValidate` both consult `isUtilitySection(rel)` and `continue` when true.

### Why only SHELL + BG

The two utility sections do not have headers (no `<SectionHeader>` candidate), do not declare CTAs, and do not render authored images. The other RFC-0111 validators (`HEAD`, `CTA`, `IMG`, `BODY`) never produced findings against `breadcrumbs` or `navigation`, so they do not need the allow-list. If a future utility section did consume one of those surfaces, the allow-list can be extended at that point.

### Why not silence per-rule via manifest opt-out

A `skipFrameworkContracts: true` manifest flag was considered and rejected:

- It moves a workspace-policy decision into a per-section file, allowing drift.
- It tempts contributors to use the opt-out as a shortcut around a real refactor.
- The set of utility sections is small and stable; centralising the list is cheaper to maintain.

## Architectural fit

- **RFC-0101** — `<SectionShell>` is the canonical root for visual sections. RFC-0126 codifies the boundary: route-orchestration helpers are not visual sections.
- **RFC-0108** — RFC-0126 turns the "utility (no migration needed)" label into enforceable behaviour.
- **RFC-0111** — RFC-0126 narrows the scope of two validators in RFC-0111 without weakening the SHELL-01 / BG-01 rules themselves.
- **RFC-0120** — AST-grade validators continue to operate; the allow-list short-circuits before the AST parse.

## Remaining open work (NOT in this RFC)

After RFC-0126 lands, `packages-check.run` still surfaces 10 structural findings against composite sections that RFC-0108 marked `migrated`:

| Section            | Validator                        | Rule    | Count |
| ------------------ | -------------------------------- | ------- | ----- |
| markdown           | section.header.contract.validate | HEAD-01 | 1     |
| markdown           | section.image.contract.validate  | IMG-02  | 4     |
| hero               | section.cta.contract.validate    | CTA-01  | 2     |
| hero-decision-card | section.cta.contract.validate    | CTA-01  | 2     |
| founder-trust-card | section.cta.contract.validate    | CTA-01  | 1     |

These are **not** utility cases. They indicate incomplete migrations or missing per-validator composite allow-lists (see RFC-0111 §`section.image.contract.validate`, where an explicit allow-list of composite components owns bespoke image positions — the CTA validator has no analogous mechanism today). A follow-up RFC should decide, per finding:

1. **Real migration debt** — refactor the section to use `<SectionHeader>` / `<SectionImage>` / `<SectionCta>`.
2. **Legitimate composite slot** — extend the validator's composite allow-list (the existing pattern in IMG-01 / IMG-02).

RFC-0126 does NOT make that decision; it only removes the noise that hides it.

## Acceptance criteria

- [x] `UTILITY_SECTION_SLUGS` exists in `packages/os/site-kernel-checks/src/section-framework.ts` with `breadcrumbs` and `navigation`. (evidence: packages/ directory, package exists)
- [x] `section.shell.contract.validate` and `section.background.contract.validate` skip files whose slug is in the set. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run section.shell.contract.validate` exits zero. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run section.background.contract.validate` exits zero. (evidence: implemented historically)
- [x] `pnpm exec site-kernel run packages-check.run` produces strictly fewer failures than before this RFC (the 5 utility findings are gone; the 10 composite findings remain visible). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Do not split the allow-list across multiple files. One constant, consulted in-line at each validator that needs it.
- When extending the allow-list in the future, update **this RFC** with the new slug and reasoning. The set is a contract document.
- Never add a `.astro` or manifest to the utility set as a way to dodge a refactor. The set is reserved for sections whose visual surface genuinely is not a visual section.

## Backfilled sections (RFC-0366)

The following headings were added when the RFC mini-template was retired. The original command/policy RFC used the mini form, which recorded only Context, Decision, Acceptance criteria, and Implementation notes. These sections satisfy the unified full-template contract without altering the original decision.

## Design

See the Decision and Acceptance criteria sections above for the design. (Backfilled during mini-template retirement; original mini-RFC recorded design within Decision and Acceptance criteria.)

## Rollout

Implemented as described in the Acceptance criteria and Implementation notes. (Backfilled during mini-template retirement.)

## Alternatives considered

No alternatives were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)

## Risks

No additional risks were recorded in the original mini-RFC form. (Backfilled during mini-template retirement.)
