---
rfcId: RFC-0497
auditId: AUDIT-RFC-0497-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0497

## Verdict: Needs revision

The RFC addresses a real and well-identified problem (Cartesian depth-5 generation creating doorway/scaled-content abuse risk), but is missing 6 required sections (V-13), does not register a migrator despite `versionBump: minor`, lacks a migration path for existing depth-5 pages, and has no implementation notes for agents — all critical gaps before implementation can proceed.

## Mechanical validation (rfc.validate)

**Pass with warnings.** 7 violations, all severity `warning`:

- **V-13** (×6): Missing required sections: "Architectural fit", "Design", "Rollout", "Alternatives considered", "Risks", "Implementation notes for agents".
- **V-19**: `amends` includes RFC-0238, but RFC-0238.amendedBy does not include RFC-0497. (RFC-0238 is in `docs/rfcs/archive/implemented/` — the `amendedBy` field must be added there.)

## Axis A — Structural completeness

**Fail.** 6 required sections are missing (V-13 warnings confirm this):

- **Architectural fit** — absent. The RFC does not explain how it relates to DNA-24, DNA-53, RFC-0192/0193, RFC-0238, RFC-0478, RFC-0479, RFC-0480, or the sibling RFCs (0492/0494/0495/0496). Related RFCs (0492, 0494, 0495, 0496) all have this section.
- **Design** — absent. No CLI surface (exact command invocations with flags), no TypeScript contracts (minimal type signatures), no file system responsibilities table, no output format (`--json` shape), no failure modes (exit codes, warn-vs-fail behavior).
- **Rollout** — absent. No default behavior description, no adoption path for existing apps, no new-app compliance, no pipeline integration table.
- **Alternatives considered** — absent. No real alternative with rejection reason. In particular, the RFC does not consider whether `surface.intersection.validate` could be a flag on `surface.validate`, or whether `surface.intersection.report` could be a flag on `surface.intersection.validate`.
- **Risks** — absent. No agent misinterpretation risk, no false-positive rate estimate for the substance independence test, no performance risk for O(N²) similarity comparisons.
- **Implementation notes for agents** — absent. No explicit behavioral rules. Related RFCs (0492, 0494, 0495, 0496) all include this section with LLM-generated content prohibition, migrator registration instructions, and Compass update duties.

The **Decision** section contains substantive content but is structured as a specification, not as a single present-tense decision statement. The **Implementation plan** section lists 8 steps but is not a substitute for the Design section (which requires CLI surface, TypeScript contracts, file system responsibilities, output format, and failure modes).

**Acceptance criteria** exist (8 items) but:

- Some are not agent-checkable without runtime probing: "Old URLs for non-existent intersections return 301 or 410, never 200" requires live HTTP probing, which the ecosystem does not do (RFC-0495 explicitly rejected runtime HTTP probing).
- "No new city×service pages are generated automatically without an explicit intersection record" is checkable via `surface.generate` output inspection.

## Axis B — DNA alignment

**Fail.** `satisfies: [DNA-24, DNA-53]` — both are real DNA invariants in `docs/architecture-dna.md`. However:

- The RFC body does not explain **how** it enforces or extends these invariants. There is no "Architectural fit" section (unlike RFC-0492, RFC-0494, RFC-0495, RFC-0496 which all have explicit DNA alignment explanations).
- **DNA-24 (Block-declarative pages):** The intersection page baker emits only intersection-specific blocks (8 block positions listed). This is consistent with DNA-24's field-presence-driven model, but the RFC doesn't state this explicitly.
- **DNA-53 (Semantic fingerprint governance):** The similarity computation uses the existing shingle method (same as RFC-0492/0494). No new ad hoc hashing. This is consistent, but the RFC doesn't state this.
- The RFC does not silently conflict with any existing DNA invariant.
- `related[]` references are relevant and not decorative — RFC-0192/0193 (surface model), RFC-0238 (website-local), RFC-0478 (versioning), RFC-0480 (Layer C), RFC-0492/0494/0495/0496 (sibling RFCs).

## Axis C — Ecosystem fit

**Fail.** Several gaps:

- **Package boundaries:** `packagesImpacted` lists `@gogol/share` but the RFC does not propose any changes to `@gogol/share`. If `@gogol/share` is not actually impacted, it should be removed. If it is (e.g., `SemanticModelOptions` extension for depth-5 JSON-LD), the RFC should say so.
- **Pipeline placement:** The RFC does not specify which pipeline each new command belongs to (`build.prepare`, `build.check`, `sites-check`, `sites-check-postbuild`). Related RFCs (0492, 0496) include explicit pipeline integration tables.
- **Compass sync:** The RFC does not identify which `docs/*.xml` files need synchronization. If the RFC changes repository-wide requirements or verification flows, it should identify them.
- **AGENTS.md updates:** The RFC does not identify which `AGENTS.md` files need rule updates. The `packages/os/site-kernel-checks/AGENTS.md` command table will need new entries for `surface.intersection.validate` and `surface.intersection.report`.
- **Command lifecycle:** `commands.proposed` and `commands.added` both list `surface.intersection.validate` and `surface.intersection.report`. `commands.changed` lists `surface.generate`, `surface.validate`, `surface.doorway-risk.report`. This is internally consistent.
- **C-contract:** `breaksC: true` is declared, but the RFC does not specify which C-contract file needs updating. The `url-schema.yaml` already has the depth-5 pattern (`/:locale?/:industry/:city/:demand`) from RFC-0495 — no new URL pattern is needed. However, the `sitemap-shape.yaml` may need updating (fewer pages in sitemap when intersection records are required). The RFC should clarify what C-contract change is needed, or justify `breaksC: true` by the behavior change (depth-5 URLs that used to return 200 now return 301/410).
- **Content collection integration:** The RFC proposes `surface/intersections/{lang}/*.md` but does not specify how `expand.ts` loads it. By analogy with RFC-0494 (city content collection loaded as supplementary data for geo-provider axes), the intersection collection should be loaded as a supplementary dataset for the demand axis. But the RFC doesn't specify this — it's an implementation gap.

## Axis D — Forward-only compliance

**No issues.** The RFC is cleanly forward-only:

- No compatibility shim, bridge, or dual-path. "Absence of record means absence of page" — no noindex stub, no sitemap entry, no internal link.
- The redirect policy for failed intersections is clean: 301 to service dossier (RFC-0496) or city page, or 410 Gone. No dual-path.
- Legacy depth-5 generation (Cartesian from demand records) is deleted, not maintained behind a flag.
- The RFC amends RFC-0238 by changing the depth-5 generation rule directly — no parallel interpretation.

## Axis E — Agent-facing policy

**Fail.** Several gaps:

- **Status gate:** The RFC does not contain self-authorizing language. No issues here.
- **Implementation notes:** The "Implementation notes for agents" section is entirely absent (V-13). Related RFCs (0492, 0494, 0495, 0496) all include this section with explicit rules:
  - Agents MAY implement code changes ONLY when status is `accepted` or `implemented`.
  - Agents MUST NOT fill intersection record fields with LLM-generated content.
  - Agents MUST register a migrator if `versionBump: minor`.
  - Agents MUST update C-contract files in the same change.
  - Agents MUST update `CHANGE_SUMMARY` Compass blocks (DNA-42).
  - Agents MUST run specific validators after implementation.
- **Anti-fabrication:** The intersection record fields (`localServiceQuestions`, `localServiceConstraints`, `localBookingContext`, `localEvidence`, `uniqueContentBlocks`) require human authoring with local expertise. The RFC does not distinguish between code changes an agent can make and content that requires human authoring. This is a critical gap — without explicit prohibition, agents may attempt to LLM-generate intersection records.
- **Governance references:** The RFC does not reference RFC-0224 (accepted→implemented transition), RFC-0334 (supersede escalation), or RFC-0330 (verification evidence).
- **Storage policy:** Not relevant — no persistence changes.

## Axis F — Pragmatism

**Fail.** Several findings:

- **Command surface:** Two new commands (`surface.intersection.validate`, `surface.intersection.report`) are proposed. `surface.intersection.validate` enforces the gate (blocking); `surface.intersection.report` generates a scaling report (diagnostic). These are distinct purposes. However, the RFC does not consider whether `surface.intersection.report` could be a `--report` flag on `surface.intersection.validate` — no alternatives section.
- **Schema overlap:** The intersection record schema has 14 fields. `localServiceConstraints` and `localBookingContext` may overlap with the demand record's existing fields (`localDemandContext`, `searchedAs`, `neededPage`). The RFC says "the intersection record adds the gate-specific fields that the demand record lacks" but does not clearly delineate which fields are new vs. inherited from the demand record. This risks duplication or confusion during implementation.
- **`packagesImpacted` accuracy:** `@gogol/share` is listed but no changes to `@gogol/share` are described. Either remove it or explain the impact.
- **Existing patterns:** The RFC does not check whether `surface.doorway-risk.report` (RFC-0492) can be extended to handle intersection records, or whether a new command is needed. The RFC says `surface.doorway-risk.report` will be "updated to check for intersection records in addition to city records" but doesn't specify how — is it a new check within the existing command, or a separate command?
- **`nonGoals`** are explicit and meaningful — properly scoped.

