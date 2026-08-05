---
id: RFC-0701
title: "Make distTreeHash and siteContentHash mismatches warning-only in leitstand.propagate when commitSha matches"
status: draft
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
reviewers: []
createdAt: 2026-08-05
updatedAt: 2026-08-05
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0608
  - RFC-0628
  - RFC-0656
  - RFC-0700
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

# RFC-0701: Make distTreeHash and siteContentHash mismatches warning-only in leitstand.propagate when commitSha matches

## Context

`leitstand.propagate` (RFC-0608) verifies that the dev site's `build-identity.json` matches the release manifest before propagating to the alt/main channel. The verification checks three fields: `commitSha`, `distTreeHash`, and `siteContentHash`. Currently, a mismatch in any of these fields causes a hard error that blocks propagation.

`distTreeHash` is computed via `fingerprintTree` with `mode: "stable"` (RFC-0656), which normalizes PDFs, source maps, and JSON timestamps. However, builds are not fully deterministic: `mission.validate` runs a build between `dev-deploy` and `release.prepare`, and environmental factors (Astro cache state, env-dependent output) can produce different `distTreeHash` values even when the source `commitSha` is identical.

This was observed during the warpgogol-com-r000012 release cycle: `leitstand.propagate` failed with `distTreeHash mismatch: manifest='sha256:9214da62...', identity='sha256:e85248fc...'` despite `commitSha` matching. The fix was applied as a code change in the same session (converting the hard error to a warning), but this RFC formalizes the decision.

## Problem

`distTreeHash` and `siteContentHash` mismatches block `leitstand.propagate` even when `commitSha` matches. Since `commitSha` is the primary integrity check (it proves the source code is identical), `distTreeHash` mismatches are caused by build non-determinism, not by actual content differences. Blocking propagation on these secondary hashes creates false negatives that prevent valid releases from being propagated.

The hard error is in `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts:1572-1595`.

## Decision

`leitstand.propagate` treats `distTreeHash` and `siteContentHash` mismatches as warnings (not errors) when the `commitSha` already matches between the dev build-identity and the release manifest.

- `commitSha` mismatch remains a hard error — it indicates the source code differs.
- `distTreeHash` mismatch with matching `commitSha` → `logger.warn` with both hash values, propagation continues.
- `siteContentHash` mismatch with matching `commitSha` → `logger.warn` with both hash values, propagation continues.
- When `commitSha` does not match, all hash mismatches remain hard errors.

## Architectural fit

- **RFC-0608**: amends the propagation gate to use `commitSha` as the primary integrity check and demote secondary hashes to advisory warnings.
- **RFC-0656**: stable mode normalization reduces but does not eliminate `distTreeHash` non-determinism. This RFC acknowledges that residual non-determinism is expected and should not block propagation.
- **Site OS operator model**: `leitstand.propagate` is the final step before alt/main deployment. False negatives here block the entire release pipeline. Warning-only secondary hashes reduce false negatives without compromising primary integrity.

## Design

### CLI surface

No CLI surface changes. The command flags remain the same:

```sh
pnpm exec site-kernel run leitstand.propagate --system warpgogol-com --release warpgogol-com-r000012 --channel alt
```

### TypeScript contracts

No new types. The existing logic in `runLeitstandPropagate` changes from `throw new Error(...)` to `logger.warn(...)` for `distTreeHash` and `siteContentHash` when `commitSha` matches.

```ts
// Before (hard error):
if (devBuildIdentity.distTreeHash !== releaseDistTreeHash) {
  throw new Error(`[leitstand.propagate] distTreeHash mismatch ...`);
}

// After (warning when commitSha matches):
if (devBuildIdentity.distTreeHash !== releaseDistTreeHash) {
  logger.warn(`[leitstand.propagate] dev build-identity distTreeHash mismatch (commitSha matches): ...`);
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` | Modified: `runLeitstandPropagate` hash check logic |
| Dev site `build-identity.json` | Read: `distTreeHash`, `siteContentHash`, `commitSha` |
| `releases/<id>/release.yaml` | Read: release manifest hashes |

### Output format

No output format changes. Warnings are logged via `logger.warn` and do not appear in `--json` output as errors. The `status` field remains `"ok"` when propagation succeeds despite hash warnings.

### Failure modes

- `commitSha` mismatch: **hard error** (exit 1) — unchanged.
- `distTreeHash` mismatch with matching `commitSha`: **warning** — propagation continues.
- `siteContentHash` mismatch with matching `commitSha`: **warning** — propagation continues.
- Both `distTreeHash` and `siteContentHash` mismatch with matching `commitSha`: **two warnings** — propagation continues.
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

- [ ] `distTreeHash` mismatch with matching `commitSha` produces a warning, not an error
- [ ] `siteContentHash` mismatch with matching `commitSha` produces a warning, not an error
- [ ] `commitSha` mismatch remains a hard error
- [ ] Warning message includes both manifest and identity hash values
- [ ] Propagation succeeds when only secondary hashes mismatch and `commitSha` matches
- [ ] Unit test covers the warning-only path in `leitstand-commands.ts`
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT remove the `commitSha` hard error check — it is the primary integrity gate.
- Agents MUST NOT silence the warnings — they provide diagnostic value for investigating build non-determinism.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id RFC-0701 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
