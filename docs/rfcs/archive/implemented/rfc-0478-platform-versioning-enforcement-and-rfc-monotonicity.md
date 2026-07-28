---
id: RFC-0478
title: "Platform versioning enforcement and RFC-id monotonicity"
status: implemented
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
createdAt: 2026-07-21
updatedAt: 2026-07-21
enhancedAt: 2026-07-21
implementedAt: 2026-07-21
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0533
related:
  - DNA-44
  - DNA-46
  - DNA-48
  - DNA-53
  - RFC-0354
  - RFC-0356
  - RFC-0357
  - RFC-0476
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-44
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement.
versionBump: patch
commands:
  proposed:
    - platform.consistency.validate
  added: []
  changed:
    - rfc.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@wgogol/forge"
  - "@gogol/site-kernel-handoff"
successSignals:
  - "Every RFC that changes packages/* declares versionBump in frontmatter"
  - "platform.consistency.validate detects SemVer/hash drift between packages and package.json"
  - "rfc.validate rejects RFC-ids lower than the current maximum (V-28)"
nonGoals:
  - "Does not permit major version bumps — major remains manually reserved for architectural shifts (cl-req-05)"
  - "Does not replace SemVer with a monotonic integer — SemVer remains for npm/pnpm tooling compatibility"
  - "Does not automate version bumping on commit — enforcement is at RFC merge and CI validation time"
  - "Does not define migrator semantics — migrator system is RFC-0479"
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

# RFC-0478: Platform versioning enforcement and RFC-id monotonicity

## Context

The WGogol platform develops sites and shared packages without backward compatibility for internal layers (A: platform packages, B: data contracts). Breaking changes to these layers are a normal part of development, not exceptional events. However, the current ecosystem has no enforced mechanism to ensure that every breaking change is accompanied by a version bump, and no guard against the platform semantic hash drifting from the declared SemVer.

Today, version lives in root `package.json` and can be changed manually. `rfc.create` automatically picks the next RFC-id by scanning for the maximum existing number, but `rfc.validate` does not enforce that RFC-ids are monotonically increasing — a manually created RFC with a lower number passes validation (V-02 only checks uniqueness).

The Sternsystem pin file (`system.pin.json`, DNA-44) records `platform.version`, `platform.commit`, `platform.rfcHead`, and `platformSemanticHash` (DNA-53). `mission.materialize` compares pin version to platform version to determine `in-sync`, `catch-up`, or `refuse-downgrade`. But there is no validation that the platform version was actually bumped when `packages/*` changed.

## Problem

Two enforcement gaps exist:

1. **Version bump is not enforced.** An RFC that changes `packages/*` can be merged without bumping `package.json` version. The `platformSemanticHash` changes (because `packages/*` changed), but SemVer stays the same. Downstream, `mission.materialize` sees `in-sync` (pin version == platform version) even though the platform drifted. Sternsystem sites are silently running against a different platform than their pin claims.

2. **RFC-id monotonicity is not enforced.** `rfc.create` picks `maxId + 1`, but a manually created RFC file (e.g. by an agent or direct file edit) with a lower or duplicate number passes `rfc.validate` as long as the id is unique (V-02) and formatted correctly (V-01). This breaks the assumption that RFC-ids are monotonically increasing, which is critical for the migrator registry ordering (RFC-0479).

## Decision

This RFC introduces two enforcement mechanisms:

### 1. RFC-gated versioning with semantic hash guard

Every RFC that changes `packages/*` or `docs/*.xml` MUST declare a `versionBump` field in frontmatter:

| `versionBump` | SemVer delta | Meaning |
| --- | --- | --- |
| `minor` | +0.1.0 | Breaking change to layer B (data contracts) — requires a migrator (RFC-0479) |
| `patch` | +0.0.1 | Safe change — no migrator needed |
| `none` | +0.0.0 | No code/contract change (prose-only RFC, documentation) |
| `major` | — | Architectural shift — manually reserved, `cl-req-05` forbids automatic major bumps |

A new command `platform.consistency.validate` checks that:

- If `platformSemanticHash` (DNA-53) changed since the last validated state, then `package.json` version was bumped (at least patch).
- If any RFC with `versionBump: minor` was merged since the last validated state, then `package.json` minor version was bumped.
- The hash-to-version mapping is recorded in a `docs/platform-version-log.generated.yaml` artifact for audit.

### 2. V-28: RFC-id monotonicity

A new validation rule V-28 is added to `rfc.validate`:

> No RFC may have an id lower than the maximum id among RFCs with a **strictly earlier** `createdAt`. Same-day RFCs (equal `createdAt`) are unconstrained relative to each other — the rule only prevents an RFC with a later `createdAt` from having a lower id than an RFC with an earlier `createdAt`.

