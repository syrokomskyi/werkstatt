---
id: RFC-0014
title: "Extend quartet mirror contract to page routes"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-16
updatedAt: 2026-04-16
implementedAt: 2026-04-16
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0009
  - RFC-0008
  - DNA-5
  - DNA-6
  - DNA-7
  - PAGE-MANDATORY-ARTIFACTS
  - COMPONENT-QUARTET-MIRROR
commands:
  proposed: []
  added:
    - mirror.quartet.validate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - site-kernel-checks
successSignals:
  - mirror.quartet.validate detects slug/route-stem mismatches in nicaragua-projekt (spenden-kontakt, wir-ueber-uns, projekte)
  - Existing passing pages (datenschutz, impressum, widerruf, etc.) continue to pass with no changes
  - New apps with matching names pass from day one without extra work
nonGoals:
  - Do not validate that content files contain correct translations — that is mirroring.validate
  - Do not enforce any convention on how slugs are chosen — only that route stem and slug agree
  - Do not change the language fallback behaviour implemented in RFC-0008
  - Do not extend this check to components (components use a different content-loading pattern)
---

# RFC-0014: Extend quartet mirror contract to page routes

## Context

RFC-0009 established the component quartet mirror contract, enforcing four-way naming alignment between `.astro`, content `.md`, schema `.ts`, and optional client script for content-driven components. `mirror.quartet.validate` currently checks only the component layer (`src/components/` ↔ `src/content/components/`).

Page routes follow a parallel structure: each `src/pages/[lang]/{name}.astro` file loads its content via `getPageEntryWithFallback(lang, "<slug>")`. The slug argument is a literal string that must identify the correct content file `src/content/pages/{lang}/{slug}.md`. By convention, and to keep the page layer consistent with the component layer, the route file stem and the content slug must be identical.

This convention is already respected by most routes in `nicaragua-projekt` (`datenschutz`, `impressum`, `widerruf`, etc.), but three routes violate it silently because no automated check exists:

| Route file              | Slug passed          | Expected slug       |
| ----------------------- | -------------------- | ------------------- |
| `spenden-kontakt.astro` | `"donation-contact"` | `"spenden-kontakt"` |
| `wir-ueber-uns.astro`   | `"about"`            | `"wir-ueber-uns"`   |
| `projekte.astro`        | `"projects"`         | `"projekte"`        |

## Problem

The page mirror contract has a gap: **no automated check verifies that the slug argument in `getPageEntryWithFallback` matches the route file's own filename stem**. This means:

- A route can silently load content from a differently-named file.
- Renaming a route file does not automatically reveal that the content file must also be renamed.
- The language fallback introduced in RFC-0008 can silently serve default-language content under a non-default-language URL when a content file exists but under the wrong slug.
- Agent-assisted page creation can introduce new mismatches because the convention is not enforced.

This violates:

- **DNA-5 (Components with copy use three-way mirroring)**: The naming alignment principle applies equally to pages; route stem and content slug must agree.
- **DNA-6 (Page content is schema-validated)**: Validation depends on finding the right content entry; a slug mismatch bypasses the intended schema lookup path.
- **DNA-7 (Routes stay thin)**: A route that references a content slug different from its own name is encoding an implicit mapping that belongs in neither the route nor an undocumented convention.

## Decision

`mirror.quartet.validate` is extended with a new rule **QP-01** that applies to page route files. For every `src/pages/[lang]/{name}.astro` file that calls `getPageEntryWithFallback(lang, "<slug>")`, the slug literal must equal the route file's stem (`{name}`).

The check is purely static: it extracts slug literals from `getPageEntryWithFallback` calls via regex — no TypeScript execution at check time. It reuses the existing `collectAstroPageFiles` helper and the same `PAGES_EXCLUDED_SUBDIRS` exclusion set already in use by `route.thin.validate`.

The existing component quartet rules Q-01 through Q-05 are unchanged.

## Architectural fit

**Architecture DNA:**

- **DNA-5**: Extends the mirroring principle from components to pages — naming alignment is now required at the route layer too.
- **DNA-6**: Ensures the route loads the content entry it was designed to validate against.
- **DNA-7**: Eliminates the implicit slug mapping that currently lives as silent knowledge inside route files.

**Page Contracts (`page-contracts.md`):**

- Formalizes the "Definition of done" checklist item: _"Its copy lives in a canonical content entry under `src/content/pages/{lang}/`"_ — route stem and content slug are now required to agree.

**Anti-Patterns prevented:**

- **AP-2 (Parallel content system)**: A route referencing a differently-named content file is effectively a hidden content alias that bypasses the standard slug lookup.

**Site OS operator model:**

- Rule QP-01 is added inside `runQuartetMirrorValidation` in `packages/os/site-kernel-checks/src/structure.ts` — consistent with the existing quartet architecture.
- No new command is introduced. `mirror.quartet.validate` already runs in `STANDARD_CHECK_PIPELINE` after `mirror.triad.validate`.

## Design

### CLI surface

```sh
# Validate quartet mirror (components + pages) for one app
pnpm exec werkstatt run mirror.quartet.validate --app nicaragua-projekt

# Machine-readable output for CI
pnpm exec werkstatt run mirror.quartet.validate --app nicaragua-projekt --json

# All apps
pnpm exec werkstatt run mirror.quartet.validate --all --json
```

### Validation rules

This RFC adds one new rule to the existing Q-01..Q-05 set:

| Rule ID | Condition | Severity |
| --- | --- | --- |
| `QP-01` | Page route `{name}.astro` calls `getPageEntryWithFallback(lang, "<slug>")` where `slug ≠ name` | error |

The existing Q-01..Q-05 rules are unchanged.

### TypeScript contracts

