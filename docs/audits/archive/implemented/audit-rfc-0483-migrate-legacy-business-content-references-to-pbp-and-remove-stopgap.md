---
rfcId: RFC-0483
auditId: AUDIT-RFC-0483-01
date: 2026-07-22
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0483

## Verdict: Needs revision

The RFC has a mechanical V-24 violation (`satisfies: []` on an architecture RFC created after 2026-07-07) and the mapping table is both incomplete (51 of 61 patterns mapped) and contains inconsistent reference syntax (mixed `/` and `.` separators after `business-profile`). These must be fixed before the RFC can proceed to enhance/plan.

## Mechanical validation (rfc.validate)

**Fail** — 1 violation:

- **V-24** (error): architecture RFC created 2026-07-22 (>= 2026-07-07) must declare at least one DNA invariant in `satisfies` (RFC-0331). The RFC has `satisfies: []`.

## Axis A — Structural completeness

- **TypeScript contracts missing.** The RFC provides no type signatures for the migrator. RFC-0481 (the precedent migrator RFC) includes a full `Migrator` type signature, `transform` function shape, and file system responsibilities table. RFC-0483 should at minimum show the migrator's `transform` signature and the mapping table's type shape.
- **File system responsibilities table missing.** The RFC names paths inline (e.g. `packages/os/site-kernel-handoff/src/migrators/registry.ts`, `src/content/business/`) but does not provide a formal table. RFC-0479 and RFC-0481 both include one.
- **Failure modes not documented.** The RFC does not specify exit codes or warn-vs-fail behavior for the migrator. What happens if a `{business.*}` reference has no mapping? What happens if a de/ PBP entity already exists but lacks `presentation`? RFC-0481 includes a failure modes table.
- **Output format not documented.** No `--json` shape described for migrator output or validation output.
- **Risks section** does not address agent misinterpretation risk or false-positive rate for the mapping table.
- **Decision** is present-tense and concrete. **Alternatives** has 3 real alternatives with rejection reasons. **Rollout** describes adoption path. **Acceptance criteria** has 15 checkable items. **Implementation notes** are explicit behavioral rules.

## Axis B — DNA alignment

- **FAIL — `satisfies: []` violates V-24.** This is an architecture RFC created 2026-07-22. It MUST declare at least one DNA invariant. The RFC body demonstrates alignment with:
  - **DNA-41** (PBT for pure functions) — the migrator is a pure idempotent function, explicitly covered by PBT `f(f(x)) == f(x)`. This should be in `satisfies`.
  - **DNA-44** (Sternsystem bundle contract) — the migrator transforms workpiece data (content files, `content.config.ts`). This should be in `satisfies`.
  - **DNA-46** (Mission lifecycle) — the migrator runs during `mission.migrate`. This should be in `satisfies`.
  - **DNA-47** (Materialization) — the migrator operates on the materialized workpiece. This should be in `satisfies`.
- `related` includes DNA-20 (superseded). The RFC body correctly frames this as completing the supersession, not satisfying it. This is fine as `related`.

## Axis C — Ecosystem fit

- **Package boundaries correct.** Migrator in `packages/os/site-kernel-handoff`, PBP entities are content files in the site workpiece. No cross-boundary violations.
- **Pipeline placement N/A** — no new commands proposed. Uses existing `mission.migrate` and `migrator.registry.validate` from RFC-0479.
- **Compass sync not addressed.** The RFC removes the `business` collection from `content.config.ts` and deletes `src/content/business/`. If `docs/requirements.xml` or `docs/technology.xml` reference the `business` content collection, they need synchronization. The RFC should identify which Compass files need updates.
- **AGENTS.md updates not addressed.** If any `AGENTS.md` or `docs/authoring/site-composition.md` references the `business` content collection or the stopgap, those references need removal. The RFC should identify which files need updates.
- **Command lifecycle consistent** — `commands.proposed/added/changed/removed` all empty. Correct — no new commands.
- **Cosmic naming N/A** — does not touch manifests or component/section/page contracts.

## Axis D — Forward-only compliance

No issues. The RFC deletes the legacy `business/` directory, removes the `business` collection from `content.config.ts`, and does not propose any compatibility shim or dual-path. The stopgap is explicitly removed, not maintained behind a flag. This is forward-only.

## Axis E — Agent-facing policy

