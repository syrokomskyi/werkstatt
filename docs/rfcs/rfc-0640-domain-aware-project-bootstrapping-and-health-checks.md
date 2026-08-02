---
id: RFC-0640
title: "Domain-Aware Project Bootstrapping and Health Checks"
status: accepted
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
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-01
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0391
  - RFC-0392
  - RFC-0638
  - RFC-0639
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
  added:
    - forge.profile.validate
  changed:
    - forge.create
    - forge.doctor
    - forge.agents.generate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - forge.create reads domain fields from the selected profile and writes them into forge.yaml and PREFERENCES.md
  - forge.doctor reports domain information, lists domain invariants from the profile, and resolves terminology
  - forge.agents.generate uses workspaceTypes from the profile for per-domain workspace detection
  - forge.profile.validate checks profile YAML files for schema compliance including domain fields
nonGoals:
  - Do not define the profile schema in this RFC — that is RFC-0638
  - Do not define the bindings schema in this RFC — that is RFC-0639
  - Do not add Editframe-specific profiles in this RFC — that is RFC-0641
  - Do not modify fo-* skill language in this RFC — that is RFC-0642
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

# RFC-0640: Domain-Aware Project Bootstrapping and Health Checks

## Context

`forge.create` (RFC-0391) bootstraps a new project: writes `forge.yaml`, syncs skills, generates `AGENTS.md`. `forge.doctor` checks project health: validates forge.yaml, bindings, skill drift. `forge.agents.generate` generates `AGENTS.md` from `forge.yaml`.

All three commands are software-domain-specific:

- `forge.create` writes `typecheck`, `test`, `scopedBuild` bindings — meaningless for non-software domains.
- `forge.doctor` checks for `package.json`, `tsconfig.json` — not applicable to video or book projects.
- `forge.agents.generate` detects `app`, `service`, `package` workspace types by hardcoded markers.

RFC-0638 extends the profile schema with domain fields. RFC-0639 extends the bindings schema with semantic keys. This RFC wires those schema extensions into the three forge commands so they become domain-aware.

## Problem

Three existing commands are hardcoded to the software domain:

- **`forge.create`** writes software-specific binding defaults (`typecheck`, `test`, `scopedBuild`) and a business register in `PREFERENCES.md`. A video project gets bindings it cannot use and a register that does not match its creative domain.
- **`forge.doctor`** checks for software-specific files (`package.json`, `tsconfig.json`) and software-specific bindings. It cannot validate domain invariants from the profile (RFC-0638) or resolve terminology (RFC-0639).
- **`forge.agents.generate`** detects workspace types by hardcoded markers (`astro.config`, `Dockerfile`, `package.json`). It cannot detect composition, chapter, or track workspace types.

There is also no command to validate profile YAML files themselves — `forge.doctor` validates `forge.yaml` but not the profile files under `packages/forge/profiles/`.

## Decision

Three existing commands are extended to be domain-aware, and one new command is added:

1. **`forge.create`** is extended to read domain fields from the selected profile (RFC-0638) and write them into `forge.yaml` and `PREFERENCES.md`. When the profile declares `register: creative`, `forge.create` writes `register: creative` into `PREFERENCES.md`. When the profile declares semantic binding defaults (e.g. `produce: "npx editframe render"`), `forge.create` writes them into the bindings section.

2. **`forge.doctor`** is extended to: (a) report the active profile's domain, (b) list domain invariants from the profile's `invariants[]` array (reported-only, not automatically checked — automatic checking is delegated to domain-specific skills referenced in `workspaceTypes[].skills`), (c) resolve terminology via the three-tier chain (RFC-0639), (d) skip software-specific checks (`package.json`, `tsconfig.json`) when the profile's `domain` is not `software`.

3. **`forge.agents.generate`** is extended to use `workspaceTypes[]` from the profile for workspace detection. When `workspaceTypes` is declared, the command uses the profile's detection markers instead of hardcoded software markers. When `workspaceTypes` is absent, the existing software-specific detection is used as fallback.

4. **`forge.profile.validate`** (new command) validates profile YAML files under `packages/forge/profiles/` against the extended schema (RFC-0638). Checks: schema version, required fields, domain field format, invariant id format, workspace type detection markers. This command is the profile analogue of `forge.skill.validate` — both validate forge-internal YAML artifacts against their respective Zod schemas. Like `forge.skill.validate`, it is a CLI command (not just a unit test) because it also runs as an advisory check inside `forge.doctor` and supports standalone execution during profile development.

## Architectural fit

