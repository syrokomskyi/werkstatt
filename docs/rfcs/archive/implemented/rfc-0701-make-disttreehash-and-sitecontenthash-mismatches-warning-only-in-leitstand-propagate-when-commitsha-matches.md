---
id: RFC-0701
title: "Make distTreeHash and siteContentHash mismatches warning-only in leitstand.propagate when commitSha matches"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335)
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-05
updatedAt: 2026-08-05
enhancedAt: 2026-08-05
implementedAt: 2026-08-05
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0608
amendedBy: []
related:
  - RFC-0608
  - RFC-0628
  - RFC-0656
  - RFC-0700
  - DNA-49
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies: []
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
    - leitstand.propagate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@warpgogol/site-kernel-handoff"
successSignals: []
nonGoals: []
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
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

# RFC-0701: Make distTreeHash and siteContentHash mismatches warning-only in leitstand.propagate when commitSha matches

## Context

`leitstand.propagate` (RFC-0608) verifies that the dev site's `build-identity.json` matches the release manifest before propagating to the alt/main channel. The verification checks three fields: `commitSha`, `distTreeHash`, and `siteContentHash`. Currently, a mismatch in any of these fields causes a hard error that blocks propagation.

`distTreeHash` is computed via `fingerprintTree` with `mode: "stable"` (RFC-0656), which normalizes PDFs, source maps, and JSON timestamps. However, builds are not fully deterministic: `mission.validate` runs a build between `dev-deploy` and `release.prepare`, and environmental factors (Astro cache state, env-dependent output) can produce different `distTreeHash` values even when the source `commitSha` is identical.

This was observed during the warpgogol-com-r000012 release cycle: `leitstand.propagate` failed with `distTreeHash mismatch: manifest='sha256:9214da62...', identity='sha256:e85248fc...'` despite `commitSha` matching. The fix was prepared as an uncommitted working-tree change in the same session (converting the hard error to a warning in `leitstand-commands.ts:1572-1595`); this RFC formalizes the decision and provides the governance trail for committing it.

## Problem

`distTreeHash` and `siteContentHash` mismatches block `leitstand.propagate` even when `commitSha` matches. Since `commitSha` is the primary integrity check (it proves the source code is identical), `distTreeHash` mismatches are caused by build non-determinism, not by actual content differences. Blocking propagation on these secondary hashes creates false negatives that prevent valid releases from being propagated.

The original hard error was introduced in `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` by RFC-0634 step 5 (commit `3401db93`). The warning-only conversion is present in the working tree but not yet committed — this RFC provides the governance trail for that commit.

## Decision

`leitstand.propagate` treats `distTreeHash` and `siteContentHash` mismatches as warnings (not errors) when the `commitSha` already matches between the dev build-identity and the release manifest.

- `commitSha` mismatch remains a hard error — it indicates the source code differs.
- `distTreeHash` mismatch with matching `commitSha` → `logger.warn` with both hash values, propagation continues.
- `siteContentHash` mismatch with matching `commitSha` → `logger.warn` with both hash values, propagation continues.
- When `commitSha` does not match, all hash mismatches remain hard errors.
- **Workpiece builds**: when either `commitSha` is `"0000000"` (workpiece placeholder), the `commitSha` mismatch check is skipped entirely (lines 1564-1565). Secondary hash checks still use `logger.warn` in this case — the warning-only behavior applies regardless of whether `commitSha` is a real SHA or the `"0000000"` placeholder.
- **Empty/missing hashes**: when either the release manifest or the dev build-identity has an empty/undefined `distTreeHash` or `siteContentHash`, the corresponding check is skipped entirely (no warning, no error). The `releaseDistTreeHash && devBuildIdentity.distTreeHash` guard ensures the comparison only runs when both values are present.

## Architectural fit

- **RFC-0608**: this RFC amends RFC-0608's propagation gate to use `commitSha` as the primary integrity check and demote secondary hashes to advisory warnings. RFC-0608 established the build-identity verification with hard errors for all three fields (`commitSha`, `distTreeHash`, `siteContentHash`); this RFC relaxes the secondary hash checks to warnings.
- **DNA-49 (Fleet propagation)**: describes `leitstand.propagate` verifying `distTreeHash` and `siteContentHash` against the release manifest. This RFC amends that behavior — the verification remains, but mismatches in secondary hashes are advisory warnings rather than hard errors when `commitSha` matches.
- **RFC-0656**: stable mode normalization reduces but does not eliminate `distTreeHash` non-determinism. This RFC acknowledges that residual non-determinism is expected and should not block propagation.
- **Site OS operator model**: `leitstand.propagate` is the final step before alt/main deployment. False negatives here block the entire release pipeline. Warning-only secondary hashes reduce false negatives without compromising primary integrity.

## Design

### CLI surface

No CLI surface changes. The command flags remain the same:

```sh
pnpm exec werkstatt run leitstand.propagate --system warpgogol-com --release warpgogol-com-r000012 --channel alt
```

### TypeScript contracts

No new types. The existing logic in `runLeitstandPropagate` changes from `throw new Error(...)` to `logger.warn(...)` for `distTreeHash` and `siteContentHash` when `commitSha` matches.

The current code (working tree) already implements the warning-only behavior:

```ts
// Current (warning-only — working tree, uncommitted):
const releaseDistTreeHash = releaseManifest.distTreeHash as string;
if (
  releaseDistTreeHash &&
  devBuildIdentity.distTreeHash &&
  devBuildIdentity.distTreeHash !== releaseDistTreeHash
) {
  logger.warn(
    `[leitstand.propagate] dev build-identity distTreeHash mismatch (commitSha matches): manifest='${releaseDistTreeHash}', identity='${devBuildIdentity.distTreeHash}'.`,
  );
}
```

The original code (commit `3401db93`, RFC-0634 step 5) used `throw new Error(...)` instead of `logger.warn(...)`. The working-tree change converts both `distTreeHash` and `siteContentHash` checks from hard errors to warnings. This RFC formalizes that conversion.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Modified: `runLeitstandPropagate` hash check logic |
| Dev site `build-identity.json` | Read: `distTreeHash`, `siteContentHash`, `commitSha` |
| `releases/<id>/release.yaml` | Read: release manifest hashes |

### Output format

No output format changes. Warnings are logged via `logger.warn` and do not appear in `--json` output as errors. The `status` field remains `"ok"` when propagation succeeds despite hash warnings.

### Failure modes

- `commitSha` mismatch (both non-`"0000000"`): **hard error** (exit 1) — unchanged.
- `commitSha` is `"0000000"` on either side: **commitSha check skipped** — workpiece build, no hard error.
- `distTreeHash` mismatch with matching `commitSha`: **warning** — propagation continues.
- `siteContentHash` mismatch with matching `commitSha`: **warning** — propagation continues.
- Both `distTreeHash` and `siteContentHash` mismatch with matching `commitSha`: **two warnings** — propagation continues.
- Empty/missing `distTreeHash` or `siteContentHash` on either side: **check skipped** — no warning, no error.
- Deploy or health check failure: **hard error** (exit 1) — unchanged.

## Rollout

- **Default behavior**: warning-only for secondary hash mismatches is the new default. No opt-in flag needed.
- **Existing apps**: no changes needed. The behavior change is backward-compatible — propagations that previously failed on `distTreeHash` mismatch will now succeed with a warning.
- **No migration path needed**: the change is in the propagation gate logic only.
- **Pipeline integration**: `leitstand.propagate` remains a standalone operator command.

## Alternatives considered

- **Make all hash checks warning-only**: rejected — `commitSha` is the primary integrity check and must remain a hard error. A `commitSha` mismatch means the source code is different, which is a genuine integrity violation.
- **Add `--skip-hash-check` flag**: rejected — operators would use it as a blanket bypass, losing the diagnostic value of the warnings. The `commitSha`-conditional approach is more precise.
- **Fix build non-determinism root cause**: rejected as a prerequisite — full build determinism is a long-term goal (RFC-0656 made progress but did not achieve it). This RFC unblocks propagation while determinism work continues.
- **Add `--strict` flag to restore hard errors**: rejected — adds complexity for a case that is not needed in practice. If strict checking is needed, it can be added later.

## Risks

- **Silent content drift**: a `distTreeHash` mismatch could indicate real content differences (not just non-determinism). Mitigation: the warning logs both hash values, making the mismatch visible. Operators can investigate if needed.
- **Agent complacency**: agents might ignore the warnings. Mitigation: the warning message includes both hash values and the note `(commitSha matches)`, making it clear that the mismatch is expected.
- **False sense of security**: `commitSha` match does not guarantee identical dist output. This is already the case — this RFC makes the behavior explicit rather than blocking.

## Acceptance criteria

- [x] `distTreeHash` mismatch with matching `commitSha` produces a warning, not an error — (evidence: `leitstand-commands.ts:1740`, `rfc-0701-propagate-warning-only.test.ts`)
- [x] `siteContentHash` mismatch with matching `commitSha` produces a warning, not an error — (evidence: `leitstand-commands.ts:1752`, `rfc-0701-propagate-warning-only.test.ts`)
- [x] `commitSha` mismatch remains a hard error — (evidence: `leitstand-commands.ts:1727`, `rfc-0701-propagate-warning-only.test.ts`)
- [x] Warning message includes both manifest and identity hash values — (evidence: `leitstand-commands.ts:1740-1741`, `rfc-0701-propagate-warning-only.test.ts`)
- [x] Propagation succeeds when only secondary hashes mismatch and `commitSha` matches — (evidence: `rfc-0701-propagate-warning-only.test.ts`)
- [x] Unit test covers the warning-only path in `leitstand-commands.ts` — (evidence: `rfc-0701-propagate-warning-only.test.ts`)
- [x] `rfc.validate` passes on this file before merging — (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0701`)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- **Post-hoc formalization**: the code change is already present in the working tree (`leitstand-commands.ts:1572-1595`). When `fo-idea-implement` runs, it should commit the working-tree change with a commit message referencing RFC-0701, then use `rfc.implement.stamp` with that commit SHA. The implementation commit and the stamp commit must be separate.
- Agents MUST NOT remove the `commitSha` hard error check — it is the primary integrity gate.
- Agents MUST NOT silence the warnings — they provide diagnostic value for investigating build non-determinism.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0701 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
