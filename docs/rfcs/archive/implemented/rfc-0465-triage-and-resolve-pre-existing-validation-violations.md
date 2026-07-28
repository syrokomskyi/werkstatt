---
id: RFC-0465
title: "Triage and resolve pre-existing validation violations"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
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
createdAt: 2026-07-20
updatedAt: 2026-07-20
enhancedAt: 2026-07-20
implementedAt: 2026-07-20
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0463
  - RFC-0464
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - forge
successSignals:
  - rfc.validate --json reports zero violations across all rules
  - rfc.validate --json exits 0 on the full RFC tree
  - PBP RFCs (0398-0462) pass V-20 with specRef in schema
nonGoals:
  - Does not introduce new validation rules — only modifies existing RFC-CMD-02/03 cutoff and fixes document-level issues.
  - Does not change the rfc.validate command interface or output format.
  - Does not register historical commands that were renamed or removed during ecosystem refactoring.
  - Does not modify RFC-0463's V-26 or V-27 rules.
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

# RFC-0465: Triage and resolve pre-existing validation violations

## Context

After RFC-0464 backfilled V-26 and V-27 violations to zero, `rfc.validate --json` still reports 1287 violations across 7 other rules. These are pre-existing violations that accumulated during ecosystem refactoring (RFC-0374 forge extraction, RFC-0381 apps retirement, PBP spec vendoring RFC-0394..0397). The violations break down as follows:

| Rule | Count | Description |
| --- | --- | --- |
| RFC-CMD-02 | 557 | RFC lists commands in `commands.added` that are no longer registered as live commands |
| RFC-CMD-03 | 660 | RFC lists commands in `commands.changed` that are no longer registered as live commands |
| V-20 | 65 | PBP RFCs (0398-0462) use `specRef` frontmatter key not in RFC schema |
| V-17 | 2 | `supersededBy` is set but status is `implemented` instead of `superseded` |
| V-11 | 1 | `supersededBy` references non-existent RFC-0388 |
| V-19 | 1 | `amends`/`amendedBy` mismatch between RFC-0375 and RFC-0081 |
| V-23 | 1 | Missing evidence file for RFC-0376 |

These violations are noise in the validation output and make it difficult to detect new violations introduced by future changes.

## Problem

`rfc.validate --json` reports 1287 violations across 7 rules. The majority (1217) are RFC-CMD-02/03 violations caused by historical command renames, removals, and ecosystem refactoring. These violations are not actionable — the commands were intentionally renamed or removed, and updating 500+ historical RFC frontmatter fields to track renames is impractical and provides no value. The remaining 70 violations are document-level issues (missing schema keys, incorrect status fields, missing evidence files) that can be fixed with targeted document edits.

The noise from 1287 violations makes it impossible to detect new violations in CI output without scrolling through hundreds of pre-existing ones.

## Decision

1. **RFC-CMD-02 and RFC-CMD-03** gain a cutoff date of `2026-07-07`. These rules only apply to RFCs with `createdAt >= 2026-07-07`. RFCs created before this date are exempt — their `commands.added` and `commands.changed` fields are historical artifacts, not live contracts.
2. **V-20**: The `specRef` key is added to the RFC frontmatter schema as an optional string field. PBP RFCs (0398-0462) already use it for traceability to vendored spec packages.
3. **V-17**: Two RFCs with `supersededBy` set but `status: implemented` are corrected to `status: superseded`.
4. **V-11**: The non-existent `supersededBy: RFC-0388` reference is removed from the affected RFC.
5. **V-19**: The `amendedBy` field of RFC-0081 is updated to include RFC-0375.
6. **V-23**: The missing evidence file for RFC-0376 is created via `rfc.verification.emit`.

## Architectural fit

- **RFC-0463**: This RFC does not modify V-26 or V-27 rules established by RFC-0463. The cutoff date applies only to RFC-CMD-02 and RFC-CMD-03.
- **RFC-0394..0397 (spec vendoring)**: The `specRef` schema addition formalizes the traceability mechanism already used by PBP RFCs materialized via `spec.materialize`.
- **RFC-0334 (supersede)**: The V-17 and V-11 fixes align affected RFCs with the supersede lifecycle defined by RFC-0334.
- **RFC-0268 (acceptance probes)**: The V-23 fix uses `rfc.verification.emit` to create the missing evidence file.

