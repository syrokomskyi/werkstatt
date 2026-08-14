---
workPacket: FORGE-KNOWLEDGE-03
status: ready
dependsOn: [FORGE-KNOWLEDGE-01, FORGE-KNOWLEDGE-02]
findings: [F1]
concern: code-mutation
---

# Packet 03 — Shared knowledge budget enforcement

## Objective

Make the RFC-0663 shared hot layer visible to the same advisory governance surfaces as local hot/warm knowledge. The shared file is counted once per workspace under a distinct `shared` budget with default 4096.

## Preconditions

- Packets 01 and 02 are committed and Forge tests pass.
- No compaction API migration remains unstaged.
- The current shared file is retained; this packet must expose its over-budget state, not trim it automatically.

## Required contracts

### Budget types and config

```ts
export interface KnowledgeBudgets {
  hot: number;
  warm: number;
  shared: number;
}

export type KnowledgeBudgetKind = "hot" | "warm" | "shared";

export interface KnowledgeBudgetSource {
  parsed: ParsedKnowledgeFile;
  skill: string;
  budgetKind: KnowledgeBudgetKind;
  pack?: string;
}
```

`DEFAULT_KNOWLEDGE_BUDGETS` is exactly `{ hot: 4096, warm: 8192, shared: 4096 }`.

Extend `bindings.knowledge.budgets` in both the runtime config type and Zod schema. Every value must be a positive integer. Resolver behavior is per-field: one invalid override falls back only that field and does not discard valid siblings.

### Budget computation

Replace the parallel `ParsedKnowledgeFile[]` + `skillNames Map` inputs with explicit `KnowledgeBudgetSource[]` (or an equivalent single descriptor type). Budget identity is supplied by the collector; it is not derived from basename/path.

- L0 sources are skipped.
- Local L1 → `warm`.
- Local L2 → `hot`.
- Shared L2 → `shared`.
- Only `status: active` entries count.
- Existing metadata/body counting algorithm remains stable unless an exact-character bug is demonstrated with a test.
- Reports carry `budgetKind` so JSON consumers can distinguish local/shared L2.

### Authority-aware shared source

Resolve the shared file once:

- Forge monorepo: `packages/forge/skills/shared/knowledge/learned-principles.md` is canonical.
- npm consumer: `<workspace>/<paths.skillsDir>/shared-knowledge/learned-principles.md` is local canonical state.

Do not count the monorepo source and `.agents` mirror together. Do not count the shared file once per consuming skill.

Extract a single collector/helper used by both `forge.skill.validate` and `forge.doctor` for shared source resolution. Local skill/pack collection may remain in its owning module, but shared identity and budget semantics must not be duplicated.

### Warning semantics

- At or below budget: no SKILL-21 warning; doctor reports headroom/pass.
- Above budget: advisory warning only; exit code remains successful unless unrelated violations exist.
- Warning uses `skill: "shared"`, `budgetKind: "shared"`, active chars, budget, exceededBy, and an actionable compaction/distillation hint.
- Invalid override: doctor warning with exact key and fallback; validator uses the same effective budget.
- Summary lists `hot`, `warm`, and `shared` effective values and their source (`default`/`override` per field if the current output can represent it without ambiguity).

## Affected artifacts

- `packages/forge/src/knowledge/budgets.ts`
- `packages/forge/src/knowledge/index.ts`
- `packages/forge/src/config/forge-config.ts`
- `packages/forge/src/validators/skill-validate.ts`
- `packages/forge/src/onboarding/doctor.ts`
- `packages/forge/src/tests/budgets.test.ts`
- Relevant doctor and skill-validator tests/fixtures
- `forge.yaml` defaults/bindings documentation only if shared is materialized there
- `packages/forge/AGENTS.md` budget contract paragraph
- `docs/ecosystem.generated.yaml` only through its generator if a projected schema changes

## Implementation steps

1. Add failing tests for missing default/override and a 4097-character shared source.
2. Extend the config schema/types/resolver with per-field fallback.
3. Replace implicit layer-to-budget routing with explicit source descriptors.
4. Add authority-aware shared source resolution and collect it once.
5. Route the same reports into SKILL-21 and doctor output.
6. Update fixtures/JSON assertions and package documentation.
7. Run a real command against this workspace and capture the shared over-budget warning as evidence; do not mutate knowledge in this packet.

## Mandatory test matrix

### Resolver

- no forge.yaml;
- no knowledge binding;
- all defaults;
- valid shared override;
- zero, negative, fractional, string, null shared override;
- invalid shared with valid hot/warm preserves valid siblings;
- valid shared with invalid hot/warm preserves shared.

### Computation

- active chars exactly 4096 → no exceedance;
- active chars 4097 → exceededBy 1;
- stale/superseded/archived excluded;
- local L2 uses hot, same-shaped shared L2 uses shared;
- shared appears once with zero, one, and several consuming skills;
- monorepo source plus identical `.agents` mirror still produces one report;
- npm-consumer source uses `.agents` state.

### Surfaces

- SKILL-21 warning exact fields and advisory status;
- doctor effective budget summary includes shared;
- invalid override doctor warning names `bindings.knowledge.budgets.shared`;
- validator and doctor agree on activeChars/budget/exceededBy for the same fixture.

## Validation commands

```sh
rtk pnpm --filter @warpgogol/forge exec vitest run src/tests/budgets.test.ts src/tests/skill-validate.test.ts src/tests/doctor-bindings.test.ts
rtk pnpm --filter @warpgogol/forge build:check
rtk node packages/forge/bin/cli.js forge.skill.validate --json
rtk node packages/forge/bin/cli.js forge.doctor --json
```

If test filenames differ, discover them with `rg --files packages/forge/src/tests` and run the exact owning tests; do not silently omit a surface.

## Completion criteria

- Typed config, resolver, validator, and doctor all expose `shared`.
- Shared source is counted once under explicit identity.
- Current workspace produces a real shared over-budget warning without failing the command solely for that warning.
- Boundary and invalid-override tests pass.
- Validator/doctor reports agree for the same input.
- Full Forge tests and `build:check` pass.
- No automatic compaction, deletion, promotion, or budget increase is introduced.
- Review has no unresolved High/Medium finding for F1.

## Forbidden shortcuts

- Mapping every L2 file to `hot` and special-casing one path later.
- Using `path.includes("shared")` or basename inference.
- Counting the `.agents` mirror in addition to monorepo source.
- Raising default 4096 to hide the present warning.
- Turning budget warnings into build blockers.
- Trimming or archiving knowledge as a side effect of validation.

## Escalation trigger

Escalate only if shared knowledge needs more than one independent budget pool or a hard blocking policy. Both change RFC-0663 semantics; neither is authorized here.