- **Status gate correct.** The RFC states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented) AND RFC-0482 is implemented." No self-authorizing language while draft.
- **Implementation notes** reference RFC-0224 (accepted→implemented transition). Correct.
- **Anti-fabrication handled.** The RFC distinguishes between migrator code changes (agent can make) and de/ entity translations (operator reviews). Line 293: "de/ PBP entities created by the migrator are first-draft translations from uk/ — the operator reviews and refines during the 'operator edits' step."
- **Storage policy N/A** — no persistence changes.

## Axis F — Pragmatism

- **`@gogol/pbp` in `packagesImpacted` is questionable.** This RFC does not change any PBP schemas — that is RFC-0482's scope. RFC-0483 creates content files (PBP entities) in the site workpiece, not package code. The only package code change is the migrator in `@gogol/site-kernel-handoff`. Consider removing `@gogol/pbp` from `packagesImpacted`.
- **No new commands** — correct, uses existing `mission.migrate`.
- **Existing patterns reused** — migrator registry from RFC-0479, content references from RFC-0045. Good.
- **`nonGoals` are explicit and meaningful** — 5 items, all substantive.

## Axis G — Blind spots

- **Mapping table incomplete.** The RFC claims "61 unique reference patterns" (line 259, Risks section) and RFC-0482 states "~20 structural + ~41 presentation = 61". The mapping table in RFC-0483 provides only 8 structural + 43 presentation = 51 patterns. **10 patterns are missing** (approximately 12 structural and 2 presentation). The Risks section acknowledges this risk ("Mapping table completeness. The mapping table must cover all 61 unique patterns") but the RFC does not provide the full mapping. This is a critical gap — an incomplete mapping table will cause build errors after migration.
- **Inconsistent reference syntax in mapping table.** Lines 180-181 and 185 use `{business-profile/documents/...}` (slash separator after collection name) while all other entries use `{business-profile.documents/...}` (dot separator after collection name). Per RFC-0045, the syntax is `{collection.file.field}` where `.` separates collection from file. The entries with `/` after `business-profile` are syntactically incorrect and would fail to resolve. Specifically:
  - Line 180: `{business-profile/documents/privacy.presentation.dates.creationDate}` — should be `{business-profile.documents/privacy.presentation.dates.creationDate}`
  - Line 181: `{business-profile/documents/imprint.presentation.dates.lastUpdateDate}` — should be `{business-profile.documents/imprint.presentation.dates.lastUpdateDate}`
  - Line 185: `{business-profile/documents/terms.presentation.dates.widerrufFormCreationDate}` — should be `{business-profile.documents/terms.presentation.dates.widerrufFormCreationDate}`
- **False positives not addressed.** The migrator does literal string replacement of `{business.*}` patterns. If a `{business.*}` pattern appears in a non-reference context (e.g. inside a code block explaining the syntax, or in a comment), it would be incorrectly replaced. The RFC should specify that replacement targets only reference positions (e.g. `{...}` patterns in markdown body and frontmatter value strings, not inside code blocks).
- **Edge cases:** Idempotency is well-handled. Concurrent execution is protected by `mission.migrate` locks (RFC-0479). Interrupted operations are handled by idempotent restart. Empty states (no `{business.*}` references) are no-ops.
- **Performance:** Bounded — scanning ~32 files for `{business.*}` patterns is trivial. Not a concern.
- **Security/privacy N/A** — no user data or PII changes.

## Questions for the author

1. Which DNA invariants does this RFC satisfy? `satisfies: []` fails V-24. The RFC body demonstrates alignment with DNA-41 (PBT for migrator idempotency), DNA-44 (Sternsystem bundle — migrator transforms workpiece data), DNA-46 (mission lifecycle — `mission.migrate` step), and DNA-47 (materialization — operates on workpiece). At least one must be declared.

2. Where are the remaining 10 mapping entries? The RFC claims 61 unique patterns but the mapping table only provides 51 (8 structural + 43 presentation). RFC-0482 states ~20 structural patterns exist, but RFC-0483 only maps 8. Which structural patterns are missing, and are there 2 missing presentation patterns?

3. Why do lines 180-181 and 185 use `{business-profile/documents/...}` (slash separator) instead of `{business-profile.documents/...}` (dot separator) like all other entries? Per RFC-0045, the separator between collection and file is `.`, not `/`. Are these typos or intentional?
