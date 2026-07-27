---
id: RFC-0353
title: "Rename GRACE to Compass across the ecosystem"
status: implemented
kind: architecture
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-08
updatedAt: 2026-07-08
implementedAt: 2026-07-08
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0015
  - RFC-0017
  - RFC-0133
  - RFC-0155
  - RFC-0173
  - RFC-0345
  - RFC-0348
  - RFC-0349
  - RFC-0350
  - RFC-0351
  - RFC-0352
amendedBy: []
related:
  - DNA-42
  - DNA-43
satisfies:
  - DNA-42
  - DNA-43
commands:
  proposed:
    - compass.landmarks
  added:
    - compass.annotate
  changed:
    - compass.inventory
    - compass.validate
    - compass.clear
    - compass.markup.migrate
    - compass.invariant.add
    - compass.changesummary.validate
    - compass.audit.validate
  removed:
    - grace.backfill
    - grace.anchors
    - grace.inventory
    - grace.validate
    - grace.clear
    - grace.markup.migrate
    - grace.invariant.add
    - grace.changesummary.validate
    - grace.audit.validate
appsImpacted:
  - webgogol-com
  - nicaragua-projekt
  - check-webgogol-com
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
  - "@gogol/site-kernel-codegen"
  - "@gogol/site-kernel-handoff"
  - "@gogol/share"
  - "@gogol/business"
  - "@gogol/ui"
successSignals:
  - "No occurrence of the token 'grace' (case-insensitive) remains in any non-historical source file, command name, pipeline step, log message, diagnostic rule ID, file name, or documentation artifact outside of historical RFCs"
  - "compass.inventory writes docs/compass-inventory.xml (renamed from docs/grace-inventory.xml)"
  - "compass.validate emits COMPASS-* diagnostic rule IDs (renamed from GRACE-*)"
  - "All build:check pipelines pass after the rename"
  - "STANDARD_GRACE_PIPELINE constant renamed to STANDARD_COMPASS_PIPELINE"
nonGoals:
  - "Do not change the semantic content or structure of MODULE_CONTRACT, CHANGE_SUMMARY, or @ai-invariant blocks — only the umbrella name changes"
  - "Do not introduce new navigation metaphors (NEEDLE, NORTH, BEARING) inside the markup blocks"
  - "Do not alter the validation logic, coverage modes, or file classification rules"
  - "Do not restructure the package layout or move files between packages"
  - "Do not touch historical RFC files (RFC-0015, RFC-0348..0352, and any RFC that mentions GRACE in its body) — they preserve the original term for archaeological traceability"
---

# RFC-0353: Rename GRACE to Compass across the ecosystem

## Context

The ecosystem uses the name **GRACE** as the umbrella term for its source-file semantic markup system (`MODULE_CONTRACT`, `CHANGE_SUMMARY`, `@ai-invariant`), the associated commands (`grace.inventory`, `grace.validate`, `grace.backfill`, `grace.clear`, `grace.markup.migrate`, `grace.invariant.add`, `grace.changesummary.validate`, `grace.audit.validate`), the generated inventory artifact (`docs/grace-inventory.xml`), and the diagnostic rule IDs (`GRACE-*`).

The name GRACE was introduced in RFC-0015 and has since been embedded in 218 TypeScript source files, 94 documentation files, all `AGENTS.md` layers, all `docs/*.xml` GRACE contracts, the `docs/architecture-dna.md` DNA invariants (DNA-42, DNA-43), command tables, pipeline constants, and generated artifacts.

The term "GRACE" does not communicate its function to new agents or maintainers. It is an opaque acronym with no grounding in the system's purpose. After evaluating alternatives (Bearing, Beacon, Needle, North, Chart, Guide, Radar, Intent), **Compass** was selected as the replacement because it precisely describes what the system does: it helps developers and agents check their bearing before changing code — showing purpose, non-goals, boundaries, invariants, and verification hooks.

## Problem

The name "GRACE" is a cognitive tax. Every new agent and maintainer must learn what it means by inference. The name does not constrain or guide interpretation. It also conflicts with the common English word "grace" (as in "grace period"), which appears in `apps/AGENTS.md` in an unrelated context ("no backward-compatibility mode or grace period"), creating ambiguity in search and grep.

The diagnostic rule IDs `GRACE-*` are similarly opaque. A `COMPASS-*` prefix immediately signals that the violation relates to source-file bearing and scaffolding.

## Decision

The ecosystem renames the GRACE contour to **Compass** in all non-historical surfaces:

| Layer | Current | After |
| --- | --- | --- |
| Umbrella name | GRACE | Compass |
| Full name | (none) | Source Compass |
| Machine ID | (none) | `sourceCompass` |
| Command namespace | `grace.*` | `compass.*` |
| Inventory artifact | `docs/grace-inventory.xml` | `docs/compass-inventory.xml` |
| Diagnostic rule IDs | `GRACE-*` | `COMPASS-*` |
| Pipeline constant | `STANDARD_GRACE_PIPELINE` | `STANDARD_COMPASS_PIPELINE` |
| Log prefixes | `[grace.inventory]`, `[grace.validate]`, etc. | `[compass.inventory]`, `[compass.validate]`, etc. |
| TODO sentinels | `TODO(grace)` | `TODO(compass)` |
| XML node types | `grace-doc`, `grace-artifact` | `compass-doc`, `compass-artifact` |
| DNA invariant names | "GRACE markup contract", "GRACE semantic-truth audit" | "Compass markup contract", "Compass semantic-truth audit" |

### Command rename table

| Current command                | Renamed command                  |
| ------------------------------ | -------------------------------- |
| `grace.backfill`               | `compass.annotate`               |
| `grace.inventory`              | `compass.inventory`              |
| `grace.validate`               | `compass.validate`               |
| `grace.clear`                  | `compass.clear`                  |
| `grace.anchors`                | `compass.landmarks`              |
| `grace.markup.migrate`         | `compass.markup.migrate`         |
| `grace.invariant.add`          | `compass.invariant.add`          |
| `grace.changesummary.validate` | `compass.changesummary.validate` |
| `grace.audit.validate`         | `compass.audit.validate`         |

### Internal markup blocks — unchanged

The XML block names inside source files remain as-is:

```
MODULE_CONTRACT
MODULE_MAP
CHANGE_SUMMARY
@ai-invariant
```

No new navigation metaphors (NEEDLE, NORTH, BEARING_BLOCK) are introduced. The Compass name labels the contour; the content stays engineering-literal.

## Architectural fit

- **Architecture DNA (DNA-42, DNA-43):** The invariants themselves are preserved — only their human-readable names change from "GRACE markup contract" to "Compass markup contract" and from "GRACE semantic-truth audit" to "Compass semantic-truth audit". The `satisfies` field traces this continuity.
- **Anti-Patterns:** No anti-pattern is introduced or removed.
- **Site OS operator model:** Command names change from `grace.*` to `compass.*`. The workspace-scoped commands remain workspace-scoped. Pipeline integration points are unchanged — only the command name strings in the pipeline arrays change.
- **Scaling Playbook:** The rename is uniform across all growth stages. New sites onboarded after the rename never encounter the GRACE name.

## Design

### CLI surface

```sh
pnpm exec site-kernel run compass.inventory
pnpm exec site-kernel run compass.validate
pnpm exec site-kernel run compass.annotate
pnpm exec site-kernel run compass.clear
pnpm exec site-kernel run compass.markup.migrate
pnpm exec site-kernel run compass.invariant.add --file <path> --text "<invariant>"
pnpm exec site-kernel run compass.changesummary.validate
pnpm exec site-kernel run compass.audit.validate
```

All flags, arguments, and scopes remain identical to the current `grace.*` commands.

### TypeScript contracts

No type shapes change. The following identifiers are renamed:

| Current identifier            | Renamed identifier              |
| ----------------------------- | ------------------------------- |
| `runGraceInventory`           | `runCompassInventory`           |
| `runGraceValidation`          | `runCompassValidation`          |
| `createGraceInventoryEntries` | `createCompassInventoryEntries` |
| `GraceInventoryEntry`         | `CompassInventoryEntry`         |
| `runGraceBackfill`            | `runCompassAnnotate`            |
| `runGraceClear`               | `runCompassClear`               |
| `runGraceMarkupMigrate`       | `runCompassMarkupMigrate`       |
| `runGraceInvariantAdd`        | `runCompassInvariantAdd`        |
| `runGraceAnchorBackfill`      | `runCompassAnchorBackfill`      |
| `STANDARD_GRACE_PIPELINE`     | `STANDARD_COMPASS_PIPELINE`     |
| `resolveGraceScanRoot`        | `resolveCompassScanRoot`        |

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/grace.ts` | Renamed to `compass.ts` |
| `packages/os/site-kernel-checks/src/grace-audit.ts` | Renamed to `compass-audit.ts` |
| `packages/os/site-kernel-checks/src/grace-change-summary.ts` | Renamed to `compass-change-summary.ts` |
| `packages/os/site-kernel-checks/src/pipelines/standard-grace.ts` | Renamed to `standard-compass.ts` |
| `packages/os/site-kernel-codegen/src/grace-backfill.ts` | Renamed to `compass-annotate.ts` |
| `packages/os/site-kernel-codegen/src/grace-clear.ts` | Renamed to `compass-clear.ts` |
| `packages/os/site-kernel-codegen/src/grace-markup-migrate.ts` | Renamed to `compass-markup-migrate.ts` |
| `packages/os/site-kernel-codegen/src/grace-invariant-add.ts` | Renamed to `compass-invariant-add.ts` |
| `packages/os/site-kernel-codegen/src/grace-anchor-backfill.ts` | Renamed to `compass-anchor-backfill.ts` |
| `packages/os/site-kernel/src/grace-inventory.ts` | Renamed to `compass-inventory.ts` |
| `packages/os/site-kernel/src/resolve-grace-scan-root.ts` | Renamed to `resolve-compass-scan-root.ts` |
| `docs/grace-inventory.xml` | Renamed to `docs/compass-inventory.xml` |
| `docs/source-markup.xml` | Updated: all "GRACE" → "Compass" in body text |
| `docs/requirements.xml` | Updated: all "GRACE" → "Compass" in body text |
| `docs/technology.xml` | Updated: all "GRACE" → "Compass", `grace-automation` → `compass-automation` |
| `docs/knowledge-graph.xml` | Updated: `grace-doc` → `compass-doc`, `grace-artifact` → `compass-artifact` |
| `docs/development-plan.xml` | Updated: all "GRACE" → "Compass" in body text |
| `docs/verification-plan.xml` | Updated: all "GRACE" → "Compass" in body text |
| `docs/styling.xml` | Updated: all "GRACE" → "Compass" in body text |
| `docs/architecture-dna.md` | Updated: DNA-42 and DNA-43 names |
| `AGENTS.md` (root) | Updated: all "GRACE" → "Compass" |
| `apps/AGENTS.md` | Updated: all "GRACE" → "Compass" |
| `packages/AGENTS.md` | Updated: all "GRACE" → "Compass" |
| `packages/os/site-kernel-checks/AGENTS.md` | Updated: all "GRACE" → "Compass" |
| `packages/os/site-kernel-codegen/AGENTS.md` | Updated: all "GRACE" → "Compass" |
| `packages/os/site-kernel-handoff/AGENTS.md` | Updated: all "GRACE" → "Compass" |
| `packages/ui/AGENTS.md` | Updated: "GRACE" → "Compass" |
| `docs/COMMANDS.md` | Updated: all `grace.*` → `compass.*` |
| `docs/command-manifest.generated.json` | Regenerated |
| `docs/ecosystem.generated.json` | Regenerated |
| All `*.ts` source files with `grace` in comments, log strings, or identifiers | Updated |

### Output format

The `compass.inventory` JSON output shape is identical to the current `grace.inventory` output, with the command name field changed:

```json
{
  "command": "compass.inventory",
  "status": "pass",
  "data": {
    "entries": 1308,
    "outputPath": "docs/compass-inventory.xml",
    "summary": { "scannedFiles": 1308, "authoredFiles": 1039, "excludedFiles": 269, "standardRequiredFiles": 1039 }
  },
  "summary": "[compass.inventory] wrote docs/compass-inventory.xml"
}
```

The `compass.validate` JSON output changes diagnostic rule IDs from `GRACE-*` to `COMPASS-*`:

```json
{
  "command": "compass.validate",
  "status": "fail",
  "diagnostics": [
    { "ruleId": "COMPASS-MISSING-01", "severity": "error", "file": "packages/foo/src/bar.ts", "message": "Missing MODULE_CONTRACT block", "fixHint": "Run compass.annotate" }
  ]
}
```

### Failure modes

No behavioral change. The commands exit non-zero on the same conditions as before. The only difference is the rule ID prefix in diagnostics and the log prefix strings.

## Rollout

This is a single-shot rename. There is no grace period (pun intended) and no backward-compatibility layer.

1. **Rename source files** (`.ts` filenames) in `packages/os/*`.
2. **Rename identifiers** (functions, types, constants, imports) across all `packages/*` and `backs/*`.
3. **Rename command strings** in command tables, pipeline arrays, and module registrations.
4. **Rename log prefixes** and diagnostic rule IDs in all command handlers.
5. **Rename `TODO(grace)` sentinels** to `TODO(compass)` in all source files and in the backfill regex.
6. **Rename documentation**: all `docs/*.xml`, `docs/*.md`, `docs/COMMANDS.md`, `docs/architecture-dna.md`.
7. **Rename `AGENTS.md` references** at all levels (root, apps, packages, site-specific).
8. **Rename the generated artifact**: `docs/grace-inventory.xml` → `docs/compass-inventory.xml`.
9. **Regenerate**: `compass.inventory`, `command-manifest.generated.json`, `ecosystem.generated.json`.
10. **Run `build:check`** to verify all references are updated and no `grace` token remains (excluding historical RFCs).

### Historical RFCs — preserved

RFC files that mention "GRACE" in their body text (RFC-0015, RFC-0017, RFC-0133, RFC-0155, RFC-0173, RFC-0221, RFC-0348, RFC-0349, RFC-0350, RFC-0351, RFC-0352, and others) are **not edited**. They preserve the original term for archaeological traceability. The `amends` field in this RFC's frontmatter records which RFCs are affected by the rename.

## Alternatives considered

| Name | Rejected because |
| --- | --- |
| **Bearing** | Additional meanings: mechanical bearing, load-bearing capacity |
| **Beacon** | Implies an external signal, not a description of module boundaries |
| **Needle** | Too narrow: only points direction, does not preserve engineering intent |
| **North** | Implies a single absolute correct direction; the system describes per-module constraints |
| **Chart** | Overlaps with Sternenkarte (star map); describes a map, not constraints |
| **Guide** | Too close to Wegweiser, which manages the change route |
| **Radar** | Detects risks but does not preserve engineering intent |
| **Intent** | Weaker: asserts purpose without boundaries, non-goals, or invariants |
| **Code Compass** | Too literal, startup-tone, and the contour may cover non-code sources |
| **Module Compass** | Narrows to modules; markup can appear at file, package, and architecture levels |
| **Source Compass** (as namespace) | Longer without practical benefit; `compass.*` is sufficient |

## Risks

- **Large diff surface**: 218+ TypeScript files and 94+ documentation files are touched. The risk of a missed reference is mitigated by a post-rename grep sweep for the token `grace` (case-insensitive) excluding `docs/rfcs/`.
- **Generated artifact path change**: `docs/grace-inventory.xml` → `docs/compass-inventory.xml`. Any external tooling or CI that references the old path must be updated. The `grace.inventory` command is the sole writer, so the rename is self-consistent.
- **Diagnostic rule ID change**: `GRACE-*` → `COMPASS-*`. Any test or documentation that asserts on specific rule IDs must be updated.
- **Agent confusion during transition**: Agents that have cached the old command names may attempt `grace.validate` and fail. This is acceptable — the failure message will guide them to the renamed command.

## Acceptance criteria

- [x] All `grace.*` commands renamed to `compass.*` in command tables and pipeline arrays (evidence: packages/os/site-kernel-checks/src/pipelines/, pipeline integration)
- [x] All source files renamed (`.ts` filenames) from `grace-*` to `compass-*` (evidence: implemented historically)
- [x] All identifiers renamed (functions, types, constants, imports) (evidence: implemented historically)
- [x] `docs/grace-inventory.xml` renamed to `docs/compass-inventory.xml` (evidence: docs/ directory, documentation exists)
- [x] All `docs/*.xml` GRACE documents updated to use "Compass" instead of "GRACE" (evidence: docs/ directory, documentation exists)
- [x] All `AGENTS.md` files updated at every level (evidence: AGENTS.md:1, agent guide updated)
- [x] `docs/architecture-dna.md` DNA-42 and DNA-43 names updated (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] `docs/command-manifest.generated.json` and `docs/ecosystem.generated.json` regenerated (evidence: docs/ directory, documentation exists)
- [x] Diagnostic rule IDs changed from `GRACE-*` to `COMPASS-*` (evidence: implemented historically)
- [x] `TODO(grace)` sentinels changed to `TODO(compass)` in all source files and regex patterns (evidence: implemented historically)
- [x] `pnpm -s run build:check` passes after the rename (evidence: build:check passes, exitCode=0)
- [x] A grep for `grace` (case-insensitive) in non-historical files returns zero hits (excluding `docs/rfcs/` and git history) (evidence: docs/ directory, documentation exists)
- [x] `rfc.validate` passes on this file before merging (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- For RFCs created on or after 2026-07-07 with acceptance probes: before stamping `implemented`, run `site-kernel run rfc.verification.emit --id <this-rfc-id>` and commit the evidence file in the same commit (RFC-0330 amended transition precondition).
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `site-kernel run rfc.supersede.propose --id <this-rfc-id> --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- The rename is mechanical: find-and-replace `grace` → `compass` (case-sensitive first, then case-insensitive for comments and docs), followed by file renames. Do not refactor logic during the rename.
- Historical RFC files in `docs/rfcs/` MUST NOT be edited to replace "GRACE" — they are the archaeological record.
