---
rfcId: RFC-0792
auditId: AUDIT-RFC-0792-01
date: 2026-08-10
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0792

## Verdict: Needs revision

The RFC targets a real gap (YAML syntax errors in non-config YAML files are not caught by `sternsystem.validate`), but contains a critical path error (`systems/<id>/` vs `systems-cache/<id>/`), an inaccurate problem statement that ignores existing `discovery-error` coverage, and proposes an output format that diverges from the existing `violations` array shape.

## Mechanical validation (rfc.validate)

Pass — 0 violations.

## Axis A — Structural completeness

- **TypeScript contracts**: The proposed `validateYamlFiles` helper signature uses `io: WorkspaceIO` — this type does not exist in the `sternsystem-validate.ts` handler. The existing handler uses `node:fs/promises` directly. The contract should match the actual codebase patterns.
- **Output format**: The RFC proposes a `diagnostics` array with fields `{ ruleId, severity, file, message, fixHint }`. The existing `sternsystem.validate` returns `violations: Array<{ systemId, rule, message }>` and `warnings: Array<{ systemId, field, message }>`. The RFC should extend the existing `violations` array, not invent a parallel `diagnostics` format.
- All other sections (Decision, CLI surface, Failure modes, Rollout, Alternatives, Risks, Acceptance criteria, Implementation notes) are structurally complete.

## Axis B — DNA alignment

- `satisfies[]` is empty — acceptable for `kind: command` RFCs (not required per RFC-0331).
- The RFC body references RFC-0790 and "Strengthens the Sternsystem contract" but does not cite DNA-45 (fleet registry, `system-config.yaml` as source of truth) or DNA-44 (bundle contract). Not a finding since `command` kind does not require `satisfies[]`, but the relationship is relevant context.
- No conflicts with existing DNA invariants.

## Axis C — Ecosystem fit

- **CRITICAL — Wrong path**: The RFC Decision section says "parses every `.yaml` and `.yml` file in `systems/<id>/`" and the file system responsibilities table lists `systems/<id>/*.yaml`. The actual system config files live in `systems-cache/<id>/` (outside the monorepo at `../systems-cache/<id>/`). DNA-45 explicitly states: "Each Sternsystem is discovered via convention-based per-system files in `systems-cache/{id}/`". The `systems/` directory inside the monorepo contains only `methodologies.md`. The implementation would scan the wrong directory.
- **Inaccurate problem statement**: The RFC claims `sternsystem.validate` "does not verify that the YAML files themselves are syntactically valid" and "either crashes or silently skips the file." In reality, `discoverSystems` in `registry-io.ts:175-183` already catches YAML parse errors in `system-config.yaml` and reports them as `discovery-error` violations (`sternsystem-validate.ts:129-137`). The actual gap is: other YAML files (`dns-records.yaml`, `system-state.yaml`, etc.) are not parsed during validation.
- **Overlap with `dns.records.schema.validate`**: An existing command `dns.records.schema.validate` already validates `dns-records.yaml` both syntactically and against schema (`dns.module.ts:140-148`). The RFC does not mention this existing validator, creating potential duplication. The RFC should clarify whether `sternsystem.validate` should skip `dns-records.yaml` or whether the overlap is acceptable.
- **Rule ID naming convention**: The proposed `SYS-YAML-01` does not follow the existing naming convention. Existing rules in `sternsystem-validate.ts` use kebab-case without numeric suffixes: `discovery-error`, `bundle-contract`, `cache-must-be-non-bare`, `mirror-credentials`, `branch-convention`, `pin-version-mismatch`, etc. The proposed rule should follow the same pattern (e.g. `yaml-syntax-error`).
- Package boundary (`packages/werkstatt`) is correct.

## Axis D — Forward-only compliance

No issues. The RFC is purely additive — no backward compatibility layers, no dual-paths, no deprecation grace periods.

## Axis E — Agent-facing policy

No issues. No self-authorizing language, no NEEDS CLARIFICATION markers, implementation notes reference the correct governance pattern (RFC-0224 for accepted→implemented transition, `rfc.supersede.propose` for invariant conflicts).

## Axis F — Pragmatism

- **Output format divergence**: The `diagnostics` array with `{ ruleId, severity, file, message, fixHint }` is speculative generality. The existing `violations` array shape (`{ systemId, rule, message }`) is sufficient — the `systemId` is already known in the loop, `rule` maps to the rule ID, and `message` can include the file path and parser error. No new array format is needed.
- **`WorkspaceIO` type**: Speculative — not used in the existing handler. The implementation should use `node:fs/promises` directly, matching the existing pattern.
- The RFC correctly extends an existing command rather than creating a new one. Non-goals are explicit and meaningful.

## Axis G — Blind spots

- **Path correction needed**: The "non-recursive top-level only" scan should target `systems-cache/<id>/` (outside the monorepo), not `systems/<id>/`. The RFC should explicitly state that the scan reads from the cache clone directory (same directory where `system-config.yaml` lives).
- **`system-state.yaml` not mentioned**: The RFC lists `dns-records.yaml` and `system-config.yaml` in the context but does not mention `system-state.yaml`, which is also a YAML file in `systems-cache/<id>/`. The design says "every `.yaml` and `.yml` file" which would cover it, but the RFC should explicitly list the expected files.
- **Subdirectories**: The RFC says "non-recursive top-level only" but does not consider whether YAML files might exist in subdirectories of `systems-cache/<id>/` (e.g. `bordbuch/`). The design should confirm that top-level only is sufficient.

## Questions for the author

1. The RFC consistently uses `systems/<id>/` but the actual path is `systems-cache/<id>/` (outside the monorepo). Should the implementation scan `systems-cache/<id>/` — the same directory where `system-config.yaml` lives?
2. `discoverSystems` already catches `system-config.yaml` parse errors as `discovery-error` violations. Should the new YAML syntax check replace the existing `discovery-error` coverage for `system-config.yaml`, or only supplement it for other YAML files?
3. `dns.records.schema.validate` already validates `dns-records.yaml` syntactically and against schema. Should `sternsystem.validate` skip `dns-records.yaml` to avoid duplication, or is the overlap intentional?
4. The proposed output format uses a `diagnostics` array with different field names than the existing `violations` array. Should the implementation use the existing `violations` array shape (`{ systemId, rule, message }`) instead?
