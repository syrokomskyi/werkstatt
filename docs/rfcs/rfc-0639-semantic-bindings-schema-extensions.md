---
id: RFC-0639
title: "Semantic Bindings Schema Extensions"
status: draft
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers: []
createdAt: 2026-08-01
updatedAt: 2026-08-01
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - DNA-54
  - RFC-0393
  - RFC-0638
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
  - Bindings schema supports semantic command keys (validate, produce, verify, preview, lint) alongside existing software-specific keys
  - Skills can reference `ref(bindings.commands.produce)` and get domain-appropriate commands resolved at runtime
  - Existing forge.yaml files with only software-specific keys (typecheck, test, scopedBuild) parse without changes
nonGoals:
  - Do not change profile schema in this RFC — that is RFC-0638
  - Do not change forge.create or forge.doctor behavior in this RFC — that is RFC-0640
  - Do not modify fo-* skill language in this RFC — that is RFC-0642
  - Do not remove existing binding keys (typecheck, test, scopedBuild) — they remain as optional software-domain keys
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

# RFC-0639: Semantic Bindings Schema Extensions

## Context

The forge bindings contract (DNA-54, RFC-0393) de-hardcodes project-specific values from skill bodies. Skills reference bindings by key (e.g. `ref(bindings.commands.validateRfc)`) instead of hardcoding commands. However, the current bindings schema (`forge/bindings@1` in `packages/forge/src/config/forge-config.ts`) uses software-specific command keys: `typecheck`, `test`, `scopedBuild`. These keys are meaningless for non-software domains — a video project does not "typecheck", a book project does not "build".

The terminology field already exists as an optional `Record<string, string>` in the bindings schema, but it is not consumed by skills or generated content. There is no `artifacts` section in bindings — profiles declare artifacts (RFC-0638) but bindings cannot reference them.

## Problem

The bindings schema has three gaps for non-software domains:

- **Software-specific command keys**: `typecheck`, `test`, `scopedBuild` are the only semantic command keys. A video project needs `produce` (render), `validate` (composition check), `preview` (dev server). A book project needs `produce` (compile), `validate` (proofread). These domains have no corresponding binding keys.
- **Terminology not resolved**: The `terminology` field exists but `resolveBinding()` does not resolve terminology keys. Skills cannot call `ref(bindings.terminology.artifact)` to get "composition" in a video project.
- **No artifact references**: Bindings cannot reference the profile's artifact model. A skill that needs to know "what does this project produce?" has no binding key to query.

## Decision

The `forge/bindings@1` schema is extended with five optional semantic command keys and a terminology resolution mechanism:

1. **`commands.validate`** — semantic key for the project's validation command (replaces `typecheck` for non-software domains). Optional, defaults to `null`.
2. **`commands.produce`** — semantic key for the project's artifact production command (replaces `scopedBuild`). Optional, defaults to `null`.
3. **`commands.verify`** — semantic key for the project's verification command (replaces `test`). Optional, defaults to `null`.
4. **`commands.preview`** — semantic key for the project's preview command (e.g. dev server, live preview). Optional, defaults to `null`.
5. **`commands.lint`** — semantic key for the project's linting command. Optional, defaults to `null`.

The `terminology` field is promoted from `optional` to a first-class bindings section with a default empty record. `resolveBinding()` is extended to resolve terminology keys (e.g. `terminology.artifact` → `"composition"`).

Existing software-specific keys (`typecheck`, `test`, `scopedBuild`) remain in the schema as optional. They are not removed — software projects continue to use them. The semantic keys are additive.

A `resolveTerminology(config, key)` helper is exported from `@warpgogol/forge/config`. It resolves a terminology key from bindings, falling back to the profile's terminology map (RFC-0638), falling back to the universal default term.

## Architectural fit

- **DNA-54 (Forge bindings contract)**: This RFC extends the bindings schema with semantic keys that work across all domains. Skills reference `ref(bindings.commands.produce)` instead of `ref(bindings.commands.scopedBuild)` — the same skill body works for software (produce = build) and video (produce = render).
- **RFC-0393 (Bindings contract)**: This RFC extends the existing bindings schema with new optional fields. It does not create a v2 schema.
- **RFC-0638 (Profile schema extensions)**: The terminology resolution chain (bindings → profile → universal default) connects the two schemas. Bindings take precedence (per-project overrides), profile terminology is the domain default, universal defaults are the fallback.
- **Degradation contract**: The existing degradation contract (required binding unresolvable → skill refuses; optional absent → step skipped) applies to the new semantic keys identically.

## Design

### CLI surface

No new CLI commands. The schema extension is consumed by existing commands and skills.

forge.yaml with semantic keys for a video project:

```yaml
bindings:
  schema: forge/bindings@1
  commands:
    validateRfc: "forge rfc.validate --id {id} --json"
    validateAdr: "forge adr.validate --id {id} --json"
    implementStamp: "forge rfc.implement.stamp --id {id} --implementation-commit {commit}"
    specValidate: "forge spec.validate --spec={id} --json"
    sessionSave: "forge session.save --json"
    # Semantic keys (domain-neutral)
    validate: "npx editframe check"
    produce: "npx editframe render -o {output}"
    verify: "npx editframe render --dry-run"
    preview: "npx editframe preview"
    lint: "npx editframe check --strict"
    # Software-specific keys (null for non-software domains)
    typecheck: null
    test: null
    scopedBuild: null
  terminology:
    artifact: composition
    module: scene
    operator: director
```

