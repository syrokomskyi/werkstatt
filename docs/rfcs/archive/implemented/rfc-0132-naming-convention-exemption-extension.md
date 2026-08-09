---
id: RFC-0132
title: "`naming.convention.lint` — exempt SHOUTY_SNAKE first-segment stems"
status: implemented
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-29
updatedAt: 2026-06-04
implementedAt: 2026-05-29
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0011
  - RFC-0079
commands:
  proposed: []
  added: []
  changed:
    - naming.convention.lint
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-checks
successSignals:
  - "`naming.convention.lint` exits zero on the workspace and continues to exempt the canonical ALLCAPS files (AGENTS.md, README.md, LICENSE)."
  - "`AGENTS.template.md`, `ICONS_GENERATE.md`, and similarly-named SHOUTY_SNAKE_CASE doc/template files are exempted."
  - "Lowercase template files (e.g., `agents.template.md`) remain subject to the kebab-case rule — the exemption is keyed on the SHOUTY_SNAKE first segment, not on the `.template.` suffix."
nonGoals:
  - "Do not exempt every file with a `.template.` segment. The exemption is tied to the canonical SHOUTY_SNAKE first stem, because that signals 'this template generates a canonically-named artifact'."
  - "Do not exempt lowercase file names like `agents.template.md` — those would conflict with the kebab-case rule's intent for ordinary source files."
  - "Do not regress the existing single-segment ALLCAPS exemption (`AGENTS.md`, `LICENSE`, `README.md`)."
---

# RFC-0132: `naming.convention.lint` — exempt SHOUTY_SNAKE first-segment stems

## Context

`naming.convention.lint` (`packages/os/site-kernel-checks/src/structure.ts`) enforces kebab-case for source-controlled files. It already exempts a few canonical patterns:

- Files starting with `.` or `_`.
- Files whose **last-segment** stem is ALLCAPS (`AGENTS.md`, `README.md`, `LICENSE`).
- Files containing certain keywords (`config`, `module`).
- Files inside exempt directories.

Two real workspace patterns slipped past the existing exemption logic:

1. **`AGENTS.template.md`** — three instances under `packages/os/site-kernel-codegen/src/templates/app-boilerplate/{,src/content/,src/styles/}`. Each generates the canonical `apps/<id>/AGENTS.md` via `agents.generate` (RFC-0079). The last-segment stem `AGENTS.template` fails the previous `/^[A-Z]+$/.test(stem)` exemption check because of the lowercase `template` segment.
2. **`ICONS_GENERATE.md`** — documentation file in `packages/ui/`. Single-segment stem `ICONS_GENERATE` fails the same check because of the underscore.

Both file names are deliberate: they convey canonical-doc / canonical-template semantics that justify breaking out of kebab-case. The exemption check just did not cover the patterns.

## Decision

Extend the SHOUTY_SNAKE exemption in `isNamingExempt` to:

1. Use the **first** stem segment instead of the last (so `AGENTS.template.md` sees `AGENTS` rather than `AGENTS.template`).
2. Accept SHOUTY*SNAKE_CASE — `[A-Z]+(*[A-Z]+)\*`— instead of pure ALLCAPS, so`ICONS_GENERATE` qualifies.

```ts
const firstDotIndex = fileName.indexOf(".");
const firstStem = firstDotIndex > 0 ? fileName.slice(0, firstDotIndex) : fileName;
if (firstStem.length > 0 && /^[A-Z]+(_[A-Z]+)*$/.test(firstStem)) return true;
```

### What this exempts and what it does not

Exempt:

- `AGENTS.md`, `LICENSE`, `README.md` — first segment ALLCAPS. (Already exempt before; preserved.)
- `AGENTS.template.md`, `AGENTS.draft.md`, `README.template.md` — first segment ALLCAPS, multi-segment stem.
- `ICONS_GENERATE.md`, `SECURITY_POLICY.md` — first segment SHOUTY_SNAKE.

Not exempt (still kebab-case-checked):

- `agents.template.md`, `readme.template.md` — first segment lowercase. The exemption is keyed on the canonical-name signal (SHOUTY_SNAKE first segment), not on the `.template.` suffix.
- `Agents.md`, `Readme.md` — mixed case. The lint correctly catches non-canonical capitalisation.
- `agents-generate.md` — kebab-case stem; not violating in the first place.

### Why first segment, not whole stem

The first segment is the file's **canonical identity** in conventions like `AGENTS.template.md` — everything after the first `.` is a modifier (`.template`, `.draft`, `.spec`, `.local`). Anchoring the exemption to the first segment preserves the original intent of "canonical doc files don't follow kebab-case" while allowing modifier-suffixed variants of those same canonical files.

## Architectural fit

- **RFC-0079** — `apps/<id>/AGENTS.md` is the canonical generated agents guide; its template carries the same canonical name with a `.template` modifier. RFC-0132 stops penalising the template for honouring the canonical name.
- **RFC-0011** — script placement rules don't intersect; this is purely a naming-convention adjustment.

## Failure modes

- **A new file is accidentally named with a SHOUTY_SNAKE first stem.** It bypasses the lint. Mitigation: code review remains the line of defence for "is this name appropriate?"; the lint never claimed to enforce file-naming semantics, only mechanical kebab-case for the bulk of source files.
- **A future canonical-doc pattern needs different exemption rules.** Add an explicit allow-list of file names (not just a stem regex). The current change is the simplest extension that closes the observed regressions without overreach.

## Acceptance criteria

- [x] `isNamingExempt` in `packages/os/site-kernel-checks/src/structure.ts` reads the first stem segment and accepts SHOUTY_SNAKE. (evidence: packages/ directory, package exists)
- [x] `pnpm exec werkstatt run naming.convention.lint` exits zero on the current workspace (3199 non-exempt files checked). (evidence: implemented historically)
- [x] `pnpm exec werkstatt run naming.convention.lint` continues to flag a deliberately introduced `Agents.md` or `Readme.md` (verified by manual inspection of regex behaviour). (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- The regex `^[A-Z]+(_[A-Z]+)*$` is intentional: it does NOT match `MixedCase`, hyphenated names, or names with digits-prefixed segments. If a future canonical name needs digits (e.g., `OPENAPI3.md`), extend the regex deliberately.
- Do not weaken the lint by exempting every multi-segment stem. The signal is "first segment is SHOUTY_SNAKE → canonical doc/template".
- The reverse direction (forcing all SHOUTY_SNAKE to be ALLCAPS) is intentionally not enforced. `README.md` and `READ_ME.md` are both exempt; readability of canonical names is governed by code review, not by the lint.

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
