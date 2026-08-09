---
rfcId: RFC-0663
auditId: AUDIT-RFC-0663-01
date: 2026-08-03
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0663

## Verdict: Needs revision

RFC-0663 is a well-structured policy RFC that cleanly extends the 0660–0662 knowledge series with a cross-skill promotion tier. The design is sound and the fo-harvest analogy is apt. Three findings block Approved: DNA-60 is referenced in the body but absent from `satisfies[]` and from `docs/architecture-dna.md`; the `forge.create` sync mechanism for the non-skill `shared/knowledge/` directory is unspecified; and containment-match near-duplicate detection has an unbounded false-positive surface.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

No issues. All required sections contain real content. Decision is present-tense and singular. TypeScript contracts are minimal signatures. File system responsibilities table names concrete paths. Output format documents the `--json` shape. Failure modes specify exit behavior. Rollout describes phases and dogfood. Alternatives are honest (4 real alternatives with rejection reasons). Risks include agent misinterpretation and false-positive/negative rates. Acceptance criteria are checkable and cover the decision's scope. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

**Finding B-1: DNA-60 referenced in body but absent from `satisfies[]` and from the DNA registry.**

The RFC body (line 108) states: "DNA-60 (proposed by this series): this RFC is the 'audited promotion' clause." However:

- `satisfies: []` is empty in the frontmatter.
- `docs/architecture-dna.md` has no DNA-60 entry (last entry is DNA-59, line 251).

RFC-0660 (line 112) says: "The implementing change adds DNA-60 to `docs/architecture-dna.md` and links RFC-0660..0662." RFC-0663 is `kind: policy`, so `--satisfies` is not required by RFC-0331. But the body claims DNA-60 alignment without listing it in `satisfies[]`. Once RFC-0660 establishes DNA-60, RFC-0663 should list it in `satisfies[]` — or at minimum, the RFC should state that it will be added to `satisfies[]` after RFC-0660 implementation, since DNA-60 does not exist yet.

## Axis C — Ecosystem fit

**Finding C-1: `forge.create` sync mechanism for the shared layer is unspecified.**

The RFC (line 114) states: "synced by `forge.create` to `.agents/skills/shared-knowledge/learned-principles.md` for npm consumers." The shared layer lives at `packages/forge/skills/shared/knowledge/learned-principles.md` — a non-skill directory (no `SKILL.md`). `forge.create` currently syncs skill directories (each containing a `SKILL.md`). The RFC does not explain how `forge.create` will discover and sync a knowledge-only file outside a skill directory. Two possibilities:

1. `forge.create` already syncs all files under `packages/forge/skills/` recursively — in which case no change to `forge.create` is needed and it should not be listed in `commands.changed`.
2. `forge.create` needs new logic to sync non-skill knowledge files — in which case the RFC should describe the change.

The RFC lists `forge.create` in `commands.changed` (line 47), implying option 2, but never describes what changes. Clarify the sync mechanism and the `forge.create` delta.

## Axis D — Forward-only compliance

No issues. The `promotedTo` pointer is a one-way transformation — local copies become superseded pointers, not parallel entries. No shims, no dual-paths, no backward compatibility layers.

## Axis E — Agent-facing policy

No issues. Status gate is correct: "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes reference RFC-0224, RFC-0330, RFC-0334. The dogfood acceptance criterion ("at least one real duplicate pair promoted end-to-end") honestly requires operator involvement, not just agent work. Anti-fabrication is respected.

## Axis F — Pragmatism

No issues. No new commands — extends `forge.doctor` (informational warnings) and `forge.create` (sync). `DuplicatePair` and `PromotionPlan` are minimal types. Reuses `parseKnowledgeFile` (RFC-0660) and `fo-knowledge-distill` (RFC-0662) — no reinvention. `packagesImpacted: [forge]` and `appsImpacted: []` are correct. `nonGoals` are meaningful (no semantic dedup, no auto-promotion, no centralization, no shared L0/L1).

## Axis G — Blind spots

**Finding G-1: Containment-match near-duplicate detection has an unbounded false-positive surface.**

The RFC (line 124) specifies: "pairs where one normalized title is a substring of the other (near-duplicates)." Unbounded substring matching produces high false positives for short titles. For example, a principle titled "Verify" would match every principle whose title contains "verify" (likely most of them). The RFC acknowledges false positives in Risks (line 235) and mitigates with "informational only; operator rejects bad pairs during grilling," but does not discuss the substring-specific risk or propose a minimum title-length threshold for containment matching. Consider requiring a minimum normalized-title length (e.g. ≥ 20 characters) for containment matching, or restricting containment to titles where the shorter title is at least 60% of the longer title's length.

## Questions for the author

1. Should `satisfies: [DNA-60]` be added now (with a comment that DNA-60 is pending RFC-0660 establishment), or should the RFC state that DNA-60 will be added to `satisfies[]` as part of RFC-0660's implementation?
2. What specific change to `forge.create` is needed to sync `packages/forge/skills/shared/knowledge/learned-principles.md` — does `forge.create` already sync non-skill files recursively, or does it need new logic?
3. What threshold prevents containment matching from producing excessive false positives for short or generic titles like "Verify" or "Redact"?
