---
id: RFC-0643
title: "Per-Domain AGENTS.md Template Generation"
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
createdAt: 2026-08-01
updatedAt: 2026-08-01
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0391
  - RFC-0611
  - RFC-0638
  - RFC-0640
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
    - forge.agents.generate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - packages/forge
successSignals:
  - `forge.agents.generate` produces domain-appropriate AGENTS.md files using profile terminology
  - Root AGENTS.md for a video project says "composition" instead of "app", "director" instead of "operator"
  - Nested AGENTS.md files use workspace-type-specific templates from the profile
  - Existing software-domain projects generate identical AGENTS.md as before (no regression)
nonGoals:
  - Do not define the profile schema in this RFC — that is RFC-0638
  - Do not change forge.create or forge.doctor behavior in this RFC — that is RFC-0640
  - Do not modify fo-* skill language in this RFC — that is RFC-0642
  - Do not create Editframe-specific AGENTS.md templates — those are part of RFC-0641's profile templates
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

# RFC-0643: Per-Domain AGENTS.md Template Generation

## Context

`forge.agents.generate` (RFC-0611) generates `AGENTS.md` files for the project root and nested workspace directories. It uses hardcoded templates with software-domain language: "app", "service", "package", "operator", "build", "typecheck". The templates are defined in `packages/forge/os/core/handlers/agents-generate.ts`.

RFC-0638 extends profiles with `terminology` and `workspaceTypes`. RFC-0640 extends `forge.agents.generate` to use `workspaceTypes` for detection. This RFC extends the template generation to use profile terminology in the generated AGENTS.md content.

## Problem

`forge.agents.generate` produces AGENTS.md files with software-domain language regardless of the project's domain. A video project gets an AGENTS.md that says "Each app is a workspace..." — wrong for a video project where workspaces are compositions. This creates cognitive friction for operators and misleads AI agents that read AGENTS.md for behavioral guidance.

The command has no mechanism to:

- Use profile terminology in generated prose ("composition" instead of "app")
- Use workspace-type-specific AGENTS.md templates from the profile
- Adapt the root AGENTS.md template to the project's domain register (creative vs business)

## Decision

`forge.agents.generate` is extended to use profile terminology and workspace-type templates when generating AGENTS.md files:

1. **Root AGENTS.md template**: The root AGENTS.md template uses `resolveTerminology()` (RFC-0639) to replace domain-specific terms. "Each app is a workspace..." becomes "Each composition is a workspace..." in a video project. The template structure remains the same — only the terminology changes.

2. **Nested AGENTS.md templates**: When `workspaceTypes[]` is declared in the profile, each workspace type's `agentsMdTemplate` field points to a template file. `forge.agents.generate` reads this template and substitutes terminology placeholders. When `agentsMdTemplate` is absent, the existing hardcoded templates are used as fallback.

3. **Register-aware prose**: The root AGENTS.md template adapts its prose to the profile's `register` field. `register: creative` produces prose oriented towards creative workflows ("compositions", "renders", "scenes"). `register: business` (the default) produces the existing business-oriented prose.

4. **Template placeholder syntax**: Templates use `{{terminology.key}}` placeholders (e.g. `{{terminology.artifact}}`) that are resolved at generation time. This is simpler than the `ref()` syntax used in skill bodies — AGENTS.md templates are not skills and do not need the full binding resolution chain.

## Architectural fit

- **RFC-0391 (forge.yaml)**: `forge.agents.generate` reads forge.yaml to determine the project structure. This RFC extends it to also read the profile's terminology and workspace-type templates.
- **RFC-0611 (Nested AGENTS.md)**: This RFC extends the nested AGENTS.md generation from RFC-0611 with profile-driven templates.
- **RFC-0638 (Profile schema extensions)**: This RFC consumes the `terminology`, `workspaceTypes`, and `register` fields from the profile.
- **RFC-0639 (Semantic bindings)**: `resolveTerminology()` from RFC-0639 is used for terminology resolution in templates.
- **RFC-0640 (Domain-aware bootstrapping)**: `forge.agents.generate` already uses `workspaceTypes` for detection (RFC-0640). This RFC extends the template generation to use the same profile fields.

## Design

### CLI surface

```sh
# Generate AGENTS.md with domain-aware terminology
forge agents.generate

# Force regeneration of all AGENTS.md files
forge agents.generate --force
```

### TypeScript contracts

