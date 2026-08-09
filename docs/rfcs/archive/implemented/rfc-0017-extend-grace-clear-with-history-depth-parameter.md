---
id: RFC-0017
title: "Extend grace clear with history depth parameter"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-20
updatedAt: 2026-06-04
implementedAt: 2026-04-20
closedAt:
supersedes: []
supersededBy:
amendedBy:
  - RFC-0353
related:
  - RFC-0015
commands:
  proposed: []
  added: []
  changed: ["compass.clear"]
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted: []
successSignals: []
nonGoals: []
---

# RFC-0017: Extend grace clear with history depth parameter

## Context

This RFC introduces a new parameter `--history DEPTH` to the existing `grace.clear` command. The `grace.clear` command is used to strip AI-generated semantic markup from files. Currently, it operates globally or on specific paths without awareness of recent changes. When AI generates new code, it often produces poor or incomplete semantic markup initially, which needs to be cleared before a proper regenerative pass.

## Problem

When creating new files or running complex workflows, AI often generates low-quality, hallucinated, or incorrect GRACE markup initially. Cleaning this up requires running `grace.clear` globally or passing many specific file paths, which is inefficient. Running it globally destroys valid semantic markup across the codebase. We need a way to target only the files that were recently introduced or newly added by the AI in the latest git commits without affecting stable markup elsewhere.

## Decision

The `grace.clear` command gains a `--history <DEPTH>` parameter that restricts the clearing operation only to those files that have been newly created (or exist as untracked) in the last `<DEPTH>` git commits.

## Architectural fit

<!-- How does this decision relate to existing building blocks?
     Explain alignment with the following — skip any that are not relevant:
     - Architecture DNA (which invariants does this enforce or protect?)
     - Anti-Patterns (which patterns does this prevent?)
     - Page Contracts (which page-level rules are formalized?)
     - Component Contracts (which component-level rules are formalized?)
     - Site OS operator model (command scope, module placement, pipeline integration)
     - Scaling Playbook (does this apply uniformly across growth stages 1–4?) -->

## Design

### CLI surface

```sh
# Clear GRACE markup from newly created files in the last 3 commits
pnpm exec werkstatt run grace.clear --history 3

# Combine with specific app scoping if applicable
pnpm exec werkstatt run grace.clear --app main --history 1
```

- `--history <DEPTH>`: Numeric value indicating the number of most recent git commits to analyze. The command will find all newly added files in those commits and apply the clear operation only to them.

### TypeScript contracts

<!-- Specify the key types and interfaces needed.
     Do not write full implementation — write the minimum contract
     that a developer or agent needs to understand the shape.

```ts
interface ExampleInput {
  // ...
}

interface ExampleResult {
  // ...
}
```
-->

### File system responsibilities

<!-- Which files/directories does this touch or read?
     Which files does this create, validate, or refuse to touch?

| Path | Role |
|---|---|
| `src/pages/[lang]/**/*.astro` | Scanned for violations |
| `docs/rfcs/index.json` | Updated by rfc.index.generate |
-->

### Output format

<!-- Describe the --json output shape so agents can parse it reliably.

```json
{
  "command": "domain.command",
  "status": "fail",
  "violations": [
    { "file": "src/pages/de/legal.astro", "rule": "missing-schema", "message": "..." }
  ]
}
```
-->

### Failure modes

<!-- What does the command do when it finds violations?
     Does it exit non-zero? Does it log warnings only?
     What is the behavior difference between --json and pretty output?
     Are there any rules where the command should warn rather than fail? -->

## Rollout

<!-- Describe the adoption path — not a short-term wave, but a durable rollout strategy:

- Default behavior on first introduction (fail-hard vs. warn vs. opt-in)
- How existing apps adopt without a flag day (e.g., --strict mode, grace period)
- How new apps automatically comply from day one
- Deprecation path if this supersedes an existing command
- How this integrates into the `build.check` or other standard pipelines
-->

## Alternatives considered

<!-- What else was considered and why was it rejected?
     Be brief but honest — this section prevents re-litigating old decisions. -->

## Risks

<!-- Technical, organizational, or agent-facing risks.
     Include: performance impact, false positive rate, maintenance burden,
     risk of agents misinterpreting this RFC. -->

## Acceptance criteria

- [x] TypeScript types and interfaces defined in the relevant package (evidence: implemented historically)
- [x] CLI command registered with correct name and scope (evidence: implemented historically)
- [x] `--json` output format documented and stable (evidence: implemented historically)
- [x] Integrated into appropriate pipeline (`build.check` or standalone) (evidence: implemented historically)
- [x] Existing apps pass without changes (or migration path is documented) (evidence: implemented historically)
- [x] `AGENTS.md` updated where agent behavior rules changed (evidence: AGENTS.md:1, agent guide updated)
- [x] Relevant Architecture DNA or spec docs link to this RFC (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

<!-- Rules that govern how AI agents interact with this RFC.
     Be explicit. Agents read this section for behavioral policy.

- Agents MAY implement code changes ONLY when this RFC has status: accepted.
- Agents MUST NOT change status fields in any RFC.
- Agents MUST check `rfc.list --status accepted` before making structural changes
  to packages or app tools that relate to this RFC's scope.
- When implementing, agents MUST reference this RFC ID in commit messages or PR descriptions.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC
  without a new RFC that supersedes it.
-->
