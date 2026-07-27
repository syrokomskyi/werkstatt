---
rfcId: RFC-0547
auditId: AUDIT-RFC-0547-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0547

## Verdict: Needs revision

The RFC is structurally sound and architecturally well-aligned, but has a referential inconsistency (`amends: []` while the body claims to amend RFC-0545 and RFC-0546) and a privacy blind spot (collecting gender — GDPR special category data — in `operator-profile.md` without addressing public-repo exposure). These are fixable in enhance.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Decision** is a single present-tense decision — good.
- **File system responsibilities** table names concrete paths — good.
- **Failure modes** is thorough, covering doctor failure, ADR failure, empty project, git history failure — good.
- **Rollout** describes 10 concrete steps with a clear order — good.
- **Alternatives considered** has 9 real alternatives with rejection reasons — good.
- **Risks** includes agent misinterpretation, false positives, performance — good.
- **Acceptance criteria** — 20 items, mostly checkable. However, "collects personal data organically during the creative dialogue" (line 288) is not mechanically verifiable — it describes agent behavior, not a file artifact. Consider splitting into: (a) SKILL.md instructs the agent to collect personal data during the first creation moment, (b) `operator-profile.md` template has a `## Personal` section for this data.
- **Implementation notes** are explicit behavioral rules with MUST/MUST NOT — good.
- No CLI surface or TypeScript contracts section — N/A for a skill redesign RFC.

## Axis B — DNA alignment

- **Finding (fail):** `amends: []` in frontmatter is empty, but the body (lines 121–122) explicitly states "this RFC amends the report section" of RFC-0545 and "Git history transfer was specified in RFC-0546 but not implemented; this RFC implements it." RFC-0545 and RFC-0546 are listed in `related[]` but not in `amends[]`. If the RFC amends them, they must be in `amends[]`. If it only builds on them without changing their contracts, the body language should be softened.
- `satisfies: [DNA-54]` — DNA-54 (Forge bindings contract) is correctly referenced. The RFC states the welcoming report "does not hardcode project-specific literals" and is "generated from the forge.yaml config." The redesigned SKILL.md instruction lines must not introduce hardcoded `pnpm exec site-kernel run` or `docs/architecture-dna.md` — the RFC's "zero CLI commands in user-facing text" rule aligns with this.

## Axis C — Ecosystem fit

- **Package boundaries:** only `packages/forge` is impacted — correct.
- **AGENTS.md updates:** the RFC identifies `packages/forge/AGENTS.md` Output contract section needs updating — good.
- **Command lifecycle:** `commands.proposed/added/changed/removed` all empty — correct, no new commands.
- **Knowledge files:** the RFC declares `forge-about.md`, `operator-profile-template.md`, `project-narrative-template.md`, and `milestone-gallery/` in the skill's `knowledge` frontmatter array. This is correct per RFC-0524 — `forge.create` syncs them, `forge.doctor` checks for stale copies, `forge.skill.validate` enforces SKILL-13 (declared files must exist).

## Axis D — Forward-only compliance

- No compatibility shims or dual paths — good.
- The old report format is replaced directly, not maintained alongside — good.
- `.git` removal from `DEFAULT_EXCLUDE_PATTERNS` changes adapter behavior directly — good, no flag-gated legacy path.
- `postSetup` stubs are replaced with real implementations — good, no parallel interpretation.

## Axis E — Agent-facing policy

- **Status gate:** the RFC says "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" — good, no self-authorizing language.
- **Implementation notes** reference RFC-0334 (supersede escalation on invariant conflict) — good.
- **Anti-fabrication:** the RFC's acceptance criteria include creating `forge-about.md`, `operator-profile-template.md`, `project-narrative-template.md` — these are files an agent can create (templates and prose). The "first creation moment" is agent behavior guided by SKILL.md instructions, not auto-generated content. Fine.
- **Storage policy:** no cookies, no external service persistence — N/A.

## Axis F — Pragmatism

- **Minimal command surface:** no new commands — good.
- **Lean contracts:** the RFC uses the existing `MigrationAdapter.postSetup` signature, no new types — good.
- **Existing patterns:** extends the existing `forge-bootstrap` skill rather than creating a new one — good.
- **Scope discipline:** `packagesImpacted: [forge]` is correct. `nonGoals` are explicit and meaningful (9 items) — good.

## Axis G — Blind spots

- **Finding (fail):** **Privacy/GDPR blind spot.** The RFC collects operator gender (line 132: "ask the operator's name and gender") — gender is special category data under GDPR Article 9. The data is stored in `operator-profile.md` in the project root. If the project is pushed to a public GitHub repo, this personal data is exposed. The RFC does not address: (a) whether `operator-profile.md` should be in `.gitignore`, (b) what happens if the operator declines to provide gender, (c) data retention/deletion. The root AGENTS.md says "if the RFC touches user data, PII, or external services, it addresses GDPR/privacy implications."
- **Performance:** `git format-patch` on large repos — addressed in Risks. Good.
- **False positives:** auto-doctor false positives — addressed in Risks. Good.
- **Edge cases:** empty project transplant, source without `.git`, git history transfer failure — all addressed in Failure modes. Good.
- **Migration path for existing projects:** projects created before this RFC won't have `@webgogol/forge` as devDependency. The RFC doesn't address this. Minor — forge is at 0.1.2, recently published, likely no external projects yet.

## Questions for the author

1. The body says "this RFC amends the report section" of RFC-0545 and implements git history transfer from RFC-0546, but `amends: []` is empty. Should RFC-0545 and RFC-0546 be listed in `amends[]`? Or is the relationship "builds on" rather than "amends"?
2. The RFC collects gender (GDPR special category data) in `operator-profile.md`. What happens if the project is pushed to a public repo? Should `operator-profile.md` be added to `.gitignore`? What if the operator declines to provide gender?
3. The acceptance criterion "collects personal data organically during the creative dialogue" (line 288) describes agent behavior, not a verifiable artifact. Should this be split into a checkable criterion (e.g. "SKILL.md instructs the agent to collect project story, deep purpose, creative influences, audience, and writing voice during the first creation moment")?
