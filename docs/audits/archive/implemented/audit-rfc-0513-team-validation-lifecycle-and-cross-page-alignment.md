---
rfcId: RFC-0513
auditId: AUDIT-RFC-0513-01
date: 2026-07-24
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0513

## Verdict: Needs revision

The RFC closes an important gap (lifecycle enforcement and cross-page consistency), but has three findings that will block implementation: (1) the prose section reference validation model contradicts the file-based `contentRef` model established by RFC-0510/0511, (2) the status badge relies on a hero `eyebrow` field that does not exist in the hero archetype, and (3) the `commands.changed` entry `apps-check.run` references a command that does not exist in the codebase (the actual command is `sites-check.run`).

## Mechanical validation (rfc.validate)

**Pass** with 2 warnings (V-19): `amends` includes RFC-0200 and RFC-0509, but neither has `amendedBy` updated to include RFC-0513. These are non-blocking bidirectional-link warnings that will be resolved during enhance.

## Axis A — Structural completeness

- **File path error in file system responsibilities table.** The RFC lists `packages/os/site-kernel-checks/src/content-voice-lint.ts` as a file to extend. The actual file is `@/packages/os/site-kernel-checks/src/content-voice.ts:1`. The command is `content.voice.lint` but the source file is `content-voice.ts`. An agent following the table literally will not find the file.
- **Missing failure modes section.** The RFC documents `--json` output format for both validators but does not specify exit codes or warn-vs-fail behavior in a dedicated section. The CTA removal rules say "fails when" and review cadence says "warns (does not fail)", but there is no consolidated failure modes table. The acceptance criteria reference this distinction but the design section does not consolidate it.
- **Missing TypeScript contracts section.** The RFC has inline code snippets (status badge function, hero block builder) but no dedicated TypeScript contracts section showing the validator function signatures, unlike RFC-0508/0510/0511/0512 which all include this section.
- **Rollout is adequate.** Three phases (validators, status badges, content alignment) with a logical ordering.

## Axis B — DNA alignment

- **DNA-53 is decorative.** The RFC lists `DNA-53` (semantic fingerprint governance) in `satisfies[]`, but the RFC body does not explain how it enforces, protects, or extends DNA-53. The RFC adds validation rules and a status badge — it does not change fingerprinting or hashing logic. DNA-53 should be removed from `satisfies[]` or the RFC body should explain the connection (e.g., "validation rules are tracked by `platform.consistency.validate`" — but this is already stated for DNA-35, making DNA-53 redundant).
- **DNA-24 is reasonable** — the status badge is added to the hero block, which is a block-declarative change.
- **DNA-35 is reasonable** — the new validators join the check suite (`app.contract.full`).

## Axis C — Ecosystem fit

- **`apps-check.run` does not exist.** The RFC lists `apps-check.run` in `commands.changed`. The actual command registered in `@/packages/os/site-kernel-checks/src/module.ts:431` is `sites-check.run` (with aliases `sites-check.author` and `sites-check.postbuild`). The pipeline constant is `SITES_CHECK_AUTHOR_PIPELINE` in `@/packages/os/site-kernel-checks/src/pipelines/sites-check-author.ts:15`. The predecessor RFCs (0508–0512) correctly use `sites-check.run` in their `commands.changed`. RFC-0513 must use `sites-check.run`, not `apps-check.run`.
- **Missing amend for RFC-0073.** The RFC extends `content.references.validate` and `content.voice.lint` with new rules. Both commands were established by RFC-0073 (`@/docs/rfcs/archive/implemented/rfc-0073-content-discipline-validators.md`). RFC-0513 does not list RFC-0073 in `amends[]` or `related[]`. Since the RFC changes the behavior of these commands (adding prose section reference checks and profile-specific prohibited patterns), it should amend RFC-0073.
- **`eyebrow` field does not exist in the hero archetype.** The RFC proposes adding a status badge via `header.eyebrow` in the hero block (`@/docs/rfcs/rfc-0513-team-validation-lifecycle-and-cross-page-alignment.md:312`). The hero section component (`@/packages/ui/src/sections/hero/hero-section.astro`), its manifest, and its generated types do not contain an `eyebrow` field anywhere. No section component in `packages/ui/src/sections/` uses `eyebrow`. The Risks section acknowledges "the hero `eyebrow` field, which may not be visually distinct enough" — but the real issue is that the field does not exist at all. Implementing this requires either a schema extension to the hero archetype (which should be declared in the RFC) or a different rendering approach.
- **Package boundaries are correct.** New files are in `@gogol/site-kernel-checks` (validators) and `@gogol/share` (hero badge rendering). No cross-boundary violations.
- **Cosmic naming is not affected** — the RFC adds validation only, no new manifests or cosmic names.

## Axis D — Forward-only compliance

