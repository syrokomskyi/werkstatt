---
rfcId: RFC-0509
auditId: AUDIT-RFC-0509-01
date: 2026-07-24
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0509

## Verdict: Needs revision

The RFC has solid architectural instincts (authored block-declarative hub, founder retirement, participant filtering) but contains multiple ecosystem-fit failures: a wrong file path for `semanticPageTypeSchema`, an unexplained new `team-hub` semantic type that duplicates the existing `collection` type, a redirect mechanism that ignores the existing `retiredRoutes`/`kind: redirect` patterns, and a redirect target using the outdated `person:` pageId prefix instead of `participant:`. These must be resolved before implementation.

## Mechanical validation (rfc.validate)

Pass with 1 warning:
- **V-19 (warning):** `RFC-0509.amends` includes `RFC-0200`, but `RFC-0200.amendedBy` does not include `RFC-0509`. This is expected — RFC-0200 is in `docs/rfcs/archive/implemented/` and its `amendedBy` field will be updated during implementation. No action needed at draft stage.

## Axis A — Structural completeness

- **Missing "Output format" section.** The RFC does not document the `--json` shape for `team.hub.validate`. The audit template requires this. (RFC line 209–212 shows the CLI invocation but no output shape.)
- **Missing "Failure modes" section.** The RFC lists `team.hub.validate` rules (lines 296–302) but does not specify exit codes or warn-vs-fail behavior. Which rules are errors vs warnings?
- **Decision phrasing.** The Decision section opens with "Create a team hub page…" (imperative mood). Convention prefers present-tense declarative: "The team base segment gains an authored hub page…".

## Axis B — DNA alignment

- **DNA-24 (block-declarative pages):** Correctly explained — the hub is a frontmatter-only page with `blocks[]` using existing archetypes (`hero`, `people`). No issue.
- **DNA-39 (route registry merge):** Mentioned (line 203) but shallow. The RFC says "the route registry merge includes the new authored page alongside the existing virtual profile routes" but does not explain that authored pages enter the merge via `system.md pages[]` (route source 1) while profile routes enter via `getParticipantProfileRoutes()` (route source 2). The merge mechanism is already implemented — the RFC should state that no registry code changes are needed, only a new `system.md` page entry.

## Axis C — Ecosystem fit

- **FAIL — Wrong file path for `semanticPageTypeSchema`.** The file system responsibilities table (line 259) says `packages/ontology/src/schemas/system.ts`. The actual file is `packages/ontology/src/schemas/system/page-output.ts` (extracted by RFC-0303). The RFC-0508 audit and implementation both correctly reference `page-output.ts`. Additionally, the `SemanticPageType` union in `packages/share/src/semantic/models.ts` must be updated in parallel — the RFC does not mention this file.
- **FAIL — `semanticType: team-hub` duplicates existing `collection` type.** The success signal (line 55) says "The hub page emits CollectionPage JSON-LD as the primary type." The existing `collection` semantic type already maps to `["WebPage", "CollectionPage"]` in `packages/share/src/semantic/jsonld/webpage.ts:31-33`. The RFC does not explain why a new `team-hub` type is needed instead of reusing `collection`. If `team-hub` is added, `jsonld/webpage.ts` must be updated to map it to `CollectionPage`, but this file is not in the file system responsibilities. The RFC also does not explain how `team-hub` populates `collectionItems` (required for the `ItemList` JSON-LD node per RFC-0490).
- **FAIL — Redirect mechanism ignores existing patterns.** The RFC proposes a new `redirects:` section in `system.md` (lines 266–273). The system manifest schema already has two redirect-adjacent mechanisms: (1) `retiredRoutes` (RFC-0487, `system/manifest.ts:439`) for 410 Gone tombstones, and (2) `kind: redirect` page entries (`page-entry.ts:153-157`) for language-root redirects. The RFC does not acknowledge either. Adding a `redirects` field to `systemManifestSchema` is a schema change not listed in the file system responsibilities. The RFC should either extend `retiredRoutes` to support 301 status or use a `kind: redirect` page entry.
- **FAIL — `commands.changed` lists `routes.generate` without explanation.** The RFC body does not describe any change to `routes.generate`. The team hub is an authored page registered in `system.md` — it enters the route registry via the existing `pages[]` merge, not via `routes.generate`. If `routes.generate` needs changes, the RFC must explain what and why.
- **FAIL — `commands.changed` lists `content.references.validate` without explanation.** The RFC body does not describe any change to `content.references.validate`. If the redirect target `participant:andrii-syrokomskyi` needs reference validation, the RFC must explain the change.
- **Compass sync not addressed.** The RFC changes `semanticPageTypeSchema` (a shared ontology contract) and adds a new system manifest field (`redirects`). Root AGENTS.md Compass duties require identifying which `docs/*.xml` files need synchronization. The RFC does not mention any Compass updates.
- **AGENTS.md updates not addressed.** If `team-hub` becomes a new semantic type, `packages/ontology/AGENTS.md` may need updating. The RFC does not address this.

