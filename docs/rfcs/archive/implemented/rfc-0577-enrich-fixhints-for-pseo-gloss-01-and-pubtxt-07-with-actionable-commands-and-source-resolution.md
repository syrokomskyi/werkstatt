---
id: RFC-0577
title: "Enrich fixHints for PSEO-GLOSS-01 and PUBTXT-07 with actionable commands and source resolution"
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
createdAt: 2026-07-28
updatedAt: 2026-07-29
implementedAt: 2026-07-29
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0203
  - RFC-0576
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-11
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
    - surface.translation.glossary.validate
    - public.surface.lint
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "PSEO-GLOSS-01 fixHint contains the exact restamping command"
  - "PUBTXT-07 fixHint resolves generated public/ file to its src/content/prose source"
nonGoals:
  - "Does not change the validation logic of either rule"
  - "Does not register new ruleIds — both PSEO-GLOSS-01 and PUBTXT-07 are already registered"
  - "Does not change the set of files scanned by either validator"
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

# RFC-0577: Enrich fixHints for PSEO-GLOSS-01 and PUBTXT-07 with actionable commands and source resolution

## Context

RFC-0203 established the canonical `Diagnostic` model with a `fixHint` field — "Imperative remediation a human or agent can execute." Two validators already emit canonical Diagnostics with `fixHint` fields, but the hints are not actionable enough for agents to resolve without reading validator source code or searching the command tables.

**PSEO-GLOSS-01** (`surface-translation.ts:392-408`): The fixHint for a stale glossary says `"Review, approve, and restamp the glossary against the current module context."` — this describes the _what_ but not the _how_. An agent must independently discover that the restamping command is `surface.translation.glossary.generate --module <module> --target <lang>` by searching command tables.

**PUBTXT-07** (`public-surface/aggregate.ts:281-287`): The fixHint says `"Use a canonical generated route/public file or add the target to the owning route/declaration set."` — but the error is reported against a generated file in `public/`, not the source file in `src/content/prose/`. An agent must independently discover that the source file is `src/content/prose/{lang}/{slug}.md` and that fixing the source and re-running `build.prepare` is the correct resolution path.

## Problem

Both PSEO-GLOSS-01 and PUBTXT-07 are recurring errors during mission completion. In a recent session (warpgogol-com-m000016), each required multiple trial-and-error iterations:

1. PSEO-GLOSS-01: The agent read the fixHint ("Review, approve, and restamp"), then spent several minutes searching for the restamping command in command tables before finding `surface.translation.glossary.generate`.
2. PUBTXT-07: The error pointed to `public/uk/porady/kategorie/kosten.md` (a generated file). The agent fixed the source prose file, re-ran `build.prepare`, but the generated file was not updated — requiring a manual `sed` edit of the generated file. The fixHint gave no indication of the source file path or the regeneration command.

The fixHints violate the RFC-0203 principle: "Imperative remediation a human or agent can execute." An agent cannot execute "review, approve, and restamp" without knowing the command. An agent cannot execute "use a canonical generated route" without knowing the source file path.

## Decision

The `fixHint` for PSEO-GLOSS-01 includes the exact restamping command (`pnpm exec werkstatt run surface.translation.glossary.generate --module <module> --target <lang>`). The `fixHint` for PUBTXT-07 resolves the generated `public/` file to its source `src/content/prose/{lang}/{slug}.md` path and includes the regeneration command (`pnpm exec werkstatt pipeline build.prepare --site <id>`).

## Architectural fit

- **RFC-0203 (canonical Diagnostic model):** This RFC enriches the `fixHint` field that RFC-0203 introduced — making it actionable per its intended contract.
- **RFC-0576 (companion RFC):** RFC-0576 migrates three validators to canonical Diagnostics; this RFC enriches two already-canonical validators. Together they cover the five validators that caused the most agent friction in mission warpgogol-com-m000016.
- **Site OS operator model:** No new commands. Two existing commands have their `fixHint` strings enriched.
- **Scaling Playbook:** Applies uniformly — all sites use the same validators and the same fixHints.