No issues. The RFC does not propose compatibility shims, dual paths, or deprecation grace periods. The status badge is additive — it renders for non-active participants and is absent for active/draft. No legacy code paths are maintained.

## Axis E — Agent-facing policy

- **No self-authorizing language.** The RFC does not contain "may proceed while draft" or similar.
- **Implementation notes are explicit behavioral rules** — 8 clear MUST/MUST NOT rules for agents.
- **Anti-fabrication is adequate.** The RFC distinguishes between code changes (validators, badge rendering) and content changes (fixing violations, updating review dates). The acceptance criteria are checkable by agents or humans.

## Axis F — Pragmatism

- **Two new commands are justified.** `team.lifecycle.validate` (status transitions, review cadence, CTA removal) and `team.cross-page.validate` (hub ↔ profile, home ↔ profile, navigation ↔ hub, JSON ↔ HTML) have distinct scopes. Combining them into one command would mix lifecycle and consistency concerns. The separation is pragmatic.
- **Prose section reference validation is based on a model mismatch.** Section 3 proposes checking that prose files contain headings like `## Beruflich`, `## Nachweise`, `## Persönlich`, etc. But RFC-0510/0511 use **separate prose files per section** (`prose/{slug}-beruflich.md`, `prose/{slug}-nachweise.md`, `prose/{slug}-persoenlich.md`), not anchor-based references within a single file. The prose files contain body text only — the headings are in the block props (`header.heading`), not in the prose files. The existing `content.references.validate` already checks that `contentRef: prose/{slug}-beruflich` resolves to an existing file. The proposed extension to check for `## Beruflich` headings inside prose files would **fail on the current content** because those headings are not in the prose files. This is the most serious finding — the RFC needs to either (a) reconcile with the file-based model from RFC-0510/0511 or (b) explain what additional value the heading check provides beyond file existence (which is already covered).
- **`appsImpacted` and `packagesImpacted` are correctly scoped** — only `warpgogol-com`, `@gogol/share`, and `@gogol/site-kernel-checks`.

## Axis G — Blind spots

- **Behavior snapshot impact not addressed.** Adding a status badge to the hero block changes the rendered HTML of profile pages for non-active participants. RFC-0269 behavior snapshots (readable and production) will diff against the previous build. The RFC does not mention behavior snapshots or how the badge change affects them. Since `breaksC: false`, the C-surface contract should not be affected, but the HTML diff will be non-empty for profile pages.
- **Hero `eyebrow` field requires schema extension.** As noted in Axis C, the `eyebrow` field does not exist in the hero archetype. Implementing the status badge requires either extending the hero section schema (new optional prop) or using a different mechanism (e.g., `tagline` prefix, a new badge component). The RFC does not address this implementation prerequisite.
- **False positive rate for cross-page validator.** The RFC acknowledges one false-positive risk (public participant not listed on hub → warning, not failure). But the JSON ↔ HTML consistency check has another risk: if JSON endpoints are generated at build time (RFC-0512) and the HTML is rendered separately, a stale `dist/` could cause false positives. The validator should run in `sites-check-postbuild` (after build), not `sites-check.author` (before build). The RFC says "join `apps-check.run`" but does not specify which sub-pipeline.
- **Performance cost not estimated.** The cross-page validator scans the people collection, the team hub page, the home page, navigation, and JSON endpoints. The RFC does not estimate the file scan count or I/O patterns. With 1–20 participants this is trivial, but the RFC should state this.
- **Empty state handling not specified for cross-page validator.** `team.lifecycle.validate` presumably no-op passes when no people records exist (following the convention of `participant.validate` and `team.hub.validate`), but this is not stated. `team.cross-page.validate` should also no-op pass when no team hub page exists.

## Questions for the author

1. **Prose section references:** RFC-0510/0511 use file-based `contentRef` (`prose/{slug}-beruflich`), not anchor-based references (`prose/{slug}#beruflich`). The prose files do not contain `## Beruflich` headings — the headings are in block props. Should section 3 be removed (file existence is already checked by `content.references.validate`), or should it check something else (e.g., that the block `header.heading` matches the expected localized value)?
2. **Hero `eyebrow` field:** The hero archetype does not support `header.eyebrow`. Should the RFC extend the hero section schema with a new optional `eyebrow` prop, or should the status badge use a different rendering mechanism (e.g., a prefix on `tagline`, a dedicated badge component, or a new block type)?
3. **Pipeline placement:** Which sub-pipeline should the new validators join — `sites-check.author` (author-time, no dist access) or `sites-check.postbuild` (post-build, scans dist)? The cross-page validator checks JSON ↔ HTML consistency, which requires built artifacts. Should `team.lifecycle.validate` join `sites-check.author` and `team.cross-page.validate` join `sites-check.postbuild`?
