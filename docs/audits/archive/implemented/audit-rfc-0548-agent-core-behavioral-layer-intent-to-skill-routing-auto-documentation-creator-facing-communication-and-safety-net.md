---
rfcId: RFC-0548
auditId: AUDIT-RFC-0548-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0548

## Verdict: Needs revision

The RFC is architecturally sound and well-structured, but has multiple findings on axes C, F, and G that collectively undermine its coherence: missing `packagesImpacted` entry, empty `commands.changed` bucket, ambiguous ownership of `operator-profile-template.md` between RFC-0547 and RFC-0548, and unaddressed privacy concerns about git-tracking personal data in `operator-profile.md`.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0548 --json` returned 0 violations.

## Axis A — Structural completeness

- **Decision** is present tense and comprehensive: "The generated AGENTS.md gains a Core behavioral layer section…" ✓
- **File system responsibilities** table names concrete paths. ✓
- **Failure modes** is detailed with 14 specific scenarios. ✓
- **Rollout** describes 8 steps with clear ordering. ✓
- **Alternatives considered** has 12 real alternatives with rejection reasons. ✓
- **Risks** has 16 risks with mitigations. ✓
- **Acceptance criteria** are checkable and split into machine-checkable vs. behavioral guidelines. ✓
- **Implementation notes** are explicit behavioral rules. ✓
- **Finding A1**: the RFC is 869 lines covering 19 behavioral areas. While each section contains real content, the sheer scope makes it difficult to review and implement as a single unit. Consider whether some areas (e.g. external capabilities/MCP, sharing, cultural awareness) could be deferred to follow-up RFCs.

## Axis B — DNA alignment

- `satisfies: [DNA-54]` — DNA-54 is the Forge bindings contract. The RFC states "the behavioral layer in AGENTS.md does not hardcode project-specific literals; it references skills by name and uses bindings for command references where needed" (line 132).
- **Finding B1**: the connection to DNA-54 is weak. DNA-54 is about skill bodies not containing hardcoded project-specific literals. The RFC's behavioral layer is generated text in AGENTS.md, not a skill body. The RFC should explain how the generator ensures the behavioral layer uses `ref(forge.yaml bindings.*)` references where it mentions commands, rather than hardcoding paths like `docs/adrs/` or `docs/rfcs/` — which appear literally in the generated content (lines 178-179, 651).
- No conflicts with existing DNA invariants. ✓
- `related[]` references (RFC-0542, RFC-0545, RFC-0547, RFC-0549) are all relevant. ✓

## Axis C — Ecosystem fit

- **Finding C1**: `packagesImpacted` lists only `forge`, but the RFC also touches `packages/os/site-kernel-handoff/src/migrators/registry.ts` (line 726, rollout step 6). `site-kernel-handoff` should be in `packagesImpacted`.
- **Finding C2**: `commands.changed` is empty (`[]`), but the RFC changes the behavior of two existing registered commands: `forge.agents.generate` (adds behavioral layer section) and `forge.create` (auto-calls `forge.agents.generate`). These should be listed in `commands.changed`.
- Package boundaries are correct: all changes are in `packages/forge/` and `packages/os/site-kernel-handoff/`. ✓
- The RFC correctly identifies `packages/forge/AGENTS.md` as needing an update (Output contract section). ✓
- No new packages proposed. ✓

## Axis D — Forward-only compliance

No issues. The migrator backs up and regenerates AGENTS.md — no dual-path, no compatibility shim. The idempotent regeneration with section markers is a clean replacement, not a parallel interpretation. Legacy AGENTS.md content within markers is overwritten, not preserved alongside.

## Axis E — Agent-facing policy

- **Status gate**: the RFC says "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 854). ✓
- **Implementation notes** reference RFC-0478 (platform versioning), RFC-0547 (onboarding), RFC-0549 (extended layer). ✓
- **Anti-fabrication**: behavioral guidelines are correctly separated from machine-checkable criteria. ✓
- **Storage policy**: `operator-profile.md` is a Markdown file, no cookies or client-side persistence. ✓

## Axis F — Pragmatism

- **Finding F1**: `operator-profile-template.md` ownership is ambiguous. Rollout step 3 (line 749) says "(Owned by RFC-0547.)" but acceptance criterion (line 819) checks for its existence and declaration in forge-bootstrap's `knowledge` array. If RFC-0547 owns it, RFC-0548 should not have an acceptance criterion for it — or the criterion should say "verify RFC-0547 created it." As written, an implementer of RFC-0548 alone would not know whether to create the file.
- **Finding F2**: `operator-profile.md` is placed at `.agents/skills/operator-profile.md` (line 197, 286). This is inside the skills directory, which is managed by `forge.init` and `forge.create` skill sync. The existing `knowledge` field mechanism (RFC-0524) is per-skill — knowledge files live in the skill's own directory and are synced alongside `SKILL.md`. But `operator-profile.md` is not a knowledge file of a specific skill — it is a cross-cutting data file read at session start. Placing it in `.agents/skills/` (without a parent skill directory) may conflict with skill sync logic that iterates skill directories. The RFC should justify this placement or consider `.agents/operator-profile.md` instead.
- **Finding F3**: the RFC proposes that `fo-session-retro` declares `operator-profile.md` as a knowledge file (line 295, 750), but `fo-session-retro`'s `SKILL.md` is at `packages/forge/skills/fo/fo-session-retro/SKILL.md`. Knowledge files are relative to the SKILL.md directory. `operator-profile.md` at `.agents/skills/operator-profile.md` is not relative to `fo-session-retro`'s directory — it's in a completely different location. The `knowledge` field mechanism does not support cross-directory references. This is a structural mismatch.
- **Finding F4**: the RFC's scope is very large — 19 behavioral areas in one RFC. While the core/extended split with RFC-0549 helps, the core layer alone is still enormous. Some areas (external capabilities/MCP, sharing, cultural awareness, invisible quality) are arguably independent of the behavioral layer and could be separate RFCs.

## Axis G — Blind spots

- **Finding G1**: the RFC does not discuss the context-window cost of the behavioral layer. AGENTS.md is loaded into every agent's system prompt. Adding 19 sections of behavioral guidance (the example structure at lines 627-715 is ~90 lines of Markdown) adds significant token count. The RFC should estimate the token impact and consider whether the full layer should be in AGENTS.md or in a referenced file.
- **Finding G2**: the RFC addresses `operator-profile.md` privacy with Zugangsstufen and developer handoff exclusion, but does not adequately address git tracking. The file lives at `.agents/skills/operator-profile.md` and is committed to git (the RFC says "git-tracked" at line 782). Personal data — emotional rhythm, frustration triggers, deep purpose, feedback history — in git history is a permanent record that cannot be easily purged. The RFC should address whether `operator-profile.md` (or its Vertraulich sections) should be in `.gitignore`, or whether git-tracking personal observations is acceptable given the 90-day expiry mechanism (which marks entries as expired but does not remove them from git history).
- **Finding G3**: the RFC says the intent-to-skill routing table is "generated from the skill registry" and "each skill's `description` field is the source for the 'Operator says' column" (line 156). But the example table at lines 146-154 has hardcoded natural-language triggers ("I want to add / create / build / change something") that are not present in any skill's `description` field. The generator would need a mapping from skill descriptions to natural-language triggers — this mapping logic is not described. The RFC should specify how the generator produces the "Operator says" column from skill descriptions, or acknowledge that the routing table is fixed text, not generated.
- **Edge cases** are well-covered (empty profile, missing file, contradictory insights, false positives). ✓
- **Migration path** is documented (backup + regenerate, idempotent). ✓

## Questions for the author

1. Should `commands.changed` list `forge.agents.generate` and `forge.create` since this RFC changes their behavior? If not, why are they excluded?
2. Who owns `operator-profile-template.md` — RFC-0547 or RFC-0548? If RFC-0547, should RFC-0548's acceptance criterion for it be removed or reworded as a dependency check?
3. How does the `knowledge` field mechanism support `operator-profile.md` at `.agents/skills/operator-profile.md` when knowledge files are relative to the declaring skill's directory? Is a new mechanism needed, or should the file location change?
4. Should `operator-profile.md` (or its Vertraulich sections) be git-tracked given that it contains personal data? The 90-day expiry marks entries but does not remove them from git history.
5. How does the generator produce the "Operator says" column from skill descriptions? The example triggers are natural language, not present in any skill's `description` field.
