---
rfcId: RFC-0508
auditId: AUDIT-RFC-0508-01
date: 2026-07-24
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0508

## Verdict: Needs revision

The RFC is architecturally sound — forward-only, DNA-aligned, no backward compatibility — but has multiple ecosystem-fit findings that undermine implementation accuracy: missing file system responsibilities for three files that import the renamed functions, a `personSchema` that was already removed by RFC-0471, a migrator code sketch that doesn't match the actual `Migrator` interface, and an unexplained `"participant"` semantic page type. The `commands.changed` vs `commands.removed` inconsistency is also significant.

## Mechanical validation (rfc.validate)

**Pass.** `rfc.validate RFC-0508 --json` exits 0 with "All 1 RFC(s) passed validation." One V-30 warning: `@gogol/ontology` is in `packagesImpacted` but `breaksC` is not `true`. This is a warning, not an error — the RFC adds `"participant"` to `semanticPageTypeSchema` (an internal enum in `schemas/system/page-output.ts`), which is not a Layer C external-surface change. `breaksC: false` is likely correct, but the RFC should note that the ontology change is internal-only to suppress the warning's intent.

## Axis A — Structural completeness

**Finding A1 — `commands.changed` vs `commands.removed` inconsistency.** The frontmatter lists `people.validate` under `commands.changed`, but the RFC body says: "`people.validate` is renamed to `participant.validate`. The old command name is removed (no backward compatibility)." A removed command belongs in `commands.removed`, not `commands.changed`. The `changed` bucket is for existing commands whose behavior changes, not commands that are deleted. `apps-check.run` (actually `sites-check.run` — see Finding C5) is correctly listed as `changed` since it gains a new pipeline step.

## Axis B — DNA alignment

**Finding B1 — `personSchema` already removed.** The RFC says: "The `personSchema` is superseded by `participantSchema` — the old schema is removed (no backward compatibility for layer B per RFC-0478)." The file system responsibilities table says: "`personSchema` removed from `packages/share/src/schemas/person.ts`; `PERSON_AFFILIATIONS` retained." However, `personSchema` was already removed from `packages/share/src/schemas/person.ts` by RFC-0471. The current file (`packages/share/src/schemas/person.ts:1-25`) only exports `PERSON_AFFILIATIONS` and `PersonAffiliation` — there is no `personSchema` to remove. The RFC claims to remove something that no longer exists. The file system responsibilities table should be updated to reflect that `person.ts` is unchanged (it already only exports `PERSON_AFFILIATIONS`).

## Axis C — Ecosystem fit

**Finding C1 — Missing file system responsibilities: `resolve-route.ts`.** `packages/share/src/astro/page-handler/resolve-route.ts:39` imports `getPeopleForSection`, `personPageId`, and `PersonView` from `../people.ts`. If these are renamed, this file must be updated. It is not listed in the file system responsibilities table.

**Finding C2 — Missing file system responsibilities: `routes/registry.ts`.** `packages/share/src/astro/routes/registry.ts:15` imports `getPersonProfileRoutes` from `../people-routes.ts`, and line 230 calls it. If the function is renamed to `getParticipantProfileRoutes`, this file must be updated. It is not listed in the file system responsibilities table.

**Finding C3 — Missing file system responsibilities: `people-section.astro`.** `packages/ui/src/sections/people/people-section.astro:22` imports `getPeopleForSection` and `selectPeople`. If these are renamed, this UI component must be updated. It is not listed in the file system responsibilities table.

**Finding C4 — `personPageId` fate ambiguous.** The RFC does not mention whether `personPageId` (in `people-routes.ts:26`) is renamed to `participantPageId` or retained. This function is used in `resolve-route.ts:162`, `people.ts:95-96`, and `people-routes.ts:97`. Its fate must be explicit — either rename it and list all callers, or state that it is retained.

**Finding C5 — `apps-check.run` vs `sites-check.run`.** The `commands.changed` field lists `apps-check.run`, but the actual registered command is `sites-check.run` (the pipeline is `SITES_CHECK_PIPELINE`, registered at `packages/os/site-kernel-checks/src/module.ts:431`). RFC-0200 also used `apps-check.run`, so this may be a legacy alias. The RFC should use the current canonical command name `sites-check.run` or explicitly state that `apps-check.run` is an alias.

**Finding C6 — `"participant"` semantic page type unexplained.** The RFC says to add `"participant"` to `semanticPageTypeSchema` alongside `"person"`. But `"person"` already exists in the enum (`packages/ontology/src/schemas/system/page-output.ts:33`). The RFC doesn't explain when `"participant"` vs `"person"` would be used as a `semanticType` on a page entry. Is `"participant"` for the team hub page (RFC-0509)? For AI-agent profile pages (RFC-0511)? This is unclear and potentially redundant. If `"participant"` is a generalization of `"person"`, should `"person"` be removed (forward-only)?

**Finding C7 — Compass sync not addressed.** The RFC changes shared package contracts (`@gogol/share`, `@gogol/ontology`, `@gogol/site-kernel-checks`) but does not identify which `docs/*.xml` Compass files need synchronization. Root AGENTS.md Compass document duties require this.

