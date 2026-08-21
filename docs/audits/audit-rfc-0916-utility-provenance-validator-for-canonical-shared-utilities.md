---
rfcId: RFC-0916
auditId: AUDIT-RFC-0916-01
date: 2026-08-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0916

## Verdict: Needs revision

The RFC is well-structured and follows the established `fingerprint.usage.lint` pattern. One command lifecycle inconsistency and a cross-package registry placement question need clarification before implementation.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

No issues. All sections contain real content. CLI surface shows exact commands with flags. TypeScript contracts are minimal. File system responsibilities table names concrete paths. Output format documents the `--json` shape with a concrete example. Failure modes specifies exit codes and warn-vs-fail behavior. Rollout describes a 6-step adoption path with a warning-to-fail transition. Alternatives considered has 3 real alternatives with rejection reasons. Risks includes agent misinterpretation, false positives, performance, and registry maintenance. Acceptance criteria are checkable with evidence references. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

- `satisfies: [DNA-53, DNA-74]` — both exist. The RFC body explains how it generalizes the DNA-53 enforcement pattern and extends DNA-74 sole-ownership enforcement.
- DNA-88 (from RFC-0915) is referenced as the invariant this RFC enforces. Correctly not in `satisfies[]` since DNA-88 doesn't exist yet. The RFC body says "this RFC provides the automated enforcement for DNA-88" — clear.
- No conflicts with existing DNA invariants.

## Axis C — Ecosystem fit

- **Package boundaries**: The validator is in `packages/werkstatt-site/src/checks/` (where all check commands live). The registry is in `packages/werkstatt-shared/src/share/`. The validator reads a file from another package — this is acceptable because `werkstatt-site` already imports from `werkstatt-shared` (packages → packages).
- **Pipeline placement**: `PACKAGES_CHECK_PIPELINE` — correct for a workspace-scope check. Placed after `fingerprint.usage.lint`, which is the logical neighbor.
- **Compass sync**: No `docs/*.xml` synchronization needed — this RFC adds a check command, not a requirement or technology change.
- **AGENTS.md updates**: The RFC does not mention updating `packages/werkstatt-shared/AGENTS.md` with the registry location. This should be added so agents know where to find the registry.
- **Command lifecycle**: **Finding** — `commands.proposed: [utility.provenance.validate]` and `commands.added: [utility.provenance.validate]` are both populated. In a `draft` RFC, `added` should be empty — commands are `proposed` during draft and move to `added` upon implementation. Having both filled is inconsistent.

## Axis D — Forward-only compliance

No issues. No compatibility shims. The warning mode → fail mode transition is described as a deliberate, time-bounded step (after RFC-0915 implementation), not an indefinite grace period. The allowlist is an exemption mechanism with required `reason` fields, not a compatibility layer.

## Axis E — Agent-facing policy

No issues. Status gate is correct. Implementation notes reference RFC-0224, RFC-0334. No self-authorizing language. The note "Agents MUST NOT switch the pipeline entry from `--mode warning` to `--mode fail` until RFC-0915 is `implemented`" is a good cross-RFC coordination rule. No NEEDS CLARIFICATION markers.

## Axis F — Pragmatism

No issues. One registry-driven command replaces N potential per-utility commands — justifies its existence. TypeScript types are minimal. The RFC explicitly follows the `fingerprint.usage.lint` pattern rather than inventing a new one. The alternatives section explains why extending `fingerprint.usage.lint`, creating a per-utility command, and using ESLint were all rejected. `packagesImpacted` lists the two impacted packages. `nonGoals` are explicit.

## Axis G — Blind spots

- **Registry validation**: The RFC mentions `UTIL-REG-01` for registry parse errors, but does not describe what happens if a `patterns[].regex` string is an invalid regex. An invalid regex could crash the validator with an unhandled exception. The validator should catch regex compilation errors and emit a `UTIL-REG-02` diagnostic instead of crashing.
- **Registry schema validation**: The RFC does not mention a schema validation step for `utility-registry.yaml` itself. If the registry is missing required fields (e.g., `canonicalPath`), the validator may fail with a confusing error. A simple schema check at startup would prevent this.
- **Cross-package registry placement**: The registry is in `werkstatt-shared` but the validator is in `werkstatt-site`. If `werkstatt-shared` is ever consumed by a non-site package (e.g., a service), the registry is available but the validator is not. This is probably fine (services don't run `PACKAGES_CHECK_PIPELINE`), but worth noting.

## Questions for the author

1. `commands.proposed` and `commands.added` both list `utility.provenance.validate`. Should `added` be empty in a `draft` RFC? The `added` bucket is for commands that have been added upon implementation — having it populated in draft is inconsistent.
2. The registry file is at `packages/werkstatt-shared/src/share/utility-registry.yaml`, but the validator is at `packages/werkstatt-site/src/checks/utility-provenance.ts`. Should the `packages/werkstatt-shared/AGENTS.md` be updated to document the registry location so agents know where to add new utility entries?
3. What happens if a `patterns[].regex` string in the registry is an invalid regex (e.g., unbalanced parentheses)? The validator should catch regex compilation errors and emit a diagnostic instead of crashing. Should a `UTIL-REG-02` rule be added for invalid regex patterns?
