---
rfcId: RFC-0510
auditId: AUDIT-RFC-0510-01
date: 2026-07-24
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0510

## Verdict: Needs revision

The RFC's TypeScript contracts and content examples are written against a Participant schema shape (`responsibilities: string[]`, `decisionAuthority: string[]`, `evidenceRefs`, `contributionRefs`) that does not exist in the implemented `participantSchema` — the actual schema uses `responsibility` (singular object), `authority` (singular object), and `evidence` (object with `claims`/`disclosures`). The `controlled-responsibility-block` props contract is also fabricated (`items` prop with `kind` discriminator) — the real archetype uses a `body-split-list` compose with `primaryItems`/`secondaryItems`. These are blocking ecosystem-fit failures that will produce code that does not compile against the real packages.

## Mechanical validation (rfc.validate)

Pass (with 2 warnings):

- **V-19 (warning):** `amends: [RFC-0200]` but RFC-0200's `amendedBy` does not include RFC-0510. Bidirectional reference must be fixed before merging.
- **V-30 (warning):** `@gogol/ontology` is in `packagesImpacted` but `breaksC: false`. The RFC's file system responsibilities table lists no `packages/ontology/src/external-surfaces/` edits — either remove `@gogol/ontology` from `packagesImpacted` or declare `breaksC: true` with a justification.

## Axis A — Structural completeness

- **Missing Output format section.** The CLI surface shows the command invocation but does not document the `--json` output shape. The `participant.profile.validate` rules section lists validation rules but does not show the JSON envelope. RFC-0508 and RFC-0509 both include output format examples.
- **Missing Failure modes section.** The RFC does not specify exit codes or warn-vs-fail behavior for `participant.profile.validate`. Which rules are errors and which are warnings?
- **Rollout lacks new-app compliance.** The rollout describes three phases but does not state what happens for sites with no people records (no-op pass? error?) or how existing sites transition.
- **Acceptance criteria are checkable** but several reference fields that do not exist in the actual schema (see Axis C).

## Axis B — DNA alignment

- **DNA-24 (satisfies):** The profile page is block-declarative — the RFC correctly uses existing archetypes. However, the synthetic page is built in `resolve-route.ts` (not a `pages/*.md` file), which is the existing pattern for virtual routes. This is consistent.
- **DNA-37 (satisfies):** The RFC claims to use the unified `SectionProps` contract. However, the `controlled-responsibility-block` TypeScript contract in the RFC uses a fabricated `items` prop that does not match the actual `SectionProps` / `body-split-list` compose. The claim is correct in intent but the contract is wrong.
- **DNA-38 (satisfies):** The RFC claims canonical item objects from the Participant record. But the actual Participant schema does not have `responsibilities` or `decisionAuthority` as string arrays — it has `responsibility` (object with `summary`/`scope`/`pbpReferences`) and `authority` (object with `canSignFor`/`canCommitTo`/`escalationRoute`). The canonical item objects the RFC references do not exist.

## Axis C — Ecosystem fit

- **FAIL — Participant schema drift (critical).** The RFC references `participant.responsibilities`, `participant.decisionAuthority`, `participant.evidenceRefs`, `participant.contributionRefs`, and `participant.consent` throughout. The actual `participantSchema` at `packages/share/src/schemas/participant.ts:194-242` has:
  - `responsibility` (singular): `{ summary: string, scope?: string, pbpReferences: string[] }` — not `responsibilities: string[]`
  - `authority` (singular): `{ canSignFor: string[], canCommitTo: string[], escalationRoute?: string }` — not `decisionAuthority: string[]`
  - `evidence`: `{ claims: Array<{ claimId, sourceRef, verifiedAt }>, disclosures: Array<{ type, text, url? }> }` — not `evidenceRefs`/`contributionRefs`
  - No `evidenceRefs` or `contributionRefs` fields exist
  - `consent` exists and matches the RFC's shape (consentRecordId, approvedFields, etc.)

  The RFC's `buildHumanProfileBlocks` TypeScript contract (lines 361-442) and the Andrii YAML example (lines 296-332) will not compile/validate against the real schema. The proposed YAML `responsibilities: ["..."]` would fail `participant.validate` because the schema expects `responsibility: { summary: "..." }`.

