---
rfcId: RFC-0372
auditId: AUDIT-RFC-0372-01
date: 2026-07-10
auditor:
  skill: wg-idea-audit
  model: claude-sonnet-4-20250514
verdict: approved
---

# Audit: RFC-0372

## Verdict: Approved

The RFC correctly identifies the root cause (home page special casing bypassing the extractor registry) and proposes a clean forward-only unification that aligns with DNA-16 and DNA-25. Axes B, D, and E pass without issues. Minor findings on axes C, F, and G require attention before implementation but do not undermine the RFC's core design.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

No issues. All required sections contain real content. Decision is in present tense ("The semantic block projection system is unified…"). CLI surface, TypeScript contracts, file system responsibilities, output format, failure modes, rollout, alternatives, risks, and acceptance criteria are all substantive. Implementation notes are explicit behavioral rules with MUST/MAY language.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-16, DNA-25]` — both are real invariants in `docs/architecture-dna.md`. The RFC body explains **how** it enforces each:

- DNA-16 (semantic layer shares topology): the unified `blocks` array ensures the semantic projection reads from the same block topology as the rendered page, eliminating the divergent home-specific model.
- DNA-25 (single `buildPage` pipeline): the RFC extends the single-pipeline principle to the semantic projection layer — one `buildSemanticPageModelWith()` path for all page types.

No new DNA invariant is established. No conflicts with existing DNA invariants. `related[]` references (DNA-16, DNA-24, DNA-25, RFC-0142, RFC-0143, RFC-0320) are relevant and not decorative.

## Axis C — Ecosystem fit

**Finding C-1 (command lifecycle inconsistency).** The `commands` frontmatter lists `page.blocks.validate` in **both** `changed` and `removed`:

```yaml
changed:
  - page.markdown.generate
  - page.blocks.validate      # ← also in removed
removed:
  - page.blocks.validate      # ← also in changed
```

This is contradictory. The RFC body says the command is **renamed** to `page.blocks.extract.validate`. It should appear in `removed` only (and `page.blocks.extract.validate` is correctly in `added`). `rfc.validate` did not catch this — it is a semantic inconsistency, not a structural one.

**Finding C-2 (Compass sync not mentioned).** The RFC changes `SemanticPageModel`, a shared package contract in `@gogol/share`. Root AGENTS.md Compass document duties require updating affected `docs/*.xml` files when shared package contracts change. The RFC does not identify which Compass files need synchronization (`docs/requirements.xml`, `docs/technology.xml`, or `docs/verification-plan.xml` may be affected if they reference the semantic model shape).

**Finding C-3 (AGENTS.md updates not mentioned).** The RFC changes the semantic projection contract in `packages/share`. `packages/AGENTS.md` documents the `share` package responsibilities and the cosmic-name maps. While the RFC doesn't change cosmic naming, it does change the `SemanticPageModel` shape that `packages/share/src/semantic/` exports. The RFC should identify whether `packages/AGENTS.md` or `packages/share/AGENTS.md` need rule updates.

## Axis D — Forward-only compliance

No issues. The RFC explicitly states "No backward compatibility" and "No deprecation path." Legacy code paths (`buildHomePageSemantic`, `createHomeAnswerBlocks`, `extractMarkdownProps`, `SemanticAnswerBlock`, `SemanticContentBlock`, `answerBlocks`, `contentBlocks`, `bodyText`) are deleted in the same change, not maintained behind a flag. The old `page.blocks.validate` command name is removed, not kept alongside the new one.

## Axis E — Agent-facing policy

No issues. The RFC contains proper status gate language: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation on invariant conflict). No self-authorizing language. No content authoring in acceptance criteria — all criteria are code changes an agent can verify. No cookies or persistence touched.

## Axis F — Pragmatism

**Finding F-1 (command rename churn).** The RFC renames `page.blocks.validate` to `page.blocks.extract.validate`. The rename is not strictly necessary — the existing command could be strengthened in-place with the same auto-discovery logic. The rename forces updates to: command table (`command-tables/09-build-artifacts.ts`), generated baselines (`kernel-flags-lint.baseline.generated.json`, `check-fixture-lint.baseline.generated.json`), and pipeline registration. This is manageable churn, but the RFC should justify why a new name earns its cost over extending the existing command. The alternatives section does not address this.

**Finding F-2 (page.markdown.generate in `changed`).** The RFC lists `page.markdown.generate` in `changed`, but the RFC body says "no changes to command interface; output is richer because `blocks` is now complete." The command code itself doesn't change — only the model it consumes changes. This is borderline; the command's observable behavior changes (richer output) but its interface doesn't. Consider whether this belongs in `changed` or whether it should be noted as an indirect effect.

## Axis G — Blind spots

**Finding G-1 (generated baselines not mentioned).** Two generated baseline files contain the string `page.blocks.validate`:

- `packages/os/site-kernel-checks/src/kernel-flags-lint.baseline.generated.json` (line 248)
- `packages/os/site-kernel-checks/src/check-fixture-lint.baseline.generated.json` (line 128)

Renaming the command requires regenerating these baselines. The RFC does not mention this. An implementer who forgets to regenerate will see false-positive lint failures.

**Finding G-2 (article-depth adaptation underspecified).** The RFC says "ART-DEPTH-02/03 read from `page.blocks` instead of `bodyText`." The actual code in `article-depth.ts` is more complex:

- `ART-DEPTH-02` (line 213) counts words from `model.bodyText` AND `model.contentBlocks` separately (line 214: `for (const block of model.contentBlocks ?? [])`).
- `ART-DEPTH-03` (line 229) calls `findThinSections(model.bodyText)`, which parses raw H2 headings from the prose body string.

After migration, `findThinSections` must scan `SemanticBlock[]` for prose-derived entries (`blockType: "prose"`) with a heading but no `body` or `facts`. The function signature changes from `(bodyText: string | undefined)` to `(blocks: SemanticBlock[])`. The RFC's Risks section mentions this briefly but the File system responsibilities table entry is insufficient — it should note that `findThinSections` requires a signature change, not just a data-source swap.

**Finding G-3 (page-blocks-mirror.ts distinction).** `page.blocks.mirror.validate` (RFC-0205) uses `PageEntry.blocks` (frontmatter blocks), not `SemanticPageModel.blocks`. The RFC should explicitly state that `page.blocks.mirror.validate` is unaffected by the `SemanticPageModel` unification, to prevent implementer confusion.

**Finding G-4 (performance cost not specified).** The strengthened `page.blocks.extract.validate` scans all page frontmatter in all apps. The RFC does not specify the scan cost (file count, I/O patterns). The current validator already scans frontmatter, so the cost is unchanged, but the RFC should state this explicitly.

## Questions for the author

1. Should `page.blocks.validate` remain in `changed` when it is also in `removed`? If the command is being renamed (not changed in-place), remove it from `changed` and keep it in `removed` only.
2. Which `docs/*.xml` Compass files reference the `SemanticPageModel` shape and need synchronization when `answerBlocks`/`contentBlocks`/`bodyText` are replaced by `blocks`?
3. Does the `page.blocks.extract.validate` rename earn its churn cost (baselines, command tables, pipelines) over simply strengthening the existing `page.blocks.validate` in-place?
