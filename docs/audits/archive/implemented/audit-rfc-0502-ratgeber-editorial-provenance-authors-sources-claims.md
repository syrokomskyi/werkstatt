---
rfcId: RFC-0502
auditId: AUDIT-RFC-0502-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0502

## Verdict: Needs revision

The RFC's architectural direction is sound — reusing CKL claim sidecars and source descriptors rather than building a parallel provenance system is correct. However, the claim sidecar example does not conform to the `recordClaimsSchema` it claims to reuse, the RFC declares `versionBump: minor` (Breaks-B) but defines no migrator, and three required sections are missing (Alternatives, Risks, Implementation notes).

## Mechanical validation (rfc.validate)

Pass with 6 warnings:

- **V-13**: Missing `## Alternatives considered`
- **V-13**: Missing `## Risks`
- **V-13**: Missing `## Implementation notes for agents`
- **V-19**: `amends` includes RFC-0500, but RFC-0500.amendedBy does not include RFC-0502
- **V-19**: `amends` includes RFC-0214, but RFC-0214.amendedBy does not include RFC-0502
- **V-30**: `@gogol/ontology` is in packagesImpacted but `breaksC` is not true

## Axis A — Structural completeness

- **Missing sections.** Three required sections are absent: `## Alternatives considered`, `## Risks`, `## Implementation notes for agents` (V-13 warnings). RFC-0500 and RFC-0501 both include all three — RFC-0502 should follow the same pattern.
- **No exit codes documented.** The failure modes table lists rules and severities but does not document exit codes (0 = pass, 1 = error, 2 = warning-only). RFC-0500 and RFC-0501 both document exit codes and the `--json` output shape.
- **No `--json` output format.** The CLI surface shows the command invocation but does not document the `--json` output shape, unlike RFC-0500 and RFC-0501.
- **Provenance footer placement is unusual.** The RFC says the footer goes "after the FAQ and before the related-articles block" (line 146). RFC-0500's baker emits: Hero → Article body → FAQ → Related articles → Closing CTA. Placing provenance between FAQ and Related articles is unconventional — provenance typically appears at the end. This placement decision should be justified or moved to the end (after CTA).

## Axis B — DNA alignment

- **`satisfies: DNA-16`** — the RFC does not explain how provenance metadata feeds into semantic outputs (JSON-LD, sitemaps). DNA-16 requires semantic outputs to share topology with navigation. The RFC should clarify whether the provenance footer adds JSON-LD fields (e.g., `author` in Article JSON-LD) or is purely visual.
- **`satisfies: DNA-24`** — the RFC does not explain how the provenance footer block fits the block-declarative page contract. The footer is emitted by `bakeRatgeberArticle` — is it a block in `blocks[]`? What `type` does it use? The RFC should state this explicitly.
- **`satisfies: DNA-53`** — listed but not explained. DNA-53 is about semantic fingerprint governance. The RFC should clarify how provenance data affects semantic hashes.

## Axis C — Ecosystem fit

- **Claim sidecar example does not conform to `recordClaimsSchema`.** The RFC's claim sidecar example (lines 129–140) shows:

  ```yaml
  pricing-setup-fee:
    value: "ab 490 €"
    sourceRef: internal-pricing
    confidence: high
    validUntil: 2026-12-31
  ```

  But the actual `recordClaimsSchema` (`packages/share/src/schemas/claims.ts`) requires `provenance` (enum: `external | derived | asserted | generated`) and `asOf` (ISO date) as **required** fields. The example is missing both. The RFC states "This reuses the existing `recordClaimsSchema` from `@gogol/share/schemas` — no new schema is introduced" (line 142), but the example contradicts this. Either fix the example to match the schema, or declare a new schema and explain why extension is needed.

- **`sourceId` vs `sourceRef` naming inconsistency.** The existing CKL system uses `sourceRef` in claim sidecars to reference source descriptors (RFC-0214). The RFC introduces `sourceId` in the article record's `sources` field (line 113). This is a different field name for the same concept. The RFC should either reuse `sourceRef` or explain the naming divergence.

