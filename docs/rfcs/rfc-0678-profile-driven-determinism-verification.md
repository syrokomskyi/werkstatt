---
id: RFC-0678
title: "Profile-driven determinism verification"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-04
updatedAt: 2026-08-04
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-54
  - RFC-0638
  - RFC-0641
  - RFC-0674
  - ADR-0021
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-54
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed:
    - forge.determinism.check
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - "`forge determinism check --dry-run` prints the resolved determinism inputs from the active profile"
  - "`forge determinism check --json` reports per-artifact hash comparison results"
  - "`forge determinism check` detects non-deterministic MP4 output for the editframe-html profile"
nonGoals:
  - "Hardcoding domain-specific determinism logic in Forge source"
  - "Cross-platform font determinism (deferred — same as RFC-0603)"
  - "Asset management (RFC-0679)"
  - "Release lifecycle (RFC-0680)"
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

# RFC-0678: Profile-driven determinism verification

## Context

Forge profiles declare artifacts (RFC-0638) with an optional `determinism` field: `{ hashable: boolean, inputs: string[] }`. This declares which artifacts are deterministically reproducible and what input files contribute to their hash.

The `editframe-html` profile (RFC-0641) declares the `composition` artifact with `determinism.hashable: true` and `determinism.inputs: ["compositions/**/*.html", "assets/**"]`. This means: the same composition HTML + the same assets should produce the same MP4 output bytes.

However, no Forge command verifies this. `forge.build` (RFC-0674) produces the output but does not check if a second build produces identical bytes. The platform has a precedent for determinism verification: RFC-0602 (timestamp determinism) and RFC-0603 (PNG determinism) for site builds. Video output determinism is the analogous concept for video projects.

## Problem

