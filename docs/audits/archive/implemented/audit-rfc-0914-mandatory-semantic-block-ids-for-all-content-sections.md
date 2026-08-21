---
rfcId: RFC-0914
auditId: AUDIT-RFC-0914-01
date: 2026-08-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0914

## Verdict: Needs revision

The RFC has a solid architectural direction (mandatory block ids, anchor registry removal), but contains factual errors about the command surface (`onboarding.scaffold` was removed by RFC-0532), conceptual confusion about which content types have `blocks[]`, insufficient acknowledgment of existing validators that already check block ids, and a `versionBump` that understates the breaking change. The `supersedes` field is empty despite superseding RFC-0048's anchor registry.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate --id RFC-0914` reports 0 violations.

## Axis A — Structural completeness

- **`onboarding.scaffold` does not exist.** The RFC lists `onboarding.scaffold` in `commands.changed` (line 50) and acceptance criteria (line 270). However, `onboarding.scaffold` was **removed** by RFC-0532 (see `packages/werkstatt-site/src/onboarding/module.ts:15`). The onboarding module now registers `onboarding.synthesize` instead. The RFC must update its `commands.changed` list and acceptance criteria to reference the correct command or mechanism (likely the materialization pipeline in `mission.materialize` or the plugin's `scaffoldProject` hook).

- **"All content types" claim is architecturally unclear.** The Decision (line 108) says "Every block in every content type (pages, prose, business-profile, faq) MUST have a stable, language-neutral `id` field." The file system responsibilities table (lines 178–181) lists `prose`, `business-profile`, and `faq` as scanned directories. However, only `PageEntrySchema` has a `blocks[]` array (`packages/werkstatt-shared/src/ontology/schemas/page-entry.ts:185`). Prose files are markdown bodies with H2 headings — they don't have frontmatter `blocks[]`. Business-profile and FAQ have their own entity schemas without `blocks[]`. The RFC must either: (a) clarify that only pages have `blocks[]` and the "all content types" language is aspirational, or (b) explain how block ids apply to prose/business-profile/faq content that doesn't use the block-declarative model.

- **Output format JSON is malformed.** The JSON example (lines 190–218) is missing the closing `}` for the root object. The `"nextSteps"` array closes with `]` but the root object never closes.

- **TypeScript contracts reference undefined types.** `BlockIdValidationResult` (line 150) uses `Diagnostic[]` and `NextStep[]` but doesn't import or specify where they come from. Per RFC-0852, `Diagnostic` is owned by `@warpgogol/werkstatt/schemas`. The contracts should reference the canonical import path.

## Axis B — DNA alignment

- **`supersedes` is empty but RFC-0048 anchor registry is superseded.** The RFC body (lines 90, 100, 116, 243, 259) repeatedly states that the RFC-0048 `anchors` registry is superseded. Yet `supersedes: []` (line 20) is empty. If this RFC removes the anchor registry from `system.md` and simplifies `resolveAnchorFragment`/`resolveSectionAnchor`, it is superseding part of RFC-0048. The RFC should either list RFC-0048 in `supersedes[]` (if the anchor registry is a core part of RFC-0048) or in `amends[]` (if it's changing part of RFC-0048's contract). Leaving both empty is a governance gap — `rfc.validate` may not catch this, but the supersede relationship is semantically required for traceability.

- **DNA-11 should be in `satisfies[]`.** The RFC body (line 114) says "Mandatory block ids strengthen language mirroring." DNA-11 (language mirroring) is in `related[]` (line 25) but not `satisfies[]` (line 34). If the RFC extends/strengthens DNA-11, it should be in `satisfies[]` with an explanation in the body of how it enforces or extends the invariant.

## Axis C — Ecosystem fit

- **Existing validators already check block ids.** `page.blocks.extract.validate` (`packages/werkstatt-site/src/checks/page-blocks-validate.ts:104-108`) already checks for missing block ids. `page.block.validate` (`packages/werkstatt-site/src/checks/page-block.ts:274-285`, rule B-05) already checks for duplicate block ids within a page. The RFC proposes a new `block.id.validate` command that duplicates both checks. The RFC does not acknowledge these existing validators. It should either: (a) extend `page.blocks.extract.validate` to add format validation (`BLOCK-ID-INVALID`) and keep the existing missing-id check there, or (b) justify why a separate command is needed instead of extending the existing ones. Three validators checking block ids (existing two + new one) is fragmented.

- **`content-links.ts` uses the anchor registry.** `packages/werkstatt-site/src/checks/content-links.ts:169-183` has a `resolveAnchor()` function that resolves anchor ids through the `AnchorRegistry`. The RFC mentions updating `resolveAnchorFragment` and `resolveSectionAnchor` in `anchors.ts` but does not mention `content-links.ts`, which is another consumer of the anchor registry. If the registry is removed, `content-links.ts` must also be updated.

- **`systemManifestSchema` does not have `anchors`.** The RFC (line 285) says "Agents MUST remove the `anchors` map from `system.md` content and from the `systemManifestSchema` (or its local view)." However, `systemManifestSchema` in `packages/werkstatt-shared/src/ontology/schemas/system/manifest.ts` does **not** have an `anchors` field. The `anchors` field exists only in the local view interfaces (`SystemRoutesView` in `registry.ts:133`, `LocalizedRouteEntry` in `registry.ts:33`). The RFC should correct this to reference the local view in `registry.ts`, not the schema.

- **CLI flag convention inconsistent.** The RFC uses `--app warpgogol-com` (line 130) but the convention in the codebase is `--site` (per RFC-0901: `--site warpgogol-com`). Existing validators like `page.block.validate` have `scope: "app"` with no explicit `--app` flag — they resolve the site from kernel context. The `--all` flag (line 131) is non-standard. The RFC should align with the actual command registration pattern.

- **AGENTS.md updates not detailed.** The acceptance criteria (line 274) mention updating `AGENTS.md` but the design section doesn't specify which `AGENTS.md` files need updates (root, `packages/werkstatt-site/`, site-specific). RFC-0901 provides a detailed "AGENTS.md updates" subsection — this RFC should follow the same pattern.

- **Compass sync not addressed.** The RFC changes repository-wide requirements (mandatory block ids) and the `system.md` contract (removing `anchors`). Per root AGENTS.md Compass document duties, the RFC should identify which `docs/*.xml` files need synchronization. RFC-0901 includes a "Compass sync" subsection — this RFC should too.

## Axis D — Forward-only compliance

No issues. The RFC is cleanly forward-only: removes the `block-N` fallback, removes the `anchors` registry, no compatibility shims, no dual paths. The migration step (`block.id.generate` before removing fallback) is a one-time migration, not a grace period.

## Axis E — Agent-facing policy

- **`reviewers: []` is empty.** Before transitioning to `implemented`, at least one reviewer must be added (V-25 rule). This is informational for `draft` status but must be addressed before implementation.

- **No `NEEDS CLARIFICATION` markers.** Good.

- **Implementation notes correctly reference RFC-0334** for supersede escalation and RFC-0224 for accepted→implemented transition.

## Axis F — Pragmatism

- **`block.id.validate` overlaps with two existing validators.** As noted in Axis C, `page.blocks.extract.validate` already checks missing ids and `page.block.validate` already checks duplicate ids (B-05). The RFC should extend these existing validators rather than creating a third command. The only new check is format validation (`BLOCK-ID-INVALID` — `/^[a-z0-9]+(-[a-z0-9]+)*$/`), which could be a one-line addition to `page.blocks.extract.validate`. `block.id.generate` is genuinely new and earns its existence as a migration tool.

- **"All content types" scope is over-engineered.** Extending block id validation to prose, business-profile, and faq — which don't have `blocks[]` — is either unnecessary (these content types don't have blocks) or requires a much larger architectural change (extending the block-declarative model to these types). The RFC should scope to pages only, which is where `blocks[]` exists.

