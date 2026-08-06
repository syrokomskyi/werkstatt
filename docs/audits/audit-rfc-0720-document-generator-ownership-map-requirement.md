---
rfcId: RFC-0720
auditId: AUDIT-RFC-0720-01
date: 2026-08-06
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0720

## Verdict: Needs revision

The RFC has the right instinct — documentation is the gap, not code — but fails mechanical validation on an invalid `kind` and is missing 7 required template sections. The proposed AGENTS.md content also has a nested-fence markdown error that will render incorrectly.

## Mechanical validation (rfc.validate)

**Fail** — 1 error, 8 warnings:

- **V-04 (error):** Invalid kind `"documentation"`. Must be one of: `architecture`, `contract`, `command`, `policy`, `deprecation`. This RFC establishes a policy ("agents MUST register generated paths"), so `kind: policy` is the correct value.
- **V-13 (warning ×7):** Missing required sections: `## Problem`, `## Architectural fit`, `## Rollout`, `## Alternatives considered`, `## Risks`, `## Acceptance criteria`, `## Implementation notes for agents`.
- **V-20 (warning):** Unknown frontmatter key `"supersedesBy"` — should be `"supersededBy"` (with `d`).

## Axis A — Structural completeness

- **Missing 7 required sections.** The RFC uses non-standard sections (`Justification`, `Consequences`, `Evolution`) instead of the template's `Problem`, `Architectural fit`, `Rollout`, `Alternatives considered`, `Risks`, `Acceptance criteria`, `Implementation notes for agents`. The non-standard sections have valid content but must be renamed/restructured to match the template.
- **No acceptance criteria.** The `successSignals` in frontmatter are not a substitute for the `## Acceptance criteria` section with `- [ ]` checkboxes. Without checkable criteria, `rfc.implement.stamp` cannot verify implementation (V-26).
- **No implementation notes for agents.** Agents need explicit behavioral rules: when to add entries, which fields are required, and what to do if `ownership.sync.validate` fails.
- **Nested markdown fence in Design section.** The proposed AGENTS.md content at lines 67–83 uses a triple-backtick fence (`\`\`\`markdown`) containing another triple-backtick fence (`\`\`\`ts`). This will break markdown rendering — the inner fence closes the outer fence prematurely. The proposed content needs an outer fence of 4+ backticks or the inner fence should be indented.

## Axis B — DNA alignment

- **`satisfies: []` is empty.** For a `policy` kind RFC this is acceptable — the RFC does not establish or enforce a DNA invariant. It documents an existing enforcement mechanism (RFC-0087 ownership, RFC-0612 `ownership.sync.validate`).
- **`related: [RFC-0087, RFC-0612]`** is correct and relevant. RFC-0087 established the ownership map; RFC-0612 added the sync validator.

## Axis C — Ecosystem fit

- **Wrong `kind`.** `kind: documentation` is not a valid kind. The RFC establishes a policy requirement ("agents MUST register"), so `kind: policy` is correct. If the intent is purely a convention note without enforcement, this could be an ADR instead of an RFC.
- **AGENTS.md scope.** The RFC only mentions `packages/os/site-kernel-checks/AGENTS.md`. The root `AGENTS.md` § "Generated file writes" already says to use `writeFileIfChanged`, but does not mention `GENERATOR_OWNERSHIP_MAP`. Consider whether the root AGENTS.md also needs a cross-reference, since agents working in other packages (e.g. `site-kernel-handoff`) also generate files.
- **No commands added/changed/removed.** Correct — the RFC explicitly states this in `nonGoals`.

## Axis D — Forward-only compliance

No issues. The RFC does not propose backward compatibility, shims, or dual paths. It documents an existing forward-only enforcement mechanism.

## Axis E — Agent-facing policy

- **No self-authorizing language.** The RFC is in `draft` status and does not grant implementation permission.
- **No NEEDS CLARIFICATION markers.** No unresolved markers found.
- **Missing implementation notes section.** Without `## Implementation notes for agents`, agents lack explicit behavioral rules governing this RFC.

## Axis F — Pragmatism

- **Minimal and focused.** The RFC correctly identifies that `ownership.sync.validate` already catches the problem and that documentation is the real gap. No new command is proposed — good.
- **AGENTS.md note is the smallest possible preventive measure.** This is appropriate for the problem scope.
- **Consider ADR alternative.** A documentation-only convention note applied to one package's AGENTS.md could be an ADR rather than an RFC. If the operator wants RFC-level traceability and acceptance criteria, `kind: policy` RFC is fine. If the goal is just to add the note, an ADR is lighter weight.

## Axis G — Blind spots

- **Agent reading behavior.** The RFC's `Consequences` section acknowledges that "documentation-only measures depend on agents reading AGENTS.md" but does not consider when agents read it. Agents typically read AGENTS.md at session start or when entering a package — they may not re-read it mid-implementation when adding a new generated file. The `ownership.sync.validate` fatal check remains the reliable safety net.
- **`markerPolicy` field omitted from example.** The proposed AGENTS.md content shows `path`, `command`, and `module` but omits `markerPolicy`. The actual `OwnershipEntry` interface (line 47 of `generator-ownership.ts`) requires `markerPolicy: "registry-only"` for `public/**` files. The example should mention this since most new entries in `public/` need it.
- **Root AGENTS.md already has a related rule.** Line 118 of `packages/os/site-kernel-checks/AGENTS.md` already mentions `GENERATOR_OWNERSHIP_MAP` paths and `{system}` placeholder. The RFC should reference this existing content and explain how the new section relates to it (extends? duplicates? replaces?).

## Questions for the author

1. Should this be `kind: policy` (RFC with acceptance criteria) or an ADR (lighter weight, no acceptance criteria needed for a documentation note)?
2. Should the AGENTS.md note also be added to the root `AGENTS.md` or to `packages/os/site-kernel-handoff/AGENTS.md`, since `site-kernel-handoff` also owns generators (bordbuch, nachweis, release)?
3. The proposed AGENTS.md example omits `markerPolicy: "registry-only"` — should it be included, since most new `public/` entries require it?
