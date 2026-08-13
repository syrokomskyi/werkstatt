---
rfcId: RFC-0823
auditId: AUDIT-RFC-0823-01
date: 2026-08-13
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0823

## Verdict: Needs revision

RFC устанавливает архитектуру тестирования и корректно делегирует реализацию downstream RFCs. Однако есть структурное нарушение V-13 (уровень заголовка Rollout) и несколько пробелов в Axis A (CLI surface, output format, failure modes). DNA-66 уже добавлен в `docs/architecture-dna.md` до принятия RFC — это преждевременно, но не блокирующе.

## Mechanical validation (rfc.validate)

One warning targeting RFC-0823:

- **V-13**: Missing required section `## Rollout` — the RFC has `### Rollout` (h3) at line 170 instead of `## Rollout` (h2).

## Axis A — Structural completeness

- **Rollout heading level**: `### Rollout` (h3, line 170) should be `## Rollout` (h2). V-13 catches this. Fix: promote to h2.
- **CLI surface missing**: The Rollout section mentions commands (`service.test.run`, `site.smoke.run`, `service.integration.run`, `contract.validate`, `site.e2e.run`) but doesn't show CLI syntax (flags, scope). For an architectural RFC these may be intentionally deferred to downstream RFCs, but the Rollout section should clarify that command details are in downstream RFCs, not here.
- **Output format missing**: No `--json` shape documented. The TypeScript contracts (`TestEvidence`, `TestFailure`) serve as the structural contract, but the RFC doesn't show the JSON output shape explicitly. Minor — acceptable for an architectural RFC if downstream RFCs define per-command output.
- **Failure modes missing**: No exit codes or warn-vs-fail behavior specified. The Risks section discusses operational risks but not command failure semantics. Minor — acceptable if deferred to downstream RFCs.
- **Decision**: Present, single decision in present tense. Good.
- **TypeScript contracts**: Present, minimal. Good.
- **File system responsibilities**: Present, concrete paths. Good.
- **Alternatives considered**: Present, honest, with rejection reasons. Good.
- **Risks**: Present, includes dev channel availability and test credentials. Good.
- **Acceptance criteria**: Checkable and sufficient. Good.
- **Implementation notes**: Present, explicit behavioral rules. Good.

## Axis B — DNA alignment

- `satisfies: [DNA-41, DNA-64]` — both exist. The RFC body explains how L1 extends DNA-41 (PBT) and how test infrastructure fits DNA-64 (plugin, not engine). Good.
- **DNA-66 already in `docs/architecture-dna.md`** (line 279-281, "Established by RFC-0823") while RFC-0823 is still `draft`. This is premature — the DNA entry should be added during implementation, not creation. However, `dna.registry.validate` does not flag this (it only checks referential integrity, not RFC status). Not blocking, but the author should be aware.
- `related[]` references (DNA-41, DNA-64, RFC-0249, RFC-0251, RFC-0347, RFC-0806) are all relevant and verified. Good.

## Axis C — Ecosystem fit

- **Package boundaries**: Tests in `packages/werkstatt-site/src/testing/` — correct, this is the site plugin. Good.
- **Pipeline placement**: The RFC says L1 runs "CI, pre-commit" and L3 runs "CI, pre-deploy gate" but doesn't name the kernel pipeline (`build.prepare`, `build.check`, `sites-check`, `sites-check-postbuild`). L2/L4/L5 are tied to deployment commands, not build pipelines — this is clear. For L1/L3, the pipeline should be named. Gap.
- **Compass sync**: The RFC doesn't identify which `docs/*.xml` files need synchronization. Since it establishes a new DNA invariant and testing architecture, `docs/requirements.xml` and `docs/technology.xml` likely need updates. Gap.
- **AGENTS.md updates**: Acceptance criterion says "AGENTS.md updated with testing architecture reference" but doesn't specify which AGENTS.md (root? `packages/werkstatt-site/AGENTS.md`?). Should be explicit.
- **Command lifecycle**: `commands.proposed/added/changed/removed` are all empty — correct for an architectural RFC with no commands. Good.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual paths. The RFC establishes a new architecture cleanly.

## Axis E — Agent-facing policy

- **Status gate**: Correct — "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Good.
- **Implementation notes**: Reference RFC-0224 (accepted→implemented transition). Good.
- **NEEDS CLARIFICATION markers**: None found. Good.
- **DNA-66 prematurity**: See Axis B — DNA-66 is already in the DNA file while the RFC is in draft. This is not self-authorizing language, but it is a procedural irregularity. The DNA entry was likely added during RFC creation rather than implementation.

## Axis F — Pragmatism

- **`packagesImpacted` includes `@warpgogol/werkstatt`**: The RFC creates the testing directory in `packages/werkstatt-site/src/testing/` — no code changes are planned for the engine package. `@warpgogol/werkstatt` should be removed from `packagesImpacted` unless there's a planned engine change not mentioned in the body.
- **Lean contracts**: TypeScript types are minimal and sufficient. Good.
- **Scope discipline**: `nonGoals` are explicit and meaningful. Good.

## Axis G — Blind spots

- **Performance**: Not applicable — this RFC creates directory structure and helpers only. Downstream RFCs handle test execution cost.
- **Edge cases**: Dev channel availability and test credentials are addressed in Risks. Good.
- **Migration path**: Rollout section describes adoption path. Good.
- **Security/privacy**: Test credentials discussed in Risks. Good.

## Questions for the author

1. Why is `### Rollout` at h3 instead of h2 (`## Rollout`)? V-13 expects a top-level section. Is this a formatting error or intentional nesting under Design?
2. `packagesImpacted` lists `@warpgogol/werkstatt` — what code changes are planned for the engine package? If none, should it be removed?
3. Which `docs/*.xml` files need synchronization after this RFC is accepted? The RFC establishes a new DNA invariant but doesn't mention Compass document duties.
