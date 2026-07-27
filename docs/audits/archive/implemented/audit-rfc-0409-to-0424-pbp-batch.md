---
rfcId: RFC-0409..RFC-0424
auditId: AUDIT-RFC-0409-0424-01
date: 2026-07-19
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0409 through RFC-0424 (PBP Batch)

## Verdict: Needs revision

All 16 RFCs share three systematic structural issues: duplicate `## Design` sections, empty frontmatter fields (`packagesImpacted`, `successSignals`, `nonGoals`) in RFC-0410..0424, and `implementedAt` set while status is `accepted`. The TypeScript implementations are correct and pass `tsc --noEmit` and `vitest run`, but the RFC documents need structural cleanup before they can be considered clean.

## Mechanical validation (rfc.validate)

Pass — only pre-existing V-20 warnings from archived RFCs. No violations targeting RFC-0409..0424.

## Common findings (all 16 RFCs)

### Axis A — Structural completeness

**FAIL: Duplicate `## Design` sections.** All 16 RFCs have two `## Design` headings. The first contains normative source references, Context, Problem, and Decision. The second contains CLI surface, TypeScript contracts, File system responsibilities, Output format, and Failure modes. The RFC template expects a single `## Design` section. The first section should be renamed (e.g. remove the `## Design` heading and let Context/Problem/Decision be top-level), or the two sections should be merged.

Evidence: `grep -c '^## Design' docs/rfcs/rfc-0409*.md` returns 2 for every RFC in the batch.

### Axis E — Agent-facing policy

**FAIL: `implementedAt` set while `status: accepted`.** All 16 RFCs have `implementedAt: 2026-07-19` in frontmatter but `status: accepted`. This is inconsistent — `implementedAt` should only be set when status transitions to `implemented`. This was caused by the rollback from `implemented` to `accepted` for this audit.

Evidence: Every RFC has `implementedAt: 2026-07-19` and `status: accepted`.

## Per-RFC findings (RFC-0410 through RFC-0424 only)

### Axis A — Structural completeness

**FAIL: Empty `packagesImpacted`, `successSignals`, `nonGoals`.** RFC-0410 through RFC-0424 (15 RFCs) have these frontmatter fields still set to `[]`. The first edit chunk in the batch edit operation failed because the template's `old_string` did not match exactly (there are comment lines between the fields in the template). RFC-0409 was filled correctly because its template had a slightly different structure.

Evidence: `grep 'packagesImpacted: \[\]' docs/rfcs/rfc-0410*.md` returns a match for RFC-0410..0424 but not RFC-0409.

### Axis F — Pragmatism

**PASS (with note):** `packagesImpacted` is empty in the frontmatter but the RFC body correctly identifies `@gogol/pbp` in the file system responsibilities table. The frontmatter should match the body.

## Per-RFC specific findings

### RFC-0409 (LegalIdentity)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct — `PbpLegalIdentity` is in `packages/pbp/`. The RFC body explains how it enforces DNA-1.

**Axis D — Forward-only compliance: PASS.** No compatibility shims, no dual paths. Private data is excluded, not flagged.

**Axis G — Blind spots: PASS.** Public/private boundary is clearly addressed. No PII concerns in the public interface.

### RFC-0410 (Brand)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis F — Pragmatism: MINOR.** The `PbpBrand` interface is minimal (name, tagline, ownerBusinessRef). This is good — no speculative generality.

### RFC-0411 (Place)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis G — Blind spots: MINOR.** `PbpPlaceKind` is a closed union of 3 values (`locality`, `region`, `country`). The spec may need `continent` or `sublocality` in the future. This is acceptable for `@1` — additive-only within the major version.

### RFC-0412 (ContactPoint)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis F — Pragmatism: PASS.** `PbpContactChannel` is a closed union of 5 values. This covers the spec's vocabulary.

### RFC-0413 (WebPresence)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis G — Blind spots: MINOR.** `PbpWebPresenceKind` has 3 values. Social media platforms may need finer granularity (e.g. `social-profile-linkedin`). This is acceptable for `@1`.

### RFC-0414 (Category)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis C — Ecosystem fit: PASS.** Category is correctly placed in the Global Semantic Layer.

### RFC-0415 (ProductGroup/ProductVariant)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis D — Forward-only compliance: PASS.** No compatibility with legacy product models.

**Axis G — Blind spots: MINOR.** Variant invariants (§12.3) are documented in the RFC but not enforced in TypeScript — the interface cannot enforce "variant MUST specify all required axes". This is a compiler concern, not an interface concern. Acceptable.

### RFC-0416 (EvidenceSource)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis G — Blind spots: PASS.** Evidence URL validity and staleness are addressed in risks.

### RFC-0417 (Disclosure)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis F — Pragmatism: PASS.** `PbpDisclosureKind` and `PbpDisclosureMateriality` are closed unions. No speculative fields.

### RFC-0418 (Credential)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis E — Agent-facing policy: PASS.** `expiresAt` is nullable — `null` means no expiration, `undefined` means not specified. This is documented in implementation notes.

### RFC-0419 (Review/AggregateRating)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis F — Pragmatism: PASS.** Rating values are strings to preserve decimal precision. This matches the spec.

### RFC-0420 (PublicDocument)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis E — Agent-facing policy: PASS.** `governance` is required on `PbpPublicDocument`.

### RFC-0421 (RuntimeOverlay)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis A — Structural completeness: PASS.** `PbpRuntimeOverlay` is correctly NOT an entity — it does not extend `PbpEntity`.

**Axis G — Blind spots: PASS.** Overlay scope creep and stale overlay display are addressed in risks.

### RFC-0422 (Validation/ErrorCodes)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis F — Pragmatism: PASS.** 15 error prefixes match the spec exactly. No speculative prefixes.

### RFC-0423 (Registry/Resolver)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis C — Ecosystem fit: PASS.** Registry types are correctly placed in `packages/pbp/`. Reproducibility (§3.7) is referenced.

### RFC-0424 (Normalization)

**Axis B — DNA alignment: PASS.** `satisfies: [DNA-1]` is correct.

**Axis D — Forward-only compliance: PASS.** No compatibility with legacy normalization. Each source field gets exactly one decision.

**Axis E — Agent-facing policy: PASS.** System-spec §3.9 (minimize hidden inferences) is referenced in implementation notes.

## Summary of required fixes

1. **Remove duplicate `## Design` sections** — merge the two Design sections into one in all 16 RFCs.
2. **Fill `packagesImpacted`, `successSignals`, `nonGoals`** in RFC-0410..0424 (15 RFCs).
3. **Clear `implementedAt`** in all 16 RFCs (set back to empty since status is `accepted`).

## Questions for the author

1. Should the first `## Design` section (normative refs + Context/Problem/Decision) be renamed to just remove the `## Design` heading, or should the two sections be merged into a single `## Design`?
2. Are the `PbpPlaceKind` (3 values) and `PbpWebPresenceKind` (3 values) vocabularies sufficient for `@1`, or should more values be added before freezing?
3. Should `implementedAt` be cleared now, or should the status be moved back to `implemented` after fixing the structural issues?