**Finding C8 — AGENTS.md updates not addressed.** The RFC does not mention which `AGENTS.md` files need rule updates. `packages/share/AGENTS.md` or `packages/os/site-kernel-checks/AGENTS.md` may need updates to reflect the new participant schema and command.

## Axis D — Forward-only compliance

No issues. The RFC is forward-only: `personSchema` is removed (no backward compatibility), `people.validate` is renamed (no alias), `getPeopleForSection` is renamed (no alias). This aligns with RFC-0478. No compatibility shims or dual-paths proposed.

## Axis E — Agent-facing policy

**Finding E1 — Consent placeholder vs real consent in acceptance criteria.** The acceptance criterion says "Existing Andrii Person records migrated to `participantType: human` with `status: active`, `visibility: public`, `relationshipType: founder`, `consent` record." The migrator adds a consent placeholder with `profileReviewer = slug` (self-reviewed) and `consentDate = file mtime`. This is a temporary state that requires human review. The acceptance criterion should distinguish between "migrator adds placeholder" (agent-verifiable) and "consent record is reviewed and complete" (requires human authoring). The RFC acknowledges this in Risks but the acceptance criterion doesn't reflect the distinction.

## Axis F — Pragmatism

**Finding F1 — Flat schema vs discriminated union.** The `participantSchema` is a single flat `z.object({}).strict()` with all type-specific fields as optional. This means a human record technically allows `aiAgent`, `organizationUnit`, `externalSpecialist`, `partnerOrganization` fields (they're optional, not forbidden). A `z.discriminatedUnion("participantType", [...])` would enforce that type-specific fields are absent for other types, providing stronger type safety. The RFC should justify the flat schema choice or switch to a discriminated union.

**Finding F2 — `consent.approvedFields` path vocabulary undefined.** The failure mode "A `consent.approvedFields` entry that references a non-existent field path" requires a known-good list of valid field paths. The RFC doesn't define this vocabulary. Is `"lifespan.born"` valid? Is `"bio"` valid? Is `"nonexistent"` invalid? The validator needs a known-good list to check against.

**Finding F3 — `temporarily-unavailable` vs `on-leave` semantic overlap.** The status vocabulary includes `temporarily-unavailable` (applies to "all") and `on-leave` (applies to "human" only). The semantic difference for humans is unclear — why would a human be `temporarily-unavailable` vs `on-leave`? This could lead to inconsistent status assignment by agents.

## Axis G — Blind spots

**Finding G1 — Migrator code sketch doesn't match actual interface.** The RFC's migrator sketch uses `migrate: (content) => { ... }` with no `fromVersion`/`toVersion` fields. The actual `Migrator` interface (`packages/os/site-kernel-handoff/src/migrators/types.ts:26-32`) requires `id`, `fromVersion`, `toVersion`, `description`, and `transform: (data: SternsystemData, ctx: MigrationContext) => Promise<SternsystemData>`. The sketch will mislead the implementing agent. Compare with `rfc-0504.ts` for the correct pattern.

**Finding G2 — Pre-migration state not addressed.** The RFC doesn't consider the edge case where `participant.validate` runs before the migrator. If a site has people records without `participantType`, all records fail validation. The rollout says "Phase 0 — Schema + migrator" ships both together, but the RFC should explicitly state that `participant.validate` replaces `people.validate` only after the migrator runs, or that it handles pre-migration records gracefully (e.g., defaults `participantType` to `human` when absent).

**Finding G3 — `apps-check.run` pipeline placement not specified.** The RFC says `participant.validate` "joins `apps-check.run`" but doesn't specify which pipeline step it joins — `SITES_CHECK_AUTHOR_PIPELINE` or `SITES_CHECK_POSTBUILD_PIPELINE`. The existing `people.validate` is in the author pipeline (content validation). The RFC should state the pipeline explicitly.

## Questions for the author

1. `personSchema` was already removed from `packages/share/src/schemas/person.ts` by RFC-0471 — the file only exports `PERSON_AFFILIATIONS`. Should the file system responsibilities table be updated to reflect that `person.ts` is unchanged, and the only schema change is the new `participant.ts` file?
2. `resolve-route.ts`, `routes/registry.ts`, and `people-section.astro` all import the functions being renamed. Should they be added to the file system responsibilities table? Is `personPageId` renamed to `participantPageId` or retained?
3. Why does `semanticPageTypeSchema` need both `"person"` and `"participant"`? When would a page entry use `"participant"` vs `"person"` as its `semanticType`? Should `"person"` be removed (forward-only)?
4. Should `participantSchema` use `z.discriminatedUnion("participantType", [...])` to enforce that type-specific fields are absent for other types? If not, why is the flat schema preferred?
5. What is the valid field path vocabulary for `consent.approvedFields`? How does the validator determine which paths are valid?
6. Should `people.validate` be listed in `commands.removed` instead of `commands.changed`, given that the RFC says the old command name is removed?