This is enforced as: `rfc.validate` collects all RFC-ids and their `createdAt` dates. For each RFC, it checks that no RFC with a **strictly later** `createdAt` has a **lower** id. If a manually created RFC has a lower number than an existing RFC created on an earlier date — V-28 violation. Archived RFCs are included in the `allParsed` map (they participate in the comparison) but are never the **target** of a V-28 violation — they were created before the rule existed and retain their original `createdAt`.

## Architectural fit

- **DNA-44 (Sternsystem bundle contract):** The pin file's `platform.version` and `platformSemanticHash` become trustworthy because the platform cannot drift from its declared version. This strengthens the pin contract.
- **DNA-46 (Mission lifecycle):** `mission.materialize` version comparison (`in-sync` / `catch-up` / `refuse-downgrade`) becomes reliable — the platform version is a truthful signal, not a manual field that can be stale.
- **DNA-48 (Release discipline):** Behavior snapshot diffs compare releases against the same platform version. Version enforcement ensures that two releases with the same version actually have the same `platformSemanticHash`.
- **DNA-53 (Semantic fingerprint governance):** `platformSemanticHash` becomes an enforcement signal, not just a recording. The hash is already computed by `@gogol/fingerprint`; this RFC adds a consistency check that uses it.
- **RFC-0476 (Enforce verified RFC implementation transitions):** `rfc.implement.stamp` is the exclusive path for accepted → implemented. This RFC adds `versionBump` as a required frontmatter field for post-cutoff implemented RFCs. The presence check (V-29) is enforced by `rfc.validate`; `rfc.implement.stamp` does not need modification — it already refuses RFCs that fail `rfc.validate`, so V-29 is transitively enforced at stamp time.
- **cl-req-05 (Major version forbidden):** Retained. Major bumps remain manually reserved for architectural shifts. The `versionBump: major` value is valid but cannot be auto-applied; it requires a separate human decision.

## Design

### `versionBump` frontmatter field

Added to both `RFC_KNOWN_KEYS` (V-20 allow-list) and the `RfcFrontmatter` TypeScript interface in `packages/forge/os/rfc/types.ts`:

```ts
versionBump: z.enum(["minor", "patch", "none", "major"]).optional()
```

