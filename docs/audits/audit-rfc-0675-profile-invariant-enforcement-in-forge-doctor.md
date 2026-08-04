---
auditId: AUDIT-RFC-0675
rfcId: RFC-0675
date: 2026-08-04
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0675 — Profile invariant enforcement in forge.doctor

## Mechanical validation

- **V-01 (schema)**: Pass — frontmatter parses, required fields present.
- **V-02 (cross-refs)**: Pass — `related` references (DNA-54, RFC-0638, RFC-0640, RFC-0641, ADR-0021) all exist.
- **V-03 (status-date)**: Pass — `createdAt` and `updatedAt` are 2026-08-04.
- **V-13 (implementation notes)**: Pass — `## Implementation notes for agents` heading present with HTML comment.

## Axis A — Structural completeness

- **Acceptance criteria**: 16 criteria, all unchecked. Comprehensive coverage of schema, engine, doctor integration, profile update, tests, and docs.
- **File system responsibilities**: 4 files listed — `profile-schema.ts`, `doctor.ts`, `invariant-engine.ts` (new), `editframe-html.yaml`.
- **TypeScript contracts**: `InvariantViolation`, `InvariantCheckResult`, `DoctorCheck` extension — all clear.
- **Missing**: No `commands.changed` issue — `forge.doctor` is already registered, this is a change to an existing command.

## Axis B — DNA alignment

- **DNA-54 (Forge bindings contract)**: Correctly satisfied — invariant check rules are declared in profile YAML, not hardcoded in Forge source.
- No other DNA invariants touched.

## Axis C — Ecosystem fit

- **RFC-0638 (profile schema)**: Correctly extends `profileInvariantSchema` with optional `check` field. Backward compatible — invariants without `check` remain advisory.
- **RFC-0640 (domain-aware doctor)**: Correctly upgrades the existing `domain-invariants` check from advisory to enforcement. The `--strict` flag behavior is consistent with existing doctor semantics.
- **RFC-0641 (editframe profile)**: VIDEO-01/02/03 invariants gain `check` declarations. VIDEO-02 is mentioned in rollout but not in acceptance criteria — the acceptance criteria only mention VIDEO-01 and VIDEO-03.
- **No new command**: Correct — only changes `forge.doctor`.

## Axis D — Forward-only compliance

- **Backward compatibility**: Invariants without `check` remain advisory. Existing profiles are unaffected. No migration needed. This is forward-compatible — adding an optional field.
- **No dual-path**: The enforcement engine replaces the advisory listing, not runs alongside it.

## Axis E — Agent-facing clarity

- **Implementation notes**: Present with standard HTML comment rules.
- **Testability**: Not explicitly mentioned, but the invariant engine is a pure function (`checkInvariants(profile, workspaceRoot)`) that can be unit-tested with temp directories.
- **Missing**: No testability subsection under implementation notes.

## Findings

### F-1 (minor): VIDEO-02 check declaration missing from acceptance criteria

The rollout section (line 226) mentions "VIDEO-02 and VIDEO-03 gain appropriate `file-contains` checks", but acceptance criteria only mention VIDEO-01 and VIDEO-03. Either add a criterion for VIDEO-02 or clarify that VIDEO-02 remains advisory.

### F-2 (minor): Missing testability subsection

The `## Implementation notes for agents` section has the HTML comment but no `### Testability` subsection explaining how the invariant engine can be unit-tested (e.g., temp directories with sample files, mocking file system reads).

### F-3 (question): Glob pattern for VIDEO-01

The rollout mentions `glob: "compositions/**/*.html"` but the editframe-html profile's artifacts declare extensions `.html` and `.tsx`. Should the glob also cover `.tsx` files? Or is VIDEO-01 specifically about `.html` composition files only?

## Questions for the author

1. Should VIDEO-02 gain a `check` declaration, or should it remain advisory? The rollout says yes but acceptance criteria don't mention it.
2. Should the VIDEO-01 glob pattern cover `.tsx` files in addition to `.html`?
3. Is the `invariant-engine.ts` module placed in `src/onboarding/` the right location, or should it be in `src/profiles/` since it's profile-related logic?
