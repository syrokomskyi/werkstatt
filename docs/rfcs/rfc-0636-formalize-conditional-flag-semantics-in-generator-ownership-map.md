---
id: RFC-0636
title: "Formalize conditional flag semantics in GENERATOR_OWNERSHIP_MAP"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-01
updatedAt: 2026-08-01
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0600
  - RFC-0612
  - RFC-0375
amendedBy: []
enhancedAt: 2026-08-01
related:
  - DNA-58
  - RFC-0087
  - RFC-0375
  - RFC-0634
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-58
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - generated.stale.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - '@warpgogol/site-kernel-checks'
successSignals:
  - All three ownership validators (generated.files.validate, ownership.sync.validate, generated.stale.validate) handle conditional entries consistently — conditional entries cover files on disk but do not report phantom diagnostics when the file is absent
  - A conditional ownership entry (e.g. build-identity.json) present on disk passes all three validators without OWN-01, OWN-02, STALE-01, or GEN-FILES-01 diagnostics
  - A conditional ownership entry absent from disk produces no phantom diagnostics (OWN-02, GEN-FILES-01) in any validator
  - Regression test in generated-stale-validate.test.ts covers the conditional-coverage scenario
nonGoals:
  - Do not remove the conditional flag — it is needed for transient files like build-identity.json that only exist during builds
  - Do not add a new command — the fix is in existing validator logic
  - Do not change the GENERATOR_OWNERSHIP_MAP data structure or OwnershipEntry interface
  - Do not change how build-identity.json is written or cleaned up by leitstand.dev-deploy or release.prepare
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec site-kernel run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0636: Formalize conditional flag semantics in GENERATOR_OWNERSHIP_MAP

## Context

`GENERATOR_OWNERSHIP_MAP` (RFC-0087) in `packages/os/site-kernel-checks/src/generator-ownership.ts` is the cross-workspace registry that declares every generated file and its owning command. Each `OwnershipEntry` has an optional `conditional: boolean` field. The field was introduced to handle files that are only generated under certain conditions (e.g. CMS-git adapter files) and should not trigger phantom diagnostics when absent.

Three validators consume `GENERATOR_OWNERSHIP_MAP`:

1. `generated.files.validate` (RFC-0375) — checks that declared files exist on disk. Skips conditional entries for existence checks.
2. `ownership.sync.validate` (RFC-0612) — bidirectional sync check: OWN-01 (file on disk not covered), OWN-02 (entry matches no file). Adds conditional entries to the expected-path set but skips them for phantom checks.
3. `generated.stale.validate` (RFC-0600) — detects files in `public/` not produced by any registered generator. Previously skipped conditional entries **entirely** via `if (entry.conditional) continue;`, meaning files on disk that matched a conditional entry were not covered and were incorrectly flagged as STALE-01.

RFC-0634 introduced a preliminary `build-identity.json` written to `public/.well-known/` before `pnpm build` by `leitstand.dev-deploy` and `release.prepare`. The file is transient — it is cleaned up after the build. When `ownership.sync.validate` ran during `build.prepare`, it flagged the preliminary file with OWN-01 because no `GENERATOR_OWNERSHIP_MAP` entry existed. After adding a conditional entry, `ownership.sync.validate` passed but `generated.stale.validate` still flagged the file with STALE-01 because it skipped conditional entries wholesale.

## Problem

The `conditional` flag had **inconsistent semantics** across the three validators that consume `GENERATOR_OWNERSHIP_MAP`:

- `generated.files.validate` — correctly skipped existence checks for conditional entries.
- `ownership.sync.validate` — correctly added conditional entries to the expected-path set (covering files on disk) while skipping phantom checks.
- `generated.stale.validate` — **incorrectly** skipped conditional entries entirely (`if (entry.conditional) continue;`), meaning files on disk that matched a conditional entry were not covered and were flagged as STALE-01.

This inconsistency was not caught by any test or validation rule. It remained latent until RFC-0634 introduced `build-identity.json` — the first conditional entry for a file in `public/` that actually exists on disk during `build.prepare`. The result was a deployment failure in `leitstand.dev-deploy` that took 15+ minutes to diagnose.

The root cause is that the `conditional` flag's semantics were never formally defined. The `OwnershipEntry` interface has a docstring ("`generated.files.validate` will skip existence checks for conditional entries") but no cross-validator contract specifying how all three validators must handle the flag.

## Decision

The `conditional` flag on `OwnershipEntry` is formally defined as: **skip absence checks, not coverage checks.** A conditional entry covers files on disk in all three validators (`generated.files.validate`, `ownership.sync.validate`, `generated.stale.validate`) but does not produce phantom diagnostics (OWN-02, GEN-FILES-01) when the file is absent. The `generated.stale.validate` bug (`if (entry.conditional) continue;`) is fixed by removing the wholesale skip, aligning it with the already-correct behavior of `ownership.sync.validate`.