- **FAIL — `controlled-responsibility-block` props mismatch (critical).** The RFC proposes (lines 133-147):

  ```ts
  { type: "controlled-responsibility-block", props: { items: [{ label: r, kind: "responsibility" }] } }
  ```

  The actual archetype at `packages/ui/src/sections/controlled-responsibility-block/` uses a `body-split-list` compose with `body.primaryItems` / `body.secondaryItems` (each a `StandardListItem` with `text` and `icon` fields). There is no `items` prop, no `kind` discriminator, and no `label` field. The manifest requires `header` and `body` (not `items`). The RFC's Block 2 contract is fabricated.

- **FAIL — `contentRef` fragment anchors do not exist.** The RFC proposes `contentRef: prose/${slug}#beruflich`, `prose/${slug}#nachweise`, `prose/${slug}#persoenlich`. The current `resolve-route.ts` uses `contentRef: prose/${personSlug}` (no fragment). The `content.references.validate` command validates `{collection.file.fieldPath}` brace references, not markdown `#fragment` anchors. There is no mechanism in the page handler or content reference system to extract a specific `##` section from a prose file by fragment. This is a new feature that the RFC does not design.

- **FAIL — `ParticipantView` does not expose the new fields.** The actual `ParticipantView` at `packages/share/src/astro/people.ts:32-54` has `participantType`, `visibility`, `status` but does NOT have `responsibilities`, `decisionAuthority`, `evidenceRefs`, `contributionRefs`, or `consent`. The RFC's `buildHumanProfileBlocks` references `participant.responsibilities`, `participant.decisionAuthority`, `participant.evidenceRefs`, `participant.contributionRefs`, `participant.consent` — none exist on `ParticipantView`. The RFC's file table lists `people.ts` as needing changes to return these fields, but the fields themselves don't exist in the schema.

- **FAIL — `apps-check.run` is not a registered command.** The frontmatter `commands.changed: [apps-check.run, content.references.validate]` references `apps-check.run`, but no such command exists in the command tables or pipeline files. The actual pipeline is `SITES_CHECK_AUTHOR_PIPELINE` (in `pipelines/sites-check-author.ts`). RFC-0508 uses `sites-check.run`; RFC-0510 should use the same naming.

- **FAIL — `participant.profile.validate` not registered in any pipeline.** The RFC says it is "registered in `apps-check.run`" but does not specify which pipeline step (`SITES_CHECK_AUTHOR_PIPELINE`?) or where it sits relative to `participant.validate` and `team.hub.validate`.

- **Breadcrumb parent mechanism underspecified.** The RFC says "finding the `team-hub` page instead of the `about` page" in `getParticipantProfileRoutes`. The actual code at `people-routes.ts:81` finds the parent by `semanticType === "about"`. The team hub page (RFC-0509) uses `semanticType: collection`, not `about`. The RFC must specify: find by `pageId === "team"`? By `semanticType === "collection"`? What happens when both an about page and a team page exist?

- **`@gogol/ontology` and `@gogol/ui` in `packagesImpacted` but no file edits.** The file system responsibilities table lists no edits to `packages/ontology/` or `packages/ui/`. The RFC explicitly says "Does not add new block types — uses existing archetypes." Either remove these from `packagesImpacted` or add the missing file edits.

## Axis D — Forward-only compliance

- **No backward compatibility layer proposed.** The RFC replaces `personSynthetic` with `buildHumanProfileBlocks` — the old two-block structure is removed, not maintained alongside. This is forward-only compliant.
- **`versionBump: minor` without migrator.** Per RFC-0478, `minor` means Breaks-B (requires migrator per RFC-0479). The RFC changes the prose file structure (splitting `prose/${slug}` into `prose/${slug}#beruflich` etc.) and the `contentRef` format. Existing prose files that are not split into sections will break. The RFC does not describe a migrator. Either declare `versionBump: patch` (if no data contract breaks) or include a migrator that splits existing prose files into the required sections.

## Axis E — Agent-facing policy

