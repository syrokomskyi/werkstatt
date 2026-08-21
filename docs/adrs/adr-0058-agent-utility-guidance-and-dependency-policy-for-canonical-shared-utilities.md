---
id: ADR-0058
title: "Agent utility guidance and dependency policy for canonical shared utilities"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: proposed
scope: workspace
decider: architecture
createdAt: 2026-08-21
updatedAt: 2026-08-21
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0915
  - RFC-0916
  - DNA-53
  - DNA-74
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0058: Agent utility guidance and dependency policy for canonical shared utilities

## Context

RFC-0915 consolidates slug generation into `@warpgogol/werkstatt-shared/src/share/slug/` and establishes DNA-88. RFC-0916 adds `utility.provenance.validate` for automated enforcement. Together they handle the hard architectural contract and the check command.

What remains is the soft guidance layer: when should a utility be extracted into `werkstatt-shared`? How should agents decide between importing an existing utility and creating a new one? What is the policy for adding external dependencies? These are conventions and policies, not commands or DNA invariants — they belong in an ADR.

The `werkstatt-shared` package already contains utilities like `slugify()`, `fingerprint` helpers, content reference resolvers, and semantic extractors. Agents need clear criteria to avoid both under-extraction (duplicating logic) and over-extraction (premature abstraction).

## Decision

Agents MUST check `@warpgogol/werkstatt-shared` exports and `utility-registry.yaml` before writing any new utility function, and external dependencies MUST be declared in `werkstatt-shared` rather than site packages whenever the utility is shared.

- **Extraction criteria**: a utility function is extracted into `werkstatt-shared` when it is used in 2+ workspaces, or when it wraps an external package that other workspaces are likely to need (high reimplementation risk).
- **Dependency policy**: external packages used by shared utilities are declared in `packages/werkstatt-shared/package.json` only. Site packages import the wrapper, not the external package.
- **Agent checklist**: before creating a new utility function, an agent MUST (1) search `werkstatt-shared` exports, (2) check `utility-registry.yaml`, (3) check existing imports in the current package for the same logic.

## Justification

The slug duplication problem (three implementations, two external packages, no canonical owner) is direct evidence that agents need explicit guidance, not just enforcement. `utility.provenance.validate` catches violations after they are written, but the agent checklist prevents them from being written in the first place.

The extraction criteria ("2+ workspaces or high reimplementation risk") follows the same principle as DNA-53 (fingerprint) and DNA-74 (Diagnostic): canonical ownership is established when a utility is shared or likely to be shared. Single-workspace utilities stay local to avoid premature abstraction.

The dependency policy (external packages in `werkstatt-shared` only) prevents dependency fragmentation. When `@sindresorhus/slugify` was declared in `werkstatt-site/package.json`, it was invisible to other packages — `werkstatt-shared` already had a custom `slugify()` because it could not import the better external package. Centralizing the dependency declaration makes the canonical wrapper visible to all consumers.

Alternative considered: "extract only when 3+ workspaces need it" — rejected as too conservative. The reimplementation risk is high even with 2 workspaces because agents do not always check other workspaces before writing code. The "2+ or high risk" threshold catches the slug case (used in `werkstatt-shared` and `werkstatt-site`) without requiring a third consumer.

## Consequences

- **Positive**: Agents have a clear checklist before writing utilities, reducing duplication. External dependencies are centralized in one package, making the dependency graph simpler. The `utility-registry.yaml` serves as a discoverability index for canonical utilities.
- **Positive**: New canonical utilities automatically get enforcement by adding a registry entry — no new command needed.
- **Negative**: `werkstatt-shared` accumulates more dependencies over time, increasing its bundle size. Acceptable because the package is only consumed by other workspace packages, not shipped to browsers directly.
- **Negative**: Agents must perform a search step before writing utility code, adding friction. Mitigated by the `utility-registry.yaml` being a single file to check.
- **Technical debt**: The extraction criteria are heuristic ("2+ workspaces or high risk"). There is no automated tool to detect "this function is used in 2+ workspaces" — it relies on agent judgment. This could be improved with a future import-graph analyzer, but that is out of scope for this ADR series.

## Evolution

- **Threshold to revisit**: if `werkstatt-shared` exceeds 20 direct external dependencies, consider splitting utility domains into sub-packages (e.g., `werkstatt-shared-slug`, `werkstatt-shared-date`). The current threshold is chosen because 20 dependencies is the point where `pnpm install` time and lockfile size become noticeable.
- **Metric to watch**: `utility.provenance.validate` violation count over time. If violations increase despite the checklist, the guidance is insufficient and may need to be promoted to a DNA invariant or a stricter enforcement mechanism.
- **Registry growth**: if `utility-registry.yaml` grows beyond 10 utility entries, consider adding a `utility.registry.validate` command to validate the registry schema itself (similar to `dns.records.schema.validate`).
- **Import-graph analyzer**: if agent judgment proves unreliable for extraction criteria, a future RFC could add an import-graph analyzer that automatically detects functions used in 2+ workspaces and suggests extraction.
