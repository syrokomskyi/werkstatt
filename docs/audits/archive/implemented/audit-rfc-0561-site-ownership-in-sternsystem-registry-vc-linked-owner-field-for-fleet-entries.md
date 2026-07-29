---
rfcId: RFC-0561
auditId: AUDIT-RFC-0561-01
date: 2026-07-27
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0561

## Verdict: Needs revision

The RFC is structurally sound and the core decision (optional `owner` field on `fleetRegistryEntrySchema`) is well-motivated and architecturally aligned. However, two factual errors in `packagesImpacted` and file system responsibilities would mislead an implementing agent, and the `owner` field format validation is underspecified.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0561` exits 0 with zero violations.

## Axis A — Structural completeness

No issues. All required sections are present with substantive content. Decision is in present tense. CLI surface shows exact invocations. TypeScript contracts are minimal type signatures. Failure modes table specifies warn-vs-fail behavior. Rollout describes phased adoption. Alternatives section has four real alternatives with rejection reasons. Risks include agent misinterpretation risk. Acceptance criteria are checkable. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-45]` is correct — DNA-45 (Fleet registry, RFC-0354) is the invariant this RFC extends. The RFC amends RFC-0354 (the establishing RFC), which is the correct mechanism for adding a field to the registry schema. `related` entries (DNA-44, DNA-45, RFC-0354, RFC-0558, RFC-0559, RFC-0560) are all relevant and non-decorative. No conflicts with existing DNA invariants.

## Axis C — Ecosystem fit

**Finding C-1 (fail): Incorrect package in `packagesImpacted`.** The RFC lists `packages/os/site-kernel-onboarding` as impacted, and the file system responsibilities table says `packages/os/site-kernel-onboarding/src/register.ts` handles the `--owner` flag. However, the actual `sternsystem.register` command lives in `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts` (confirmed by `@/packages/os/site-kernel-handoff/src/sternsystem/index.ts:36` and `sternsystem-register.ts`). The `packagesImpacted` entry should be `packages/os/site-kernel-handoff`, and the file system responsibilities table should reference `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts`.

**Finding C-2 (fail): Missing `packages/studio-gate` in `packagesImpacted`.** The RFC proposes adding a `verifyOwnership` function to `packages/studio-gate/src/auth.ts` (line 165, TypeScript contracts section, file system responsibilities table). However, `packages/studio-gate` is not listed in `packagesImpacted`. Since the RFC proposes code changes in that package, it must be listed.

**Finding C-3 (pass with note): No AGENTS.md updates identified.** The RFC does not identify which `AGENTS.md` files need rule updates. Since the `owner` field is a schema extension with validation behavior, the root `AGENTS.md` §External mirror sync or `packages/ontology/AGENTS.md` may need updates to document the `owner` field. This is minor — the schema is self-documenting via Zod.

## Axis D — Forward-only compliance

No issues. The `owner` field is optional and additive — existing entries without `owner` remain valid. No compatibility shim, no dual-path, no expand-then-contract migration. The permissive/enforced mode toggle in Studio Gate is a config change (in `werkstatt.identity.json`), not a code-level dual-path. Deprecation of permissive mode is not proposed — both modes coexist as operator choice.

## Axis E — Agent-facing policy

No issues. The RFC is in `draft` status and contains no self-authorizing language. Implementation notes reference RFC-0224 (accepted→implemented transition), RFC-0334 (supersede escalation), RFC-0330 (verification evidence). Anti-fabrication: no content authoring claims. Storage policy: no cookies, no persistence concerns. The `owner` field is a plain string in a YAML file — no `document.cookie` or `Set-Cookie` implications.

## Axis F — Pragmatism

**Finding F-1 (pass with note): `verifyOwnership` function placement.** The RFC proposes a new `verifyOwnership` function in `packages/studio-gate/src/auth.ts`. RFC-0559 already defines `authenticateMcpCall` in the same file. The `verifyOwnership` function is a natural extension of the auth middleware, not a duplicate command. This is lean — no new command, no new package. The function could alternatively be a private helper inside `authenticateMcpCall`, but exposing it as a separate function is acceptable for testability.

No other issues. The `owner` field is a single optional string — minimal contract. No new commands proposed. `nonGoals` are explicit and meaningful (no transfer, no multi-owner, no pin file owner, no auto-assignment).

## Axis G — Blind spots

**Finding G-1 (fail): `owner` field format validation underspecified.** The RFC says `sternsystem.validate` "fails for entries with malformed `owner` field" (acceptance criterion, failure modes table) but does not define what "valid VC subject id" means. RFC-0558 uses `did:web:<domain>#<key-version>` format (e.g., `did:web:warpgogol.com#operator-v1`). The RFC should specify the validation regex or format rule that `sternsystem.validate` applies. Without this, an implementing agent would have to guess the format. Should it be `^did:web:.+#.+$`? Should it accept any non-empty string? Should it validate the domain matches the site id?

**Finding G-2 (pass with note): Empty string edge case.** The RFC does not specify whether `owner: ""` (empty string) is treated as "present" or "absent". The Zod schema `z.string().optional()` would accept an empty string as present. If the intent is that empty string equals absent, the schema should use `.optional().refine(s => s === undefined || s.length > 0)` or similar. This is minor but should be clarified.

**Finding G-3 (pass with note): Studio Gate mode configuration source.** The RFC references "permissive mode" and "enforced mode" but does not specify where the mode is configured. RFC-0559 establishes that `authMode` lives in `werkstatt.identity.json`. RFC-0561 should cross-reference this or at least state that the mode configuration is inherited from RFC-0559's auth middleware, not redefined here.

**Finding G-4 (pass with note): `verifyOwnership` registry path.** The `verifyOwnership` function signature takes `registryPath: string` but the RFC does not specify how Studio Gate obtains the registry path. In practice, Studio Gate runs in the workspace root and `systems/registry.yaml` is a fixed relative path. This is minor — the implementing agent can infer this — but the RFC should state it explicitly.

## Questions for the author

1. What format validation should `sternsystem.validate` apply to the `owner` field? Should it check for `did:web:` prefix, or accept any non-empty string? Should it validate that the domain in the `did:web` identifier matches the Sternsystem id?
2. The file system responsibilities table lists `packages/os/site-kernel-onboarding/src/register.ts` for the `--owner` flag, but `sternsystem.register` actually lives in `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-register.ts`. Should `packagesImpacted` be corrected to `packages/os/site-kernel-handoff`?
3. Should `packages/studio-gate` be added to `packagesImpacted` given that the RFC proposes adding `verifyOwnership` to `packages/studio-gate/src/auth.ts`?