- **Claim sidecar collection path mismatch.** The RFC says claim sidecars live at `surface/articles/{lang}/{slug}.claims.yaml` (line 127). But the existing `collectClaimSidecars` function in `content-claims.ts` scans `paths.businessDirectory`, not surface article directories. The existing `source.binding.validate` also calls `collectClaimSidecars(paths.businessDirectory)`. The RFC does not explain how the collection machinery will be extended to find sidecars in the articles directory.

- **`@gogol/ontology` in packagesImpacted but no ontology files in responsibilities.** The file system responsibilities table lists no files under `packages/ontology/`. The V-30 warning flags this. Either remove `@gogol/ontology` from `packagesImpacted` or add the ontology files being changed.

- **`amends` RFC-0214 without explanation.** The body says "reuses — article sourceId references the same source descriptor registry" (line 163). Reusing a system is not amending it. Either remove RFC-0214 from `amends` or explain what is actually being amended in RFC-0214's contract.

- **`commands.changed` includes `surface.validate` but no explanation.** The RFC lists `surface.validate` in `commands.changed` but the body does not describe what changes to `surface.validate` are needed. No `surface.validate`-related files appear in the file system responsibilities.

## Axis D — Forward-only compliance

- **No migrator defined.** `versionBump: minor` means Breaks-B per RFC-0478. RFC-0479 requires a migrator for every Breaks-B change. The RFC has no migrator — no migrator file, no migrator registration, no migrator in the file system responsibilities table. The rollout says "Create `surface/authors/{lang}/andrii-syrokomskyi.md`" (line 218) which is manual content creation, not a migrator. RFC-0500's migrator already sets `authorId: andrii-syrokomskyi` on all articles, but the author record doesn't exist until RFC-0502 creates it. A migrator is needed to create the initial author record file as part of the migration pipeline.

## Axis E — Agent-facing policy

- **No implementation notes for agents.** The `## Implementation notes for agents` section is missing (V-13). RFC-0500 and RFC-0501 both include explicit agent behavioral rules (e.g., "Agents MUST NOT auto-generate prose bodies"). RFC-0502 should include similar guidance, especially regarding claim sidecar authoring (human vs agent) and author record creation.
- **No status gate language.** The RFC does not state that agents may implement only when the RFC has status `accepted`. RFC-0500 and RFC-0501 both include this rule.

## Axis F — Pragmatism

- **`ratgeber.provenance.validate` earns its existence.** It checks author resolution, source resolution, claim existence, and Quellen coverage — none of which are covered by existing validators. This is a distinct concern from `ratgeber.hub.validate` (surface artifact) and `ratgeber.article.validate` (prose structure).
- **Lean contracts.** `AuthorRecord` and `ArticleSourceBinding` are minimal and sufficient. No speculative generality.
- **Scope discipline.** `appsImpacted` and `packagesImpacted` are mostly accurate, except `@gogol/ontology` which appears unjustified (see Axis C).

## Axis G — Blind spots

- **RG-PROV-05 exception for grundlagenartikel is unexplained.** The RFC says "Article has no sources (non-blocking for grundlagenartikel)" (line 202) but does not explain why this type is exempt. Not all grundlagenartikel are source-free — a foundational knowledge article may still cite sources. The exception should be justified or removed.
- **No performance estimate.** The validator scans author records, source descriptors, claim sidecars, and article prose for Quellen section coverage. No estimate of file count or I/O cost is given.
- **No false-positive analysis.** The Quellen section coverage check (RG-PROV-04) matches `sourceId` strings in prose. No description of how partial matches or renamed sources are handled.
- **No edge case for empty state.** What happens when no author records exist? What happens when an article has `sources: []`? The RFC should document behavior for these cases.

## Questions for the author

1. The claim sidecar example does not conform to `recordClaimsSchema` (missing `provenance` and `asOf`). Will you fix the example to match the schema, or do you need a new schema? If new, why can't the existing schema be extended?
2. Why is there no migrator for a `versionBump: minor` (Breaks-B) RFC? RFC-0500's migrator sets `authorId` on all articles — who creates the author record file that `authorId` resolves to?
3. Why does the `sources` field use `sourceId` when the existing CKL system uses `sourceRef` for the same concept (referencing a source descriptor in `integrations/truth-sources/`)?
