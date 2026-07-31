---
rfcId: RFC-0607
auditId: AUDIT-RFC-0607-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0607

## Verdict: Needs revision

The RFC is structurally sound and the DNA-58 entry is already present in `docs/architecture-dna.md`. However, `rfc.validate` fails with V-25 (empty reviewers on an accepted RFC), the `satisfies[]` field is empty when it should include `DNA-58`, and the DNA-58 text in `architecture-dna.md` has an expanded binary file list that diverges from the RFC's own invariant text.

## Mechanical validation (rfc.validate)

Fail — 1 violation:

- **V-25** (error): accepted RFC created 2026-07-30 has empty `reviewers` — the deciding human must record their identity (RFC-0335).

## Axis A — Structural completeness

- **Acceptance criterion 5** ("`rfc.validate` passes on this file") currently fails due to V-25. The criterion cannot be checked until reviewers are populated.
- **DNA-58 text mismatch**: The RFC's Decision section (line 99) and Invariant text section (line 120) list binary exclusions as "(PNG, ICO, WebP, MP4, WebM)". The DNA-58 entry in `docs/architecture-dna.md:249` lists "(PNG, ICO, WebP, MP4, WebM, JPG, JPEG, GIF, TIFF, HEIC, HEIF, SVG)". Acceptance criterion 2 ("DNA-58 text matches the Decision section of this RFC") is not met — the canonical entry has 7 additional extensions not mentioned in the RFC body.

## Axis B — DNA alignment

- **`satisfies: []` is empty**: The audit convention (Axis B) states that if an RFC establishes a new DNA invariant, its `satisfies[]` should include the new invariant id. This RFC establishes DNA-58 but does not list it in `satisfies[]`. The field should be `[DNA-58]`.
- **DNA-58 already in architecture-dna.md**: The entry at line 247-249 is present and correctly placed after DNA-57. ✓
- **DNA-18 relationship**: Correctly described as distinct — DNA-18 remains the Uni registry invariant, DNA-58 is the general case. ✓
- **No conflicts with existing DNA invariants**: No overlap or contradiction identified. ✓

## Axis C — Ecosystem fit

- **Compass XML sync**: The RFC does not mention whether any `docs/*.xml` Compass files need synchronization after adding DNA-58. Adding a DNA invariant may require updates to `docs/verification-plan.xml` or `docs/technology.xml` if they track invariant inventories. The RFC should either confirm no Compass sync is needed or list the files that require updates.
- **AGENTS.md updates**: The RFC does not identify whether root `AGENTS.md` needs a rule update. Since DNA-58 is a workspace-level invariant documented in `architecture-dna.md`, no AGENTS.md change may be needed — but the RFC should state this explicitly.
- **Command lifecycle**: All command buckets are empty — correct for a policy RFC. ✓
- **Package boundaries**: N/A (policy RFC, no code). ✓

## Axis D — Forward-only compliance

No issues. The RFC is forward-only — it adds a new invariant without maintaining any legacy path. No compatibility shims, no dual paths, no deprecation grace periods. ✓

## Axis E — Agent-facing policy

- **Status gate**: No self-authorizing language. The RFC correctly states "Agents MAY implement changes ONLY when this RFC has status: accepted (or implemented)." ✓
- **Implementation notes**: Reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation on invariant conflict). ✓
- **Anti-fabrication**: N/A (no content authoring). ✓
- **Storage policy**: N/A (no persistence). ✓

## Axis F — Pragmatism

- **Minimal command surface**: No commands proposed — correct for a policy RFC. ✓
- **Existing patterns**: The RFC explains why extending DNA-18 is insufficient and a new invariant is cleaner. Three alternatives are considered with honest rejection reasons. ✓
- **Scope discipline**: `appsImpacted: []` and `packagesImpacted: []` — correct for a policy RFC that changes no code. ✓
- **nonGoals**: Explicit and meaningful — three non-goals that scope the RFC to policy-only. ✓

## Axis G — Blind spots

- **Dependency chain**: The RFC correctly identifies that RFC-0601 depends on this RFC being accepted. The risk section documents the consequences of rejection. ✓
- **Migration path**: Existing apps have no immediate impact; new apps automatically benefit. ✓
- **Edge cases**: The RFC considers the relationship between DNA-58 and DNA-18, and between RFC-0345/0375/0600/0601. ✓
- **Performance / false positives**: N/A (no command). ✓
- **Security/privacy**: N/A. ✓

## Questions for the author

1. Should `satisfies[]` include `DNA-58`? The audit convention says establishing RFCs should list the new invariant they create. Is the empty `satisfies[]` intentional, or should it be `[DNA-58]`?
2. The DNA-58 entry in `architecture-dna.md` lists 12 binary extensions (PNG, ICO, WebP, MP4, WebM, JPG, JPEG, GIF, TIFF, HEIC, HEIF, SVG), but the RFC body only lists 5 (PNG, ICO, WebP, MP4, WebM). Which list is canonical? The RFC text should match the architecture-dna.md entry.
3. Who is the deciding human reviewer? The `reviewers` field is empty, which fails V-25. The default reviewer per the frontmatter comment is `human:andrii-syrokomskyi` — should this be set?