## Axis G — Blind spots

- **`resolveSectionAnchor` mechanism after registry removal.** The RFC says `resolveSectionAnchor` should "use block id directly as HTML id" but doesn't specify how section components obtain the block id. Currently, `resolveSectionAnchor` reads `pageOverride.anchorId` from section props (`anchors.ts:70-71`). If the anchor registry is removed, what field in the section props carries the block id? Is it `block.id` passed through `pageOverride`? The RFC should specify the prop flow: how `block.id` from frontmatter reaches the section component's `id` attribute.

- **`UNIVERSAL_BLOCK_PROPS` includes `anchorId`.** `packages/werkstatt-site/src/checks/page-block.ts:54` lists `anchorId` as a universal block prop ("RFC-0048: stable anchor id for resolveSectionAnchor, not a section prop"). If the anchor registry is removed and block ids serve as anchors directly, `anchorId` as a universal block prop may need to be removed or repurposed. The RFC doesn't address this.

- **`versionBump: patch` understates the breaking change.** The RFC removes the `block-N` fallback (breaking for content without ids), removes the `anchors` map from `system.md` (breaking for system.md schema consumers), and changes `resolveSectionAnchor` behavior (breaking for section components). Per RFC-0478, `patch` means "safe" and `minor` means "Breaks-B, requires migrator." This RFC requires a migrator (`block.id.generate`) and breaks existing content — it should be `versionBump: minor`.

- **Prose heading-derived ids not addressed.** `extractContentBlocks` in `build-page.ts:143` handles frontmatter blocks, but prose files use `extractAnswerBlocksFromMarkdown` which generates ids from H2 headings via slugification. The RFC doesn't explain how `block.id.validate` checks prose content — does it validate the slugified heading ids? Are these ids stable across locales? This is a gap if the RFC truly intends to cover "all content types."

- **Performance cost not specified.** `block.id.validate` scans all content files across all locales. The RFC should specify the expected file count and I/O pattern, similar to how RFC-0901 estimates O(N×L).

## Questions for the author

1. **Which content types actually have `blocks[]`?** Only `PageEntrySchema` has a `blocks[]` array. Prose, business-profile, and faq use different schemas. Should the RFC scope to pages only, or does it propose extending the block-declarative model to other content types?
2. **Why a new `block.id.validate` command instead of extending `page.blocks.extract.validate`?** The existing validator already checks missing ids. The existing `page.block.validate` checks duplicate ids (B-05). The only new check is format validation. Could this be a one-line addition to the existing validator?
3. **How does `block.id` from frontmatter reach the section component's HTML `id` attribute after the anchor registry is removed?** What replaces `pageOverride.anchorId` in the prop flow? Does `block.id` become a universal block prop that section components read directly?
4. **Should RFC-0048 be in `supersedes[]`?** The RFC removes the anchor registry established by RFC-0048. What is the correct governance relationship — supersede, amend, or neither?
5. **Should `versionBump` be `minor` instead of `patch`?** The RFC requires a migrator (`block.id.generate`) and breaks existing content without ids. Per RFC-0478, this is Breaks-B.