## Design

### CLI surface

No CLI surface changes. Both commands are invoked identically.

### TypeScript contracts

#### PSEO-GLOSS-01 fixHint enrichment

In `packages/os/site-kernel-checks/src/surface-translation.ts`:

Current (stale hash case, line 404-408):

```ts
fixHint: "Review, approve, and restamp the glossary against the current module context.",
```

After:

```ts
fixHint: `Run: pnpm exec werkstatt run surface.translation.glossary.generate --module ${module.id} --target ${target}. Then re-run validation.`,
```

Current (missing glossary case, line 392-396):

```ts
fixHint: "Create and approve the module target-language glossary.",
```

After:

```ts
fixHint: `Run: pnpm exec werkstatt run surface.translation.glossary.generate --module ${module.id} --target ${target} to create the glossary, then approve it.`,
```

#### PUBTXT-07 source resolution

In `packages/os/site-kernel-checks/src/public-surface/aggregate.ts`:

The validator already knows the `file` (the generated `public/` file path). The enrichment resolves the corresponding source prose file by reversing the `public/{lang}/...` → `src/content/prose/{lang}/...` mapping.

Current (line 285-286):

```ts
fixHint: "Use a canonical generated route/public file or add the target to the owning route/declaration set.",
```

After:

```ts
// Resolve generated public/ path to source prose path
const sourcePath = resolveProseSource(file, appDir);
fixHint: sourcePath
  ? `Fix the source file ${sourcePath}, then re-run: pnpm exec werkstatt pipeline build.prepare --site <id>.`
  : "Use a canonical generated route/public file or add the target to the owning route/declaration set.",
```

