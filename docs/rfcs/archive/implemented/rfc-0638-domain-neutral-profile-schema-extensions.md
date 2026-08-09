---
id: RFC-0638
title: "Domain-Neutral Profile Schema Extensions"
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
createdAt: 2026-08-01
updatedAt: 2026-08-02
enhancedAt: 2026-08-02
implementedAt: 2026-08-02
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-54
  - RFC-0392
  - RFC-0393
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
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - "Stack profile YAML files can declare `domain`, `terminology`, `artifacts`, `workspaceTypes`, `invariants`, and `register` fields"
  - "Existing v1 profiles (astro-typescript-turborepo, phaser-turborepo, forge-shell) parse without changes"
  - "`forge.doctor` reports domain information from the active profile"
nonGoals:
  - Do not add Editframe-specific profiles in this RFC — that is RFC-0641
  - Do not change the bindings schema in this RFC — that is RFC-0639
  - Do not change forge.create or forge.doctor command behavior in this RFC — that is RFC-0640
  - Do not modify fo-* skill language in this RFC — that is RFC-0642
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

# RFC-0638: Domain-Neutral Profile Schema Extensions

## Context

`@warpgogol/forge` is published to NPM as a portable governance engine. Its stack profiles (`forge/stack-profile@1`) currently encode software-specific assumptions: workspace dirs are `sites/`, `packages/`, `services/`; artifacts are code; the operator is a developer. This works for the two existing profiles (`astro-typescript-turborepo`, `phaser-turborepo`) but prevents FORGE from supporting non-software domains — programmatic video creation (Editframe), book authoring, music production, game development, or illustration generation.

The forge bindings contract (DNA-54, RFC-0393) already de-hardcodes project-specific values from skill bodies. However, the profile schema itself has no concept of _domain_: no terminology map, no artifact model, no workspace-type detection, no domain-specific invariants, no behavioral register selection. Every profile is implicitly a software profile.

This RFC extends `forge/stack-profile@1` with optional domain-neutral fields that allow a profile to declare what kind of project it governs — without breaking existing profiles.

## Problem

The stack profile schema (`packages/forge/src/config/forge-config.ts` → `forgeConfigSchema`, and the profile YAML files under `packages/forge/profiles/`) has no domain abstraction. Concretely:

- **No terminology map**: profiles cannot declare what their artifacts are called ("composition" vs "site" vs "chapter" vs "track"). Generated content (AGENTS.md, doctor output) uses hardcoded software terms.
- **No artifact model**: profiles cannot declare what the project produces, how it is built, or how it is validated. `forge.doctor` cannot run domain-specific health checks.
- **No workspace-type detection**: `forge.agents.generate` detects `app`, `service`, `package` by hardcoded markers (astro.config, Dockerfile, package.json). Non-software workspace types (composition, chapter, track) are invisible.
- **No domain invariants**: profiles cannot declare domain-specific DNA invariants (e.g. "all compositions use kebab-case filenames", "all speech audio must have captions"). Quality enforcement is limited to universal DNA.
- **No register selection**: profiles cannot declare a default behavioral register (business vs creative). All projects default to business, which is wrong for creative domains like video, music, or illustration.

## Decision

The `forge/stack-profile@1` schema is extended with six optional fields that allow a profile to declare its domain model without breaking backward compatibility:

1. **`domain`** — a string identifying the project domain (e.g. `software`, `video`, `book`, `music`, `game`, `illustration`). Used for profile detection and doctor output.
2. **`terminology`** — a map of universal concept keys to domain-specific terms (e.g. `artifact: "composition"`, `module: "scene"`, `operator: "director"`). Used by generated content and skill language resolution.
3. **`artifacts`** — an array of artifact definitions, each declaring extensions, produce command, validate command, and determinism properties. Used by `forge.doctor` for domain-specific health checks.
4. **`workspaceTypes`** — an array of workspace type definitions, each with detection markers, associated skills, and AGENTS.md template reference. Used by `forge.agents.generate` for per-domain workspace detection.
5. **`invariants`** — an array of domain-specific invariant definitions, each with an id, rule text, and severity. Schema only in this RFC; enforcement is deferred to follow-up RFCs.
6. **`register`** — a string selecting the default behavioral register (`business` or `creative`). Used by `forge.create` when writing `PREFERENCES.md`.

All six fields are optional. Existing profiles without these fields continue to parse and function identically.

## Architectural fit

