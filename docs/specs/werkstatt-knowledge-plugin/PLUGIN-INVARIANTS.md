# `werkstatt-knowledge` Stack Invariants

The plugin SHOULD export these as stable `StackInvariant` ids. Exact `check` command wiring is an implementation detail.

| ID | Invariant | Severity if violated |
|---|---|---|
| `KNO-001` | Canonical manifest id exists and is valid. | error |
| `KNO-002` | Source root resolves only as `../<kb-id>-source`. | error |
| `KNO-003` | Registered source unit has valid README/package version metadata. | error |
| `KNO-004` | No KB operation writes/mutates source bundle/payload. | error |
| `KNO-005` | Current source fingerprint/version matches canonical binding for release. | error |
| `KNO-006` | Source-controlled code is not executed by default extractor policy. | error |
| `KNO-007` | `knowledge/` contains only schema-valid canonical record forms. | error |
| `KNO-008` | Canonical record ids are unique and keys/aliases do not collide. | error |
| `KNO-009` | All evidence resolves to current source binding. | error |
| `KNO-010` | Required semantic claims/relations have sufficient evidence/review. | error |
| `KNO-011` | All relation types are registered and domain/range valid. | error |
| `KNO-012` | Canonical epistemic status excludes speculation. | error |
| `KNO-013` | Canonical human-authored semantic language is English. | error |
| `KNO-014` | `staging/` records are excluded from canonical export. | error |
| `KNO-015` | `laboratory/` records cannot appear as canonical authority. | error |
| `KNO-016` | Global ontology/normative changes reference accepted RFC. | error |
| `KNO-017` | Cross-game concept admission/merge/split references accepted decision. | error |
| `KNO-018` | Coverage claims satisfy denominator/verifier rules. | error |
| `KNO-019` | Materialized/projection canonical hash matches current canonical state. | error |
| `KNO-020` | No public/repository secrets detected. | error |
| `KNO-021` | Public release has explicit dataset license/publication metadata. | error |
| `KNO-022` | Public evidence excerpts obey per-source publication policy. | error |
| `KNO-023` | Generated similarity does not appear as an unreviewed canonical relation. | error |
| `KNO-024` | Workshop resolves `werkstatt-knowledge` as the sole current Werkstatt plugin. | error |
| `KNO-025` | Source bundle is outside npm/Turbo workspace globs. | error |
| `KNO-026` | Canonical mutation uses transaction/promotion pathway. | error |
| `KNO-027` | Materialization is deterministic for identical canonical input/builder version. | error |
| `KNO-028` | Open source-unit evidence uses resolvable repo/commit/path metadata when available. | warning/error by release policy |
