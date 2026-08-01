---
rfcId: RFC-0620
auditId: AUDIT-RFC-0620-01
date: 2026-07-31
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0620

## Verdict: Needs revision

The RFC correctly identifies a real problem (workspace-absolute generated files leaking into the workpiece via unfiltered `public/` copy) and proposes a sound, self-maintaining solution (ownership-map-driven filter). However, the TypeScript contract uses an import path that is not resolvable with the current package exports map, and the file system responsibilities table contradicts `packagesImpacted` by listing `@warpgogol/site-kernel-checks` as "Read-only" when the package must be modified to expose `GENERATOR_OWNERSHIP_MAP` for cross-package import.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0620 --json` returns zero violations.

## Axis A — Structural completeness

**Finding A-1: TypeScript contract import path is not resolvable.** The RFC proposes:

```ts
import { GENERATOR_OWNERSHIP_MAP } from "@warpgogol/site-kernel-checks/generator-ownership";
```

The `package.json` exports map for `@warpgogol/site-kernel-checks` (lines 8–49) does not include a `./generator-ownership` subpath. `GENERATOR_OWNERSHIP_MAP` is exported from `src/generator-ownership.ts` but is NOT re-exported from `src/index.ts` (the main entry point). No other package currently imports `GENERATOR_OWNERSHIP_MAP` cross-package — all 76 usages are internal to `site-kernel-checks`. The implementation must either add a `./generator-ownership` subpath to the exports map or re-export from `src/index.ts`. The TypeScript contract should reflect the actual import path that will be used.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-47]` is correct — the RFC protects the materialization invariant by ensuring only authored content and site-relative generated files enter the workpiece. `related: [DNA-44, DNA-47, RFC-0473, RFC-0568, RFC-0597]` are all relevant and correctly explained in the "Architectural fit" section. No conflicts with existing DNA invariants.

## Axis C — Ecosystem fit

**Finding C-1: File system responsibilities table contradicts `packagesImpacted`.** The table lists `packages/os/site-kernel-checks/src/generator-ownership.ts` as "Read-only — source of `GENERATOR_OWNERSHIP_MAP`". However, to make `GENERATOR_OWNERSHIP_MAP` importable from `@warpgogol/site-kernel-handoff`, the `site-kernel-checks` package must be modified (either `package.json` exports map or `src/index.ts` re-export). This means the package is NOT read-only — it requires a change to expose the export. The `packagesImpacted` list correctly includes `@warpgogol/site-kernel-checks`, but the responsibilities table should reflect that a package-level export change is needed, not "Read-only".

## Axis D — Forward-only compliance

No issues. The RFC replaces the existing hardcoded point-removal hotfix (lines 782–797 of `mission-materialize.ts`) with the ownership-map-driven filter. The old code is deleted, not maintained behind a flag. No compatibility shim or dual-path.

## Axis E — Agent-facing policy

No issues. The RFC is `draft` with no self-authorizing language. Implementation notes correctly reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). No content authoring involved. No storage policy changes.

## Axis F — Pragmatism

**Finding F-1: `packagesImpacted` is correct but responsibilities table is misleading.** See Finding C-1 — the package IS impacted (needs export changes), but the table says "Read-only". This is a documentation inconsistency, not an over-scoping issue. The approach itself is pragmatic: it reuses the existing `GENERATOR_OWNERSHIP_MAP` instead of creating a new data structure, and the filter is self-maintaining (new workspace-absolute generators are automatically excluded).

## Axis G — Blind spots

No issues. Performance is addressed (O(1) per file, 2 entries currently). False positives are discussed (extremely unlikely because workspace-absolute paths represent generated artifacts, not authored content). Edge cases (empty map, new entries, glob patterns) are documented. The glob pattern limitation is honestly stated as a future concern.

## Questions for the author

1. How will `GENERATOR_OWNERSHIP_MAP` be imported from `@warpgogol/site-kernel-checks`? Will you add a `./generator-ownership` subpath to the package.json exports map, or re-export from `src/index.ts`? The TypeScript contract should use the actual import path.
2. The file system responsibilities table says `site-kernel-checks` is "Read-only", but the package needs an export change to support the cross-package import. Should the table be updated to reflect the actual change needed?
3. The existing hotfix (lines 782–797) removes bordbuch files AFTER the copy. The RFC proposes filtering DURING the copy. Will the `copyDir` function be modified to accept a filter callback, or will the filter be applied as a separate pass before/after `copyDir`?