- **DNA-54 (Forge bindings contract)**: This RFC extends the same de-hardcoding principle from skill bodies to profile schemas. Just as skills reference bindings by key instead of hardcoding values, profiles declare terminology and artifact models that generated content resolves dynamically. The connection is analogical: DNA-54 governs skill bodies, this RFC governs profile schemas — both serve the same de-hardcoding goal at different layers.
- **RFC-0392 (Stack profiles)**: This RFC extends the existing profile schema with new optional fields. It does not create a v2 schema — all existing profiles remain valid.
- **RFC-0393 (Bindings contract)**: The `terminology` field in profiles is the profile-level analogue of the `terminology` field in bindings. They serve the same purpose at different layers: bindings are per-project, profile terminology is per-domain.
- **RFC-0549 (Extended behavioral layer)**: The `register` field allows profiles to declare a default behavioral register, enabling creative domains to get the extended behavioral layer by default.
- **Site OS operator model**: No new commands are introduced. The schema extension is consumed by existing commands (`forge.create`, `forge.doctor`, `forge.agents.generate`) in follow-up RFCs.

## Design

### CLI surface

No new CLI commands. The schema extension is consumed by existing commands in follow-up RFCs.

Profile YAML files use the new fields:

```yaml
schema: forge/stack-profile@1
id: editframe-html
displayName: Editframe HTML Video
domain: video
register: creative
terminology:
  artifact: composition
  artifactPlural: compositions
  module: scene
  source: composition file
  output: render
  verify: render-verify
  operator: director
artifacts:
  - id: composition
    extensions: [.html, .tsx]
    produce:
      command: ref(bindings.commands.produce)
      output: dist/renders/{name}.mp4
    validate:
      command: ref(bindings.commands.validate)
    determinism:
      hashable: true
      inputs: [composition files, assets, editframe version]
workspaceTypes:
  - id: composition
    detect:
      glob: *.html
      contains: ef-timegroup
    skills: [ef-composition-review, ef-render-verify]
    agentsMdTemplate: templates/composition-agents.md
invariants:
  - id: VIDEO-01
    rule: Compositions use kebab-case filenames
    severity: error
  - id: VIDEO-02
    rule: Scene durations use contain mode by default
    severity: warning
  - id: VIDEO-03
    rule: All speech audio must have ef-captions
    severity: error
```

### TypeScript contracts

```ts
// New optional fields added to the stack profile schema.
// All fields are optional — existing profiles remain valid.

export interface ProfileArtifact {
  id: string;
  extensions: string[];
  produce?: {
    command: string;
    output?: string;
  };
  validate?: {
    command: string;
  };
  determinism?: {
    hashable: boolean;
    inputs: string[];
  };
}

export interface ProfileWorkspaceType {
  id: string;
  detect: {
    glob?: string;
    contains?: string;
    packageJsonDep?: string;
  };
  skills?: string[];
  agentsMdTemplate?: string;
}

export interface ProfileInvariant {
  id: string;
  rule: string;
  severity: "error" | "warning";
}

export interface StackProfileDomainFields {
  domain?: string;
  terminology?: Record<string, string>;
  artifacts?: ProfileArtifact[];
  workspaceTypes?: ProfileWorkspaceType[];
  invariants?: ProfileInvariant[];
  register?: "business" | "creative";
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/profiles/profile-schema.ts` | New file: `StackProfileDomainFields` types, Zod sub-schemas, and universal terminology key catalog |
| `packages/forge/src/profiles/stack-profile.ts` | Existing schema extended — imports and spreads domain fields into `stackProfileSchema` |
| `packages/forge/src/index.ts` | Exports `StackProfileDomainFields`, `ProfileArtifact`, `ProfileWorkspaceType`, `ProfileInvariant` from `@warpgogol/forge` |
| `packages/forge/profiles/*.yaml` | Existing profiles unchanged; new profiles use new fields |
| `packages/forge/src/tests/profile-schema.test.ts` | New test: domain fields parse correctly, v1 profiles still valid |

### Output format

No command output — this RFC is a schema extension only. The schema is consumed by commands in follow-up RFCs.

### Terminology key catalog

The `terminology` field uses an **open vocabulary** — new domains may introduce new keys without schema changes. The following universal keys are recognized by generated content and have built-in defaults (the key itself):

| Key              | Default       | Used by                         |
| ---------------- | ------------- | ------------------------------- |
| `artifact`       | `artifact`    | AGENTS.md, doctor output        |
| `artifactPlural` | `artifacts`   | AGENTS.md, doctor output        |
| `module`         | `module`      | AGENTS.md workspace type labels |
| `source`         | `source file` | AGENTS.md, doctor output        |
| `output`         | `output`      | Doctor health checks            |
| `verify`         | `verify`      | Doctor health checks            |
| `operator`       | `operator`    | AGENTS.md, PREFERENCES.md       |

