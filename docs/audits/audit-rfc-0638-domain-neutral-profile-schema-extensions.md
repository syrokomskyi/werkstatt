---
rfcId: RFC-0638
auditId: AUDIT-RFC-0638-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0638

## Verdict: Needs revision

RFC-0638 proposes a clean, backward-compatible schema extension to `forge/stack-profile@1` with six optional domain-neutral fields. The design is sound and well-motivated. However, the file system responsibilities table names incorrect paths that don't match the actual codebase structure, and three blind spots need clarification before implementation.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **File system responsibilities table names incorrect paths.** The RFC says the schema is extended in `packages/forge/src/config/forge-config.ts`, but the stack profile schema (`stackProfileSchema`, `StackProfile` interface) lives in `packages/forge/src/profiles/stack-profile.ts` (`@/packages/forge/src/profiles/stack-profile.ts:23-52`). The `forge-config.ts` file is for `forge.yaml` project configuration, not stack profiles. The RFC also proposes a new file `packages/forge/src/config/profile-schema.ts` for domain field types — this should live in `packages/forge/src/profiles/` alongside the existing schema, not in `config/`.
- **Acceptance criterion #2** says "Schema extension loaded and validated in `packages/forge/src/config/forge-config.ts`" — this is the wrong file. The schema extension belongs in `packages/forge/src/profiles/stack-profile.ts` (or a new `packages/forge/src/profiles/profile-schema.ts` that `stack-profile.ts` imports from).

## Axis B — DNA alignment

- **DNA-54 connection is analogical, not literal.** DNA-54 says "Canonical forge skill bodies (`packages/forge/skills/**/*.md`) must not contain hardcoded project-specific literals." The RFC extends this principle to profile schemas, which is a reasonable architectural analogy. However, `satisfies: [DNA-54]` implies the RFC enforces or protects DNA-54, when in fact it broadens the same de-hardcoding concept to a new layer. This is acceptable — the RFC body explains the relationship clearly — but the `satisfies` claim is slightly stretched.
- No conflicts with existing DNA invariants. ✓

## Axis C — Ecosystem fit

- **Package boundaries**: `packages/forge` is the correct package. ✓
- **Pipeline placement**: No new commands, no pipeline changes. ✓
- **AGENTS.md updates**: Acceptance criterion mentions `packages/forge/AGENTS.md`. ✓
- **Command lifecycle**: `commands: proposed: [], added: [], changed: [], removed: []` — correct for a schema-only RFC. ✓
- **Export surface**: The RFC doesn't mention whether `StackProfileDomainFields` and the new Zod sub-schemas should be exported from `@warpgogol/forge` (the package entrypoint in `packages/forge/src/index.ts`). Existing `StackProfile` and `stackProfileSchema` are exported — the new types should be too. This is missing from the file system responsibilities table.

## Axis D — Forward-only compliance

No issues. Purely additive optional fields, no compatibility shims, no dual paths, no legacy code maintained. ✓

## Axis E — Agent-facing policy

- **Status gate**: No self-authorizing language. ✓
- **Implementation notes**: Present, reference correct governance rules. ✓
- **Anti-fabrication**: No content authoring claims. ✓
- **Storage policy**: No persistence changes. ✓

## Axis F — Pragmatism

- **Lean contracts**: TypeScript types are minimal and well-shaped. `ProfileArtifact`, `ProfileWorkspaceType`, `ProfileInvariant` each have only the fields needed. ✓
- **Existing patterns**: Extends existing `stackProfileSchema` rather than creating v2. ✓
- **Scope discipline**: `packagesImpacted: [packages/forge]` — correct. `appsImpacted: []` — correct. ✓
- **Non-goals**: 4 meaningful non-goals referencing planned follow-up RFCs (RFC-0639..0642). ✓

## Axis G — Blind spots

- **`register` conflict resolution undefined**: The RFC says `register` allows profiles to declare a default behavioral register (`business` or `creative`), used by `forge.create` when writing `PREFERENCES.md`. But what happens if a profile declares `register: creative` and the operator already has a `PREFERENCES.md` with `register: business`? Who wins? The RFC doesn't specify the precedence rules.
- **`terminology` universal key catalog missing**: The RFC says `terminology` is a `Record<string, string>` and the failure modes section says "missing terminology key falls back to the universal default term." But the RFC doesn't list the universal keys (e.g. `artifact`, `module`, `operator`, `source`, `output`, `verify`). Without a canonical key catalog, skills and profiles will use ad-hoc keys, leading to drift. The example YAML shows 7 keys, but these are presented as examples, not as a closed vocabulary.
- **`invariants` enforcement mechanism undefined**: The RFC says invariants are "used by `fo-review` and `forge.doctor` for domain-specific quality enforcement," but doesn't describe how. `fo-review` is a skill — how does it read profile invariants? `forge.doctor` is a command — does it scan files against invariant rules? The RFC says "No new CLI commands" and "The schema is consumed by commands in follow-up RFCs," but the acceptance criteria don't test enforcement, only parsing. The RFC should either (a) clarify that enforcement is fully deferred to follow-up RFCs and remove the claim that `fo-review` and `forge.doctor` use invariants, or (b) describe the enforcement mechanism.

## Questions for the author

1. Should the schema extension live in `packages/forge/src/profiles/stack-profile.ts` (where `stackProfileSchema` currently resides) or in a new `packages/forge/src/profiles/profile-schema.ts`? The RFC names `packages/forge/src/config/forge-config.ts` which is the wrong module.
2. What is the canonical set of universal `terminology` keys? Should they be a closed enum exported from `@warpgogol/forge`, or an open vocabulary with documented defaults?
3. When a profile declares `register: creative` but `PREFERENCES.md` already exists with `register: business`, which takes precedence? Does `forge.create` only write the default for new projects?