Optional for existing RFCs, required for RFCs with `status: implemented` and `createdAt >= 2026-07-21` (this RFC's cutoff). V-29 (new rule) checks:

- If `status: implemented` and `createdAt >= cutoff` and `versionBump` is absent → V-29 error.
- If `versionBump: none` but the RFC `commands.added` or `commands.changed` is non-empty → V-29 warning (commands imply code changes, `none` implies prose-only).
- If `versionBump: minor` → `Breaks-B: yes` is implied; migrator required (RFC-0479 enforces migrator existence).

### `platform.consistency.validate` command

```sh
pnpm exec site-kernel run platform.consistency.validate
pnpm exec site-kernel run platform.consistency.validate --json
```

**Scope:** workspace

**Flags:**

| Flag      | Kind    | Required | Description                                                    |
| --------- | ------- | -------- | -------------------------------------------------------------- |
| `--json`  | boolean | no       | JSON output for agent consumption                              |
| `--check` | boolean | no       | Read-only mode: validate without writing the log file (for CI) |

The command:

1. Computes the current `platformSemanticHash` of `packages/` using `@gogol/fingerprint/semantic` (DNA-53).
2. Reads `docs/platform-version-log.generated.yaml` (the last validated state: hash + version).
3. If hash changed but `package.json` version did not → **error**: platform drifted without version bump.
4. If version was bumped but no RFC with `versionBump: minor` or `versionBump: patch` was merged since last validation → **warning**: version bumped without corresponding RFC.
5. On success, updates `docs/platform-version-log.generated.yaml` with current hash + version + timestamp.

**`docs/platform-version-log.generated.yaml` is committed to the repo** (not gitignored). The `.gitignore` does not have a blanket `docs/*.generated.*` pattern — only `apps/*/src/*.generated.yaml` are gitignored. The `.prettierignore` has `**/*.generated.*` which suppresses formatting but does not affect git tracking. The workflow is: the developer runs `platform.consistency.validate` locally (which updates the file), then commits it. CI reads the committed file and validates against it — CI does not write back.

**Performance note:** `fingerprintTree` with `mode: "semantic"` parses every TypeScript, Astro, CSS, JSON, YAML, and Markdown file under `packages/`. On a monorepo with 25+ packages, this takes 3–8 seconds (measured on the current tree). This is acceptable for a CI gate that runs once per pipeline, not per-file. The cost is the same as `resolvePlatformSemanticHash` already used by `sternsystem.pin`.

### V-28: RFC-id monotonicity

Added to `validateSingleRfc` in `packages/forge/os/rfc/handlers/validate-rules.ts`:

```ts
// V-28: RFC-id monotonicity — no RFC may have an id lower than the
// maximum id among RFCs with a strictly earlier createdAt.
```

Implementation: `rfc.validate` collects all RFC-ids and their `createdAt` dates. For each RFC, it checks that no RFC with a **strictly later** `createdAt` has a **lower** id. Same-day RFCs (equal `createdAt`) are unconstrained. Archived RFCs are included in the comparison map but are never the target of a violation — they predate the rule.

### TypeScript contracts

```ts
interface PlatformConsistencyData {
  currentHash: string;
  lastHash: string;
  currentVersion: string;
  lastVersion: string;
  driftDetected: boolean;
  validatedAt: string;
}

interface PlatformConsistencyViolation {
  rule: "PC-01" | "PC-02" | "PC-03";
  message: string;
}
```

| Rule | Severity | Condition |
| --- | --- | --- |
| `PC-01` | error | `platformSemanticHash` changed but `package.json` version did not |
| `PC-02` | warning | `package.json` version bumped but no corresponding RFC with `versionBump` found |
| `PC-03` | error | `versionBump: minor` RFC merged but minor version was not bumped |

### File system responsibilities

| Path | Role |
| --- | --- |
| `package.json` (root) | Read for current SemVer version |
| `packages/` | Semantic fingerprinted by `@gogol/fingerprint/semantic` |
| `docs/platform-version-log.generated.yaml` | Last validated hash + version state |
| `packages/forge/os/rfc/types.ts` | Add `versionBump` to `RFC_KNOWN_KEYS` and `RfcFrontmatter` interface |
| `packages/forge/os/rfc/handlers/validate-rules.ts` | Add V-28 and V-29 rules |
| `packages/forge/os/rfc/rfc-0000-template.md` | Add `versionBump: patch` default to template frontmatter |
| `packages/forge/os/rfc/handlers/list-create.ts` | Add `versionBump` placeholder replacement in `runRfcCreate` |
| `packages/os/site-kernel-handoff/src/platform-consistency.ts` | New command implementation |
| `packages/os/site-kernel-handoff/src/platform-module.ts` | New `platform` kernel module — registers `platform.consistency.validate` |
| `packages/os/site-kernel-handoff/src/index.ts` | Export `createPlatformModule` from barrel |
| `tools/kernel.config.ts` | Add `platform` module loader entry |
| `packages/os/site-kernel-checks/src/ci-local.ts` | Add `platform.consistency.validate` to `CI_LOCAL_CHECKED_COMMANDS` |
| `packages/os/site-kernel-checks/src/pipelines/packages-check.ts` | Add `platform.consistency.validate` step to `PACKAGES_CHECK_PIPELINE` |
| `docs/COMMANDS.md` | Add command to table |
| `AGENTS.md` | Document versioning enforcement and `versionBump` field |

### Output format

```json
{
  "command": "platform.consistency.validate",
  "status": "pass",
  "data": {
    "currentHash": "sha256:abc123...",
    "lastHash": "sha256:def456...",
    "currentVersion": "4.6.0",
    "lastVersion": "4.5.0",
    "driftDetected": false,
    "validatedAt": "2026-07-21T00:00:00.000Z"
  },
  "violations": []
}
```

### Failure modes

| Condition | Behavior |
| --- | --- |
| `platformSemanticHash` changed, version unchanged | `PC-01` error, exit non-zero |
| Version bumped, no `versionBump` RFC found | `PC-02` warning, exit zero |
| `versionBump: minor` RFC merged, minor not bumped | `PC-03` error, exit non-zero |
| `docs/platform-version-log.generated.yaml` missing | First run — seed with current state, exit zero. The file is committed to the repo (not gitignored) — see Design section |
| `@gogol/fingerprint/semantic` unavailable | Error: fingerprint package not built |

## Rollout

1. Add `versionBump` to `RFC_KNOWN_KEYS` and V-28/V-29 rules to `rfc.validate`.
2. Implement `platform.consistency.validate` command and register in kernel.
3. Seed `docs/platform-version-log.generated.yaml` with current hash + version.
4. Include `platform.consistency.validate` in `ci.local.validate` and `packages.check` pipeline.
5. Update `AGENTS.md` with `versionBump` field guidance and enforcement rules.
6. Existing RFCs without `versionBump` are unaffected (optional for pre-cutoff RFCs).
7. `rfc.create` scaffolds `versionBump: patch` as default in the template (operators change to `minor` for breaking changes).

## Alternatives considered

- **Monotonic integer instead of SemVer.** Rejected: breaks npm/pnpm tooling compatibility. SemVer remains the primary version; semantic hash is the enforcement guard.
- **Git hook for version bump enforcement.** Rejected: `--no-verify` bypasses hooks. CI-level validation (`platform.consistency.validate` in `ci.local.validate`) is non-bypassable.
- **Automatic version bump on RFC merge.** Rejected: the RFC declares intent (`versionBump`), but the actual `package.json` edit is a separate commit. This keeps the RFC as the decision and the version bump as the action, both auditable.
- **V-28 as warning instead of error.** Rejected: monotonicity is critical for migrator registry ordering (RFC-0479). A warning would be ignored, breaking the ordering assumption.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Operator forgets `versionBump` field | Medium | V-29 error on implemented RFCs; `rfc.create` scaffolds default |
| `platformSemanticHash` changes on formatting-only edits | Low | DNA-53 semantic hash is invariant under formatting/comment-only changes by design |
| `docs/platform-version-log.generated.yaml` drift after rebase | Low | Command re-seeds if missing; hash is deterministic from `packages/` tree |
| V-28 false positive on archived RFCs | Low | Archived RFCs are included in the comparison map but are never the target of a V-28 violation — they predate the rule and retain their original `createdAt` |
| V-28 false positive on same-day RFCs | None | The rule uses **strictly earlier** `createdAt`, not "earlier or equal" — same-day RFCs are unconstrained relative to each other |
| `fingerprintTree` cost on CI | Low | 3–8 seconds for 25+ packages; same cost as `sternsystem.pin` which already runs in `packages.check` |

## Acceptance criteria

- [x] `versionBump` field added to `RFC_KNOWN_KEYS` and `RfcFrontmatter` interface in `packages/forge/os/rfc/types.ts` (evidence: packages/forge/os/rfc/types.ts:223, packages/forge/os/rfc/types.ts:520)
- [x] V-28 rule implemented in `validateSingleRfc` — rejects RFC-ids lower than the maximum among RFCs with strictly earlier `createdAt` (evidence: packages/forge/os/rfc/handlers/validate-rules.ts:657-683, rfc.validate --json exit 0)
- [x] V-29 rule implemented — requires `versionBump` for post-cutoff implemented RFCs (evidence: packages/forge/os/rfc/handlers/validate-rules.ts:685-713, rfc.validate --json exit 0)
- [x] `platform.consistency.validate` command implemented in a new `platform-module.ts` and registered via `tools/kernel.config.ts` (evidence: packages/os/site-kernel-handoff/src/platform-module.ts, tools/kernel.config.ts:103-104)
- [x] `PC-01` detects hash drift without version bump (evidence: packages/os/site-kernel-handoff/src/platform-consistency.ts:140-147)
- [x] `PC-02` warns on version bump without corresponding RFC (evidence: packages/os/site-kernel-handoff/src/platform-consistency.ts:149-168)
- [x] `PC-03` detects `versionBump: minor` without minor version bump (evidence: packages/os/site-kernel-handoff/src/platform-consistency.ts:170-191)
- [x] `docs/platform-version-log.generated.yaml` seeded and updated on successful validation (committed to repo, not gitignored) (evidence: docs/platform-version-log.generated.yaml)
- [x] `platform.consistency.validate` included in `ci.local.validate` (`CI_LOCAL_CHECKED_COMMANDS`) (evidence: packages/os/site-kernel-checks/src/ci-local.ts:39)
- [x] `platform.consistency.validate` included in `packages.check` pipeline (`PACKAGES_CHECK_PIPELINE`) (evidence: packages/os/site-kernel-checks/src/pipelines/packages-check.ts:171-172)
- [x] `rfc.create` scaffolds `versionBump: patch` as default in the template (evidence: packages/forge/os/rfc/rfc-0000-template.md:42)
- [x] `AGENTS.md` documents `versionBump` field and enforcement rules (evidence: AGENTS.md:247-252)
- [x] `docs/COMMANDS.md` updated with `platform.consistency.validate` entry (evidence: docs/COMMANDS.md, regenerated via docs.commands.generate)
- [x] `rfc.validate` passes on this file (evidence: rfc.validate --json exit 0)
- [x] `pnpm --filter @wgogol/forge build:check` passes (evidence: exit 0)
- [x] `pnpm --filter @gogol/site-kernel-handoff build:check` passes (evidence: exit 0)

## Implementation notes for agents

- Agents MAY implement this RFC only after it is accepted.
- Agents MUST use `rfc.implement.stamp` (RFC-0476) to transition this RFC from accepted to implemented.
- Agents MUST NOT bypass `platform.consistency.validate` — it is a CI gate, not an advisory.
- Agents MUST declare `versionBump` in every RFC that changes `packages/*` or `docs/*.xml`.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
