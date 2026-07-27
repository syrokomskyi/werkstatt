---
rfcId: RFC-0500
auditId: AUDIT-RFC-0500-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0500

## Verdict: Needs revision

The RFC is architecturally sound, forward-only, and well-structured. However, it has one axis-E failure: the acceptance criteria require creating `surface/article-categories/{lang}/*.md` records, but the RFC never defines the initial category set — an agent cannot fabricate editorial taxonomy. Two additional axis-C gaps (missing Compass sync declarations and AGENTS.md update scope) should be resolved before implementation.

## Mechanical validation (rfc.validate)

Pass with 3 warnings (all expected for a draft RFC):

- **V-12**: `RFC-0500.supersedes includes RFC-0325, but RFC-0325.supersededBy is empty` — implementation notes say to update this; will resolve at implementation time.
- **V-19**: `RFC-0500.amends includes RFC-0193, but RFC-0193.amendedBy does not include RFC-0500` — same.
- **V-19**: `RFC-0500.amends includes RFC-0498, but RFC-0498.amendedBy does not include RFC-0500` — same.

## Axis A — Structural completeness

- **Decision** is present-tense and single: "The ratgeber surface is restructured from a flat topic list into an editorial knowledge hub." Good.
- **CLI surface** shows exact `pnpm exec site-kernel run` invocations with `--site` and `--json` flags. Good.
- **TypeScript contracts** are minimal type signatures (`ArticleRecord`, `ArticleType`, `ArticleCategoryRecord`). Good.
- **File system responsibilities** table names 13 concrete paths. Good.
- **Failure modes** table has 8 rule IDs (`RG-HUB-01`..`RG-HUB-08`) with severity. Good.
- **Rollout** is 10 steps, ordered. Good.
- **Alternatives considered** has 3 real alternatives with rejection reasons. Good.
- **Risks** table has 4 risks with likelihood and mitigation. Good.
- **Acceptance criteria** are 9 checkable items. Good.
- **Implementation notes** are explicit behavioral rules. Good.
- **Finding A-1 (minor):** No "Output format" section documenting the `--json` shape returned by `ratgeber.hub.validate`. The existing validators in the codebase return `{ exitCode, summary, diagnostics[] }` — the RFC should state this explicitly or reference the existing pattern.
- **Finding A-2 (minor):** Failure modes table does not specify exit codes. The existing convention is exit code 1 for errors, 0 for pass-with-warnings. The RFC should state this.

## Axis B — DNA alignment

- **DNA-16 (semantic layer shares topology with navigation):** The RFC changes the hub's `semanticType` from `article` to `collection` and adds `CollectionPage` JSON-LD. This is consistent — the semantic output reflects the page topology (hub = collection, articles = article). The `surface.contract.validate` check is updated. Pass.
- **DNA-24 (block-declarative pages):** The RFC says hub and articles are baked as block-declarative `PageEntry` objects via `bakeRatgeberHub`/`bakeRatgeberArticle`. Article bodies use `contentRef` to `prose/{lang}/ratgeber-{slug}.md`. This preserves the block-declarative contract. Pass.
- **DNA-53 (semantic fingerprint governance):** The RFC declares `versionBump: minor` and notes "semantic hash changes trigger version enforcement." The `topics` → `articles` collection rename is a Breaks-B change requiring a migrator. Consistent. Pass.
- No conflicts with any existing DNA invariant. The RFC does not establish a new DNA invariant.

## Axis C — Ecosystem fit

- **Package boundaries:** New files in `packages/os/site-kernel-checks/src/` (bakers, validator), `packages/surface/src/` (schema), `packages/ontology/` (blueprint, JSON-LD types), `packages/os/site-kernel-handoff/src/migrators/` (migrator). All imports flow `apps → packages` and `packages → packages`. No `apps → apps` or `apps → services` imports. Pass.
- **Pipeline placement:** `ratgeber.hub.validate` in `build.check` (blocking). Correct for a structural validator. Pass.
- **Finding C-1 (minor):** The RFC mentions updating `docs/verification-plan.xml` and `docs/COMMANDS.md` but does not mention `docs/requirements.xml`, `docs/technology.xml`, or `docs/knowledge-graph.xml`. The blueprint schema extension (new `hub` and `statusGate` fields) changes shared package contracts — root AGENTS.md Compass document duties require syncing affected `docs/*.xml` files. The RFC should identify which Compass files need updates.
- **Finding C-2 (minor):** The RFC mentions updating `packages/os/site-kernel-checks/AGENTS.md` (rollout step 9) but does not mention `packages/surface/AGENTS.md` (for the new `BlueprintHubConfig`/`BlueprintStatusGate` types) or `packages/ontology/AGENTS.md` (for the rewritten blueprint and new JSON-LD type policy). These AGENTS.md files document package ownership boundaries and should be updated.
- **Cosmic naming:** The new constellation names `ratgeber-hub` and `ratgeber-article` are referenced in the blueprint. Existing constellation names (`website-pillar`, `website-industry`) are also referenced in blueprints without separate constellation YAML files — they are resolved through `system.md` page plans. The RFC follows this pattern. No cosmic naming issue. Pass.
- **Command lifecycle:** `commands.proposed` and `commands.added` both list `ratgeber.hub.validate`. `commands.changed` lists 5 existing commands. Internally consistent. Pass.

