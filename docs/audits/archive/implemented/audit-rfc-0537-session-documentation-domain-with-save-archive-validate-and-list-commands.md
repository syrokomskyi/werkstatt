---
rfcId: RFC-0537
auditId: AUDIT-RFC-0537-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: approved
---

# Audit: RFC-0537

## Verdict: Approved

The RFC is structurally complete, follows the established documentation-domain pattern (RFC-0521), and correctly extends `docs.archive`, `forge.yaml`, and `PREFERENCES.md`. No failures on axes B, D, or E. Minor findings on axes A, C, and G should be addressed during enhancement but do not block the RFC.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0537` reports zero violations.

## Axis A — Structural completeness

- **Risks table missing agent misinterpretation risk.** The risks table covers format changes, repo bloat, skill verbosity, regex false positives, idempotency, gitignore, shell portability, and PII. It does not explicitly call out the risk of an agent misunderstanding the hybrid command/skill split — e.g., running `session.save` when `saveSessions: false` is set, or expecting the command to produce semantic annotations (which is the skill's job). A one-line risk entry with mitigation "Implementation notes explicitly state the command/skill boundary; `fo-session-save` checks `saveSessions` and no-ops" would close this gap.
- All other sections contain real content with no template placeholders.

## Axis B — DNA alignment

No issues. `satisfies: []` is correct for a `command`-kind RFC. No conflicts with existing DNA invariants. `related[]` references (RFC-0521, RFC-0370, RFC-0393, RFC-0523, RFC-0524) are all relevant and verified to exist.

## Axis C — Ecosystem fit

- **`session.validate` pipeline placement not specified.** The RFC defines `session.validate` with SES-01..05 rules but does not state whether it runs in `build.check`, `packages.check`, or is on-demand only. Other domain validators (`rfc.validate`, `adr.validate`) are on-demand. If `session.validate` is also on-demand, the RFC should say so explicitly. If it should run in a pipeline, the RFC must name the pipeline and justify blocking vs. advisory.
- **`docs.archive --status` pass-through to `session.archive`.** The existing `docs.archive` handler passes `input` (including `--status`) directly to all sub-commands. `session.archive` uses `--max-age-days`, not `--status`. When `docs.archive --status implemented` is called, `session.archive` will silently ignore the `--status` flag (it reads `input.flags["max-age-days"]`, not `input.flags["status"]`). This is behaviorally correct but the RFC should document that `--status` is a no-op for `session.archive` to prevent operator confusion.
- Package boundaries, module registration pattern, AGENTS.md updates, and command lifecycle buckets are all correct.

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual paths, no legacy code maintained behind flags.

## Axis E — Agent-facing policy

No issues. Status gate is respected (draft RFC, implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted"). Implementation notes reference RFC-0224, RFC-0334, RFC-0330. The command/skill split correctly distinguishes deterministic tasks from LLM tasks. No cookies or client-side persistence.

## Axis F — Pragmatism

No issues. Four commands follow the exact pattern of existing domains (rfc, adr, plan, audit). TypeScript contracts are minimal. `packagesImpacted: ["@wgogol/forge"]` is correct — only forge is impacted. `appsImpacted: []` is correct.

## Axis G — Blind spots

- **Concurrent execution not addressed.** Two agents running `session.save` simultaneously on different raw files is safe (different output paths). Two agents running `session.archive` simultaneously could race on `fs.rename` — the existing archive handlers catch `ENOENT` for "already moved by another process" but the RFC doesn't mention this pattern. The implementation should follow the same `ENOENT` catch as existing archive handlers.
- **Interrupted operations.** If `session.save` crashes between writing the `.md` and deleting the raw file, the raw file remains in `.raw/` and re-running `session.save` will skip the existing `.md` (idempotency) but won't delete the raw file (skip means "do not delete raw"). This is safe but the RFC doesn't document this recovery behavior.
- **Performance** is trivial — directory scans of `docs/sessions/` with frontmatter parsing. Not a concern.
- **False positives** are covered in the risks table with mitigation.
- **Security/privacy** is covered (PII redaction by skill).

## Questions for the author

1. Should `session.validate` run in any pipeline (`build.check`, `packages.check`), or is it strictly on-demand like `rfc.validate` and `adr.validate`?
2. The existing `fo-session-retro` skill handles session-end insight triage. How does the proposed `fo-session-save` skill interact with `fo-session-retro`? Should `fo-session-save` invoke `fo-session-retro` after saving, or are they independent invocations? The RFC doesn't mention `fo-session-retro` at all.
3. The `session.archive` bidirectional behavior (moving files back from `archive/` when `--max-age-days` is increased) is unique — no other archive command does this. Is this intentional? If so, should the acceptance criterion for bidirectional behavior also verify that `docs.archive` (which uses the default 7-day threshold) doesn't accidentally unarchive files that were archived with a smaller threshold by a previous direct `session.archive --max-age-days 3` call?