Video rendering (Editframe's headless Chrome frame capture) is not guaranteed to produce byte-identical MP4 output across runs. Sources of non-determinism include:

- System font rendering differences
- Headless Chrome timing/race conditions
- Non-deterministic CSS animations
- Timestamps embedded in MP4 metadata

Without a determinism check, the operator cannot trust that a video artifact is reproducible. This is critical for release integrity: if the same composition produces different bytes on different machines, hash-based verification fails.

## Decision

Forge gains `forge.determinism.check` — a profile-driven command that verifies artifact determinism by building twice and comparing output hashes.

The command is **generic** — it reads the profile's `artifacts[].determinism` declarations and checks each artifact with `hashable: true`. No domain-specific determinism logic exists in Forge source.

## Architectural fit

- **DNA-54 (Forge bindings contract):** Determinism inputs are declared in profile YAML.
- **RFC-0638 (profile schema):** `artifacts[].determinism` already exists in the schema.
- **RFC-0674 (lifecycle commands):** `forge.build` produces the output. `forge.determinism.check` calls `forge.build` twice and compares hashes.
- **RFC-0602/RFC-0603 (site determinism):** Precedent for determinism verification in the platform. This RFC extends the concept to profile-driven artifacts.
- **ADR-0021:** Profile-driven lifecycle — determinism is part of the build lifecycle.

## Design

### CLI surface

```sh
# Check determinism for all hashable artifacts in the active profile
forge determinism check

# Check a specific artifact
forge determinism check --artifact composition

# Dry-run: print what would be checked
forge determinism check --dry-run

# Structured JSON output
forge determinism check --json
```

### TypeScript contracts

```ts
interface DeterminismCheckResult {
  artifactId: string;
  hashable: boolean;
  inputs: string[];
  firstBuildHash: string | null;
  secondBuildHash: string | null;
  deterministic: boolean;
  inputHash: string;
  error?: string;
}

interface ForgeDeterminismCheckResult {
  command: "forge.determinism.check";
  profileId: string;
  artifacts: DeterminismCheckResult[];
  allDeterministic: boolean;
}
```

### Verification algorithm

For each artifact with `determinism.hashable: true`:

1. Compute the input hash: hash all files matching `determinism.inputs` glob patterns, sorted by path.
2. Run `forge.build --artifact <id>` (first build).
3. Hash the output file(s) matching `artifacts[].extensions`.
4. Run `forge.build --artifact <id>` again (second build).
5. Hash the output file(s) again.
6. Compare first and second build hashes.
7. Report `deterministic: true` if hashes match, `false` otherwise.

If the input hash is the same as a previously recorded input hash (stored in `dist/.determinism-cache.json`), the command skips the double-build and reports the cached result.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/os/core/core.module.ts` | Registers `forge.determinism.check` |
| `packages/forge/os/core/handlers/determinism-check.ts` | New — determinism verification handler |
| `dist/.determinism-cache.json` | New — cached input-to-output hash mapping |
| `packages/forge/profiles/editframe-html.yaml` | Already declares `determinism` on composition artifact |

### Output format

`forge determinism check --json`:

```json
{
  "command": "forge.determinism.check",
  "profileId": "editframe-html",
  "artifacts": [
    {
      "artifactId": "composition",
      "hashable": true,
      "inputs": ["compositions/**/*.html", "assets/**"],
      "inputHash": "sha256:abc123",
      "firstBuildHash": "sha256:def456",
      "secondBuildHash": "sha256:def456",
      "deterministic": true
    }
  ],
  "allDeterministic": true
}
```

### Failure modes

- **No active profile**: exit 1 with message listing available profiles.
- **Profile has no hashable artifacts**: exit 0 with message "Profile <id> has no hashable artifacts — nothing to check".
- `--artifact <id>` not found or not hashable: exit 1 with message.
- **Build fails**: exit 1 with `error` field set to the build error message.
- **Non-deterministic output**: exit 1 with `deterministic: false` and both hashes reported.
- **Cache hit**: if input hash matches cache, skip double-build and report cached result with `cached: true` flag.

## Rollout

- **New command**: `forge.determinism.check` — no existing commands affected.
- **No profile schema changes**: `determinism` field already exists (RFC-0638).
- **`editframe-html` profile**: already declares `determinism` on the composition artifact. No changes needed.
- **No migration**: existing Forge consumers without hashable artifacts are unaffected.
- **Integration**: standalone command — not automatically added to any pipeline. Consumers wire it into CI or pre-release checks.
- **Cache file**: `dist/.determinism-cache.json` is gitignored (it lives in `dist/`).

## Alternatives considered

- **Hardcode determinism checks per domain**: Rejected — couples Forge to specific domains, violates DNA-54.
- **Use `@warpgogol/fingerprint` directly in profiles**: Rejected — profiles are YAML data, not code. Forge source handles the hashing.
- **Single-build hash comparison (no double-build)**: Rejected — a single build hash cannot verify reproducibility. The double-build approach is the only way to detect non-determinism without a reference hash.
- **Record reference hashes in profile YAML**: Rejected — reference hashes are machine-specific. The double-build approach is machine-agnostic.

## Risks

- **Slow execution**: double-building all artifacts is expensive (two full renders). Mitigation: `--artifact <id>` flag to check a single artifact. Cache file skips double-build when inputs haven't changed.
- **Headless Chrome non-determinism**: Editframe's headless Chrome pipeline may produce non-deterministic output due to font rendering or timing. This is a known limitation — the command reports it, it does not fix it. Mitigation: bundle fonts (future RFC, same approach as RFC-0603).
- **Cache invalidation**: if the build command itself changes (e.g. Editframe version update), the cache may produce false positives. Mitigation: the cache key includes the build command string from the profile.
- **Large output files**: hashing large MP4 files may be slow. Mitigation: use `@warpgogol/fingerprint` `byteHashFile` which streams the file.

## Acceptance criteria

- [ ] `forge.determinism.check` command registered in `packages/forge/os/core/core.module.ts` with `--dry-run`, `--json`, `--profile`, `--artifact` flags
- [ ] `DeterminismCheckResult` and `ForgeDeterminismCheckResult` interfaces defined in the handler
- [ ] `forge determinism check --dry-run` prints the resolved determinism inputs from the active profile
- [ ] `forge determinism check --json` reports per-artifact hash comparison results
- [ ] `forge determinism check --artifact composition` checks only the specified artifact
- [ ] `dist/.determinism-cache.json` cache file implemented with input-hash-based cache hits
- [ ] Unit test verifies double-build hash comparison detects non-deterministic output
- [ ] Unit test verifies cache hit skips double-build
- [ ] Unit test verifies `--dry-run` does not execute any build
- [ ] Unit test verifies artifacts without `determinism.hashable: true` are skipped
- [ ] `packages/forge/AGENTS.md` updated with determinism check documentation
- [ ] `command.manifest.generate` run to update `docs/command-manifest.generated.yaml`
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run
  `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file
  in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run
  `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"`
  instead of working around it (RFC-0334).
-->