## Axis D — Forward-only compliance

- The RFC explicitly states "No backward compatibility is preserved — the `topics` collection is replaced by the `articles` collection." Clean break. Pass.
- The migrator transforms `topics` → `articles` and drops `sections` (not maintained behind a flag). Pass.
- No compatibility shim, bridge, or dual-path. Pass.
- The `article` block on depth-0 is removed — the hub is no longer a dated article. This is a direct contract change, not a parallel interpretation. Pass.

## Axis E — Agent-facing policy

- **Status gate:** The RFC says "Agents MAY implement code changes only when this RFC has status `accepted`." Correct — no self-authorizing language. Pass.
- **Implementation notes** reference `mission.migrate` for content migration and `rfc.validate` for validation. Correct governance. Pass.
- **Finding E-1 (failure):** The acceptance criteria require "surface/article-categories/{lang}/*.md created with initial categories" and the implementation notes say "Agents MUST create surface/article-categories/{lang}/*.md records for the initial category set." But the RFC **never defines what the initial categories are**. An agent cannot fabricate an editorial taxonomy — it would need to invent category slugs, names, descriptions, and sort orders. The RFC must either (a) declare the initial category set explicitly (slug, name, description, sortOrder per category), or (b) state that the migrator infers categories from existing article slugs and provide the inference rules. The current migrator table says `categoryId` is "Inferred from slug" but does not describe the inference algorithm.
- **Storage policy:** Not applicable — no persistence changes. Pass.

## Axis F — Pragmatism

- **Minimal command surface:** `ratgeber.hub.validate` is a new command, not a flag on `surface.validate`. Justified — the six-block layout check, card standard, category coverage, and commercial claim check are substantial domain-specific logic that would overload `surface.validate`. Pass.
- **Lean contracts:** `ArticleRecord`, `ArticleType`, `ArticleCategoryRecord` are minimal. `BlueprintHubConfig` has 2 fields, `BlueprintStatusGate` has 2 fields. No speculative generality. Pass.
- **Existing patterns:** The baker specialization follows the existing pattern in `bake.ts` (depth-4 city, depth-5 intersection specializations). The migrator follows the existing `rfc-NNNN.ts` pattern. Pass.
- **Scope discipline:** `appsImpacted` lists only `webgogol-com` (correct — ratgeber is only on webgogol-com). `packagesImpacted` lists 6 packages, all genuinely impacted. `nonGoals` are 7 explicit, meaningful items. Pass.

## Axis G — Blind spots

- **Performance:** `ratgeber.hub.validate` scans article records and prose. Currently 2 articles (DE) + 2 (UK) = negligible. Even at 100 articles, this is a trivial file scan. No concern.
- **False positives:** The prohibited commercial result claims check uses whole-word, case-insensitive matching on 5 specific DE/UK phrase pairs. False positive risk is low for these specific phrases. However, the RFC does not describe how to suppress noise during migration if a legitimate article uses one of these phrases in a non-commercial context (e.g., quoting a competitor's claim to debunk it). **Finding G-1 (minor):** Consider adding a suppression mechanism or an exclusion context (e.g., "only check article prose, not FAQ answers that quote competitor claims").
- **Edge cases:** The `minRecordsPerDepth: { 0: 0, 1: 1 }` means the hub can exist with 0 published articles. The "Aktuelle Entscheidungshilfen" and "Neu" blocks would be empty. The RFC does not specify what the baker emits when these blocks have no articles — should they be omitted, or should they render an empty state? **Finding G-2 (minor):** Specify baker behavior for empty editorial blocks.
- **Migration path:** The migrator infers `categoryId` from slug prefix. The RFC acknowledges this as a medium-likelihood risk. The migrator table says `categoryId` is "Inferred from slug" but does not describe the inference algorithm. This is the same gap as Finding E-1.
- **Security/privacy:** Not applicable. No user data, PII, or external services.

## Questions for the author

1. What is the initial category set? The RFC requires agents to create `surface/article-categories/{lang}/*.md` records but never defines the categories (slug, name, description, sortOrder). Should the RFC declare them explicitly, or should the migrator infer them from existing article slugs? If the latter, what is the inference algorithm?
2. How does the `ratgeber-hub` constellation resolve? Existing constellation names like `website-pillar` are referenced in blueprints but have no constellation YAML file — they are resolved through `system.md` page plans. Will `ratgeber-hub` follow the same pattern, or will it need a constellation YAML in `packages/ontology/constellations/`?
3. What does the baker emit when editorial blocks ("Aktuelle Entscheidungshilfen", "Neu", "Grundlagen") have zero matching articles? Should the blocks be omitted, or should they render an empty state?
