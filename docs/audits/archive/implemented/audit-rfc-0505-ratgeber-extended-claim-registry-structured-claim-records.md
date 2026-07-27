---
rfcId: RFC-0505
auditId: AUDIT-RFC-0505-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0505

## Verdict: Needs revision

The RFC introduces a well-motivated structured claim registry but is missing four required sections (`## Architectural fit`, `## Design`, `## Acceptance criteria`, `## Implementation notes for agents`) and has a critical ecosystem-fit gap: it creates a parallel claim collection without explaining its relationship to the existing claim sidecar system from RFC-0502, risking a dual-path forward-only violation.

## Mechanical validation (rfc.validate)

Pass with 4 V-13 warnings:

- Missing required section `## Architectural fit`
- Missing required section `## Design`
- Missing required section `## Acceptance criteria`
- Missing required section `## Implementation notes for agents`

## Axis A — Structural completeness

- **Missing `## Architectural fit`**: RFC-0502 and RFC-0504 (both implemented) include this section to explain DNA alignment and RFC relationships. RFC-0505 omits it entirely. The `satisfies: [DNA-16, DNA-24, DNA-53]` entries are unexplained.
- **Missing `## Design`**: No CLI surface (exact command invocations with flags), no TypeScript contracts (minimal type signatures), no file system responsibilities table, no failure modes table with exit codes, no pipeline placement, no output format documentation. Compare RFC-0502's `## Design` section which provides all of these.
- **Missing `## Acceptance criteria`**: No checkable items. An implementation cannot be verified without acceptance criteria. V-14 requires ≥ 3 acceptance items.
- **Missing `## Implementation notes for agents`**: No explicit behavioral rules. Compare RFC-0502's implementation notes which explicitly prohibit auto-generating claim sidecars for factual claims.
- **`## Rollout` is minimal**: 9 steps but doesn't describe default behavior (what happens when `surface/claims/` doesn't exist), adoption path for existing apps, or new-app compliance.
- **`## Risks`** doesn't include agent misinterpretation risk or false-positive rate for the proposed validator.

## Axis B — DNA alignment

- **DNA-16** (semantic layer shares topology with navigation): The RFC says claim records are "machine-readable backing — not rendered directly on the page" but doesn't explain how the claim registry relates to semantic outputs (JSON-LD, sitemaps). Does `claimText` or `reviewStatus` feed into JSON-LD? The RFC needs to state explicitly that DNA-16 is satisfied because the claim registry does not introduce a parallel page-structure model — it is a provenance backing store, not a navigation or semantic output surface.
- **DNA-24** (block-declarative pages): The RFC creates a new content collection `surface/claims/{lang}/*.md` but doesn't explain how it relates to the block-declarative contract. Claim records are not page blocks — they are metadata records. The RFC should state that DNA-24 is satisfied because claim records are not rendered as blocks; they are referenced by `claimIds` in article frontmatter and resolved by the validator.
- **DNA-53** (semantic fingerprint governance): The RFC adds new content files which will change the platform semantic hash. `versionBump: minor` is declared, but the RFC doesn't explain DNA-53 alignment. It should state that the hash change is expected and governed by the declared version bump.

## Axis C — Ecosystem fit

- **Critical: dual claim system.** RFC-0502 (implemented) established claim sidecars at `surface/articles/{lang}/{slug}.claims.yaml` using the CKL `recordClaimsSchema` from `@gogol/share/schemas`. The existing `ratgeber.provenance.validate` (RG-PROV-03) checks `claimId` existence against these sidecars. RFC-0505 proposes a new `surface/claims/{lang}/*.md` collection with a different schema (`claimId`, `claimText`, `sourceRefs`, `calculationInputs`, `limitations`, `verifiedAt`, `expiresAt`, `reviewStatus`). The RFC does not explain:
  - Whether the new claim collection replaces, supplements, or runs alongside the existing claim sidecars.
  - What happens to RG-PROV-03 (currently checks against sidecars) when RG-PROV-06 (checks against claim records) is added. Do both run? Does RG-PROV-03 change?
  - Whether existing claim sidecars are migrated, deleted, or kept.
  - How `sourceRefs[].sourceId` in the new claim record relates to `sourceRef` in the existing claim sidecar annotation (they serve similar purposes but have different shapes).
- **Pipeline placement not specified**: The RFC doesn't say which pipeline `ratgeber.claim.validate` runs in (`build.check`, `build.prepare`, etc.) or whether it's blocking or advisory.
- **Compass sync not identified**: The RFC doesn't list which `docs/*.xml` files need synchronization (likely `docs/verification-plan.xml`, `docs/requirements.xml`, `docs/technology.xml`, `docs/knowledge-graph.xml`).
- **AGENTS.md updates not identified**: The RFC doesn't say which AGENTS.md files need updates (likely `packages/os/site-kernel-checks/AGENTS.md`).
- **`packagesImpacted` includes `@gogol/share`** but the RFC doesn't explain what changes in share. The claim record Zod schema should live in `@gogol/share/schemas` (following the `recordClaimsSchema` pattern) or in `@gogol/site-kernel-checks` — the RFC should specify which.