- **No self-authorizing language.** The RFC is `status: draft` and does not claim implementation permission. Good.
- **Anti-fabrication — content authoring vs code changes.** The acceptance criteria include "Andrii's prose is restructured into `## Beruflich`, `## Nachweise`, `## Persönlich` sections" and "Andrii's Participant record has `responsibilities`, `decisionAuthority`, `evidenceRefs`, `contributionRefs`." These are content changes an agent can make. However, the consent record (`consentRecordId: "andrii-consent-2026-07-24"`, `profileReviewer: "andrii-syrokomskyi"`) is a self-reviewed placeholder — the RFC should note this is a placeholder requiring human review (RFC-0508 does this explicitly).
- **Storage policy — no cookies, no client-side persistence.** Not applicable. Good.

## Axis F — Pragmatism

- **`@gogol/ontology` and `@gogol/ui` in `packagesImpacted` are spurious.** No file edits to these packages are listed. Remove them.
- **`stats` removal is partial.** The RFC removes `stats` from the hero block but the `participantSchema` retains `stats` as an optional field. The RFC should clarify that `stats` remains in the schema for non-profile uses (e.g. home page spotlight) and is only removed from the profile hero.
- **Evidence status labels table is well-designed** but the `evidenceStatus` field does not exist in the actual `evidenceSchema` (which has `claims` with `verifiedAt`, not `evidenceStatus: verified|claimed|unverified`). The labels table maps to a field that doesn't exist.

## Axis G — Blind spots

- **Prose file fragmentation risk.** Splitting a single prose file into three `##` sections means the `contentRef` mechanism must support fragment extraction. If it doesn't (and it currently doesn't), the RFC needs to design this feature or use separate prose files (`prose/${slug}-beruflich`, `prose/${slug}-nachweise`, `prose/${slug}-persoenlich`).
- **Empty states not fully considered.** What happens when a participant has `responsibility` but no `authority`? The `controlled-responsibility-block` expects both `primaryItems` and `secondaryItems`. The RFC says "When `responsibilities` and `decisionAuthority` are both empty or absent, this block is omitted" but doesn't address the case where one is present and the other is empty.
- **Consent withdrawal.** The RFC says the personal block is omitted when consent is absent. But what happens if consent was previously granted and then withdrawn? The prose file still has the `## Persönlich` section — the RFC says "the section may exist in the prose file but is not rendered without consent." This is correct but the validator should check that the rendering path actually suppresses it.
- **Performance.** `participant.profile.validate` scans people records and prose files. For 1-20 participants this is trivial. No performance concern.

## Questions for the author

1. The actual `participantSchema` uses `responsibility` (singular object: `{ summary, scope?, pbpReferences[] }`) and `authority` (singular object: `{ canSignFor[], canCommitTo[], escalationRoute? }`), not `responsibilities: string[]` and `decisionAuthority: string[]`. The RFC's TypeScript contracts and Andrii YAML examples are written against the non-existent flat-array shape. Will you rewrite all contracts and examples against the actual schema, or do you intend to change the schema itself (requiring a separate RFC that supersedes RFC-0508)?

2. The `controlled-responsibility-block` archetype uses `body.primaryItems` / `body.secondaryItems` (split-list body kind with `StandardListItem` objects), not an `items` prop with `{ label, kind }`. How will you map `responsibility.summary` and `authority.canSignFor`/`canCommitTo` into the split-list structure? Will responsibilities be `primaryItems` and authority items be `secondaryItems`?

3. The `contentRef: prose/${slug}#beruflich` fragment anchor mechanism does not exist in the page handler or content reference system. Will you design this feature (and if so, where does the extraction logic live?), or will you use separate prose files per section?

4. `versionBump: minor` implies Breaks-B and requires a migrator (RFC-0478/0479). The prose file restructuring (single file → three `##` sections) and `contentRef` format change will break existing profile pages. Where is the migrator that splits existing prose files?

5. `apps-check.run` is not a registered command. The actual pipeline is `SITES_CHECK_AUTHOR_PIPELINE`. Which pipeline step does `participant.profile.validate` join, and where does it sit relative to `participant.validate` (line 168) and `team.hub.validate` (line 170)?
