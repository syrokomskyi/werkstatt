---
rfcId: RFC-0808
auditId: AUDIT-RFC-0808-01
date: 2026-08-11
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0808

## Verdict: Needs revision

The RFC is structurally well-formed and architecturally sound, but the proposed profile YAML uses three invariant check kinds (`link-resolution`, `frontmatter-required`, `path-exclusion`) that don't exist in the current `profileInvariantCheckSchema`. The `OrphanReport` TypeScript contract references `NOTE-03` (code exclusion) instead of an orphan-specific rule. The CLI surface uses `forge run <cmd>` but forge has no `run` subcommand. The `scriptDir` implementation note is stale — ADR-0043 already added the field to the schema.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **OrphanReport rule mapping error.** The `OrphanReport` interface (line 272-277) declares `rule: "NOTE-03"`, but NOTE-03 (line 192-196) is "No executable code files in vault/ (scripts go to scripts/ per ADR-0043)". Orphan detection is not covered by NOTE-01..04. Either add a NOTE-05 for orphans, or remove the `rule` field from `OrphanReport` and make it a purely informational report without an invariant reference.
- **`forge doctor` vault check undescribed.** Acceptance criterion (line 354) requires "`forge doctor` reports when the profile is active but `vault/` directory is missing", but the Design section does not describe any changes to the `forge doctor` command. How does `doctor` discover the profile's content directory? The profile declares `workspace.dirs: [vault, scripts, .forge]` — does `doctor` already check workspace dirs for existence? If not, the RFC must describe the implementation or drop the acceptance criterion.
- **workspaceTypes skills don't exist.** The profile YAML (line 173-176) lists `fo-note-create`, `fo-note-link`, `fo-note-refactor` as skills for the `vault` workspace type. These skills are not created by this RFC and don't exist in the forge skill registry. The RFC should either mark them as future skills or remove them from the profile.

## Axis B — DNA alignment

- **DNA-64 reference is tangential but defensible.** DNA-64 establishes the engine/plugin/workshop boundary: stack-specific logic lives in plugins, the engine is stack-agnostic. This RFC adds a Forge profile (governance layer), explicitly NOT a Werkstatt plugin. The RFC explains this correctly in "Architectural fit" (line 118). The connection is that the profile system is the Forge-side counterpart to the plugin system on the engine side — adding a new profile extends the governance layer that DNA-64's boundary relies on. No conflict, but the `satisfies` relationship is indirect: the RFC doesn't enforce or extend DNA-64, it operates within its boundary. Consider whether `satisfies` is the right field vs. `related`.

## Axis C — Ecosystem fit

- **Invariant check kinds not in schema (critical).** The proposed profile YAML defines four invariants with `check.kind` values:
  - NOTE-01: `kind: link-resolution` — NOT in schema
  - NOTE-02: `kind: frontmatter-required` — NOT in schema
  - NOTE-03: `kind: path-exclusion` — NOT in schema
  - NOTE-04: `kind: filename-pattern` — IS in schema ✓

  The `profileInvariantCheckSchema` (in `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/forge/src/profiles/profile-schema.ts:124-141`) only supports: `filename-pattern`, `file-contains`, `file-not-contains`, `attribute-pattern`. Three of four check kinds are new and require a schema extension. The RFC must declare this as a schema extension need in the Design section and add the new check kinds to the `profileInvariantCheckSchema` enum.

- **CLI command pattern wrong.** The CLI surface (line 242-249) shows `pnpm exec forge run note.link.validate --json`, but forge has no `run` subcommand. The correct pattern (verified via `forge --help`) is `pnpm exec forge note.link.validate --json` or `pnpm exec forge <command> --flags`. The `run` prefix is a werkstatt pattern (`werkstatt run <cmd>`), not a forge pattern.

- **Stale `scriptDir` implementation note (line 365).** The RFC says: "The `scriptDir` field in the profile YAML is a new field not yet in the `stackProfileSchema`. Implementation MUST extend the schema to accept `scriptDir?: string` (optional, default `scripts/`)." But `scriptDir` was already added to the schema by ADR-0043 — see `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/forge/src/profiles/profile-schema.ts:306` (`scriptDir: z.string().min(1).optional()`) and `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/forge/src/profiles/stack-profile.ts:76` (`scriptDir: stackProfileDomainFieldsSchema.shape.scriptDir`). This implementation note should be removed or updated to say "already implemented by ADR-0043".

## Axis D — Forward-only compliance

No issues. The RFC is a clean addition — no backward compatibility layers, no dual paths, no legacy maintenance.

## Axis E — Agent-facing policy

- **No NEEDS CLARIFICATION markers.** No unresolved markers found.
- **Status gate respected.** The RFC is in `draft` status and does not contain self-authorizing language. Implementation notes correctly reference the accepted→implemented transition.
- **Anti-fabrication.** Acceptance criteria are code-checkable (profile exists, validators detect fixtures, commands exit non-zero). No content authoring claims.

## Axis F — Pragmatism

- **Three commands for a niche profile.** `note.link.validate`, `note.frontmatter.validate`, `note.orphan.detect` are three new commands for a profile that may have very few initial users. The RFC argues they are opt-in standalone commands. This is defensible — each command has a distinct purpose (link integrity, frontmatter consistency, orphan detection) and cannot be reduced to a flag on an existing command. However, consider whether `note.frontmatter.validate` could be a `--frontmatter` flag on `note.link.validate` to reduce command surface.
- **Lean contracts.** TypeScript types are minimal. The `OrphanReport.inboundLinks: 0` literal type is unusual but semantically correct for orphans.

## Axis G — Blind spots

- **Performance at scale.** The RFC mentions O(n) scan for 100k+ notes (line 338) and proposes a `--path` flag for scoping. This is adequate.
- **Wikilink ambiguity.** The RFC correctly identifies short-form link ambiguity (line 339) and proposes warnings, not errors. Reasonable.
- **Empty state.** What happens when `vault/` is empty or has no `.md` files? The validators should return zero violations, not crash. The RFC doesn't mention this but it's the natural behavior of a glob-based scan.
- **Concurrent execution.** Two agents running `note.link.validate` simultaneously — both read the vault, neither writes. No conflict. Not a concern.

## Questions for the author

1. The proposed profile YAML uses three invariant check kinds (`link-resolution`, `frontmatter-required`, `path-exclusion`) that don't exist in `profileInvariantCheckSchema`. Should the RFC extend the schema with these new check kinds, or should NOTE-01..03 use existing check kinds (e.g. `file-contains` with a custom wikilink pattern, `file-not-contains` for code exclusion)?
2. `OrphanReport` references `rule: "NOTE-03"` but NOTE-03 is about code files in vault, not orphans. Should a NOTE-05 be added for orphan detection, or should `OrphanReport` not reference a NOTE rule at all?
3. The acceptance criterion requires `forge doctor` to report a missing `vault/` directory. What changes to `forge doctor` are needed to support per-profile workspace directory checks, and are they in scope for this RFC?
