---
rfcId: RFC-0465
auditId: AUDIT-RFC-0465-01
date: 2026-07-20
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0465

## Verdict: Needs revision

The RFC correctly identifies all 1287 pre-existing violations and proposes reasonable fixes. However, two factual errors in the Design section reference wrong file paths, and the V-23 fix needs clarification on whether RFC-0376 has acceptance probes that can be emitted. The cutoff date approach is sound and aligns with the existing `RFC_METADATA_CUTOFF` pattern.

## Mechanical validation (rfc.validate)

Pass — 0 violations on RFC-0465.

## Axis A — Structural completeness

- **F-A1 (minor)**: The `commands.proposed` field contains a descriptive string `"rfc.validate (modified: RFC-CMD-02 and RFC-CMD-03 rules gain cutoff date)"` rather than a clean command name. The `commands.proposed` array should contain command names only (e.g. `"rfc.validate"`); descriptions belong in the RFC body.
- **F-A2 (minor)**: The `commands.changed` field lists `"rfc.validate"` — this is correct since the RFC modifies the `rfc.validate` behavior, but the RFC should clarify that the change is in the lifecycle handler, not the validate command itself.

## Axis B — DNA alignment

No issues. `satisfies: []` is acceptable for a `policy` kind RFC. The RFC does not claim to establish or modify any DNA invariant.

## Axis C — Ecosystem fit

- **F-C1 (error)**: The Design section states the RFC-CMD-02 and RFC-CMD-03 rules are in `packages/forge/os/rfc/handlers/validate-rules.ts`. They are actually in `packages/forge/os/rfc/handlers/lifecycle.ts` (lines 97-111 for RFC-CMD-02, lines 124-138 for RFC-CMD-03). The file system responsibilities table and Design section must be corrected.
- **F-C2 (error)**: The Design section states `specRef` should be added to `packages/forge/os/rfc/types.ts`. This is correct — but the RFC should specifically reference the `RFC_KNOWN_KEYS` array at line 450 of `types.ts`, which is the array that V-20 checks against. Adding `specRef` to `RfcFrontmatter` interface alone is insufficient; it must also be in `RFC_KNOWN_KEYS`.
- **F-C3 (minor)**: The `packagesImpacted` field lists `forge` — this is correct, but the RFC should also list `forge` as the package containing the lifecycle handler. The package name in `package.json` is `@wgogol/forge`.

## Axis D — Forward-only compliance

No issues. The RFC does not propose compatibility shims or dual paths. The cutoff date approach is a clean exemption, not a migration path.

## Axis E — Agent-facing policy

No issues. Implementation notes are explicit. The MUST NOT about applying cutoff to other rules is good defensive language.

## Axis F — Pragmatism

- **F-F1 (minor)**: The cutoff date `2026-07-07` matches `RFC_METADATA_CUTOFF` in `types.ts` line 482. The RFC should reference this existing constant rather than hardcoding a new date, to keep a single source of truth. Consider reusing `RFC_METADATA_CUTOFF` directly.

## Axis G — Blind spots

- **F-G1 (minor)**: The V-23 fix for RFC-0376 says "run `rfc.verification.emit --id RFC-0376`". The audit verified that RFC-0376 has `createdAt >= 2026-07-07` and has acceptance probes — so `rfc.verification.emit` should work. However, the RFC should note that if the probes fail (overall != "pass"), the evidence file will still be created but V-23 will not be resolved. The fix may require updating the probes or the implementation first.
- **F-G2 (minor)**: The V-17 fix changes `status: implemented` to `status: superseded` for RFC-0346 and RFC-0366. This means these RFCs will move from `docs/rfcs/archive/implemented/` to `docs/rfcs/archive/superseded/` (or stay in place — the audit did not verify whether the validator requires directory consistency). The RFC should clarify whether file moves are needed.

## Questions for the author

1. Should the cutoff date reuse the existing `RFC_METADATA_CUTOFF` constant from `types.ts` rather than introducing a new date literal?
2. For V-17, do the affected RFC files need to be moved from `archive/implemented/` to `archive/superseded/`, or is changing the `status` field sufficient?
3. For V-23, what happens if `rfc.verification.emit --id RFC-0376` produces an evidence file with `overall: "fail"` — will V-23 still report a violation?