### TypeScript contracts

```ts
// Extended ForgeBindings['commands'] — five new optional semantic keys.
// Existing keys remain; all are optional with null defaults.

export interface ForgeBindingsCommands {
  // Existing (RFC-0393, RFC-0540)
  validateRfc: string | null;
  validateAdr: string | null;
  implementStamp: string | null;
  typecheck: string | null;      // software domain
  test: string | null;           // software domain
  scopedBuild: string | null;    // software domain
  specValidate: string | null;
  sessionSave: string | null;
  // New semantic keys (RFC-0639)
  validate: string | null;       // domain-neutral
  produce: string | null;        // domain-neutral
  verify: string | null;         // domain-neutral
  preview: string | null;        // domain-neutral
  lint: string | null;           // domain-neutral
}

// Terminology resolution chain: bindings → profile → universal default

export function resolveTerminology(
  config: ForgeConfig,
  profile: StackProfile | undefined,
  key: string,
): string {
  // 1. Per-project override in bindings.terminology
  if (config.bindings?.terminology?.[key]) {
    return config.bindings.terminology[key];
  }
  // 2. Per-domain default in profile.terminology
  if (profile?.terminology?.[key]) {
    return profile.terminology[key];
  }
  // 3. Universal default
  return UNIVERSAL_TERMINOLOGY[key] ?? key;
}

export const UNIVERSAL_TERMINOLOGY: Record<string, string> = {
  artifact: "artifact",
  artifactPlural: "artifacts",
  module: "module",
  source: "source file",
  output: "output",
  verify: "verify",
  operator: "operator",
};
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/src/config/forge-config.ts` | Schema extended with semantic keys, `resolveTerminology` added |
| `packages/forge/src/tests/bindings-schema.test.ts` | New test: semantic keys parse, terminology resolution chain works |
| `packages/forge/AGENTS.md` | Updated with semantic key documentation |

### Output format

No command output — this RFC is a schema extension only. `resolveTerminology()` returns a string; `resolveBinding()` returns `string | string[] | null` as before.

### Failure modes

- **Semantic key is null**: If a skill references `ref(bindings.commands.produce)` and the binding is `null`, the skill's degradation contract applies: required → skill refuses to start; optional → step skipped with `Degraded:` line.
- **Terminology key not found**: `resolveTerminology()` falls back to the universal default term. No error.
- **Both semantic and software keys set**: Both can coexist. Skills choose which to reference. No conflict.

## Rollout

- **Backward compatibility**: All new keys are optional with `null` defaults. Existing forge.yaml files parse without changes.
- **forge.create defaults**: `forge.create` writes `null` for semantic keys (same as `typecheck`, `test`, `scopedBuild`). The profile (RFC-0638) may provide domain-specific defaults in follow-up RFC-0640.
- **Skill migration**: Skills are updated to reference semantic keys in RFC-0642. Until then, skills that reference `typecheck`/`test`/`scopedBuild` continue to work.
- **No flag day**: The schema extension is purely additive.

## Alternatives considered

- **Replace software-specific keys with semantic keys**: Rejected. This would break all existing forge.yaml files and require a v2 schema. Additive extension is safer.
- **Domain-specific key namespaces (e.g. `commands.video.render`)**: Rejected. This couples the bindings schema to specific domains. Semantic keys (`produce`, `validate`, `verify`) are domain-neutral and work for all domains.
- **Terminology as a separate config file**: Rejected. Terminology is per-project and per-domain — it belongs in bindings (per-project) and profiles (per-domain), not in a separate file.

## Risks

- **Key proliferation**: Adding five new keys to the commands schema increases the surface area. Mitigation: all keys are optional; skills only reference the keys they need.
- **Skill confusion**: Skills might reference both `typecheck` and `validate`, creating ambiguity. Mitigation: RFC-0642 audits all skills and migrates them to semantic keys where appropriate.
- **Terminology resolution overhead**: The three-tier resolution chain (bindings → profile → default) adds a lookup. Mitigation: the chain is a simple object key lookup — negligible performance impact.

## Acceptance criteria

- [ ] `ForgeBindingsCommands` interface extended with `validate`, `produce`, `verify`, `preview`, `lint` optional keys
- [ ] Zod schema in `forge-config.ts` extended with five new optional nullable string fields
- [ ] `resolveTerminology(config, profile, key)` exported from `@warpgogol/forge/config`
- [ ] `UNIVERSAL_TERMINOLOGY` constant exported with default terms
- [ ] Unit tests verify: semantic keys parse, null defaults work, terminology resolution chain returns correct values at each tier
- [ ] Existing forge.yaml files (software domain) parse without changes
- [ ] `packages/forge/AGENTS.md` updated with semantic key and terminology documentation
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
