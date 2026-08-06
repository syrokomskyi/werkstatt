---
id: RFC-0711
title: "Add living feature specs with delta-merge from archived RFCs"
status: accepted
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-06
updatedAt: 2026-08-06
enhancedAt: 2026-08-06
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0709
  - RFC-0710
  - RFC-0712
satisfies:
  - DNA-55
versionBump: minor
commands:
  proposed:
    - spec.live.merge
    - spec.live.list
    - spec.live.show
    - spec.live.validate
  added:
    - spec.live.merge
    - spec.live.list
    - spec.live.show
    - spec.live.validate
  changed:
    - docs.archive
    - rfc.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/forge
successSignals:
  - "docs/specs/live/ contains living specs for feature-level modules"
  - "Agents read living specs instead of archived RFCs to understand current state"
  - "spec.live.merge runs automatically during docs.archive for implemented RFCs"
  - "Living specs stay current without manual maintenance"
nonGoals:
  - "Does not replace DNA invariants — DNA covers architecture, living specs cover feature-level design"
  - "Does not replace RFCs — RFCs remain the change proposal mechanism; living specs are the merged result"
  - "Does not apply to ADRs — ADRs are local decisions, not feature-level specifications"
  - "Does not auto-generate living specs for past RFCs — initial population is manual or on-demand"
  - "Does not introduce a new file format — living specs are markdown with YAML frontmatter"
acceptance:
  - probe: run
    command: "site-kernel run spec.live.list --json"
    expect:
      exitCode: 0
  - probe: run
    command: "site-kernel run spec.live.validate --json"
    expect:
      exitCode: 0
  - probe: run
    command: "site-kernel run spec.live.show --domain forge --json"
    expect:
      exitCode: 1
  - probe: run
    command: "site-kernel run rfc.validate --id RFC-0711 --json"
    expect:
      exitCode: 0
  - probe: file-contains
    path: "packages/forge/os/rfc/types.ts"
    pattern: "liveSpec"
  - probe: file-contains
    path: "packages/forge/os/core/core.module.ts"
    pattern: "spec.live.merge"
  - probe: file-contains
    path: "packages/forge/os/spec/spec.module.ts"
    pattern: "spec.live.merge"
---

# RFC-0711: Add living feature specs with delta-merge from archived RFCs

## Context

Our RFCs describe changes, then get archived after implementation. An agent working on the same feature 6 months later reads archived RFCs to understand current state — but the "current truth" is scattered across multiple RFCs, amends, and supersessions. There is no single living document per feature/module that reflects the **current** specification.

DNA invariants (`docs/architecture-dna.md`) serve this purpose for architecture — they are the single source of truth for stable invariants. But there is no equivalent for feature-level design: the current specification of a module, feature, or subsystem that evolves through multiple RFCs over time.

OpenSpec solves this with **delta-specifications**: each change writes `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` delta-files. On archive, deltas merge into `openspec/specs/<domain>/spec.md` — a living spec that always reflects current state.

## Problem

An agent tasked with working on an existing feature must reconstruct the current specification by reading:

1. The original RFC that introduced the feature.
2. All amending RFCs.
3. All superseding RFCs.
4. The current code (which may have drifted from the last RFC).

This is error-prone and time-consuming. The agent may miss an amend or misread a superseded RFC's intent. There is no single document that says "this is what the feature does today."

## Decision

Introduce **living feature specs** at `docs/specs/live/<domain>.md`. A living spec is a markdown document that reflects the current design of a feature-level module. It is updated during RFC archive by merging design deltas (ADDED/MODIFIED/REMOVED sections) from the archived RFC's `## Design` section.

Living specs complement DNA invariants:

- **DNA** = stable architectural invariants (rarely change, cross-cutting).
- **Living specs** = feature-level design (evolves through RFCs, module-scoped).

## Architectural fit