## Design

### Cutoff date for RFC-CMD-02 and RFC-CMD-03

The validation rules `RFC-CMD-02` and `RFC-CMD-03` are implemented in `packages/forge/os/rfc/handlers/lifecycle.ts` (lines 97-111 for RFC-CMD-02, lines 124-138 for RFC-CMD-03). These rules are modified to skip RFCs with `createdAt < RFC_METADATA_CUTOFF` (the existing constant `"2026-07-07"` defined in `packages/forge/os/rfc/types.ts` line 482 and already imported by `validate-rules.ts`). The `lifecycle.ts` handler must import `RFC_METADATA_CUTOFF` from `../types.ts` and apply the cutoff check before testing command registration.

The cutoff reuses the existing `RFC_METADATA_CUTOFF` constant — no new date literal is introduced. This keeps a single source of truth for all cutoff-based validation rules (V-23, V-24, V-25, and now RFC-CMD-02/03).

```ts
// In lifecycle.ts — import the existing constant
import { RFC_METADATA_CUTOFF } from "../types.ts";

// RFC-CMD-02: skip pre-cutoff RFCs
const createdAt = String(fm["createdAt"] ?? "");
if (createdAt >= RFC_METADATA_CUTOFF && status === "implemented" && ...) {
  // ... existing check logic ...
}
```

Note: the `rfc.validate` command itself is not modified — the change is in the lifecycle handler that `rfc.validate` calls internally. The `commands.changed: ["rfc.validate"]` entry reflects that the effective behavior of `rfc.validate` changes (fewer violations reported), even though the command interface and output format remain the same.

### specRef in RFC schema

The `specRef` field is added to two locations in `packages/forge/os/rfc/types.ts`:

1. The `RfcFrontmatter` interface (as `specRef?: string`) — the TypeScript type for parsed frontmatter.
2. The `RFC_KNOWN_KEYS` array (line 450) — the list of sanctioned keys that V-20 checks against. Without adding `specRef` to `RFC_KNOWN_KEYS`, V-20 will continue to flag PBP RFCs that use `specRef`.

The field is an optional string tracing an RFC to a vendored spec node (e.g. `pbp-specification-package/RFC-PBP-000`).

### Document-level fixes

