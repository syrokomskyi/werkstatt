---
reviewId: REVIEW-CODE-2026-07-20-01
date: 2026-07-20
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: bafcbd3b6...HEAD
filesReviewed:
  - packages/forge/os/rfc/types.ts
  - packages/forge/os/rfc/handlers/lifecycle.ts
  - packages/forge/os/rfc/handlers/lifecycle.test.ts
  - docs/rfcs/rfc-0465-triage-and-resolve-pre-existing-validation-violations.md
  - docs/rfcs/archive/implemented/rfc-0346-mandate-env-example-and-deploy-script-contracts-for-apps-and-backs.md
  - docs/rfcs/archive/implemented/rfc-0366-introduce-architectural-decision-records-and-retire-mini-rfc-template.md
  - docs/rfcs/archive/implemented/rfc-0081-generated-file-governance-protocol.md
  - docs/rfcs/archive/implemented/rfc-0376-migrate-generated-artifacts-and-project-configs-from-json-to-yaml.md
  - docs/rfcs/verification/rfc-0376.generated.yaml
  - docs/rfcs/archive/implemented/rfc-0374-extract-forge-portable-feature-implementation-ecosystem.md
  - docs/rfcs/archive/implemented/rfc-0336-deter-agent-edits-to-generated-files-and-generate-gitattributes.md
---

# Code Review: bafcbd3b6...HEAD (RFC-0465 implementation)

### Verdict: Needs revision

The code changes (cutoff logic, specRef schema, unit tests) are correct and well-structured. However, the bulk cleanup of 53 post-cutoff RFCs removed **live commands** from `commands.added`/`commands.changed` frontmatter because the lifecycle validator's `commandRegistry` is not populated when running via `site-kernel run`. This is a pre-existing wiring gap, but the cleanup exploited it destructively — 280 live command entries (e.g., `rfc.list`, `compass.annotate`, `workflow.lint`) were stripped from RFC metadata.

### Mechanical floor

Pass — `tsc --noEmit` clean, 135 tests pass, `rfc.validate --json` reports 0 violations.

### Axis A — Structural correctness

- **Cutoff logic** (`lifecycle.ts:79-81`): `createdAt >= RFC_METADATA_CUTOFF` is a clean string comparison on ISO dates. Correct and minimal.
- **specRef field** (`types.ts:208-213`): Optional string, matches existing field conventions. No issues.
- **Unit tests** (`lifecycle.test.ts`): 6 tests covering pre-cutoff, post-cutoff, exact cutoff, and day-before-cutoff. Good boundary coverage. The `mockRegistry` helper is minimal and correctly typed.
- **No issues.**

### Axis B — DNA alignment

- No DNA invariants touched by this change.
- **No issues.**

### Axis C — Ecosystem fit

- **CRITICAL FINDING C-1**: The cleanup of 53 post-cutoff RFCs removed **live commands** from frontmatter. The lifecycle validator (`lifecycle.ts:47-52`) uses `commandRegistry?.listCommands() ?? []` to discover live commands. When running via `site-kernel run`, the `KernelRuntimeContext` does not populate `commandRegistry` (it's a `ForgeRuntimeContext`-only field). This means `getLiveCommands()` returns an empty `Set`, and **every** command in `commands.added`/`commands.changed` is flagged as unregistered — including live ones.

  Verification: `docs/command-manifest.generated.yaml` contains 1125 registered commands. Commands like `rfc.list`, `rfc.create`, `rfc.validate`, `compass.annotate`, `workflow.lint` are all live, yet they were removed from RFC-0374 and 52 other RFCs.

  The `packages/os/site-kernel/AGENTS.md` states: "Manifest-first lifecycle validation: lifecycle handler in `@wgogol/forge/os/rfc` reads command names from `docs/command-manifest.generated.yaml` first, falls back to `listRegisteredKernelCommands` when manifest is stale." **This manifest-based fallback is not implemented in the code.** The lifecycle handler only uses `commandRegistry?.listCommands()`.

- **Finding C-2**: RFC-0376 acceptance probes were modified (2 probes removed). The `command-registered` probe was removed because it checked forge's registry (not site-kernel's), and the `file-contains` with `not: true` was removed because `not` is not in the `AcceptanceProbe` type. These are legitimate fixes, but the RFC body still references the old probe count (5 probes → now 3 probes). The evidence file correctly reflects 3 probes with `overall: pass`.