- **Spec vendoring (DNA-55):** `docs/specs/` currently holds vendored external spec packages under `docs/specs/<spec-id>/` with immutability, integrity manifests, and `forge-spec.yaml` projections. Living specs add a new subdirectory `docs/specs/live/` for **internal** feature specs that are mutable and do not have integrity manifests. Living specs are **exempt** from SPEC-01..07 — they are validated by `spec.live.validate` (V-LS-01..05) instead. The `satisfies: [DNA-55]` entry means this RFC is **compatible** with DNA-55: living specs do not conflict with the vendoring contract because they are structurally separated from vendored specs by the `live/` subdirectory prefix.
- **RFC lifecycle:** Living specs are updated **after** the RFC is implemented and archived. The merge happens during `docs.archive` — the terminal artifact command. This means living specs always reflect implemented and archived RFCs, not drafts or works in progress. Only RFCs with `status: implemented` trigger the merge step — `rejected` and `superseded` RFCs are skipped (rejected RFCs represent decisions that were NOT made; superseded RFCs are handled by the supersession logic).
- **DNA registry analogy:** Just as DNA invariants are referenced by `satisfies[]` in RFC frontmatter, living specs are referenced by `liveSpec` in RFC frontmatter — a new optional field declaring which living spec domain this RFC contributes to.
- **Package placement:** The `spec.live.*` command handlers are registered in `forgeSpecModule` in `packages/forge/os/spec/` alongside the existing `spec.validate`, `spec.status`, and `spec.materialize` commands. This keeps all spec-related commands in one module.
- **Compass sync:** This RFC does not require `docs/*.xml` synchronization — living specs are a new artifact type under `docs/specs/`, not a change to repository-wide requirements or shared package contracts.
- **AGENTS.md updates:** Root `AGENTS.md` § Spec vendoring (DNA-55) should be updated to document the `docs/specs/live/` subdirectory and the distinction between vendored specs (immutable, SPEC-01..07) and living specs (mutable, V-LS-01..05).
- **Living specs vs. AGENTS.md:** Living specs describe **feature design** (data model, commands, validation rules, current state). Package-level `AGENTS.md` files describe **agent rules** (import policies, coding patterns, prohibitions). They do not duplicate each other — an agent reads the living spec to understand what a feature does today, and the AGENTS.md to understand how to work in the package correctly.

## Design

### Living spec format

```markdown
---
domain: nachweis
title: "Nachweis Register — Feature Specification"
lastMergedRfc: RFC-0708
updatedAt: 2026-08-06
createdAt: 2026-08-06
history:
  - rfc: RFC-0706
    mergedAt: 2026-08-06
    operation: created
  - rfc: RFC-0707
    mergedAt: 2026-08-06
    operation: modified
  - rfc: RFC-0708
    mergedAt: 2026-08-06
    operation: modified
---

# Living Spec: Nachweis Register

## Overview

<current description of the feature, merged from the latest RFC's Context section>

## Design

### Data model

<current data model, merged from ADDED/MODIFIED/REMOVED sections across RFCs>

### Commands

<current command surface>

### Validation rules

<current validation rules>
```

### Delta extraction from RFCs

When an RFC is archived (status → `implemented` then archived), `spec.live.merge` extracts deltas from the RFC's `## Design` section. The RFC frontmatter gains a new optional field:

```yaml
liveSpec: true
```

The domain is **auto-derived** from the RFC's `packagesImpacted[0]` field — the package name without the `packages/` prefix. For example, if `packagesImpacted: [packages/forge]`, the domain is `forge`. If the RFC impacts multiple packages, the primary package (`packagesImpacted[0]`) determines the domain.

For cases where the domain does not match the package name, an explicit override is supported:

```yaml
liveSpec: nachweis
```

If the field is absent or `false`, no merge occurs. `rfc.validate` is updated to recognize `liveSpec` as an optional frontmatter field (boolean or string).

The merge process:

1. **Read the RFC's `## Design` section.**
2. **Classify content into delta operations:**
   - **ADDED:** New sections, new commands, new validation rules that did not exist in the living spec.
   - **MODIFIED:** Sections that replace existing content in the living spec (matched by heading).
   - **REMOVED:** Sections explicitly marked as removed (rare — usually superseded by a new RFC).
3. **Apply deltas to the living spec:**
   - ADDED content is appended under the appropriate heading.
   - MODIFIED content replaces the matching heading's body.
   - REMOVED content deletes the matching heading.
4. **Update frontmatter:** `lastMergedRfc`, `updatedAt`, and `history[]` are updated.

### Delta classification heuristics

The merge is **semi-automatic**: the agent running `spec.live.merge` proposes the delta classification, and the operator confirms via `--dry-run` preview. The operator runs `spec.live.merge --id RFC-0708 --dry-run` to preview the proposed deltas, reviews them, then runs `spec.live.merge --id RFC-0708` (without `--dry-run`) to apply. This is consistent with the `docs.archive --dry-run` pattern. The heuristics are:

- If the RFC's `## Design` section contains a heading that **does not exist** in the living spec → **ADDED**.
- If the RFC's `## Design` section contains a heading that **exists** in the living spec → **MODIFIED** (the RFC's content replaces the living spec's content for that heading).
- If the RFC explicitly says "removes X" or "deprecates X" → **REMOVED**.
- If the RFC `supersedes` another RFC → the superseded RFC's contributions are **REMOVED** before the new RFC's contributions are **ADDED**.

### CLI surface