Profiles that declare a subset of these keys get defaults for the rest. Profiles may declare additional keys for domain-specific use — generated content that references an unknown key falls back to the key itself.

### Register conflict resolution

The `register` field provides a **default for new projects only**. `forge.create` writes `PREFERENCES.md` when it does not exist yet — if `PREFERENCES.md` already exists, `forge.create` skips it (same pattern as `forge.yaml` in `init.ts`). Therefore:

- **New project**: profile `register` value is written to `PREFERENCES.md`.
- **Existing project**: `PREFERENCES.md` is never overwritten — the operator's existing `register` value always wins.

This means `register` in a profile is a one-time default, not an ongoing enforcement. Operators can change `register` in `PREFERENCES.md` at any time without profile changes.

### Invariants enforcement scope

This RFC defines the `invariants` schema only. Enforcement — how `fo-review` reads profile invariants, how `forge.doctor` scans files against invariant rules — is **fully deferred to follow-up RFCs** (RFC-0640 and beyond). The acceptance criteria in this RFC test parsing and validation only, not enforcement. The `invariants` array is stored in the parsed profile and available for consumption by future commands, but no existing command reads it yet.

### Failure modes

- **Unknown domain value**: If `domain` is set to a string not in the known domains list, `forge.doctor` reports a warning but does not fail. The known domains list is open — new domains can be added without schema changes.
- **Missing terminology key**: If a terminology key referenced by a skill is not in the profile's `terminology` map, the skill falls back to the universal default term (e.g. "artifact" → "artifact").
- **Invalid invariant id format**: If `invariants[].id` does not match `^[A-Z]+-\d+$`, profile loading fails with a validation error.

## Rollout

- **Backward compatibility**: All new fields are optional. Existing profiles (`astro-typescript-turborepo`, `phaser-turborepo`, `forge-shell`) parse without changes. No migration required.
- **New profiles**: New profiles (e.g. `editframe-html` in RFC-0641) use the new fields from day one.
- **Existing profiles upgrade**: Existing profiles MAY add `domain: software` and `terminology` maps in follow-up PRs, but are not required to.
- **No flag day**: The schema extension is purely additive. No existing behavior changes.

## Alternatives considered

- **Profile schema v2 (`forge/stack-profile@2`)**: Rejected. A new schema version would require migration logic and break existing consumers. The extension is purely additive — optional fields in v1 are sufficient.
- **Domain-specific profiles as separate npm packages**: Rejected for now. The domain fields are small enough to live in the profile schema. External profile packages can be added later if the profile directory grows unmanageably.
- **Hardcoded domain detection in forge.create**: Rejected. Hardcoding domain detection logic in the command handler would couple forge to specific domains. The profile schema approach keeps forge domain-agnostic.

## Risks

- **Schema bloat**: Adding six optional fields to the profile schema increases complexity. Mitigation: all fields are optional and well-documented; profiles that don't use them pay no cost.
- **Terminology key drift**: Skills might reference terminology keys that profiles don't declare. Mitigation: universal default terms are always available; missing keys fall back gracefully.
- **Invariant id collisions**: Domain invariants (e.g. `VIDEO-01`) might collide with future DNA invariants. Mitigation: domain invariants use domain-specific prefixes (`VIDEO-`, `BOOK-`, `MUSIC-`) while DNA invariants use `DNA-` prefix. No collision possible.

## Acceptance criteria

- [x] `StackProfileDomainFields` interface and Zod schema defined in `packages/forge/src/profiles/profile-schema.ts` (evidence: packages/forge/src/profiles/profile-schema.ts:96-116)
- [x] Schema extension loaded and validated in `packages/forge/src/profiles/stack-profile.ts` (imports and spreads domain fields into `stackProfileSchema`) (evidence: packages/forge/src/profiles/stack-profile.ts:19-22,57-63)
- [x] New types exported from `@warpgogol/forge` via `packages/forge/src/index.ts` (evidence: packages/forge/src/index.ts:98-110)
- [x] Existing profiles (`astro-typescript-turborepo`, `phaser-turborepo`, `forge-shell`) parse without changes (evidence: packages/forge/src/tests/profile-schema.test.ts:120-131, pnpm --filter @warpgogol/forge run test passes)
- [x] Unit tests verify: new fields parse correctly, absent fields default to undefined, invalid invariant ids fail validation (evidence: packages/forge/src/tests/profile-schema.test.ts:1-191, 14 test cases pass)
- [x] `packages/forge/AGENTS.md` updated with domain fields documentation (evidence: packages/forge/AGENTS.md:97-108)
- [x] `rfc.validate` passes on this file before merging (evidence: pnpm exec werkstatt run rfc.validate --id RFC-0638 --json, status: pass)

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