No new types are required. The existing `QuartetViolation` shape (from RFC-0009) is reused:

```ts
// Existing — reused unchanged
interface QuartetViolation {
  component: string;  // for page violations: relative route path e.g. "src/pages/[lang]/spenden-kontakt.astro"
  rule: 'Q-01' | 'Q-02' | 'Q-03' | 'Q-04' | 'Q-05' | 'QP-01';
  message: string;
  file?: string;
}
```

The `rule` union is extended with `'QP-01'`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `src/pages/[lang]/*.astro` | Scanned for `getPageEntryWithFallback` calls; slug compared to filename stem |
| `src/pages/[lang]/**/*.astro` | Nested page routes — same rule applies |
| `packages/os/site-kernel-checks/src/structure.ts` | QP-01 logic added inside `runQuartetMirrorValidation` |

Directories excluded from scan (same as `route.thin.validate`): `api/`, `sitemaps/`, `robots/`.

### Output format

```json
{
  "command": "mirror.quartet.validate",
  "status": "fail",
  "violations": [
    {
      "component": "src/pages/[lang]/spenden-kontakt.astro",
      "rule": "QP-01",
      "message": "slug \"donation-contact\" does not match route stem \"spenden-kontakt\" — rename the content file or the route",
      "file": "src/pages/[lang]/spenden-kontakt.astro"
    }
  ]
}
```

### Failure modes

| Scenario                                                | Behavior                             |
| ------------------------------------------------------- | ------------------------------------ |
| `getPageEntryWithFallback` slug matches route stem      | Pass — no violation                  |
| `getPageEntryWithFallback` slug differs from route stem | QP-01 error, exit 1                  |
| Route file has no `getPageEntryWithFallback` call       | Skipped — not a content-driven route |
| `src/pages/` directory not found                        | Exit 0, summary: no pages directory  |

## Rollout

**Phase 1 (This RFC):** Define QP-01, extend `runQuartetMirrorValidation` in `structure.ts`. `mirror.quartet.validate` already runs in `STANDARD_CHECK_PIPELINE` — no pipeline changes needed.

**Existing violations in nicaragua-projekt (Phase 2):** Three routes currently violate QP-01. Each must be resolved by renaming either the route file or the content files so stem and slug agree. These are separate content/route rename tasks and are not part of this RFC's implementation — they are the acceptance signal that the check works.

**New apps:** Comply from day one if they follow the convention that route file stems match content slugs (which is the natural default when naming both consistently).

**Default behavior on first introduction:** Fail-hard. Unlike Q-03 (orphan script, warning only), QP-01 is an error because the mismatch is unambiguous and has no legitimate intentional use case.

## Alternatives considered

| Alternative | Rejected because |
| --- | --- |
| Implement as a separate `route.slug.validate` command | Inconsistent with the quartet architecture — the same naming alignment principle already governs components; pages should follow the same model inside the same command |
| Warn instead of error | The mismatch has no legitimate intentional use case; warnings would accumulate silently |
| Fix the three violating routes without a check | The fix would drift again without enforcement; the check is the durable solution |
| Enforce inside `mirroring.validate` | Different concern — `mirroring.validate` checks cross-language file presence, not the route-to-content slug binding |

## Risks

| Risk | Mitigation |
| --- | --- |
| False positives for routes that legitimately load a differently-named entry | No such case exists in the current architecture; `getPageEntryWithFallback` is always called with the page's own slug by convention |
| Regex mis-matches multi-line or unusual `getPageEntryWithFallback` call formatting | The regex is identical to what `route.thin.validate` already uses for its own pattern matching; edge cases observed in practice are minimal |
| Agent renames route file without renaming content file, breaking the build | QP-01 catches this immediately on the next `mirror.quartet.validate` run |

## Acceptance criteria

- [x] QP-01 rule implemented inside `runQuartetMirrorValidation` in `packages/os/site-kernel-checks/src/structure.ts` (evidence: packages/ directory, package exists)
- [x] `QuartetViolation.rule` union extended with `'QP-01'` (documented in RFC design; runtime uses string literals) (evidence: implemented historically)
- [x] QP-01 violations reported with file path and line number in error message (evidence: implemented historically)
- [x] `mirror.quartet.validate` detected all three existing violations in `nicaragua-projekt` — violations then fixed by renaming content/schema files (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Routes without `getPageEntryWithFallback` are silently skipped (no false positives for machine-readable endpoints, sitemaps, etc.) (evidence: implemented historically)
- [x] `PAGES_ROUTE_EXCLUDED_SUBDIRS` exclusion set applied consistently (same set as `PAGES_EXCLUDED_SUBDIRS` in `route.thin.validate`) (evidence: implemented historically)
- [x] `page-contracts.md` updated to document the route-stem ↔ slug alignment rule (evidence: implemented historically)
- [x] `architecture-dna.md` invariant 7 updated to reference QP-01 enforcement (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status is `accepted`.
- Agents MUST NOT change the `status` field in this RFC.
- Agents MUST add QP-01 logic inside the existing `runQuartetMirrorValidation` function — do NOT create a new command or a new exported function.
- Agents MUST reuse `collectAstroPageFiles` and `PAGES_EXCLUDED_SUBDIRS` already defined in `src/semantic.ts` — do not duplicate the directory walker.
- Agents MUST extract the slug regex as a named constant with an `@ai-invariant` comment so future renames of `getPageEntryWithFallback` are visible.
- Agents MUST NOT fix the three violating routes in `nicaragua-projekt` as part of implementing this RFC — fixing existing violations is a separate task gated on `status: accepted`.
- Agents MUST run `mirror.quartet.validate --app nicaragua-projekt` after implementation and confirm exactly 3 QP-01 violations are reported.
