---
id: RFC-0720
title: "Document generator ownership map requirement in AGENTS.md — ownership.sync.validate already exists"
status: draft
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0087
  - RFC-0612
satisfies: []
versionBump: none
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
  - "@warpgogol/site-kernel-handoff"
successSignals:
  - "packages/os/site-kernel-checks/AGENTS.md includes a note about GENERATOR_OWNERSHIP_MAP requirement"
  - "Agents adding generated files to public/ know to add ownership map entries"
nonGoals:
  - "Does not add a new command — ownership.sync.validate (RFC-0612) already detects drift"
  - "Does not change the existing ownership.sync.validate behavior"
---

# RFC-0720: Document generator ownership map requirement in AGENTS.md — ownership.sync.validate already exists

## Context

During RFC-0707/RFC-0715 implementation, four new generated files were added to `public/` and `public/.well-known/` without registering them in `GENERATOR_OWNERSHIP_MAP` (in `packages/os/site-kernel-checks/src/generator-ownership.ts`):

- `bordbuch/events.ndjson`
- `status.generated.yaml`
- `nachweis-pubkey.json`
- `nachweise/manifest.json`

This caused `ownership.sync.validate` (OWN-01) to fail, requiring a follow-up fix commit.

**Investigation finding:** `ownership.sync.validate` (RFC-0612) already exists and already detects this exact problem. It runs in both `build.prepare` and `sites-check-author` pipelines. It emits OWN-01 (file on disk not covered by any ownership entry) and OWN-02 (phantom registration). The check is fatal.

The root cause was not a missing check — it was a missing **documentation** reminder. Agents did not know about `GENERATOR_OWNERSHIP_MAP` and did not add entries when creating new generated files.

## Problem

The `GENERATOR_OWNERSHIP_MAP` in `packages/os/site-kernel-checks/src/generator-ownership.ts` is the single registry that maps every generated file to its owning command (RFC-0087). `ownership.sync.validate` (RFC-0612) enforces this registry at build time — any file in `public/` not covered by an entry triggers OWN-01 (fatal).

However, there is no documentation in `packages/os/site-kernel-checks/AGENTS.md` or `packages/os/site-kernel-handoff/AGENTS.md` that reminds agents to add entries when creating new generated files. Agents working in `site-kernel-handoff` (which owns bordbuch, nachweis, and release generators) are especially vulnerable because `site-kernel-handoff/AGENTS.md` does not mention `GENERATOR_OWNERSHIP_MAP` at all.

The existing `packages/os/site-kernel-checks/AGENTS.md` line 118 mentions `GENERATOR_OWNERSHIP_MAP` paths and `{system}` placeholder in the context of `generated.files.validate`, but does not explicitly state the agent-facing requirement to register new generated paths.

## Decision

Add a documentation note to `packages/os/site-kernel-checks/AGENTS.md` reminding agents that any new generated file in `public/` or `public/.well-known/` must be registered in `GENERATOR_OWNERSHIP_MAP`. Add a cross-reference note to `packages/os/site-kernel-handoff/AGENTS.md` pointing to the ownership map requirement.

## Architectural fit

- **RFC-0087 (single ownership):** This RFC reinforces the existing invariant that every generated file has exactly one owner in `GENERATOR_OWNERSHIP_MAP`. It does not change the invariant — it documents it for agent awareness.
- **RFC-0612 (ownership.sync.validate):** This RFC does not modify the validator. It adds documentation that prevents agents from triggering OWN-01 in the first place.
- **Site OS operator model:** The note lives in package-level `AGENTS.md` files, which are the canonical agent instruction layer. `site-kernel-checks/AGENTS.md` is the primary location because `GENERATOR_OWNERSHIP_MAP` lives in that package. `site-kernel-handoff/AGENTS.md` gets a cross-reference because handoff owns generators that write to `public/`.
- **No new commands, no pipeline changes, no code changes.** This is a documentation-only policy RFC.

## Design

### Addition to `packages/os/site-kernel-checks/AGENTS.md`

Add a new section after the existing `GENERATOR_OWNERSHIP_MAP` mention (line 118):

````markdown
## Generator ownership map (RFC-0087, RFC-0612)

When adding a new kernel command that generates files under `public/` or `public/.well-known/`,
you MUST register each generated path in `GENERATOR_OWNERSHIP_MAP` in
`src/generator-ownership.ts`. Failure to do so causes `ownership.sync.validate`
(OWN-01) to fail in `build.prepare` and `sites-check-author`.

