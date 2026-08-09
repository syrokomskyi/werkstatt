---
rfcId: RFC-0571
auditId: AUDIT-RFC-0571-01
date: 2026-07-28
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0571

## Verdict: Needs revision

The RFC is architecturally sound — the decision to use `requireAstroSitePaths` and add `config.regenerate` to `build.prepare` is correct and well-justified. However, the Design section omits that two error messages in `config-regenerate.ts` (lines 119 and 128) hardcode `"apps/"` in their text and would be misleading after the path resolution change. The implementation notes' "two-line edit" claim is inaccurate.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0571 --json` returns 0 violations.

## Axis A — Structural completeness

- **Error messages not addressed:** `config-regenerate.ts` lines 119 and 128 contain error messages referencing `apps/`:
  - Line 119: `"config.regenerate: apps/" + app + " does not exist"`
  - Line 128: `"config.regenerate: unable to read apps/" + app + "/src/content/system.md"`

  After the path resolution change, these messages would be misleading (the path is no longer under `apps/`). The RFC's Design section shows the before/after for the path resolution line but does not mention these error messages. The implementation notes say "The path resolution change is a two-line edit" — with error message updates, it is a 4-5 line edit.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-44, DNA-47]` — both are real invariants in `docs/architecture-dna.md`. The RFC body explains how each is enforced: DNA-44 (platform-owned files materialized at build time, now kept in sync), DNA-47 (runtime scaffolding stays current via `build.prepare`). No conflicts with existing DNA invariants.

## Axis C — Ecosystem fit

- **Missing `related` entry:** RFC-0381 (apps/ retirement) is referenced twice in the RFC body (Context and Rollout sections) but is not listed in `related[]`. Since the RFC's entire motivation depends on the apps/ → missions/ transition established by RFC-0381, it should be in `related[]`.

Otherwise: package boundaries are correct (`site-kernel-onboarding` imports from `site-kernel-astro`, both in `packages/os/`). Pipeline placement in `build.prepare` is correct. No AGENTS.md or Compass XML updates needed — the change is internal to command implementation and pipeline composition.

## Axis D — Forward-only compliance

No issues. The hardcoded `apps/` path is removed, not maintained behind a flag. The RFC explicitly states "No backward compatibility" in Rollout. No compatibility shim or dual-path.

## Axis E — Agent-facing policy

No issues. Status gate is respected — the RFC says "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Implementation notes reference RFC-0224 (accepted→implemented transition) and RFC-0334 (supersede escalation). No self-authorizing language.

## Axis F — Pragmatism

No issues. No new commands — fixes an existing one and adds it to an existing pipeline. The change is minimal (path resolution + pipeline step). `packagesImpacted` lists exactly the two packages that are touched. `nonGoals` are explicit and meaningful.

## Axis G — Blind spots

No issues. Double generation during materialization is addressed (idempotent). Customized files (no GENERATED marker) are addressed (skipped, `--force` overrides). Performance is not a concern (5 file writes). No security/privacy implications.

## Questions for the author

1. Should the error messages at lines 119 and 128 of `config-regenerate.ts` be updated to remove the `apps/` reference? If so, should the Design section enumerate these changes and the implementation notes update the "two-line edit" claim?
2. Should RFC-0381 be added to `related[]` given it is the foundational RFC for the apps/ → missions/ transition that motivates this RFC?