| Violation | File | Fix |
| --- | --- | --- |
| V-17 (2) | `rfc-0346`, `rfc-0366` | Change `status: implemented` to `status: superseded`. No file move needed — the validator does not enforce directory-status consistency. For organizational consistency, files MAY be moved from `archive/implemented/` to `archive/superseded/`, but this is not required by `rfc.validate`. |
| V-11 (1) | `rfc-0346` | Remove `supersededBy: RFC-0388` (non-existent) |
| V-19 (1) | `rfc-0081` | Add `RFC-0375` to `amendedBy` list |
| V-23 (1) | `rfc-0376` | Run `rfc.verification.emit --id RFC-0376`. Note: V-23 requires `evidence.overall === "pass"` in the generated evidence file. If the acceptance probes fail (overall: "fail"), V-23 will still report a violation. The implementation must verify that RFC-0376's acceptance probes pass before stamping, or update the probes/implementation to make them pass. |

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/os/rfc/handlers/lifecycle.ts` | Modified: import `RFC_METADATA_CUTOFF`, add cutoff check to RFC-CMD-02/03 rules |
| `packages/forge/os/rfc/types.ts` | Modified: add `specRef` to `RfcFrontmatter` interface and `RFC_KNOWN_KEYS` array |
| `docs/rfcs/archive/implemented/rfc-0346-*.md` | Fixed: status → superseded, remove invalid supersededBy |
| `docs/rfcs/archive/implemented/rfc-0366-*.md` | Fixed: status → superseded |
| `docs/rfcs/archive/implemented/rfc-0081-*.md` | Fixed: add RFC-0375 to amendedBy |
| `docs/rfcs/verification/rfc-0376.generated.yaml` | Created: evidence file via `rfc.verification.emit` |

## Rollout

1. **Modify `lifecycle.ts`**: Import `RFC_METADATA_CUTOFF` from `../types.ts`, add cutoff check to RFC-CMD-02 and RFC-CMD-03 rules (skip RFCs with `createdAt < RFC_METADATA_CUTOFF`).
2. **Add `specRef` to RFC schema**: Update `types.ts` — add `specRef?: string` to `RfcFrontmatter` interface and `"specRef"` to `RFC_KNOWN_KEYS` array.
3. **Fix V-17/V-11**: Update frontmatter of 2 RFCs (status → superseded, remove invalid supersededBy).
4. **Fix V-19**: Update `amendedBy` in RFC-0081 to include RFC-0375.
5. **Fix V-23**: Run `rfc.verification.emit --id RFC-0376` to create evidence file. Verify `overall: "pass"` — if probes fail, update probes or implementation first.
6. **Validate**: Run `rfc.validate --json` — must report 0 violations.
7. **Update tests**: Add unit tests for the cutoff date behavior in lifecycle validation tests.

## Alternatives considered

- **Clean all historical frontmatter** (rejected): Updating 500+ RFC frontmatter fields to remove or rename 1200+ command references is impractical. Many commands were intentionally renamed or merged during ecosystem refactoring, and tracking the full rename history provides no value.
- **Register all historical commands** (rejected): Many commands were intentionally removed or merged. Re-registering them as live commands would pollute the command surface with dead entries.
- **Remove `specRef` from PBP RFCs** (rejected): `specRef` is the canonical traceability mechanism for spec-materialized RFCs (RFC-0396). Removing it would break the spec → RFC traceability chain.

## Risks

- **Cutoff date false negatives**: New RFCs created after 2026-07-07 that list non-existent commands will still be caught. The cutoff only exempts historical RFCs.
- **specRef schema evolution**: If `specRef` semantics change in a future spec vendoring RFC, the schema field may need to be updated. This is acceptable — the field is a simple string.
- **Agent misinterpretation**: Agents may see the cutoff date and assume all pre-2026-07-07 RFCs are exempt from all validation rules. This is not the case — only RFC-CMD-02 and RFC-CMD-03 are exempt. V-26, V-27, and all other rules still apply.

## Acceptance criteria

- [x] RFC-CMD-02 and RFC-CMD-03 rules in `lifecycle.ts` skip RFCs with `createdAt < RFC_METADATA_CUTOFF` (reusing existing constant from `types.ts`) (evidence: packages/forge/os/rfc/handlers/lifecycle.ts:79-80,100-101,128-129)
- [x] `specRef` added to `RfcFrontmatter` interface and `RFC_KNOWN_KEYS` array in `types.ts` as optional string (evidence: packages/forge/os/rfc/types.ts:208-213,482)
- [x] V-17 fixed: 2 RFCs corrected to `status: superseded` (evidence: docs/rfcs/archive/implemented/rfc-0346-_.md:4, docs/rfcs/archive/implemented/rfc-0366-_.md:4)
- [x] V-11 fixed: `supersededBy` in RFC-0346 changed from YAML list to string `RFC-0388` (evidence: docs/rfcs/archive/implemented/rfc-0346-\*.md:16)
- [x] V-19 fixed: `amendedBy` in RFC-0081 includes RFC-0375 (evidence: docs/rfcs/archive/implemented/rfc-0081-\*.md:22)
- [x] V-23 fixed: evidence file created for RFC-0376 via `rfc.verification.emit` with `overall: "pass"` (evidence: docs/rfcs/verification/rfc-0376.generated.yaml:51)
- [x] Unit tests added for cutoff date behavior in lifecycle validation tests (evidence: packages/forge/os/rfc/handlers/lifecycle.test.ts:1-135)
- [x] `rfc.validate --json` reports 0 violations across all rules (evidence: rfc.validate --json output 2026-07-20)
- [x] `rfc.validate` passes on this file before merging (evidence: rfc.validate RFC-0465 --json output 2026-07-20)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Agents MUST NOT apply the cutoff date to any rule other than RFC-CMD-02 and RFC-CMD-03. V-26, V-27, and all other rules apply to all RFCs regardless of `createdAt`.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