Entries use this shape:

```ts
{
  path: "public/path/to/file.generated.yaml",
  command: "your.command.name",
  module: "packages/os/.../src/your-module.ts",
  markerPolicy: "registry-only",  // required for public/** files
}
```

Use `conditional: true` for files that are only generated under certain conditions
(e.g. CMS-git adapter, preliminary build-identity.json). Conditional entries are
exempt from OWN-02 (phantom registration) but still contribute to coverage checks.
```
````

### Cross-reference in `packages/os/site-kernel-handoff/AGENTS.md`

Add a brief note in the rules section:

```markdown
- **When adding a new generated file to `public/` or `public/.well-known/`,** register it in `GENERATOR_OWNERSHIP_MAP` in `packages/os/site-kernel-checks/src/generator-ownership.ts`. See `packages/os/site-kernel-checks/AGENTS.md` § Generator ownership map for details.
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/AGENTS.md` | Add new section documenting the ownership map requirement |
| `packages/os/site-kernel-handoff/AGENTS.md` | Add cross-reference note |

## Rollout

- **Default behavior:** The documentation note is effective immediately upon RFC implementation. No grace period, no opt-in.
- **Existing apps:** No changes needed — `ownership.sync.validate` already enforces the requirement. The documentation is preventive, not corrective.
- **New apps:** Agents onboarding new sites will read the AGENTS.md note before creating generators, preventing OWN-01 from the start.
- **Pipeline integration:** No pipeline changes. `ownership.sync.validate` remains the automated safety net.

## Alternatives considered

- **Pre-commit hook warning** (rejected for now): A pre-commit hook could scan for new files in `public/` and warn if they lack ownership entries. This would catch the problem earlier than `ownership.sync.validate`, but adds complexity and maintenance burden. The existing fatal check in `build.prepare` is sufficient as a safety net. Deferred to the Evolution section.
- **ADR instead of RFC** (rejected): An ADR would be lighter weight, but the RFC process provides acceptance criteria and traceability. The operator chose RFC to ensure the policy is formally accepted and implemented.
- **Root AGENTS.md note** (rejected): The root `AGENTS.md` already mentions `GENERATOR_OWNERSHIP_MAP` in the context of `CMD-MAN-03` (command manifest validation). Adding a separate note about agent registration requirements would duplicate the package-level note. The package-level AGENTS.md is the correct location for package-specific agent rules.

## Risks

- **Agent reading behavior:** Documentation-only measures depend on agents reading `AGENTS.md` at the right time. Agents typically read `AGENTS.md` at session start or when entering a package — they may not re-read it mid-implementation when adding a new generated file. The `ownership.sync.validate` fatal check remains the reliable safety net.
- **Note staleness:** If `GENERATOR_OWNERSHIP_MAP` entry shape changes (e.g. new required fields), the AGENTS.md example may become stale. This risk is low — the `OwnershipEntry` interface has been stable since RFC-0606.
- **False sense of security:** Agents might assume that reading the note is sufficient and skip running `ownership.sync.validate` locally. The note explicitly states that the check is fatal, mitigating this risk.

## Acceptance criteria

- [ ] `packages/os/site-kernel-checks/AGENTS.md` includes a section about `GENERATOR_OWNERSHIP_MAP` requirement
- [ ] `packages/os/site-kernel-handoff/AGENTS.md` includes a cross-reference note pointing to the ownership map requirement
- [ ] The AGENTS.md example includes `markerPolicy: "registry-only"` for `public/**` files
- [ ] The AGENTS.md example mentions `conditional: true` semantics
- [ ] `rfc.validate` passes on this RFC with zero errors

## Implementation notes for agents

- Agents MAY implement this RFC only when it has status: `accepted` (or `implemented`).
- The implementation is documentation-only: edit two `AGENTS.md` files, no code changes.
- Agents MUST NOT add new commands or pipeline steps — `ownership.sync.validate` (RFC-0612) already enforces the requirement.
- If implementation reveals that the `OwnershipEntry` interface has changed since this RFC was written, update the example in the AGENTS.md note to match the current interface.
- Agents MUST NOT weaken or remove the `ownership.sync.validate` check — it is the automated safety net for this policy.

## Evolution

If agents continue to miss the ownership map requirement despite documentation, a pre-commit hook warning (similar to the command manifest staleness check) could be added. But the existing `ownership.sync.validate` fatal check is sufficient as a safety net.
