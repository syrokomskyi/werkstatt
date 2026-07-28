---
rfcId: RFC-0467
auditId: AUDIT-RFC-0467-01
date: 2026-07-20
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: approved
---

# Audit: RFC-0467

## Verdict: Approved

The RFC is well-structured, correctly references the compiler pipeline contract (RFC-0428), and aligns with DNA-1, DNA-20, and DNA-55. The 14-phase pipeline is clearly specified with pure function signatures, determinism requirements, and strictness modes. Minor findings on ecosystem fit and pragmatism do not block implementation.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **Decision** is present tense and specific: "packages/pbp/src/compiler/ is established as the home..."
- **CLI surface** correctly states "No CLI command. Library-only."
- **TypeScript contracts** are minimal signatures, not implementations.
- **File system responsibilities** table names all 16 concrete paths.
- **Output format** correctly states "N/A — library-only."
- **Failure modes** covers fatal vs. migration strictness, graph errors, missing singleton, duplicate IDs.
- **Rollout** describes immediate availability, no site impact, golden fixtures, dependency chain.
- **Alternatives considered** has 4 real alternatives with rejection reasons.
- **Risks** covers performance, determinism, schema drift, migration strictness.
- **Acceptance criteria** — 13 items, all checkable.
- **Implementation notes** — 7 explicit behavioral rules including determinism constraints and stub requirements.
- No issues.

## Axis B — DNA alignment

- **DNA-1 (Monorepo boundary):** Compiler lives in `packages/pbp/src/compiler/`. No site-local compiler code. Correctly aligned.
- **DNA-20 (Business layer):** The RFC states it "replaces the implicit load-and-merge logic in @gogol/business/src/loaders.ts with an explicit, phased, deterministic pipeline." This is a forward-only replacement — no compatibility shim. Correct.
- **DNA-55 (Spec vendoring):** Phase structure references `pbp-specification-package/compiler` sections. Correct.
- `satisfies: [DNA-1, DNA-20]` — both are real invariants and the RFC body explains how each is enforced.
- No issues.

## Axis C — Ecosystem fit

- **Package boundaries:** Compiler in `packages/pbp/`, no site imports until RFC-0469. Correct.
- **Pipeline placement:** Not applicable — library-only, no build pipeline hooks.
- **Compass sync:** The RFC does not mention which `docs/*.xml` files need synchronization. Since it adds a new `./compiler` export path to `packages/pbp/package.json`, `docs/technology.xml` and `docs/source-markup.xml` may need updates for the new module. **Minor finding.**
- **AGENTS.md updates:** The RFC does not explicitly mention updating `packages/pbp/AGENTS.md` with the new `./compiler` export path. The current AGENTS.md (updated by RFC-0466) lists `./schemas`, `./loaders`, `./astro` but not `./compiler`. **Minor finding — should be noted in implementation.**
- **Cosmic naming:** Not applicable — no manifests or components.
- **Command lifecycle:** `commands.proposed/added/changed/removed` all empty. Correct — no CLI commands.
- No blocking issues.

## Axis D — Forward-only compliance

- No compatibility shims, no dual-paths, no backward compatibility layers.
- The compiler is a new implementation, not a bridge to legacy.
- `migration` strictness mode is not a compatibility shim — it's a diagnostic mode that collects errors instead of aborting. The RFC explicitly states all errors must be resolved before cutover (RFC-0469).
- No issues.

## Axis E — Agent-facing policy

- **Status gate:** RFC is `draft`. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." No self-authorizing language.
- **Implementation notes** reference RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation). Correct.
- **Anti-fabrication:** Not applicable — code-only RFC.
- **Storage policy:** Not applicable — no persistence.
- No issues.

## Axis F — Pragmatism

- **Minimal command surface:** No CLI commands. Correct.
- **Lean contracts:** `PbpCompilerInput`, `PbpCompilerResult`, `PbpResolvedGraph`, `PbpBuyerView`, `PbpProjectionSet` — all minimal and purpose-driven.
- **Existing patterns:** The RFC extends the existing `PbpCompilerPhase` contract from RFC-0428 rather than inventing a new pipeline structure.
- **Scope discipline:** `packagesImpacted: ["@gogol/pbp"]` — correct, only one package. `appsImpacted: ["warpgogol-com"]` — correct, but the RFC explicitly states no site impact until RFC-0469.
- **Phase 8 and 13 stubs:** Justified — Wave 3/4 features with stable signatures. Pragmatic.
- No issues.

## Axis G — Blind spots

- **Performance:** The RFC acknowledges "The 14-phase pipeline may be slow for large catalogs" and mitigates with Wave 1 scope (~30 entities) and Wave 3 incremental processing. Adequate.
- **Determinism:** The RFC explicitly bans `Date.now()`, `Math.random()`, unsorted `Object.keys()`. `buildTime` is injected from caller. Good.
- **Edge cases:** The RFC considers missing business singleton (fatal error), duplicate IDs (fatal error), and missing refs (graph errors). Does not explicitly consider empty content directory (no `.md` files found). **Minor finding — Phase 1 should handle empty inventory gracefully.**
- **Migration path:** Not applicable — new module, no existing code to migrate.
- **Security/privacy:** Phase 10 semantic validation checks ADR-036 (no sensitive data in public fields). Adequate.
- No blocking issues.

## Questions for the author

1. Phase 1 (discover) should specify behavior when `src/content/business-profile/` is empty or missing — should it return an empty inventory or throw?
2. Should the `./compiler` export path be added to `packages/pbp/AGENTS.md` and `docs/technology.xml` as part of this RFC's implementation, or deferred to a doc-audit step?
3. The `PbpCompilerResult.projectionSet` type references `PbpWebsiteProjection` and `PbpAiAnswerProjection` from RFC-0455/0456 — are these interfaces already exported from `packages/pbp/src/entities/`, or do they need to be created?
