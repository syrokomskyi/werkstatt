---
rfcId: RFC-0721
auditId: AUDIT-RFC-0721-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0721

## Verdict: Needs revision

The RFC has a fundamental design flaw in its route comparison logic: it compares `system.md pages[]` routes against `behavior.snapshot.generated.yaml` routes, but the snapshot includes ALL routes (including Programmatic Surface virtual routes per DNA-39), which will produce false positives on every site using the surface. Additionally, the RFC is missing 5 required sections and has a V-24 error (empty `satisfies[]` for an architecture RFC).

## Mechanical validation (rfc.validate)

Fail — 1 error, 6 warnings:

- **V-24 (error):** architecture RFC created 2026-08-06 (>= 2026-07-07) must declare at least one DNA invariant in `satisfies` (RFC-0331).
- **V-13 (warning):** missing required sections: `## Rollout`, `## Alternatives considered`, `## Risks`, `## Acceptance criteria`, `## Implementation notes for agents`.
- **V-20 (warning):** unknown frontmatter key `supersedesBy` — should be `supersededBy`.

## Axis A — Structural completeness

5 required sections are missing: `## Rollout`, `## Alternatives considered`, `## Risks`, `## Acceptance criteria`, `## Implementation notes for agents`. The RFC has `## Context`, `## Decision`, `## Justification`, `## Design`, `## Consequences`, `## Evolution` — but the required sections V-13 checks for are absent.

The `## Design` section contains a code sketch but no file system responsibilities table, no output format documentation (`--json` shape), and no explicit exit code / warn-vs-fail behavior specification beyond "warning".

The frontmatter has `supersedesBy:` (line 14) with no value — this is a typo for `supersededBy:` and should be removed if empty (V-20).

## Axis B — DNA alignment

`satisfies: []` is empty. This is an architecture RFC created after 2026-07-07, so RFC-0331 requires at least one DNA invariant. The RFC relates to behavior snapshot validation (RFC-0269) and build pipeline integrity, but doesn't declare which DNA invariant it satisfies. Candidates: DNA-35 (`app.contract.full` as canonical readiness signal — this check augments the build validation surface) or DNA-48 (release discipline — behavior snapshots are part of the release contract). The RFC must declare at least one.

## Axis C — Ecosystem fit

- **Pipeline placement discrepancy:** the RFC says "Add as a non-fatal step in `build.prepare` pipeline, after `routes.generate`" (line 120), but the actual implementation places it at the end of `build.prepare` (after `generated.stale.validate`, line 141 of `build-prepare.ts`). The RFC text should match the actual placement or justify the end-of-pipeline position.
- **Command scope mismatch:** the command table entry has `scope: "workspace"` but the implementation uses `requireAstroSitePaths(context)` which requires app context. The existing `behavior.snapshot.validate` and `behavior.snapshot.generate` commands both have `scope: "app"`. This command should also be `scope: "app"`.
- **AGENTS.md update not mentioned:** the RFC doesn't mention updating `packages/os/site-kernel-checks/AGENTS.md` to document the new command in the module table.
- **Command manifest not mentioned:** the RFC doesn't mention running `command.manifest.generate` after implementation (RFC-CMD-02 will fail without it).
- **Dev pipeline exclusion not addressed:** the `SITES_BUILD_PREPARE_DEV_PIPELINE` (RFC-0597) is a codegen-only subset of `build.prepare`. The RFC doesn't state whether the staleness check should be included in the dev pipeline. Given that it's advisory and lightweight, it likely should be — but the RFC should state this explicitly.

## Axis D — Forward-only compliance

No issues. The RFC adds a new advisory check without duplicating or competing with existing SNAP-01/02 logic. No backward compatibility layers, no shims, no dual-paths.

## Axis E — Agent-facing policy

- No self-authorizing language — the RFC is in draft status and doesn't grant implementation permission.
- No `## Implementation notes for agents` section (missing, V-13).
- No NEEDS CLARIFICATION markers.
- Storage policy: not applicable (no persistence, no cookies).

## Axis F — Pragmatism

- **New command justified:** `behavior.snapshot.staleness.check` cannot be a flag on `behavior.snapshot.validate` because the validate command requires `dist/client` (runs in `build.post`), while the staleness check runs in `build.prepare` before dist exists. Different scope, different timing — a separate command is appropriate.
- **Lean contracts:** the code sketch is minimal — good.
- **Existing patterns checked:** the RFC explains why `behavior.snapshot.validate` can't be reused (requires dist/client). Good.
- **Scope discipline:** `packagesImpacted` lists only `@warpgogol/site-kernel-checks` — correct. `appsImpacted: []` — correct.

## Axis G — Blind spots

- **Critical: false positives from Programmatic Surface routes (DNA-39).** The check compares `system.md pages[]` routes against `behavior.snapshot.generated.yaml` routes. But per DNA-39, the route registry is a merge of route sources — `system.md pages[]` is one source, the Programmatic Surface is a second. The behavior snapshot captures ALL routes from `dist/client/**/*.html`, including surface-generated virtual routes. The `removedRoutes` direction (snapshot routes not in system.md) will flag every surface-generated route as "in behavior.snapshot.generated.yaml but not declared in system.md" — a false positive on every site using the Programmatic Surface. The check must either: (a) only check the `newRoutes` direction (system.md routes absent from snapshot), or (b) filter committed routes to exclude known surface routes, or (c) compare against the merged route registry instead of just `system.md pages[]`.
- **Performance:** the RFC states "~200ms for typical sites" — reasonable for a YAML parse + set comparison.
- **Edge cases — new app with no committed snapshot:** the RFC handles this (returns skip). Good.
- **Edge cases — i18n routes:** `system.md pages[]` routes include language prefixes (e.g. `/de/impressum/`). The snapshot routes also include language prefixes. The comparison should work correctly as long as both use the same route format. The RFC doesn't verify this explicitly.
- **False-positive rate:** not estimated. Given the surface route issue above, the false-positive rate could be 100% for surface-enabled sites.

## Questions for the author

1. How will the check handle Programmatic Surface routes (DNA-39)? The snapshot includes surface-generated routes that are NOT in `system.md pages[]` — the `removedRoutes` direction will produce false positives on every surface-enabled site. Should the check only compare the `newRoutes` direction, or should it compare against the merged route registry instead of just `system.md pages[]`?
2. Which DNA invariant does this RFC satisfy? `satisfies: []` is empty, but V-24 requires at least one for architecture RFCs created after 2026-07-07. Candidates: DNA-35 (build validation surface) or DNA-48 (release discipline — behavior snapshots are part of the release contract).
3. Should the staleness check be included in `SITES_BUILD_PREPARE_DEV_PIPELINE` (RFC-0597)? The RFC doesn't address this. Given that it's advisory and lightweight (~200ms), it likely should be — but the RFC should state this explicitly.
