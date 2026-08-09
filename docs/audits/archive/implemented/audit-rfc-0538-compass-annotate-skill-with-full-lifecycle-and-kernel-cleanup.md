---
rfcId: RFC-0538
auditId: AUDIT-RFC-0538-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0538

## Verdict: Needs revision

The RFC is architecturally sound — moving LLM-driven Compass annotation from kernel commands to a Forge skill is the correct layer, and the forward-only removal of obsolete commands aligns with ecosystem policy. However, the RFC under-specifies the blast radius: DNA-42 explicitly names three of the removed commands as enforcement machinery and must be updated, multiple source files and docs reference the removed commands but are absent from the file system responsibilities table, and the `compass.changesummary.tidy` → `compass.summary.trim` rename creates a cap-semantics mismatch with the retained `compass.changesummary.validate` that the RFC does not address.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0538 --json` exits 0, zero violations.

## Axis A — Structural completeness

- **Missing "Failure modes" section.** The RFC does not specify exit codes or warn-vs-fail behavior for `compass.summary.trim`. The existing `compass.changesummary.tidy` (RFC-0349) has a "Failure modes" section; the renamed command should too.
- **"Output format" partial.** The `CompassSummaryTrimResult` interface is documented, but the skill's own output format (the Markdown summary table) is shown as an example without a formal contract. Acceptable for a skill (chat output is inherently Markdown), but the `compass.summary.trim` `--json` shape should document exit codes.
- **Acceptance criteria are checkable** — each item can be verified by file existence, command execution, or `forge.skill.validate`. No issues.
- **Implementation notes are explicit** — forward-only, no external API keys, skill file granulation, minimize operator distraction. No issues.

## Axis B — DNA alignment

- **FAIL: DNA-42 references removed commands.** `docs/architecture-dna.md:185` (DNA-42) states: "Enforced by `compass.validate`, managed by `compass.markup.migrate` / `compass.changesummary.tidy` / `compass.invariant.add`." The RFC removes `compass.markup.migrate` and `compass.invariant.add` and renames `compass.changesummary.tidy` → `compass.summary.trim`, but does not list `docs/architecture-dna.md` in its file system responsibilities, does not mention updating DNA-42, and does not supersede RFC-0348 (the establishing RFC for DNA-42). Per audit axis B rules: "If the RFC changes a DNA invariant, it must `supersede` the establishing RFC — not amend it." The RFC should either amend RFC-0348 to update the DNA-42 enforcement command list, or include `docs/architecture-dna.md` in its file system responsibilities and update DNA-42 text directly (DNA-42 is maintained by RFC-0348, so an `amends: [RFC-0348]` is the correct mechanism).
- **`satisfies: []` is empty.** The RFC should reference DNA-42 (Compass markup contract) and DNA-54 (Forge bindings contract) in `satisfies[]`. The RFC extends DNA-42's lifecycle management and uses DNA-54's binding pattern for `compass.fileExtensions` / `compass.testPatterns`.

## Axis C — Ecosystem fit

- **FAIL: File system responsibilities table is incomplete.** The following files reference removed commands and must be updated, but are missing from the table at lines 306–320:
  - `packages/forge/os/compass/compass.module.ts` — registers all 4 removed commands (lines 207–256). Must remove those registrations.
  - `packages/os/site-kernel-codegen/src/index.ts` — exports `runCompassAnnotate`, `runCompassClear`, `runCompassMarkupMigrate`, `runCompassInvariantAdd` (lines 58–64). Must remove those exports.
  - `packages/os/site-kernel-checks/src/compass.ts:237` — `compass.validate` fix hint says `"fix: remove ${marker}; run compass.markup.migrate"`. Must update to reference the skill or remove the fix hint.
  - `packages/os/site-kernel-checks/src/compass-change-summary.ts:130,140` — `compass.changesummary.validate` fix hints say `"fix: run compass.changesummary.tidy"`. Must update to `compass.summary.trim`.
  - `docs/COMMANDS.md` — lists all 4 removed commands and `compass.changesummary.tidy` (lines 141–151). Must be regenerated/updated.
  - `docs/architecture-dna.md` — DNA-42 references removed commands (see Axis B).
  - `packages/os/site-kernel-checks/README.md` — references all 4 removed commands in example code and wiring instructions (lines 14–24).
  - `packages/os/site-kernel-checks/AGENTS.md` — references `compass.annotate` in example code (line 105).
  - `packages/os/site-kernel-checks/docs/compass-operations.md` — documents all 4 removed commands and `compass.changesummary.tidy` (lines 24, 42–47, 186–189).
  - `packages/os/site-kernel-codegen/README.md` — documents all 4 removed commands (lines 13–16, 25–27, 32–45).
  - `packages/os/site-kernel-codegen/AGENTS.md` — documents all 4 removed commands (lines 22–28).

- **Frontmatter command lifecycle inconsistency.** `compass.changesummary.tidy` is listed in `commands.changed` but the RFC body (line 124, line 252) says it is a **rename** to `compass.summary.trim`. A rename means the old command is removed and a new one is added. `compass.changesummary.tidy` should be in `commands.removed`, not `commands.changed`. As written, `rfc.validate` passes (it checks internal consistency of the buckets), but the semantic intent is wrong — `changed` implies the same command with modified behavior, not a renamed command.

- **`forge.yaml` bindings schema extension.** The RFC proposes adding a new top-level `compass` section to `bindings` (line 100–105, 258–264). The current `forge/bindings@1` schema (as used in `forge.yaml`) has `commands`, `paths`, and `terminology` top-level keys. The RFC does not address whether the schema allows arbitrary extension keys or whether `forge/bindings@1` needs a schema update to recognize `compass`. If `forge.doctor` validates binding keys against a closed set, the new `compass` section would be rejected.

- **`STANDARD_COMPASS_PIPELINE` update.** The RFC correctly identifies that `compass.markup.migrate` and `compass.annotate` steps must be removed from the pipeline (line 347). The remaining pipeline (`compass.inventory`, `compass.validate`, `compass.changesummary.validate`) is correct. No issue.

## Axis D — Forward-only compliance

No issues. The RFC is explicitly forward-only:

- Removed commands have no deprecation period (line 345).
- No backward compatibility shims (line 155, line 371).
- Legacy code paths are deleted, not maintained behind a flag.

## Axis E — Agent-facing policy

No issues.

- **Status gate**: The RFC is `draft` and does not contain self-authorizing language. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted" (line 402).
- **Governance references**: Implementation notes reference RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation), RFC-0330 (verification evidence) correctly (lines 403–406).
- **Storage policy**: No persistence changes, no cookies introduced.
- **Anti-fabrication**: The skill generates Compass headers (prose about code), which is legitimate LLM work — the agent reads the code and writes headers. No claim of auto-generating content that requires human authoring.

## Axis F — Pragmatism

- **FAIL: Cap semantics mismatch between `compass.changesummary.validate` and `compass.summary.trim`.** The existing `compass.changesummary.validate` (retained, section 7) checks for `unprotectedCount > 3` (COMPASS-CS-02, `compass-change-summary.ts:75,134`). The renamed `compass.summary.trim` changes the cap to "30 total items" (line 124, line 251). This creates a semantic mismatch: a file with 5 unprotected + 2 protected = 7 total items would be flagged by validate (5 > 3 unprotected) but not trimmed by `compass.summary.trim` (7 total < 30). The RFC does not address whether `compass.changesummary.validate`'s cap logic should also change. If validate's cap stays at 3 unprotected, the fix hint "run `compass.summary.trim`" would not actually fix the violation. The RFC must either (a) update `compass.changesummary.validate` to use the same 30-total cap, or (b) keep the 3-unprotected cap in trim and only change the name, or (c) explicitly document the mismatch and explain why it's acceptable.

- **Rename justification is weak.** The RFC says the rename from `compass.changesummary.tidy` to `compass.summary.trim` is "for clarity" (line 124, line 252). The existing name is already known and documented. The rename creates churn across fix hints, docs, COMMANDS.md, and DNA-42. The cap change (3→30) could be done in-place without renaming. If the rename is desired, the alternatives section should justify why the name change is worth the churn.

## Axis G — Blind spots

- **`compass.validate` TODO(compass) sentinel check.** `compass.ts:251–274` checks for `TODO(compass)` sentinels in authored files and emits COMPASS-TODO-01 diagnostics. When `compass.annotate` is removed and the skill replaces skeletons entirely, files with stale `TODO(compass)` sentinels would still be flagged by validate. The RFC does not address whether the validate check should be updated (e.g., fix hint should reference the skill instead of `compass.annotate`), or whether the skill is expected to clean all sentinels before validate runs.

- **Performance: skill scan cost.** The skill scans all matching files in the workspace (line 178–183). For a large monorepo with hundreds of `packages/**` and `services/**` files, this could be slow. The RFC does not estimate scan cost or mention incremental scanning (the `--changed` flag mitigates this, but the default `/fo-compass-annotate` invocation scans everything).

- **Concurrent execution.** The RFC does not consider what happens if two agents run the skill simultaneously on the same workspace (race condition on file writes). The existing `compass.annotate` has the same risk, so this is not a regression, but the skill's batch-end `compass.validate` + autorretry loop could conflict with another agent's changes.

- **Edge case: empty workspace.** A new project with no authored files yet — the skill should gracefully report 0 annotated, 0 skipped. Not mentioned but likely works by default.

## Questions for the author

1. **DNA-42 update**: DNA-42 explicitly names `compass.markup.migrate`, `compass.changesummary.tidy`, and `compass.invariant.add` as enforcement commands. The RFC removes 2 and renames 1. Will you add `amends: [RFC-0348]` and include `docs/architecture-dna.md` in the file system responsibilities to update DNA-42's enforcement command list, or do you intend to supersede RFC-0348?

2. **Cap semantics**: `compass.changesummary.validate` (retained) checks for >3 unprotected items. `compass.summary.trim` (renamed) trims to 30 total items. A file with 5 unprotected + 2 protected items would fail validate but not be trimmed. Will you update validate's cap to match, keep trim's cap at 3 unprotected, or document the mismatch as intentional?

3. **Frontmatter consistency**: `compass.changesummary.tidy` is in `commands.changed` but the body says it's a rename. Should it be in `commands.removed` with `compass.summary.trim` in `commands.added`?