```sh
# Preview deltas for an implemented RFC (dry-run)
pnpm exec site-kernel run spec.live.merge --id RFC-0708 --dry-run

# Merge an implemented RFC into its living spec
pnpm exec site-kernel run spec.live.merge --id RFC-0708

# List all living specs
pnpm exec site-kernel run spec.live.list --json

# Show a living spec
pnpm exec site-kernel run spec.live.show --domain forge --json

# Validate all living specs
pnpm exec site-kernel run spec.live.validate --json
```

### TypeScript contracts

```ts
interface LivingSpec {
  domain: string;
  title: string;
  lastMergedRfc: string;
  updatedAt: string;
  createdAt: string;
  history: LivingSpecHistoryEntry[];
  body: string;
}

interface LivingSpecHistoryEntry {
  rfc: string;
  mergedAt: string;
  operation: "created" | "modified" | "removed";
}

interface SpecLiveMergeInput {
  id: string;
}

interface SpecLiveMergeResult {
  domain: string;
  operation: "created" | "modified";
  deltas: DeltaOperation[];
  conflicts: DeltaConflict[];
}

interface DeltaOperation {
  type: "added" | "modified" | "removed";
  heading: string;
  rfc: string;
}

interface DeltaConflict {
  heading: string;
  existingRfc: string;
  newRfc: string;
  resolution: "pending" | "resolved";
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/specs/live/<domain>.md` | Living spec file (one per domain) |
| `docs/specs/live/` | Directory for all living specs |
| `docs/rfcs/rfc-*.md` | Source for delta extraction (read during merge) |
| `docs/rfcs/archive/` | Archived RFCs are still read for merge (the `liveSpec` field is in frontmatter) |

### docs.archive integration

`docs.archive` gains a post-loop step after all 6 sub-commands (rfc.archive, adr.archive, plan.archive, audit.archive, session.archive, mission.archive) have run. The `writes` and `reads` arrays in the `docs.archive` command registration are updated to include `docs/specs/live/**`.

> **Step 7: Living spec merge.** After the main archive loop, collect all RFCs that were moved to `docs/rfcs/archive/implemented/` in this run and have a `liveSpec` field in frontmatter. For each such RFC, run `spec.live.merge --id <rfc-id>`. Only RFCs with `status: implemented` are processed — `rejected` and `superseded` RFCs are skipped. If the living spec does not exist, create it. If the merge produces conflicts, warn but do not block — the operator resolves conflicts manually.

### Output format

`spec.live.list --json`:

```json
{
  "command": "spec.live.list",
  "livingSpecs": [
    {
      "domain": "nachweis",
      "title": "Nachweis Register — Feature Specification",
      "lastMergedRfc": "RFC-0708",
      "updatedAt": "2026-08-06",
      "historyCount": 3
    }
  ]
}
```

`spec.live.merge --id RFC-0708 --json`:

```json
{
  "command": "spec.live.merge",
  "domain": "nachweis",
  "operation": "modified",
  "deltas": [
    { "type": "added", "heading": "### UI Components", "rfc": "RFC-0708" },
    { "type": "modified", "heading": "### Commands", "rfc": "RFC-0708" }
  ],
  "conflicts": []
}
```

### Failure modes

- **Living spec does not exist:** `spec.live.merge` creates a new living spec with the RFC's content as the initial body. `operation: "created"`.
- **Heading conflict:** If the RFC modifies a heading that was last modified by a different RFC (not the one being merged), a conflict is recorded with `resolution: "pending"`. The living spec is **not written to disk** when a conflict is detected — the merge aborts before any file I/O. The operator resolves the conflict by editing the RFC's `## Design` section to avoid the heading collision, then re-runs `spec.live.merge`. This ensures no partial application.
- **Atomic writes:** `spec.live.merge` uses `writeFileIfChanged` from `@warpgogol/forge/utils` for all file writes, consistent with the project's generated-file conventions. The living spec is written atomically — either the full merge result is written or nothing is written.
- **RFC has no `liveSpec` field:** `spec.live.merge` is a no-op — the RFC does not contribute to any living spec.
- **RFC is not archived:** `spec.live.merge` rejects RFCs with `status != implemented` (archived RFCs have `status: implemented` and are in `docs/rfcs/archive/`). Actually, the merge happens **during** archiving, so the RFC is in `implemented` status at merge time.

### spec.live.validate

Validates all living specs in `docs/specs/live/`:

- **V-LS-01:** Living spec frontmatter has required fields (`domain`, `title`, `lastMergedRfc`, `updatedAt`, `createdAt`, `history`).
- **V-LS-02:** `domain` matches filename (`<domain>.md`).
- **V-LS-03:** `lastMergedRfc` references an existing, archived RFC.
- **V-LS-04:** All `history[].rfc` references exist and are archived.
- **V-LS-05:** No duplicate `domain` values across living specs.