## Axis G — Blind spots

**Fail.** Several critical gaps:

- **Migrator missing:** `versionBump: minor` requires a migrator in the registry (RFC-0479). The RFC does not mention a migrator at all. Related RFCs (0492, 0495, 0496) all register migrators. This is a **blocking gap** — `platform.consistency.validate` will fail (semantic hash changed but no migrator registered). The migrator is likely a no-op (intersection collection is additive), but it must be registered to advance `migratorCursor`.
- **Migration path for existing depth-5 pages:** Currently, depth-5 pages are generated from demand records. After this RFC, they require intersection records. The RFC says "absence of record means absence of page" but does not describe:
  - What happens to existing depth-5 URLs that don't have intersection records? They disappear. The redirect policy (301/410) applies, but only if the old URLs had been deployed. If this is the first deployment with depth-5 pages, there are no old URLs to redirect.
  - Is there a grace period (warn mode) like RFC-0492/0496? The RFC does not mention this.
  - How does the operator know which intersection records to create? The RFC doesn't describe a diagnostic tool for identifying which demand records need intersection records.
- **Performance:** `surface.intersection.validate` computes similarity against parent pages (industry, city, service) and all other intersection pages in the same industry. For N intersections per industry, this is O(N²) pairwise comparisons plus O(N × 3) parent comparisons. The RFC does not specify the cost or any optimization (e.g., precomputing parent page text once, caching shingle sets).
- **Substance independence test:** The test says "if the page loses meaning without city name, key phrase, CTA, AI image, it fails the gate." The RFC says "the delta must be below a threshold" but does not specify:
  - What threshold?
  - How is "substance score" computed? (The existing `substanceMin` in the blueprint uses a token-count-based score, but this test requires a different semantic score.)
  - What is "key phrase" and "AI image" in the context of an intersection page?
- **False positives:** The similarity threshold (0.70) and substance independence test may produce false positives during migration when intersection records are sparse. The RFC does not estimate the false-positive rate or describe suppression mechanisms.
- **Edge cases:** The RFC does not consider:
  - Empty state: new site with no intersection records — does `surface.intersection.validate` pass (empty collection) or fail?
  - Intersection record without a matching demand record — the generation rule requires both, but what if the intersection record exists and the demand record doesn't?
  - Language fallback: intersection records in default language only — does the baker use default-language fields for all languages?
- **Security/privacy:** Not relevant — no user data or PII.

## Questions for the author

1. **Migrator:** `versionBump: minor` requires a migrator (RFC-0479). What is the migrator id, what does it transform, and where is it registered? If it is a no-op (intersection collection is additive), state this explicitly and specify the `migratorCursor` advancement.

2. **Migration path:** What happens to existing depth-5 pages that have demand records but no intersection records? Is there a grace period (warn mode) like RFC-0492/0496, or do all depth-5 pages disappear immediately on first deployment with this RFC? How does the operator identify which demand records need intersection records?

3. **C-contract change:** `breaksC: true` is declared, but `url-schema.yaml` already has the depth-5 pattern from RFC-0495. What specific C-contract file changes are needed? Is the `breaksC: true` justified by the behavior change (depth-5 URLs returning 301/410 instead of 200), and if so, which C-contract file captures this behavior?

4. **Substance independence test:** How is the "substance score" computed? What threshold determines "loses meaning"? What are "key phrase" and "AI image" in the context of an intersection page? Is this a new scoring method or a reuse of the existing `substanceMin` token-count score?

5. **Content collection loading:** How does `expand.ts` load `surface/intersections/{lang}/*.md`? Is it a supplementary collection for the demand axis (analogous to RFC-0494's city content loading), or a new axis? How does the baker access intersection record fields via `valData()` or a new loading path?

6. **Schema delineation:** Which intersection record fields are new vs. inherited from the demand record? `localServiceConstraints` and `localBookingContext` may overlap with the demand record's `localDemandContext`. How does the baker avoid rendering duplicate content from both records?
