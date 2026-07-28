---
rfcId: RFC-0466
auditId: AUDIT-RFC-0466-01
date: 2026-07-20
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: approved
---

# Audit: RFC-0466

## Verdict: Approved

The RFC is structurally complete, DNA-aligned, and forward-only compliant. It correctly mirrors proven legacy patterns from `@gogol/business` and clearly scopes itself as the runtime layer only. Minor findings on ecosystem fit (missing AGENTS.md and Compass sync notes) and pragmatism (appsImpacted listing) are acceptable for approval.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

No issues. All required sections contain real content:

- Decision is a single present-tense statement ("This RFC materializes the runtime layer...").
- CLI surface correctly states "No CLI command. Library-only."
- TypeScript contracts show minimal Zod signatures for envelope and business schema.
- File system responsibilities table names concrete paths in `packages/pbp/src/`.
- Failure modes specify tsc, vitest, Astro build, and loader error behavior.
- Rollout describes immediate impact, no site impact, golden fixtures, and dependency chain.
- Alternatives considered has 4 real alternatives with rejection reasons.
- Risks includes 4 risks with mitigations, including performance and Zod version compatibility.
- Acceptance criteria has 11 checkable items.
- Implementation notes are explicit behavioral rules with RFC references.

## Axis B — DNA alignment

No issues.

- `satisfies: [DNA-1, DNA-20]` — both exist in `docs/architecture-dna.md`.
- DNA-1 (Monorepo boundary): RFC body §Architectural fit states "All schemas, loaders, and collections live in `packages/pbp/`. No site-local schemas." — explains how it enforces DNA-1.
- DNA-20 (Business layer): RFC body states "This RFC does not delete `@gogol/business`. It creates the runtime layer that will eventually replace it (RFC-0470). Both coexist until cutover (RFC-0469)." — explains the coexistence relationship without conflicting with DNA-20's canonicality requirement.
- `related: [DNA-55]` — DNA-55 (Spec vendoring) exists; RFC body references `pbp-specification-package/entity-model` sections, consistent with DNA-55.
- No new DNA invariants established. No conflicts with existing invariants.

## Axis C — Ecosystem fit

Two minor findings:

1. **AGENTS.md updates not identified.** `packages/pbp/AGENTS.md` currently lists only TypeScript interfaces and the critical rule "Sites MUST NOT consume `@gogol/pbp` until RFC-PBP-102." After implementation, the AGENTS.md needs new sections documenting `./schemas`, `./loaders`, `./astro` export paths and the `pbpCollections` wiring pattern. The RFC should identify this as a file to update.

2. **Compass XML sync not identified.** Adding new package exports (`./schemas`, `./loaders`, `./astro`) and a new content directory contract (`src/content/business-profile/`) may require synchronization with `docs/technology.xml` (package exports) and `docs/requirements.xml` (content directory). The RFC should identify which Compass files need updates per root AGENTS.md Compass document duties.

## Axis D — Forward-only compliance

No issues. The RFC creates a new package alongside legacy — not a compatibility shim, bridge, or dual-path. Sites use either `@gogol/business` OR `@gogol/pbp`, never both. Legacy deletion is deferred to RFC-0470, which is the correct sequencing.

## Axis E — Agent-facing policy

No issues.

- Status gate: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." — correct.
- Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation on invariant conflict).
- Anti-fabrication: all acceptance criteria are code changes (schemas, loaders, tests) — no content authoring required.
- Storage policy: N/A — no persistence, cookies, or client-side storage.

## Axis F — Pragmatism

One minor finding:

1. **`appsImpacted` includes `warpgogol-com` prematurely.** The RFC explicitly states "No site imports from `@gogol/pbp` until RFC-0469 (cutover)." Since no site changes happen in this RFC, `appsImpacted` should be empty or the RFC should clarify that the impact is indirect (the RFC creates the runtime that warpgogol-com will eventually consume).

Otherwise: no commands proposed (appropriate for library-only RFC), TypeScript contracts are minimal, existing patterns from `@gogol/business` are explicitly referenced, and `packagesImpacted` lists only `@gogol/pbp`.

## Axis G — Blind spots

One minor finding:

1. **Empty state not considered.** The RFC specifies loader behavior when a required entity is missing ("Loaders throw if a required entity...is missing from the default locale") but does not consider the empty state: what happens when a site has no `src/content/business-profile/` directory at all? The loaders should produce a clear error message (not a crash or undefined behavior) for this case, especially during the transition period when sites have not yet created PBP content.

Otherwise: performance is addressed (caching, 30+ entities vs 12), Zod version compatibility is addressed (pinning same version), and migration path is clear (sites use @gogol/business until RFC-0469).

## Questions for the author

1. The `pbpCollections` definition says `schema: pbpEntitySchema` — will the Astro collection use a Zod discriminated union of all 20+ entity schemas (discriminated by the `schema` field), or just the base envelope? If a union, how is the discriminator wired?
2. The RFC lists `pricing.ts` and `terms.ts` as schema files but marks them "embedded in offering" — are these separate files imported by `offering.ts`, or inline definitions? The file system responsibilities table lists `packages/pbp/src/schemas/` as a directory, but doesn't clarify whether these embedded schemas are separate files.
3. The RFC says `zod` is a "peer dependency — already used by `@gogol/business`" — should it be a direct dependency of `@gogol/pbp` instead, given that `@gogol/business` will be deleted in RFC-0470? A peer dependency on a package that will be deleted could cause issues post-RFC-0470.