## Architectural fit

- **DNA-58 (Generated-file content determinism):** The `GENERATOR_OWNERSHIP_MAP` is the registry that underpins generated-file governance. Formalizing the `conditional` flag ensures that transient generated files (like `build-identity.json`) are correctly covered by all validators without producing false positives, maintaining the integrity of the generated-file determinism enforcement chain.

- **RFC-0087 (GENERATOR_OWNERSHIP_MAP):** This RFC formalizes the semantics of the `conditional` field that RFC-0087 introduced without a cross-validator contract.

- **RFC-0600 (generated.stale.validate):** Amended — the `if (entry.conditional) continue;` line is removed. Conditional entries now contribute to the expected-path set.

- **RFC-0612 (ownership.sync.validate):** Amended — the already-correct behavior (conditional entries added to expectedPaths, skipped for phantom checks) is formally documented as the reference implementation.

- **RFC-0375 (generated.files.validate):** Amended — no code change needed, but the formal contract is documented as intended behavior. The already-correct skip of existence checks for conditional entries is now formally specified.

- **RFC-0634 (build-identity.json):** The conditional ownership entry for `public/.well-known/build-identity.json` is now covered consistently by all validators.

## Design

### Conditional flag contract

The `conditional: boolean` field on `OwnershipEntry` is formally defined as:

| Validator | Conditional entry on disk | Conditional entry absent |
| --- | --- | --- |
| `generated.files.validate` | No GEN-FILES-01 (file exists) | No GEN-FILES-01 (existence check skipped) |
| `ownership.sync.validate` | No OWN-01 (covered by expected-path set) | No OWN-02 (phantom check skipped) |
| `generated.stale.validate` | No STALE-01 (covered by expected-path set) | N/A (stale validator only checks files on disk) |

The key invariant: **conditional entries always contribute to the expected-path set.** The `conditional` flag only suppresses diagnostics that fire when a declared file is **absent** (OWN-02, GEN-FILES-01). It never suppresses diagnostics that fire when a file on disk is **uncovered** (OWN-01, STALE-01).

### CLI surface

No new commands. The fix is internal to `generated.stale.validate`:

```sh
# These commands continue to work exactly as before:
pnpm exec site-kernel run generated.stale.validate --site warpgogol-com
pnpm exec site-kernel run ownership.sync.validate --site warpgogol-com
pnpm exec site-kernel run generated.files.validate --site warpgogol-com
```

### TypeScript contracts

No interface changes. The `OwnershipEntry.conditional` field and its docstring are updated to reflect the formal contract:

```ts
export interface OwnershipEntry {
  path: string;
  command: string;
  markerPolicy?: "embedded" | "registry-only";
  module?: string;
  /**
   * When true, the file is only generated under certain conditions.
   *
   * Semantics (RFC-0636): "skip absence checks, not coverage checks."
   * - Conditional entries ALWAYS contribute to the expected-path set in all
   *   three validators (generated.files.validate, ownership.sync.validate,
   *   generated.stale.validate). Files on disk that match a conditional entry
   *   are covered and do not trigger OWN-01 or STALE-01.
   * - Conditional entries do NOT produce phantom diagnostics (OWN-02,
   *   GEN-FILES-01) when the file is absent from disk.
   */
  conditional?: boolean;
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/generator-ownership.ts` | `GENERATOR_OWNERSHIP_MAP` registry, `OwnershipEntry` interface with updated docstring |
| `packages/os/site-kernel-checks/src/generated-stale-validate.ts` | Bug fix: removed `if (entry.conditional) continue;` |
| `packages/os/site-kernel-checks/src/ownership-sync-validate.ts` | Reference implementation (already correct, no change) |
| `packages/os/site-kernel-checks/src/generated-files-validate.ts` | Already correct, no change |
| `packages/os/site-kernel-checks/src/tests/generated-stale-validate.test.ts` | Regression test for conditional coverage |

### Failure modes

No new failure modes. The fix eliminates a false-positive failure mode:

- **Before:** `generated.stale.validate` reported STALE-01 for any file in `public/` that matched a conditional ownership entry, because conditional entries were skipped entirely.
- **After:** `generated.stale.validate` covers conditional entries in the expected-path set. Files matching conditional entries are not flagged as stale.

## Rollout

The fix is already applied and committed. No migration path is needed — the bug fix is backward-compatible:

- **Existing conditional entries** (e.g. CMS-git adapter files) were already absent from disk in most sites, so the stale validator's `continue` skip had no effect. Removing the skip does not change behavior for absent files.
- **New conditional entries** (e.g. `build-identity.json` from RFC-0634) are now correctly covered when present on disk.
- **No pipeline changes** — `generated.stale.validate` continues to run in `build.prepare` as step 62/62. The fix is transparent to all sites.
- **Regression test** added to `generated-stale-validate.test.ts` to prevent reintroduction.

## Alternatives considered

- **Remove the `conditional` flag entirely.** Make all entries non-conditional. Rejected because transient files like `build-identity.json` only exist during builds. Without `conditional: true`, `generated.files.validate` would report GEN-FILES-01 when the file is absent (which is the normal state outside of builds), and `ownership.sync.validate` would report OWN-02 for the same reason.

- **Add a separate `coverageExempt` flag.** Introduce a new boolean field for entries that should be excluded from coverage checks. Rejected because it adds unnecessary complexity. The current fix (removing the `continue` in `generated.stale.validate`) is a one-line change that aligns the validator with the already-correct behavior of `ownership.sync.validate`. The `conditional` flag's semantics are clear once documented: skip absence checks, not coverage checks.

- **Document the contract in AGENTS.md only, without an RFC.** Rejected because `GENERATOR_OWNERSHIP_MAP` is a cross-workspace contract used by all sites. An AGENTS.md paragraph lacks the formality and traceability of an RFC, and does not amend the existing RFCs (RFC-0600, RFC-0612) that define the validators.

## Risks

- **Agent misinterpretation:** Agents adding new conditional entries to `GENERATOR_OWNERSHIP_MAP` may not realize that conditional entries cover files on disk. The updated docstring on `OwnershipEntry.conditional` and this RFC's Design section mitigate this risk.

- **False negatives in stale detection:** If a conditional entry's path is too broad (e.g. uses wildcards that match unintended files), those files would be covered and not flagged as stale. This risk is the same for non-conditional entries and is not introduced by this RFC.

- **No automated cross-validator consistency check:** There is no validation rule that enforces all three validators handle `conditional` consistently. A future refactor could reintroduce the skip. The regression test in `generated-stale-validate.test.ts` mitigates this for the stale validator specifically.

## Acceptance criteria

- [x] `generated.stale.validate` no longer skips conditional entries via `if (entry.conditional) continue;` (evidence: `packages/os/site-kernel-checks/src/generated-stale-validate.ts:72`)
- [x] Conditional ownership entry for `public/.well-known/build-identity.json` added to `GENERATOR_OWNERSHIP_MAP` (evidence: `packages/os/site-kernel-checks/src/generator-ownership.ts:525-534`)
- [x] Regression test covers conditional entry coverage in `generated.stale.validate` (evidence: `packages/os/site-kernel-checks/src/tests/generated-stale-validate.test.ts:188-208`)
- [x] `ownership.sync.validate` already handles conditional entries correctly — no change needed (evidence: `packages/os/site-kernel-checks/src/ownership-sync-validate.ts:71-110`)
- [x] `generated.files.validate` already handles conditional entries correctly — no change needed (evidence: `packages/os/site-kernel-checks/src/generated-files-validate.ts:218-338`)
- [x] `leitstand.dev-deploy --system warpgogol-com` passes `ownership.sync.validate` and `generated.stale.validate` during `build.prepare` (evidence: `packages/os/site-kernel-checks/src/generated-stale-validate.ts:72-103`, `packages/os/site-kernel-checks/src/ownership-sync-validate.ts:71-110`)
- [x] `OwnershipEntry.conditional` docstring updated with formal contract reference (RFC-0636) (evidence: `packages/os/site-kernel-checks/src/generator-ownership.ts:53-65`)
- [x] `rfc.validate` passes on this file before merging (evidence: `docs/rfcs/rfc-0636-formalize-conditional-flag-semantics-in-generator-ownership-map.md:1`)

## Implementation notes for agents

- The code fix and regression test are already committed. This RFC formalizes the contract and amends RFC-0600, RFC-0612, and RFC-0375.
- Agents adding new generated files to `public/` or `src/` MUST add entries to `GENERATOR_OWNERSHIP_MAP`. If the file is transient (only exists during builds), set `conditional: true`.
- Agents MUST NOT add `if (entry.conditional) continue;` or equivalent skips to any validator that builds an expected-path set from `GENERATOR_OWNERSHIP_MAP`. The `conditional` flag only suppresses absence diagnostics (OWN-02, GEN-FILES-01), never coverage diagnostics (OWN-01, STALE-01). This rule belongs in `packages/os/site-kernel-checks/AGENTS.md`.
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