## Axis D — Forward-only compliance

No issues. The `founder` page is deleted (not kept behind a flag), the redirect is 301 (not a compatibility shim), and no backward compatibility layers are proposed.

## Axis E — Agent-facing policy

- **FAIL — Redirect target uses outdated `person:` prefix.** The RFC proposes `to: person:andrii-syrokomskyi` (line 271). RFC-0508 renamed `personPageId` to `participantPageId` — the pageId format is now `participant:andrii-syrokomskyi` (see `packages/share/src/astro/people-routes.ts:28`). The redirect target must be `participant:andrii-syrokomskyi`. Using `person:` would fail at runtime because the route registry no longer registers `person:` pageIds.
- **No self-authorizing language.** The RFC is `status: draft` and does not grant implementation permission. No issue.
- **DE content not provided.** The RFC provides the full UK YAML for the hub page (lines 115–172) but not the DE version. The acceptance criteria require `pages/{de,uk}/team.md`. The DE content (hero text, section headings, subheadings) requires human authoring or at least a DE YAML example. The RFC should either provide both language examples or explicitly note that DE content is authored during implementation.

## Axis F — Pragmatism

- **`PeopleSelect` extension already implemented.** The RFC proposes extending `PeopleSelect` with `participantType`, `status`, `visibility` (lines 177–190, 258) as new work. However, RFC-0508 already added these fields and the `selectPeople` function already implements the filtering (see `packages/share/src/astro/people.ts:156-189`). The file system responsibilities table lists this as a new edit, but the code is already in place. The RFC should acknowledge that RFC-0508 shipped this extension and remove it from the file system responsibilities (or clarify what additional work is needed beyond what RFC-0508 already did).
- **`team.hub.validate` earns its existence.** The validator enforces structural rules specific to the team hub (4 blocks, participant type filters, founder absence, navigation entry). This is not a flag on an existing command. No issue.
- **`semanticType: team-hub` vs `collection`.** (See Axis C.) If `collection` is reused, no new semantic type is needed — less schema churn. If `team-hub` is justified, the RFC must explain the semantic distinction.

## Axis G — Blind spots

- **Empty section heading suppression.** The RFC says "the section renders nothing — no heading, no empty state" (line 194). The `people` section component (`packages/ui/src/sections/people/people-section.astro`) may render a heading even when `selectPeople` returns zero participants. The RFC should verify this behavior or specify that the section component must suppress the heading when the filtered list is empty. This may require a change to `people-section.astro` not currently listed in the file system responsibilities.
- **Breadcrumb trail.** The success signal says "breadcrumb trail Home → Team" (line 55). The RFC does not specify `parentPageId` for the team hub page. Without `parentPageId`, the breadcrumb is flat `Home → Team` (which is what's wanted), but this should be explicit in the `system.md` page entry.
- **UK locale in url-schema.yaml.** The existing `url-schema.yaml` only uses `enum: [de, en]` for locale params. The RFC proposes `enum: [uk]` for the `/komanda` pattern (line 291). This is a new locale enum value not present in the existing schema. The RFC should verify that the url-schema.yaml schema supports per-pattern locale enums or document what schema change is needed.
- **`collectionItems` for JSON-LD.** If `collection` or `team-hub` semantic type is used, `SemanticPageModel.collectionItems` drives the `ItemList` JSON-LD node. The RFC does not explain how the hub populates `collectionItems` — are they the participant profile URLs? The RFC should specify this or clarify that the hub emits `CollectionPage` without an `ItemList`.

## Questions for the author

1. Why `semanticType: team-hub` instead of reusing the existing `collection` type which already maps to `CollectionPage` JSON-LD? If `team-hub` is needed, how does it map to `CollectionPage` in `jsonld/webpage.ts`, and why isn't that file in the file system responsibilities?
2. The redirect target is `person:andrii-syrokomskyi`, but RFC-0508 renamed `personPageId` to `participantPageId`. Should the target be `participant:andrii-syrokomskyi`?
3. The system manifest schema already has `retiredRoutes` (RFC-0487, for 410 Gone) and `kind: redirect` page entries (for language-root redirects). Why a new `redirects:` section instead of extending `retiredRoutes` to support 301 or using a `kind: redirect` page entry?
4. `PeopleSelect` already has `participantType`, `status`, `visibility` fields (added by RFC-0508, `people.ts:156-189`). Why does this RFC list it as a new extension in the file system responsibilities?
5. `commands.changed` lists `routes.generate` and `content.references.validate` — what specific changes do these commands need, and why?
6. Where is the DE version of the team hub page content? The RFC provides only the UK YAML. Will the DE content be authored during implementation, or should the RFC provide both?
