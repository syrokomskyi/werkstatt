---
id: RFC-0639
title: "Semantic Bindings Schema Extensions"
status: implemented
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

The `terminology` field schema changes from `z.record(z.string(), z.string()).optional()` to `z.record(z.string(), z.string()).default({})` — making it non-optional in the `ForgeBindings` interface (`terminology: Record<string, string>` instead of `terminology?: Record<string, string>`). `defaultForgeConfig` already sets `terminology: {}`, so no existing consumer breaks. `resolveBinding()` already resolves terminology keys via its generic dot-path traversal — no change needed to `resolveBinding()` itself.

Existing software-specific keys (`typecheck`, `test`, `scopedBuild`) remain in the schema as optional. They are not removed — software projects continue to use them. The semantic keys are additive.

A `resolveTerminology(config, terminology, key)` helper is exported from `@warpgogol/forge/config`. It resolves a terminology key from bindings (tier 1), falling back to the caller-provided terminology map (tier 2, typically from the profile's `terminology` field per RFC-0638), falling back to the universal default term (tier 3). The `terminology` parameter is `Record<string, string> | undefined` — a separate parameter, not embedded in `StackProfile` — so the function compiles and works whether or not RFC-0638 is implemented.

## Architectural fit

- **DNA-54 (Forge bindings contract)**: This RFC extends the bindings schema with semantic keys that work across all domains. Skills reference `ref(bindings.commands.produce)` instead of `ref(bindings.commands.scopedBuild)` — the same skill body works for software (produce = build) and video (produce = render).
- **RFC-0393 (Bindings contract)**: This RFC extends the existing bindings schema with new optional fields. It does not create a v2 schema.
- **RFC-0638 (Profile schema extensions)**: The terminology resolution chain (bindings → profile terminology → universal default) connects the two schemas. Bindings take precedence (per-project overrides), profile terminology is the domain default, universal defaults are the fallback. RFC-0638 is a **soft prerequisite**: `resolveTerminology` accepts the terminology map as a separate `Record<string, string> | undefined` parameter, so it compiles and works without RFC-0638 — tier 2 simply remains `undefined` and the function falls back to universal defaults. When RFC-0638 is implemented, callers pass `profile.terminology` as the second argument.
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

// Terminology resolution chain: bindings → caller-provided terminology → universal default
// The `terminology` parameter is a separate Record (not StackProfile) to decouple
// from RFC-0638. Callers pass `profile.terminology` when RFC-0638 is implemented;
// until then, pass `undefined` and tier 2 is skipped.

export function resolveTerminology(
  config: ForgeConfig,
  terminology: Record<string, string> | undefined,
  key: string,
): string {
  // 1. Per-project override in bindings.terminology
  if (config.bindings?.terminology?.[key]) {
    return config.bindings.terminology[key];
  }
  // 2. Per-domain default (caller-provided, typically from profile.terminology)
  if (terminology?.[key]) {
    return terminology[key];
  }
  // 3. Universal default
  return UNIVERSAL_TERMINOLOGY[key] ?? key;
}

// Universal default terms — derived from the vocabulary used in existing fo-skill
// instruction lines and generated AGENTS.md content. These 7 keys cover the
// domain-neutral concepts that skills and generated content reference:
// artifact/artifactPlural (what the project produces), module (structural unit),
// source (input file), output (production result), verify (verification action),
// operator (the person running the project). Skills reference these via
// `ref(bindings.terminology.<key>)`; if unresolvable, the key itself is returned.

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
| `packages/forge/src/config/forge-config.ts` | Schema extended with 5 semantic keys; `terminology` changed from `.optional()` to `.default({})`; `ForgeBindingsCommands` interface extended; `resolveTerminology` and `UNIVERSAL_TERMINOLOGY` added; `applyCliBindingDefaults` updated to initialize 5 new keys with `null` |
| `packages/forge/src/tests/bindings-schema.test.ts` | New test: semantic keys parse, null defaults work, terminology resolution chain returns correct values at each tier, `applyCliBindingDefaults` includes 5 new keys |
| `packages/forge/AGENTS.md` | Updated with semantic key and terminology documentation |

### Output format

No command output — this RFC is a schema extension only. `resolveTerminology()` returns a string; `resolveBinding()` returns `string | string[] | null` as before.

### Failure modes

- **Semantic key is null**: If a skill references `ref(bindings.commands.produce)` and the binding is `null`, the skill's degradation contract applies: required → skill refuses to start; optional → step skipped with `Degraded:` line.
- **Terminology key not found**: `resolveTerminology()` falls back to the universal default term. If the key is not in `UNIVERSAL_TERMINOLOGY` either, the key itself is returned. No error.
- **Both semantic and software keys set**: Both can coexist. Skills choose which to reference. No conflict.
- **`forge.doctor` behavior**: The 5 semantic keys are **not** added to `BINDING_COMMAND_KEYS` in `doctor.ts`. `forge.doctor` validates only forge-CLI-backed and software-domain keys. Semantic keys are opt-in per-domain — reporting them as `absent` for projects that intentionally leave them `null` would be noise, not signal. `forge.doctor` may be extended in RFC-0640 to validate semantic keys when a profile declares them as expected.

## Rollout

- **Backward compatibility**: All new keys are optional with `null` defaults. Existing forge.yaml files parse without changes. The `terminology` schema change (`.optional()` → `.default({})`) is backward-compatible: existing YAML files without `terminology` now get `{}` instead of `undefined`, and `defaultForgeConfig` already sets `terminology: {}`.
- **`applyCliBindingDefaults`**: Updated to initialize the 5 new semantic keys with `null` (same as `typecheck`, `test`, `scopedBuild`). Semantic keys are stack-dependent, not CLI-backed — `forge.create` writes `null`, not a default command. The profile (RFC-0638) may provide domain-specific defaults in follow-up RFC-0640.
- **`forge.doctor` validation**: Semantic keys are not added to `BINDING_COMMAND_KEYS`. Doctor validation is limited to forge-CLI-backed and software-domain keys. This prevents false `absent` reports for projects that intentionally leave semantic keys `null`.
- **RFC-0638 soft dependency**: `resolveTerminology` accepts `terminology: Record<string, string> | undefined` as a separate parameter. When RFC-0638 is not yet implemented, callers pass `undefined` and tier 2 is skipped. When RFC-0638 is implemented, callers pass `profile.terminology`.
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

- [x] `ForgeBindingsCommands` interface extended with `validate`, `produce`, `verify`, `preview`, `lint` optional keys (evidence: packages/forge/src/config/forge-config.ts:76-81)
- [x] Zod schema in `forge-config.ts` extended with five new optional nullable string fields (evidence: packages/forge/src/config/forge-config.ts:42-47)
- [x] `resolveTerminology(config, terminology, key)` exported from `@warpgogol/forge/config` — accepts `Record<string, string> | undefined` as second parameter (not `StackProfile`) (evidence: packages/forge/src/config/forge-config.ts:418-430, packages/forge/src/index.ts:76)
- [x] `UNIVERSAL_TERMINOLOGY` constant exported with default terms — reused `TERMINOLOGY_DEFAULTS` from `profile-schema.ts` (RFC-0638) to avoid duplication (evidence: packages/forge/src/profiles/profile-schema.ts:30-38, packages/forge/src/config/forge-config.ts:26)
- [x] `applyCliBindingDefaults` updated to initialize 5 new semantic keys with `null` (evidence: packages/forge/src/config/forge-config.ts:234-239)
- [x] Unit tests verify: semantic keys parse, null defaults work, terminology resolution chain returns correct values at each tier, `applyCliBindingDefaults` includes 5 new keys (evidence: packages/forge/src/tests/bindings-schema.test.ts, 14 tests pass)
- [x] `terminology` schema changed from `.optional()` to `.default({})` in Zod and `ForgeBindings` interface (evidence: packages/forge/src/config/forge-config.ts:56, packages/forge/src/config/forge-config.ts:90)
- [x] Existing forge.yaml files (software domain) parse without changes (evidence: packages/forge/src/tests/bindings-schema.test.ts:69-92, existing forge.yaml at repo root parses)
- [x] `packages/forge/AGENTS.md` updated with semantic key and terminology documentation (evidence: packages/forge/AGENTS.md:127-149)
- [x] `rfc.validate` passes on this file before merging (evidence: `pnpm exec werkstatt run rfc.validate --id RFC-0639 --json` — status: pass)

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
