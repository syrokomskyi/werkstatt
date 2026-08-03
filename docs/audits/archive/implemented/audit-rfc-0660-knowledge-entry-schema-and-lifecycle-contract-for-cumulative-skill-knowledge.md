---
rfcId: RFC-0660
auditId: AUDIT-RFC-0660-01
date: 2026-08-03
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0660

## Verdict: Needs revision

The RFC is well-structured and addresses a real gap (unstructured knowledge entries). Five findings need resolution before implementation: DNA-60 is missing from `satisfies`, `forge.create` in `commands.changed` needs clarification, non-L0/L1/L2 knowledge files are unaddressed, `packages/forge/AGENTS.md` update is not mentioned, and performance cost is not estimated.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

No issues. All required sections contain real content. Decision is present tense. CLI surface shows exact invocations. TypeScript contracts are minimal signatures. File system responsibilities table names concrete paths. Output format documents `--json` shape. Failure modes specify warn-vs-fail behavior. Rollout describes phased adoption. Alternatives considered has four real alternatives with rejection reasons. Risks include agent misinterpretation and false-positive rate. Acceptance criteria are checkable and cover the decision's scope. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

**Finding B1: DNA-60 missing from `satisfies`.** The RFC body (line 112) says "DNA-60 (proposed, established by this series)" and "The implementing change adds DNA-60 to `docs/architecture-dna.md`". But `satisfies` (line 33-34) only lists `DNA-54`. If this RFC establishes DNA-60, it should be listed in `satisfies` so that `dna.registry.validate` (RFC-0158) can enforce sync between the registry and the establishing RFC. DNA-54 (Forge bindings contract) is only tangentially related — this RFC extends `forge.skill.validate` but not in a way that involves bindings or hardcoded literals. The primary DNA relationship is DNA-60, which is being created.

## Axis C — Ecosystem fit

**Finding C1: `packages/forge/AGENTS.md` update not mentioned.** The AGENTS.md "Skills" section (line 42) currently documents SKILL-13: "`forge.skill.validate` enforces SKILL-13: declared knowledge files must exist." Adding SKILL-19/SKILL-20 should be reflected in this section. The RFC's file system responsibilities table (line 267-268) mentions `writing-great-skills` and `skill-create` but not `packages/forge/AGENTS.md`. The AGENTS.md is the authoritative instruction layer for the forge package — omitting it from the update plan risks leaving the agent guide stale.

**Finding C2: `forge.create` in `commands.changed` needs clarification.** The RFC body (line 247) says "forge.create scaffolds new skills' knowledge files from structured templates (preamble + zero entries)". But `forge.create` (`packages/forge/src/onboarding/init.ts`) creates forge projects and syncs existing skills — it does not scaffold individual skills or their knowledge files. The knowledge file templates live in `packages/forge/skills/` and are copied as-is by `forge.create`. The change is to template _content_ (structured-empty preamble), not to `forge.create` command logic. If `forge.create`'s behavior doesn't change, listing it in `commands.changed` may trigger RFC-CMD-03 questions — the entry should either be removed or the RFC should describe the specific behavioral change `forge.create` undergoes.

**Finding C3: Non-L0/L1/L2 knowledge files are not addressed.** `forge-bootstrap` declares 3 knowledge files (`forge-about.md`, `operator-profile-template.md`, `project-narrative-template.md`) that don't follow the L0/L1/L2 naming convention and don't contain Q&A logs, fix patterns, or learned principles — they are templates and about files. The RFC says "all cumulative skill knowledge files ... adopt a structured entry format" (line 104) and SKILL-19/SKILL-20 apply to "every file declared in a skill's `knowledge:` frontmatter" (line 242). These template files would be parsed as 100% legacy sections, producing SKILL-19 warnings during the migration window — false positives on files that are not knowledge entries by any definition. The RFC needs to either exempt non-layer knowledge files from the structured entry format, define a layer-agnostic file type, or clarify that `forge-bootstrap`'s templates are outside scope.

## Axis D — Forward-only compliance

No issues. The migration window is time-limited: legacy sections produce warnings, not errors, and the RFC explicitly states "promoting the legacy-section warning to an error is a separate follow-up decision" (line 320). This is a temporary window, not an indefinite dual-path.

## Axis E — Agent-facing policy

No issues. The RFC is `draft` and contains no self-authorizing language. Implementation notes reference RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation), and RFC-0330 (verification evidence). No storage policy or PII concerns.

## Axis F — Pragmatism

No issues. No new commands — extends existing `forge.skill.validate`, `forge.doctor`, `forge.create`. TypeScript types are minimal (9 metadata fields, all necessary for lifecycle). `packagesImpacted: [forge]` is correct. `nonGoals` are explicit and meaningful (no external memory providers, no automatic deduplication, no background compaction, no AGENTS.md routing changes).

## Axis G — Blind spots

**Finding G1: Performance cost not estimated.** Currently 4 skills declare knowledge files (11 files total: `fo-session-save` 3, `fo-memory-sync` 3, `forge-bootstrap` 3, `grilling` 2). The parser runs as part of `forge.skill.validate`, which already scans all skill files. The incremental cost of parsing 11 small markdown files is negligible, but the RFC should state the file count and note that the parser is linear in file size. As the knowledge system grows, the parser cost scales with total knowledge file size — worth noting for future budget RFCs (RFC-0661).

**Finding G2: Migration window close condition is vague.** The RFC says the warning-to-error promotion is "a separate follow-up decision, taken after at least one full compaction cycle (RFC-0662) has run on this monorepo" (line 320). No concrete trigger or timeline is specified. This is acceptable for a draft but should be tightened before acceptance — e.g., "after `forge.doctor` reports zero legacy sections across all knowledge files" would be a deterministic trigger.

## Questions for the author

1. Should `satisfies` include DNA-60? The RFC establishes DNA-60 but only lists DNA-54 in `satisfies`. `dna.registry.validate` expects the establishing RFC to reference the DNA invariant it creates.
2. What behavioral change does `forge.create` undergo? If only template content changes (structured-empty knowledge files in `packages/forge/skills/`), `forge.create`'s command logic doesn't change and it may not belong in `commands.changed`.
3. How should non-L0/L1/L2 knowledge files (`forge-bootstrap`'s `forge-about.md`, `operator-profile-template.md`, `project-narrative-template.md`) be handled? They don't fit the entry format but are declared in `knowledge:` frontmatter and would generate SKILL-19 false-positive warnings.
