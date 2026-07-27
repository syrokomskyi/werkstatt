---
rfcId: RFC-0501
auditId: AUDIT-RFC-0501-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0501

## Verdict: Needs revision

The RFC defines a clear and well-scoped publication gate for ratgeber articles, but is missing three required sections (Alternatives, Risks, Implementation notes for agents), has decorative `satisfies[]` entries that don't explain how the RFC enforces those DNA invariants, and doesn't distinguish between code changes an agent can make and prose content that requires human authoring. The V-19 amend reciprocity gap and V-30 ontology/breaksC warning must also be resolved.

## Mechanical validation (rfc.validate)

Pass with 5 warnings:

- **V-13**: Missing `## Alternatives considered` section.
- **V-13**: Missing `## Risks` section.
- **V-13**: Missing `## Implementation notes for agents` section.
- **V-19**: `RFC-0501.amends` includes `RFC-0500`, but `RFC-0500.amendedBy` does not include `RFC-0501`.
- **V-30**: `@gogol/ontology` is in `packagesImpacted` but `breaksC` is not `true`. If this RFC modifies `packages/ontology/src/external-surfaces/`, declare `breaksC: true`. Otherwise remove `@gogol/ontology` from `packagesImpacted`.

## Axis A — Structural completeness

- **Missing sections**: `## Alternatives considered`, `## Risks`, `## Implementation notes for agents` are all absent (V-13 warnings). These are required sections per the RFC template.
- **Missing `## Pipeline placement`**: RFC-0500 has an explicit Pipeline placement section naming `build.check` and related validators. RFC-0501 only says "Site-scoped, runs in `build.check`" in the CLI surface section — this should be a dedicated section clarifying whether `ratgeber.article.validate` runs alongside or replaces parts of `article.depth.validate`.
- **Missing `--json` output format**: The CLI surface shows the command invocation but does not document the `--json` output shape. RFC-0500 documents the standard check-command contract (`{ exitCode, summary, diagnostics }`). RFC-0501 should do the same or reference the standard contract.
- **Decision**: Present, clear, present tense — good.
- **TypeScript contracts**: Minimal type signatures — good.
- **File system responsibilities**: Concrete paths listed — good.
- **Failure modes**: Table with rule IDs, severities, and descriptions — good. Exit codes are not documented (RFC-0500 documents `0 = pass, 1 = any error, 2 = only warnings`).
- **Rollout**: Present but step 3 ("Update existing article prose bodies to include the 10-section structure") is content authoring, not a code change — see Axis E.
- **Acceptance criteria**: Checkable but all unchecked. Items mix code-verifiable criteria (validator passes, CTAs render) with content-verifiable criteria (every published article has all 10 sections) — see Axis E.

## Axis B — DNA alignment

- **DNA-16** (Semantic layer shares topology with navigation): The RFC body does not explain how it enforces, protects, or extends this invariant. The RFC is about article structure validation, not semantic layer topology. This entry appears decorative.
- **DNA-24** (Block-declarative pages): The RFC preserves the block-declarative contract (article prose is a markdown `contentRef` block), but doesn't extend or enforce it. "Preserved" is not "satisfied" — the RFC should either explain how it actively enforces DNA-24 or remove this entry.
- **DNA-53** (Semantic fingerprint governance): The RFC introduces no hashing or fingerprinting. This entry is decorative.
- **Recommendation**: Remove all three `satisfies[]` entries or replace them with a meaningful explanation. If the RFC does enforce a DNA invariant, the body must say how.

## Axis C — Ecosystem fit

- **Package boundaries**: OK — validator in `packages/os/site-kernel-checks`, types in `@gogol/surface` and `@gogol/ontology`. No cross-boundary violations.
- **Pipeline placement**: Not formally specified. The RFC should name the correct pipeline (`build.check`) in a dedicated section and justify blocking vs advisory.
- **Compass sync**: The "File system responsibilities" table lists `docs/verification-plan.xml` and `docs/COMMANDS.md` but omits `docs/requirements.xml`, `docs/technology.xml`, and `docs/knowledge-graph.xml` — which RFC-0500 updates for the same scope. A workspace-scoped architectural RFC should sync all relevant Compass files.
- **AGENTS.md updates**: Not mentioned. `packages/os/site-kernel-checks/AGENTS.md` documents `ratgeber-hub-validate.ts` and `bake-ratgeber-article.ts` — it will need a new entry for `ratgeber-article-validate.ts`.
- **Command lifecycle**: `commands.proposed` and `commands.added` both list `ratgeber.article.validate` — internally consistent. `commands.changed` lists `article.depth.validate` and `surface.validate` — these are existing commands being modified. OK.
- **V-30 / `@gogol/ontology`**: The "File system responsibilities" table does not list any `packages/ontology/` file. Either remove `@gogol/ontology` from `packagesImpacted` or add the ontology file being changed (e.g., if the `ArticleType` enum should live in ontology). Same for `@gogol/share` — no share file is listed in the table.