```ts
// Template placeholder substitution
interface TemplateContext {
  terminology: Record<string, string>;  // resolved terminology
  register: "business" | "creative";
  domain: string | null;
  workspaceType?: string;  // for nested templates
}

function substituteTemplate(
  template: string,
  context: TemplateContext,
): string {
  return template.replace(
    /\{\{terminature\.(\w+)\}\}/g,
    (_, key) => context.terminology[key] ?? key,
  );
}

// Root AGENTS.md template selection
function selectRootTemplate(
  register: "business" | "creative",
): string {
  if (register === "creative") {
    return CREATIVE_ROOT_TEMPLATE;
  }
  return BUSINESS_ROOT_TEMPLATE;  // existing template
}

// Nested AGENTS.md template selection
function selectNestedTemplate(
  workspaceType: ProfileWorkspaceType | undefined,
  fallback: string,
): string {
  if (workspaceType?.agentsMdTemplate) {
    return readFile(workspaceType.agentsMdTemplate);
  }
  return fallback;  // existing hardcoded template
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/forge/os/core/handlers/agents-generate.ts` | Extended: terminology substitution, template selection |
| `packages/forge/os/core/templates/root-agents-creative.md` | New: creative register root template |
| `packages/forge/os/core/templates/root-agents-business.md` | Existing business template extracted to file |
| `packages/forge/src/tests/agents-generate-domain.test.ts` | New test: terminology substitution, register selection |

### Output format

```json
{
  "command": "forge.agents.generate",
  "status": "ok",
  "generated": [
    { "path": "AGENTS.md", "domain": "video", "register": "creative" },
    { "path": "compositions/my-video/AGENTS.md", "workspaceType": "composition" }
  ]
}
```

### Failure modes

- **Template file not found**: If a workspace type's `agentsMdTemplate` points to a non-existent file, `forge.agents.generate` reports a warning and falls back to the hardcoded template.
- **Unknown terminology placeholder**: If a template contains `{{terminology.unknown}}` and the key is not in the resolved terminology, the placeholder is replaced with the key name itself (e.g. `unknown`). No error.
- **No profile loaded**: If no profile is loaded (e.g. forge.yaml has no matching profile), the command falls back to the existing business-register hardcoded templates.

## Rollout

- **Backward compatibility**: When no profile is loaded or the profile has no domain fields, the command produces identical output to the current implementation. No regression for existing projects.
- **New profiles**: New profiles (e.g. `editframe-html` in RFC-0641) provide terminology and workspace-type templates. `forge.agents.generate` uses them automatically.
- **Existing profiles upgrade**: Existing profiles MAY add `terminology` maps. Once added, `forge.agents.generate` uses the terminology in generated AGENTS.md files.
- **Template extraction**: The existing hardcoded business template is extracted to a template file (`root-agents-business.md`). This is a refactoring — the generated output is identical.

## Alternatives considered

- **Per-domain AGENTS.md command (e.g. `forge.agents.generate.video`)**: Rejected. The profile-driven approach keeps forge domain-agnostic. One command, profile-driven output.
- **Manual AGENTS.md editing for non-software domains**: Rejected. Operators should not need to manually edit generated files. The generation should be domain-aware from the start.
- **Jinja-style template engine**: Rejected. The `{{terminology.key}}` placeholder syntax is sufficient for terminology substitution. A full template engine would add complexity without value.

## Risks

- **Template drift**: The extracted business template might diverge from the hardcoded version if one is updated and the other is not. Mitigation: the hardcoded version is removed — the template file is the single source of truth.
- **Placeholder syntax confusion**: `{{terminology.key}}` is different from `ref(bindings.terminology.key)` used in skills. Mitigation: AGENTS.md templates are not skills — they use a simpler syntax. The two are documented separately.
- **Creative template maintenance**: The creative root template is new and must be maintained alongside the business template. Mitigation: the templates share structure — only prose differs. A shared template with conditional sections could be used if divergence becomes problematic.

## Acceptance criteria

- [ ] `forge.agents.generate` uses `resolveTerminology()` for placeholder substitution in templates
- [ ] Root AGENTS.md template uses `{{terminology.key}}` placeholders
- [ ] Creative register root template (`root-agents-creative.md`) created
- [ ] Business register root template extracted to file (`root-agents-business.md`)
- [ ] Nested AGENTS.md templates use `workspaceTypes[].agentsMdTemplate` when present
- [ ] Fallback to existing hardcoded templates when profile has no domain fields
- [ ] `--json` output includes `domain`, `register`, and `workspaceType` per generated file
- [ ] Unit tests: terminology substitution, register selection, nested template, fallback
- [ ] Existing software-domain projects generate identical AGENTS.md (no regression)
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