## Rollout

- **Default behavior:** `spec.live.merge` is available immediately. It is **opt-in** via the `liveSpec` frontmatter field — RFCs without this field are unaffected.
- **Existing RFCs:** No retroactive merge. Existing archived RFCs can be merged on-demand by running `spec.live.merge --id <rfc-id>` manually.
- **New RFCs:** Authors add `liveSpec: <domain>` to frontmatter when the RFC contributes to a feature-level spec. The field is optional — not all RFCs need living specs (e.g., governance RFCs, DNA amendments).
- **docs.archive integration:** The merge step runs automatically during `docs.archive` for RFCs with `liveSpec` field. Failures are non-blocking (warn only).
- **Initial population:** For features with existing archived RFCs, the operator runs `spec.live.merge` manually for each historical RFC in order to build the initial living spec.

## Alternatives considered

- **Auto-generate living specs from code:** Rejected — code reflects implementation, not design intent. Living specs capture the "why" and "what", not the "how".
- **Use DNA invariants for feature-level specs:** Rejected — DNA is for stable, cross-cutting architectural invariants. Feature-level specs change more frequently and are module-scoped. Mixing them would bloat DNA.
- **Store living specs in docs/rfcs/live/:** Rejected — `docs/rfcs/` is for RFCs (change proposals). Living specs are not change proposals — they are the current state. `docs/specs/live/` separates them clearly.
- **Full automation (no operator confirmation):** Rejected — delta classification has edge cases (heading matching, supersession). Semi-automatic with operator confirmation is safer. Future RFCs may automate fully once heuristics are proven.

## Risks

- **Living spec drift:** If `spec.live.merge` is not run during archive (e.g., due to a bug in `docs.archive`), living specs become stale. Mitigation: `spec.live.validate` checks that `lastMergedRfc` references the latest archived RFC with `liveSpec: <domain>`. A warning is produced if a newer archived RFC exists with the same `liveSpec` domain.
- **Merge conflicts:** Heading-based matching is fragile — RFCs might use slightly different headings. Mitigation: conflicts are reported, not silently overwritten. The operator resolves manually.
- **Adoption friction:** Authors must remember to add `liveSpec` to frontmatter. Mitigation: `fo-idea-create-rfc` can suggest the field when the RFC is classified as a feature-level change (not governance/policy).
- **Scope creep:** Living specs might accumulate implementation details instead of design. Mitigation: `spec.live.validate` could check for code-like content (e.g., TypeScript interfaces beyond a threshold) and warn.

## Acceptance criteria

- [ ] `docs/specs/live/` directory created with a README explaining the purpose
- [ ] `spec.live.merge` command registered and functional (semi-automatic with operator confirmation)
- [ ] `spec.live.list` command registered and returns JSON output
- [ ] `spec.live.show` command registered and returns living spec content
- [ ] `spec.live.validate` command registered with V-LS-01..05 rules
- [ ] `docs.archive` integration: step 7 runs `spec.live.merge` for RFCs with `liveSpec` field
- [ ] RFC frontmatter template updated with optional `liveSpec` field
- [ ] `fo-idea-create-rfc` skill suggests `liveSpec` field for feature-level RFCs
- [ ] `spec.live.merge` handles supersession (removes superseded RFC's contributions before adding new)
- [ ] `spec.live.merge` handles initial creation (no existing living spec)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- Living specs are **not** governance documents — they do not define contracts, commands, or policies. They are the merged result of archived RFCs.
- Living specs are **not** a substitute for reading the actual RFC when implementing a change — they are a starting point for understanding current state.
- Living specs are **not** the same as package-level `AGENTS.md` files. Living specs describe feature design (data model, commands, validation rules); `AGENTS.md` files describe agent rules (import policies, coding patterns, prohibitions). An agent reads both: the living spec to understand what a feature does, the `AGENTS.md` to understand how to work in the package.
- The `liveSpec` frontmatter field is optional. Not all RFCs need living specs. Governance RFCs, DNA amendments, and policy RFCs typically do not have a `liveSpec` domain.
- `spec.live.merge` is semi-automatic: the agent proposes deltas via `--dry-run` preview, the operator confirms by running without `--dry-run`. Silent merging without operator confirmation is a violation.
- Living specs are committed to git. They are generated artifacts (produced by `spec.live.merge`) and include a `GENERATED` header marker. The `history[]` frontmatter field is append-only — each merge appends a new entry.
- `rfc.validate` is updated to recognize `liveSpec` as an optional frontmatter field (boolean or string).