- **RFC-0391 (forge.yaml)**: `forge.create` already reads the profile to determine workspace layout and install steps. This RFC extends it to also read domain fields.
- **RFC-0392 (Stack profiles)**: `forge.doctor` already validates forge.yaml against the profile. This RFC extends it to also check domain invariants.
- **RFC-0638 (Profile schema extensions)**: This RFC consumes the domain fields declared by RFC-0638.
- **RFC-0639 (Bindings schema extensions)**: `forge.create` writes semantic binding defaults from the profile; `forge.doctor` resolves terminology via the three-tier chain.
- **Site OS operator model**: All commands remain workspace-scoped. `forge.profile.validate` is workspace-scoped — it validates forge's shipped profile YAML files under `packages/forge/profiles/`, not consumer project artifacts. Consumers do not declare custom profiles; profile authoring is a forge-internal concern. The command runs both standalone (for forge developers) and as an advisory check inside `forge.doctor` (for consumers, to detect malformed shipped profiles).
- **Compass documents**: No `docs/*.xml` Compass documents are affected. Forge command behavior is not described in Compass XML files — those documents cover site composition, requirements, technology, and verification plans. The `packages/forge/AGENTS.md` file is the single documentation artifact that needs updating.

## Design

### CLI surface

```sh
# New command
# Validate all shipped profiles:
forge profile.validate --json
# Validate a single profile by id:
forge profile.validate --id editframe-html --json

# Changed commands (existing flags, new behavior)
forge create --profile editframe-html
forge doctor --json
forge doctor --json --strict   # domain invariant violations become errors
forge agents.generate
```

The `--strict` flag is a new flag for `forge.doctor` that elevates domain invariant warnings to errors. Without `--strict`, invariant violations are reported as `warn` status (advisory). With `--strict`, they are reported as `fail` status (gating). The flag is declared in the command registration in `core.module.ts`.

The `--id` flag for `forge.profile.validate` is optional. When present, only the profile with the matching `id` field is validated. When absent, all profiles under `packages/forge/profiles/` are validated.

### TypeScript contracts

```ts
// forge.profile.validate result
interface ProfileValidateResult {
  valid: boolean;
  profiles: Array<{
    id: string;
    valid: boolean;
    errors: string[];
    warnings: string[];
  }>;
}

// forge.create extended input — profile is already selected,
// domain fields are read from the profile and written to forge.yaml
interface CreateDomainContext {
  profile: StackProfile & StackProfileDomainFields;
  terminology: Record<string, string>;  // resolved from profile
  register: "business" | "creative";    // from profile.register
  semanticBindings: Record<string, string | null>;  // from profile.artifacts
}

// forge.doctor extended output — new domain section
interface DoctorDomainReport {
  domain: string | null;
  register: "business" | "creative" | null;
  invariants: Array<{ id: string; rule: string; severity: "error" | "warning" }>;  // reported-only, not automatically checked
  terminology: Record<string, string>;  // resolved terminology — all keys from UNIVERSAL_TERMINOLOGY (RFC-0639)
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/onboarding/create.ts` | Extended: reads domain fields from profile |
| `packages/forge/src/onboarding/doctor.ts` | Extended: domain reporting, terminology resolution |
| `packages/forge/src/onboarding/agents-generate.ts` | Extended: workspaceTypes detection |
| `packages/forge/src/onboarding/workspace-discovery.ts` | Extended: profile-driven workspace type detection |
| `packages/forge/src/onboarding/profile-validate.ts` | New: validates profile YAML files |
| `packages/forge/src/config/forge-config.ts` | Extended: forge.yaml schema gains optional `domain` and `terminology` fields |
| `packages/forge/os/core/core.module.ts` | Register `forge.profile.validate`, add `--strict` flag to `forge.doctor` |
| `packages/forge/profiles/*.yaml` | Read by `forge.profile.validate` |
| `packages/forge/src/tests/profile-validate.test.ts` | New test |

### Output format

```json
{
  "command": "forge.profile.validate",
  "status": "ok",
  "profiles": [
    {
      "id": "editframe-html",
      "valid": true,
      "errors": [],
      "warnings": []
    }
  ]
}
```

`forge.doctor` --json output gains a new `domain` section:

```json
{
  "command": "forge.doctor",
  "status": "ok",
  "domain": {
    "domain": "video",
    "register": "creative",
    "invariants": [
      { "id": "VIDEO-01", "rule": "Compositions use kebab-case filenames", "severity": "error" },
      { "id": "VIDEO-02", "rule": "Scene durations use contain mode by default", "severity": "warning" }
    ],
    "terminology": {
      "artifact": "composition",
      "module": "scene",
      "operator": "director"
    }
  }
}
```

### Failure modes