## Axis D — Forward-only compliance

No issues. The RFC amends RFC-0500 directly, proposes no compatibility shims, no dual-path, no legacy code paths behind flags. Clean forward-only design.

## Axis E — Agent-facing policy

- **Missing `## Implementation notes for agents`**: The RFC lacks agent-facing behavioral rules. It should specify: (a) agents MUST run `ratgeber.article.validate` before marking an article as `published`, (b) agents MUST NOT auto-generate article prose bodies — the 10-section structure requires human authoring, (c) agents MUST update `amendedBy` on RFC-0500 to include RFC-0501.
- **Anti-fabrication gap**: Rollout step 3 ("Update existing article prose bodies to include the 10-section structure") and acceptance criteria ("Every published article has all 10 mandatory sections in order", "Type-specific requirements are met") require human content authoring. The RFC must distinguish between code changes an agent can make (validator, baker CTA logic, command registration) and content changes that require human authoring (rewriting prose bodies with 10 sections). The RFC should not imply an agent can implement all acceptance criteria.
- **V-19 amend reciprocity**: `RFC-0500.amendedBy` must be updated to include `RFC-0501`. This is a mechanical fix.
- **Status gate**: No self-authorizing language — good. The RFC does not claim implementation can proceed while draft.

## Axis F — Pragmatism

- **Separate command vs extending existing**: `ratgeber.article.validate` is proposed as a new command, but `ratgeber.hub.validate` (RFC-0500) already validates article fields (RG-HUB-08 checks required fields). The RFC does not consider extending `ratgeber.hub.validate` with article structure rules instead of creating a new command. The missing `## Alternatives considered` section should address this.
- **Scope discipline**: `@gogol/ontology` and `@gogol/share` are listed in `packagesImpacted` but no files from those packages appear in the "File system responsibilities" table. Either remove them or add the concrete files.
- **Redundancy with `article.depth.validate`**: The RG-ART-02 rule (published article < 500 words) duplicates ART-DEPTH-02 in `article-depth.ts` (same 500-word floor). The RFC should clarify: does `ratgeber.article.validate` replace the word count check in `article.depth.validate` for ratgeber articles, or is it redundant? The `commands.changed` list includes `article.depth.validate` — the RFC should explain what changes.

## Axis G — Blind spots

- **Section heading matching**: The validator checks for exact H2 heading strings (e.g., `## Einleitung`). The RFC does not specify whether matching is exact, trimmed, or tolerant of trailing whitespace/attributes (e.g., `## Einleitung {#intro}`). False-positive risk during migration.
- **Third language**: Mandatory sections are defined for DE and UK only. If a third language is added, the validator has no section list for it. The RFC should specify behavior: skip validation for unsupported languages, or fail.
- **Migration path for existing articles**: Existing articles (from RFC-0500 migrator) won't have the 10-section structure. The RFC does not specify whether `ratgeber.article.validate` will block `build.check` until all prose bodies are rewritten, or whether there's a migration window. This is a critical operational gap — the validator could break the build for all existing articles immediately upon implementation.
- **Type-specific requirement detection**: Rules like "decision table with ≥ 3 rows" or "numbered step-by-step guide with ≥ 3 steps" require markdown parsing heuristics. The RFC does not specify the detection algorithm or its false-positive rate. What counts as a "numbered step"? Is `1.` sufficient, or must it be a proper ordered list?
- **Performance**: Not a concern — the validator is O(n) per article with simple string matching. Not mentioned but not a blind spot.

## Questions for the author

1. Why a separate `ratgeber.article.validate` command instead of extending `ratgeber.hub.validate` with article structure rules? The hub validator already checks article fields (RG-HUB-08). What does a separate command earn that a flag or rule group on the existing command does not?
2. What happens to existing published articles that don't have the 10-section structure? Will `ratgeber.article.validate` block `build.check` immediately, or is there a migration window? How many existing articles need manual rewriting before the build passes?
3. How does `ratgeber.article.validate` relate to `article.depth.validate` (ART-DEPTH-02, same 500-word floor)? Does RG-ART-02 replace ART-DEPTH-02 for ratgeber articles, or is it redundant? What specifically changes in `article.depth.validate` (listed in `commands.changed`)?
4. `@gogol/ontology` and `@gogol/share` are in `packagesImpacted` but no files from those packages appear in the "File system responsibilities" table. What changes in those packages? If nothing changes, remove them from the list.
5. The mandatory section headings are defined for DE and UK only. What happens when a third language is added? Does the validator skip that language, or does it fail?
