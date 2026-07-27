---
rfcId: RFC-0393
auditId: AUDIT-RFC-0393-01
date: 2026-07-19
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: approved
---

# Audit: RFC-0393

### Verdict: Approved

The RFC is architecturally sound and addresses a real portability gap. The bindings contract is well-designed with clear degradation semantics. The `bindings` slot is already reserved in the `forge/config@1` schema. One minor finding on SKILL-11 false-positive risk and one on the scope of the skill rewrite.

### Mechanical validation (rfc.validate)

Pass — no violations targeting RFC-0393.

### Axis A — Structural completeness

- **Decision** is present tense and specific. ✅
- **CLI surface** shows exact invocations. ✅
- **TypeScript contracts** are minimal type signatures with `resolveBinding`. ✅
- **File system responsibilities** table names concrete paths. ✅
- **Output format** documents the `--json` shape for `forge.doctor`. ✅
- **Failure modes** specifies exit codes, warn-vs-fail, and skill runtime behavior. ✅
- **Rollout** has 6 steps with clear ordering and the critical "resolved-equals-previous-literal" check. ✅
- **Alternatives** has 4 real alternatives with rejection reasons. ✅
- **Risks** includes weak-agent indirection, rewrite regressions, binding drift, and SKILL-11 false positives. ✅
- **Acceptance criteria** — 9 items, all checkable. ✅
- **Implementation notes** are explicit behavioral rules with RFC-0224 and RFC-0334 references. ✅

### Axis B — DNA alignment

- `satisfies: [DNA-1, DNA-2]` — both are real invariants. The RFC body explains how bindings make the monorepo boundary and pnpm/Turborepo invariants explicit per-project instead of implicit in skill texts. ✅
- The RFC establishes a new DNA invariant ("Forge bindings contract"). The body states it will be added to `docs/architecture-dna.md` at implementation time and `satisfies[]` extended in the same commit. ✅
- No conflict with existing DNA. ✅
- `related[]` references (RFC-0370, RFC-0374, RFC-0391, RFC-0392, RFC-0394, DNA-1, DNA-2) are all relevant. ✅

### Axis C — Ecosystem fit

- **Package boundaries**: all changes in `packages/forge/`. ✅
- **Pipeline placement**: no new commands; `forge.doctor` and `forge.agents.generate` are changed. `forge.skill.validate` gains SKILL-11. ✅
- **Compass sync**: no `docs/*.xml` changes needed — forge-internal feature. ✅
- **AGENTS.md updates**: acceptance criterion requires root `AGENTS.md` to document the bindings contract. ✅
- **Cosmic naming**: not applicable. ✅
- **Command lifecycle**: `commands.changed: [forge.doctor, forge.agents.generate]` — correct, no new commands. ✅

### Axis D — Forward-only compliance

- No compatibility shims. The skill rewrite replaces hardcoded values with binding refs — old values are gone, not maintained alongside. ✅
- `bindings` field was already reserved as `z.record(z.unknown()).optional()` in RFC-0391 — this RFC fills it, doesn't add a parallel schema. ✅
- No legacy code paths. ✅

### Axis E — Agent-facing policy

- **Status gate**: no self-authorizing language. ✅
- **Implementation notes** reference RFC-0224, RFC-0334. ✅
- **Anti-fabrication**: no content authoring claims. ✅
- **Storage policy**: no persistence or cookies. ✅
- **Degradation semantics** are explicitly defined: required binding missing → refuse; optional binding absent → skip + mandatory `Degraded:` report line. Silent skips are a contract violation. ✅

### Axis F — Pragmatism

- **Minimal command surface**: no new commands — extends existing `forge.doctor` and `forge.agents.generate`. ✅
- **Lean contracts**: `ForgeBindings` is minimal — commands, paths, terminology. The `terminology` field is optional and justified (e.g. `{ invariants: "DNA" }`). ✅
- **Existing patterns**: extends the proven `ref(…)` pattern from `languagePolicy`. ✅
- **Scope discipline**: `packagesImpacted` lists only `@wgogol/forge`. `nonGoals` are explicit. ✅

### Axis G — Blind spots

- **Performance**: `forge.doctor` bindings validation is trivial — schema parse + path existence checks. ✅
- **False positives**: SKILL-11 scans for `pnpm exec site-kernel`, `docs/architecture-dna.md`, `@gogol/` in instruction lines. The RFC acknowledges false-positive risk and specifies that only imperative instruction lines are scanned, with `<!-- skill-lint-disable SKILL-11 -->` escape hatch. ✅
- **Edge cases**: absent bindings (`null`), missing `bindings` section entirely, invalid paths — all handled. ✅
- **Migration path**: WGogol behavior is bit-identical after rollout — bindings resolve to the exact strings the skills contained before. ✅
- **Security/privacy**: no user data or external services. ✅

### Questions for the author

1. The skill rewrite is ~20 skills, one commit per skill — should the RFC specify a batching strategy (e.g. group by pipeline stage: idea → audit → enhance → plan → implement → review → fix → doc-audit) to reduce commit count while maintaining the resolved-value equivalence check?
2. The `terminology` field is `Record<string, string>` — should the RFC specify a closed vocabulary for known terminology keys (e.g. `invariants`, `compass`, `scopedBuild`) to prevent unbounded growth?
3. Should `forge.init` generate default bindings from stack detection results (RFC-0392), or should bindings always be hand-authored?
