---
rfcId: RFC-0643
auditId: AUDIT-RFC-0643-01
date: 2026-08-02
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0643

## Verdict: Needs revision

The RFC has a clear architectural direction but contains a factual file-path error, a typo in the TypeScript contract regex, an undocumented breaking change to the `--json` output format, and an unresolved tension between static template files and the dynamically generated behavioral layer. These must be resolved before implementation.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **File path error (line 83, 176):** The RFC states templates are defined in `packages/forge/os/core/handlers/agents-generate.ts`. The actual handler is at `packages/forge/src/onboarding/agents-generate.ts` (confirmed via `core.module.ts:43` which imports `runAgentsGenerate` from `../../src/onboarding/agents-generate.ts`). The `os/core/handlers/` directory does not contain an `agents-generate.ts` file. The file system responsibilities table must be corrected.

2. **TypeScript contract typo (line 145):** The `substituteTemplate` regex is `/\{\{terminature\.(\w+)\}\}/g` — "terminature" instead of "terminology". This would silently fail to match any placeholder. Should be `/\{\{terminology\.(\w+)\}\}/g`.

## Axis B — DNA alignment

No issues. `satisfies: []` is acceptable for a `command` kind RFC. No new DNA invariants are established.

## Axis C — Ecosystem fit

1. **Breaking change to `--json` output format:** The RFC's output format example (line 183-192) shows `generated` as an array of objects (`{ path, domain, register, workspaceType }`). The current `AgentsGenerateResult` interface (`agents-generate.ts:292-300`) uses `generated: string[]`. Changing this to an object array breaks existing consumers: `forge.doctor` (staleness check via dryRun) and `forge.upgrade` (nested generation). The RFC must either keep `generated: string[]` and add a separate `details` field, or explicitly update all consumers and acknowledge the breaking change.

2. **`status` field inconsistency:** The RFC output example uses `"status": "ok"` but the current code uses `"status": "pass"`. The example should match the existing contract.

3. **Command overlap with RFC-0640:** RFC-0640 also lists `forge.agents.generate` in `commands.changed` (for workspace detection). Both RFCs modify the same command handler. Neither RFC specifies implementation ordering or how the changes compose. Since RFC-0640 changes detection and RFC-0643 changes template generation, they can compose — but the RFCs should acknowledge each other's changes to the same file.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims. The fallback to hardcoded templates is default behavior, not a compatibility layer.

## Axis E — Agent-facing policy

No issues. Standard implementation notes, no self-authorizing language, no storage policy concerns.

## Axis F — Pragmatism

1. **Undocumented `--force` flag:** The CLI surface (line 126) shows `forge agents.generate --force` but the flag is never explained. The current command does not support `--force`. Does it bypass the edit guard for hand-written root AGENTS.md? Does it regenerate hand-written nested files? The failure modes section doesn't mention it. Either remove it or specify its behavior.

2. **Static template vs. dynamic content gap:** The RFC proposes extracting the root AGENTS.md to template files (`root-agents-business.md`, `root-agents-creative.md`). However, the current root AGENTS.md is built dynamically in `runAgentsGenerate()` — it includes the skills table (from `FORGE_SKILLS` registry), the capabilities section (from resolved bindings), and the behavioral layer (300+ lines generated from skill triggers, register, and fixed policy text). A static template file cannot contain this dynamic content. The RFC must specify how static template prose and dynamically generated sections coexist — e.g., template covers only the static header/conventions prose, dynamic sections are injected at runtime.

## Axis G — Blind spots

1. **Behavioral layer terminology gap:** The RFC says "Root AGENTS.md template uses `{{terminology.key}}` placeholders" but doesn't address whether the behavioral layer (RFC-0548) also gets terminology substitution. The behavioral layer contains fixed policy text with software-domain language ("build", "typecheck", "app", "package"). In a video project, should the behavioral layer say "render" instead of "build"? If yes, `{{terminology.key}}` placeholders must be added to the behavioral layer content. If no, the behavioral layer remains software-domain-specific even in creative/video profiles. The RFC must clarify its scope: does terminology substitution apply only to the static template parts, or to the entire generated AGENTS.md?

2. **Substitution ordering:** The RFC doesn't specify whether `substituteTemplate` runs before or after the behavioral layer is appended. If after, it could accidentally replace `{{terminology.*}}` patterns in the behavioral layer's fixed policy text. If before, the behavioral layer won't receive terminology substitution. The implementation must define the substitution boundary.

3. **Template path resolution:** `workspaceTypes[].agentsMdTemplate` points to a file path (e.g. `templates/composition-agents.md`). The RFC doesn't specify whether this path is relative to the profile YAML directory, the forge package root, or the consuming project root. Path traversal (e.g. `../../etc/passwd`) is not addressed. The failure mode "Template file not found" is documented, but path resolution semantics are not.

## Questions for the author

1. How should the root AGENTS.md template extraction handle the dynamically generated sections (skills table, capabilities, behavioral layer)? Should the template file contain only static prose with injection points for dynamic sections, or should the entire content remain inline with terminology substitution applied post-generation?

2. Is the `generated` field in the `--json` output changing from `string[]` to an object array? If so, how are existing consumers (`forge.doctor`, `forge.upgrade`) updated? If not, where do `domain`, `register`, and `workspaceType` per file appear?

3. Does terminology substitution apply to the behavioral layer's fixed policy text, or only to the static template parts? If the behavioral layer is excluded, it remains software-domain-specific in non-software projects — is that acceptable?