## Axis D — Forward-only compliance

- **Dual-path risk**: The RFC creates a new claim collection without removing or deprecating the existing claim sidecar system from RFC-0502. If both systems coexist indefinitely, this is a compatibility shim. The RFC must either:
  1. State that claim sidecars are deprecated and the migrator transforms them into claim records (removing the sidecars), or
  2. Clearly explain why both are needed and how they don't overlap.
- The `## Alternatives considered` section rejects "extend RFC-0502 claim sidecars" but doesn't address what happens to the existing sidecars after the new collection is introduced.

## Axis E — Agent-facing policy

- **Missing implementation notes**: No `## Implementation notes for agents` section. The RFC must include explicit rules:
  - Agents MUST NOT auto-generate `claimText`, `limitations`, or `reviewStatus` — these are editorial fields requiring human authoring.
  - Agents MAY create claim record file structures with `reviewStatus: unverified` from existing claim sidecar data.
  - The migrator is idempotent.
- **Anti-fabrication gap**: The success signals include "populate initial claim records" but `claimText`, `sourceRefs[].title`, and `limitations` are editorial content that requires human authoring. The RFC should distinguish between code changes (schema, validator, migrator) and content changes (claim record authoring).
- No self-authorizing language found — the RFC doesn't grant implementation permission while draft.

## Axis F — Pragmatism

- **`ratgeber.claim.validate` earns its existence**: It validates a distinct concern (claim record schema, source binding, expiry, review status) separate from `ratgeber.provenance.validate` (article-level author/source/claim resolution).
- **`calculationInputs` schema is underspecified**: The field references PBP paths (e.g., `business-profile.offerings/digital-foundation.presentation.price.setup`) but the RFC doesn't specify the `ref` path format, how it's resolved, or what happens when the PBP data changes. The example shows `{ ref: "...", value: "200" }` but the schema is not formalized.
- **`packagesImpacted` lists `@gogol/share`** without explaining what changes there. If the claim record Zod schema goes in share, this is correct — but the RFC should say so.
- **`nonGoals` are meaningful**: The RFC explicitly scopes to ratgeber-specific claims, not a general-purpose system.

## Axis G — Blind spots

- **Performance not estimated**: The RFC doesn't estimate how many files `ratgeber.claim.validate` scans (claim records, article records for `articleId` resolution, source descriptors for `sourceRefs[].sourceId`).
- **False-positive rate not analyzed**: RG-CLAIM-07 (expired claims) and RG-CLAIM-08 (disputed claims) produce warnings. The RFC doesn't estimate how many warnings to expect during initial migration or how to suppress noise.
- **Edge cases not considered**:
  - Empty state: new site with no claim records — does the validator pass?
  - Article references a `claimId` but no claim record exists — is this an error or warning?
  - Claim record references an `articleId` that doesn't exist — RG-CLAIM-03 covers this, but what if the article is `status: draft`?
- **Migration path underspecified**: The migrator "populates initial claim records from existing article claim sidecars" but:
  - What if an article has no claim sidecar?
  - What if a claim sidecar has claim IDs but no `sourceRef`?
  - How is `claimText` derived? (It can't be — the sidecar doesn't contain claim text.)
- **`calculationInputs` drift detection**: The RFC mentions `ratgeber.claim.validate` "can warn when the current PBP value differs from the recorded value" but doesn't specify this as a validation rule. It's described in `## Risks` but not in the validation rules section.

## Questions for the author

1. What is the relationship between the new `surface/claims/{lang}/*.md` collection and the existing `surface/articles/{lang}/{slug}.claims.yaml` sidecars from RFC-0502? Does the new collection replace the sidecars, supplement them, or run alongside them? What happens to RG-PROV-03 (which checks claimIds against sidecars) when RG-PROV-06 (which checks claimIds against claim records) is added?

2. Where does the claim record Zod schema live — in `@gogol/share/schemas` (following `recordClaimsSchema`) or in `@gogol/site-kernel-checks`? What exactly changes in `@gogol/share` (listed in `packagesImpacted`)?

3. The migrator "populates initial claim records from existing article claim sidecars" — but claim sidecars don't contain `claimText`, `limitations`, or `calculationInputs`. How are these fields populated? Are they left empty for the operator to fill, or does the migrator mark them as `reviewStatus: unverified` with empty `claimText`?