- **Profile not found**: `forge.create --profile editframe-html` fails with a clear error listing available profiles.
- **Domain invariant reporting**: `forge.doctor` lists domain invariants from the profile's `invariants[]` array as advisory information. Invariants are not automatically checked — automatic checking is delegated to domain-specific skills (e.g. `ef-composition-review` for video). The `--strict` flag does not affect invariant reporting because invariants are not checked; it is reserved for future use when automatic checking is added.
- **workspaceTypes detection ambiguity**: If multiple workspace types match the same directory, `forge.agents.generate` reports a warning and uses the first match (order = `workspaceTypes[]` array order in the profile).
- **workspaceTypes detection fallback**: When the profile has no `workspaceTypes[]` field, the existing hardcoded detection is used (app > service > package precedence). When `workspaceTypes[]` is present, it fully replaces the hardcoded detection — directories matching no profile-declared workspace type are not classified and do not get a nested `AGENTS.md`.
- **Profile schema invalid**: `forge.profile.validate` exits non-zero with per-profile error details. When run as an advisory check inside `forge.doctor`, profile validation failures are reported as `warn` status (not `fail`), since shipped profiles are forge-internal artifacts not under the consumer's control.

## Rollout

- **Dependency ordering**: RFC-0638 (profile schema extensions) and RFC-0639 (bindings schema extensions) must be implemented before this RFC. This RFC consumes the schema fields they define — without them, there are no domain fields to read and no semantic keys to write.
- **Backward compatibility**: When a profile has no domain fields (existing profiles), all three commands fall back to current software-domain behavior. No changes for existing projects.
- **New profiles**: New profiles (e.g. `editframe-html` in RFC-0641) declare domain fields and get domain-aware behavior from day one.
- **Existing profiles upgrade**: Existing profiles MAY add `domain: software` in follow-up PRs. `forge.doctor` will then report the domain but skip no checks (software domain is the default).
- **Domain invariant reporting**: Domain invariants are reported-only (listed in doctor output). Automatic checking is delegated to domain-specific skills referenced in `workspaceTypes[].skills`.
- **`forge.profile.validate`**: New command, no deprecation path. Added to `forge.doctor` as an advisory check with `warn` status on failure (not gating).

## Alternatives considered

- **Domain-specific forge.create variants (e.g. `forge.create.video`)**: Rejected. This couples forge to specific domains. The profile-driven approach keeps forge domain-agnostic.
- **Separate doctor command per domain (e.g. `forge.doctor.video`)**: Rejected. Same reason — forge stays domain-agnostic, the profile drives behavior.
- **Hardcoded domain detection in doctor**: Rejected. Hardcoding detection logic in the command handler couples forge to specific domains.
- **Unit test instead of CLI command for `forge.profile.validate`**: Rejected. While a unit test in `packages/forge/src/tests/` could validate profiles against the Zod schema, `forge.skill.validate` sets the precedent for forge-internal validation as a CLI command. The command also runs as an advisory check inside `forge.doctor` and supports standalone execution during profile development, which a unit test cannot do.

## Risks

- **Command complexity**: Extending three commands increases their complexity. Mitigation: domain-aware logic is guarded by profile field presence — absent fields trigger fallback to existing behavior.
- **Profile validation gaps**: `forge.profile.validate` is new and might miss edge cases. Mitigation: it uses the same Zod schema as the profile loader, so schema-level validation is consistent.
- **workspaceTypes detection false positives**: Non-software markers (e.g. `*.html` containing `ef-timegroup`) might match unrelated files. Mitigation: detection markers are profile-specific and can be refined per profile.

## Acceptance criteria

- [ ] `forge.profile.validate` command registered in `forgeCoreModule`
- [ ] `forge.create` reads `register` from profile and writes it to `PREFERENCES.md`
- [ ] `forge.create` writes semantic binding defaults from profile `artifacts[]` when present
- [ ] `forge.doctor` reports domain information when profile has `domain` field
- [ ] `forge.doctor` reports domain invariants from profile `invariants[]` (reported-only, not automatically checked)
- [ ] `forge.doctor` resolves terminology via three-tier chain (bindings → profile → default)
- [ ] `forge.doctor` skips software-specific checks when `domain !== "software"`
- [ ] `forge.agents.generate` uses `workspaceTypes[]` for detection when present, replacing hardcoded detection
- [ ] All three commands fall back to existing behavior when profile has no domain fields
- [ ] `forge.doctor` `--strict` flag declared in command registration
- [ ] `forge.profile.validate` `--id` flag filters to a single profile when present
- [ ] Unit tests for each command's domain-aware and fallback paths
- [ ] `packages/forge/AGENTS.md` updated
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