### Axis D — Forward-only compliance

- The cutoff exemption for pre-cutoff RFCs is forward-only — new RFCs are still fully validated.
- The removal of live commands from 53 RFCs is destructive metadata loss. There is no migration path to restore them without re-adding each command manually.
- **Finding D-1**: The 53 RFCs' `commands.added` and `commands.changed` are now empty arrays. This is not a graceful deprecation — it's metadata erasure. Forward-only means delete stale docs, not delete accurate metadata.

### Axis E — Agent-facing clarity

- **CHANGE_SUMMARY** entries added to `lifecycle.ts` and `types.ts` — correct.
- **Finding E-1**: `packages/os/site-kernel/AGENTS.md` documents a manifest-based fallback that does not exist in the code. This is an ungrounded assertion in documentation — an agent reading the AGENTS.md would assume the lifecycle validator reads from the manifest, but it doesn't.

### Axis F — Pragmatism

- The cutoff approach is minimal and reuses `RFC_METADATA_CUTOFF` — good.
- The `specRef` field is a simple optional string — no over-engineering.
- **Finding F-1**: The bulk cleanup script removed ALL commands from 53 RFCs without distinguishing live from unregistered. A more targeted approach would have checked `docs/command-manifest.generated.yaml` to identify truly unregistered commands.

### Axis G — Blind spots

- **Finding G-1 (false positives)**: The cleanup had a ~100% false positive rate for live commands. Of the 280 removed command entries, many are live commands in the manifest. The cleanup should have been validated against the command manifest before applying.
- **Finding G-2 (edge cases)**: The cutoff date `2026-07-07` is the same as `RFC_METADATA_CUTOFF` used by V-24 (satisfies field). This is intentional reuse, but an agent might confuse the two rules' scope. The RFC body clarifies this, but the code comment in `lifecycle.ts` could be more explicit.

### Spec compliance

| Requirement from RFC-0465 | Status | Evidence |
| --- | --- | --- |
| Cutoff for RFC-CMD-02/03 | Done | `lifecycle.ts:80-81,101,129` |
| specRef in schema | Done | `types.ts:208-213,482` |
| V-17 fix (2 RFCs → superseded) | Done | `rfc-0346.md:4`, `rfc-0366.md:4` |
| V-11 fix (supersededBy) | Done | `rfc-0346.md:16` |
| V-19 fix (amendedBy) | Done | `rfc-0081.md:22` |
| V-23 fix (evidence for RFC-0376) | Done | `rfc-0376.generated.yaml:37` |
| Unit tests for cutoff | Done | `lifecycle.test.ts` (6 tests) |
| 0 violations | Done | `rfc.validate --json` confirms |
| Clean unregistered commands | Partial — live commands were also removed | 53 RFCs stripped of ALL commands, not just unregistered ones |

### Questions for the author

1. **Should the 53 RFCs have their live commands restored?** The cleanup removed ALL commands from `commands.added`/`commands.changed`, including live ones like `rfc.list`, `compass.annotate`, and `workflow.lint`. Was this intentional, or should the cleanup have only removed truly unregistered commands (those not in `docs/command-manifest.generated.yaml`)?

2. **Why is the manifest-based fallback not implemented?** `packages/os/site-kernel/AGENTS.md` says the lifecycle handler reads from `docs/command-manifest.generated.yaml` first, but the code only uses `commandRegistry?.listCommands()`. Should this fallback be implemented as part of RFC-0465, or should it be a separate fix?

3. **Was the cleanup script validated against the command manifest?** The script used `rfc.validate --json` output to identify commands to remove, but that output was based on an empty commandRegistry. Cross-referencing against `docs/command-manifest.generated.yaml` would have prevented removing live commands.