The `resolveProseSource` helper maps `public/{lang}/{path}.md` → `src/content/prose/{lang}/{path}.md` and checks existence. If no source file is found, the generic fixHint is used as fallback.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/surface-translation.ts` | Enrich PSEO-GLOSS-01 fixHint with restamping command |
| `packages/os/site-kernel-checks/src/public-surface/aggregate.ts` | Enrich PUBTXT-07 fixHint with source file resolution |

### Output format

Before (PSEO-GLOSS-01):

```json
{
  "ruleId": "PSEO-GLOSS-01",
  "severity": "error",
  "file": "src/content/enriched/_translation-glossaries/offer-uk.json",
  "message": "Glossary offer/uk is missing approval or has a stale moduleContextHash.",
  "fixHint": "Review, approve, and restamp the glossary against the current module context."
}
```

After:

```json
{
  "ruleId": "PSEO-GLOSS-01",
  "severity": "error",
  "file": "src/content/enriched/_translation-glossaries/offer-uk.json",
  "message": "Glossary offer/uk is missing approval or has a stale moduleContextHash.",
  "fixHint": "Run: pnpm exec werkstatt run surface.translation.glossary.generate --module offer --target uk. Then re-run validation."
}
```

Before (PUBTXT-07):

```json
{
  "severity": "error",
  "file": "public/uk/porady/kategorie/kosten.md",
  "message": "PUBTXT-07 same-site generated link target is not locally known: /uk/porady/skilky-koshtuye-sayt/",
  "fixHint": "Use a canonical generated route/public file or add the target to the owning route/declaration set."
}
```

After:

```json
{
  "severity": "error",
  "file": "public/uk/porady/kategorie/kosten.md",
  "message": "PUBTXT-07 same-site generated link target is not locally known: /uk/porady/skilky-koshtuye-sayt/",
  "fixHint": "Fix the source file src/content/prose/uk/ratgeber-category-kosten.md, then re-run: pnpm exec werkstatt pipeline build.prepare --site <id>."
}
```

### Failure modes

- No behavior change — both validators still exit non-zero on errors.
- The `resolveProseSource` helper gracefully falls back to the generic fixHint when no source file is found.
- The restamping command in PSEO-GLOSS-01 uses the module ID and target language from the diagnostic's `data` field — no hardcoded values.

## Rollout

- **No flag day.** Both validators already run in `build.check` pipelines. Only the `fixHint` string content changes.
- **No app changes needed.** Apps do not consume fixHints programmatically — agents and humans do.
- **Agent-facing improvement.** Agents encountering PSEO-GLOSS-01 can copy-paste the restamping command from the fixHint. Agents encountering PUBTXT-07 get the source file path and regeneration command directly.
- **fix-patterns.md catalog.** The `wg-mission-complete` skill's `fix-patterns.md` can add EC-06 (PSEO-GLOSS-01) and EC-07 (PUBTXT-07) entries that reference the fixHint content, enabling auto-resolution at confirmations >= 3.

## Alternatives considered

1. **Add a `fixCommand` field to `Diagnostic` instead of enriching `fixHint`.** Rejected: `fixHint` already exists and is defined as "imperative remediation a human or agent can execute." Adding a new field would require changing the `Diagnostic` interface (RFC-0203 contract) and all consumers. The fixHint string is sufficient — agents can parse it.

2. **Generate fixHints from a command registry instead of hardcoding them.** Rejected: the command name and flags are already known at the call site (the validator has the module ID and target language). Generating from a registry adds indirection without benefit. The fixHint is a string template, not a structured command invocation.

3. **For PUBTXT-07, always point to `build.prepare` without source resolution.** Rejected: without knowing _which_ source file to fix, the agent must search all prose files for the broken link. Source resolution narrows the search to one file.

## Risks

- **fixHint length.** The enriched fixHints are longer (include full commands). This is intentional — the console output wraps `fix:` on its own line (RFC-0203 `formatDiagnosticItem`), so length does not clutter the summary.
- **Source resolution accuracy.** `resolveProseSource` maps `public/{lang}/{path}.md` → `src/content/prose/{lang}/{path}.md`. If the generated file does not follow this convention (e.g., non-prose generated files), the fallback fixHint is used. No false-positive source paths.
- **Command stability.** The fixHint embeds `pnpm exec werkstatt run surface.translation.glossary.generate` — if the command is renamed, the fixHint becomes stale. This is the same risk as any documentation referencing command names. The fix-patterns.md catalog has the same risk.
- **Agent misinterpretation.** An agent might run the restamping command without reviewing the glossary first. The fixHint says "Run: ... Then re-run validation" — it does not say "review and approve." The approval step is a human action, not an agent action. This is acceptable: the glossary generate command restamps the hash; approval is a separate human step.

## Acceptance criteria

- [x] PSEO-GLOSS-01 fixHint for stale hash includes `surface.translation.glossary.generate --module <module> --target <lang>` command (evidence: commit 5002246, surface-translation.ts:408)
- [x] PSEO-GLOSS-01 fixHint for missing glossary includes the generate command (evidence: commit 5002246, surface-translation.ts:396)
- [x] PUBTXT-07 fixHint resolves `public/{lang}/{path}.md` to `src/content/prose/{lang}/{path}.md` when the source file exists (evidence: commit 5002246, aggregate.ts:50-58 resolveProseSource helper)
- [x] PUBTXT-07 fixHint includes `build.prepare` regeneration command when source is found (evidence: commit 5002246, aggregate.ts:297-298)
- [x] PUBTXT-07 falls back to generic fixHint when no source file is found (evidence: commit 5002246, aggregate.ts:299)
- [x] `rfc.validate` passes on this file (evidence: no RFC-0577 errors in rfc.validate output)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The `resolveProseSource` helper for PUBTXT-07 MUST check file existence before including the source path in the fixHint — a non-existent source path would mislead the agent.
- The PSEO-GLOSS-01 fixHint MUST use the actual `module.id` and `target` from the diagnostic context, not hardcoded values.
- The fixHint string template MAY be refined during implementation as long as it contains the command name and arguments an agent can copy-paste.
