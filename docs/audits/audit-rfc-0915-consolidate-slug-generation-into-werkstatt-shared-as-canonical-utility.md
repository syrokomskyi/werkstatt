---
rfcId: RFC-0915
auditId: AUDIT-RFC-0915-01
date: 2026-08-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0915

## Verdict: Needs revision

The RFC is structurally complete and aligns well with DNA-53/DNA-74 patterns. However, it leaves a migration gap: the existing `slugify` export from `extract.ts`/`page-utils.ts` is consumed by other code, and the RFC does not clarify whether this export is removed (breaking consumers) or kept as a re-export (compatibility shim, violating forward-only).

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

No issues. All sections contain real content. The Design section replaces the CLI surface with "Module structure" — appropriate for a non-command RFC. TypeScript contracts are minimal. File system responsibilities table names concrete paths. Acceptance criteria are checkable with evidence references. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

- `satisfies: [DNA-53, DNA-74]` — both exist in `docs/architecture-dna.md`. The RFC body explains how it extends the canonical-package pattern from DNA-53 and the sole-ownership pattern from DNA-74. Alignment is clear.
- DNA-88 is referenced as a new invariant established by this RFC. DNA-87 is the current highest number, so DNA-88 is the correct next ID. The RFC's `satisfies[]` does not include DNA-88 — this is correct (it doesn't exist yet), but the RFC should note that DNA-88 will be added to `satisfies[]` (or to a new `establishes[]` field) once the invariant is written into `docs/architecture-dna.md`.
- No conflicts with existing DNA invariants.

## Axis C — Ecosystem fit

- **Package boundaries**: `werkstatt-site` importing from `werkstatt-shared` is correct (packages → packages). No `apps/* → apps/*` or `apps/* → services/*` violations.
- **Pipeline placement**: Not applicable — no new commands.
- **Compass sync**: The RFC identifies `docs/architecture-dna.md` and `packages/werkstatt-shared/AGENTS.md` as needing updates. No `docs/*.xml` synchronization is mentioned — acceptable since this RFC does not change requirements, technology, or development plan.
- **AGENTS.md updates**: mentioned in file system responsibilities.
- **Command lifecycle**: `commands.proposed/added/changed/removed` are all empty — correct for a non-command RFC.

## Axis D — Forward-only compliance

**Finding**: The RFC says `extract.ts` is "Modified — replace custom `slugify()` with `slugId()` re-export" and `page-utils.ts` is "Modified — import `slugId` from `../slug/` instead of `./extract.ts`". But `page-utils.ts` currently re-exports `slugify` from `extract.ts` (line 18-20: `import { slugify } from "./extract.ts"; export { slugify; }`), and `page-utils.ts` uses `slugify(block.heading)` at lines 102 and 118. The RFC does not clarify:
  1. Whether the `slugify` export from `page-utils.ts` is removed entirely (breaking any external consumers importing `slugify` from `@warpgogol/werkstatt-shared/share/semantic/page-utils`).
  2. Whether `slugify` is kept as a re-export of `slugId` (a permanent alias — acceptable if the function signature is identical, but the RFC should state this explicitly).
  3. Whether this is a temporary migration shim (violating forward-only — no indefinite compatibility layers).

The RFC must explicitly state the migration path for existing `slugify` consumers. If `slugify` is removed, all consumers must be updated in the same RFC wave. If `slugify` is kept as a permanent re-export of `slugId`, the RFC should say so.

## Axis E — Agent-facing policy

No issues. Status gate is correct ("Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)"). No self-authorizing language. Implementation notes reference RFC-0224, RFC-0334. No NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

No issues. No new commands — appropriate for a consolidation RFC. TypeScript contracts are minimal. The RFC extends the existing DNA-53 pattern rather than inventing a new one. `packagesImpacted` lists only the two impacted packages. `nonGoals` are explicit and meaningful (no separate package, no replacing github-slugger, no provenance validator).

## Axis G — Blind spots

- **Migration path for `slugify` consumers**: The RFC says "No flag day, no migration period — all changes are internal import-path refactoring with identical external behavior." But replacing `slugify` with `slugId` is a rename, not just an import-path change. Any code importing `slugify` from `@warpgogol/werkstatt-shared/share/semantic/page-utils` or `@warpgogol/werkstatt-shared/share/semantic/extract` will break. The RFC should list all consumers of the current `slugify` export and state whether they are updated in the same wave or whether `slugify` remains as a re-export.
- **Edge cases**: The RFC mentions empty string handling (`slugId("") → "entity"`). Good. But it does not mention `null`/`undefined` inputs — the current `slugify` in `extract.ts` takes `string` (not `string | undefined`), so this is likely fine, but worth confirming.

## Questions for the author

1. Should `slugify` remain as a permanent re-export from `extract.ts`/`page-utils.ts` (aliasing `slugId`), or should it be removed and all consumers updated to import `slugId` from `@warpgogol/werkstatt-shared/share/slug`? If removed, list all consumers that must be updated in the same wave.
2. The `SlugStrategy` interface and `citySlug` function in `werkstatt-site/src/domain/geo/slug.ts` are currently exported. Should `SlugStrategy` be re-exported from `werkstatt-shared/share/slug` for extensibility, or is it internal to the slug module? `citySlug` is used by geo consumers — will it be re-exported or replaced by `slugUrl`?
3. The RFC says DNA-88 is established by this RFC, but `satisfies[]` only lists DNA-53 and DNA-74. Should the RFC's frontmatter include DNA-88 in `satisfies[]` (self-referential), or should it note that DNA-88 will be added to `satisfies[]` after the invariant is written into `docs/architecture-dna.md`?
