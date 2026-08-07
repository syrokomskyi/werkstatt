---
rfcId: RFC-0727
auditId: AUDIT-RFC-0727-01
date: 2026-08-07
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0727

## Verdict: Needs revision

The RFC is structurally sound and well-aligned with the existing `rfc.implement.stamp` pattern. Three findings require revision before implementation: a count mismatch in the Problem section, a missing `packages/forge/AGENTS.md` update in the file system responsibilities, and a missing `fo-idea-implement` step 4.10b gate update in the rollout.

## Mechanical validation (rfc.validate)

Pass with one warning: V-19 — `RFC-0625.amendedBy` does not include `RFC-0727`. This is expected because RFC-0625 is archived (status: implemented) and cannot be edited in place. The implementation step must update `amendedBy` on RFC-0625 directly.

## Axis A — Structural completeness

- **A-1 (Problem section count mismatch):** The Problem section opens with "Four gaps exist in the current ADR status transition process" but then lists five numbered items (1–5). Item 5 (AV-16 message inconsistency) is a distinct gap, not a sub-item. Fix the count to "Five gaps" or merge item 5 into another gap.

- **A-2 (Decision section):** Present tense, single decision — correct.

- **A-3 (Acceptance criteria):** 14 items, all checkable. Sufficient scope coverage. No issues.

- **A-4 (Implementation notes):** Explicit MAY/MUST NOT rules with correct governance references. No issues.

## Axis B — DNA alignment

No issues. `satisfies: []` is correct for a `kind: command` RFC. No DNA invariants are established or modified by this RFC.

## Axis C — Ecosystem fit

- **C-1 (Missing AGENTS.md update):** The file system responsibilities table does not list `packages/forge/AGENTS.md` for updating the `forgeAdrModule` command table (currently lists `adr.list`, `adr.create`, `adr.validate`, `adr.archive` — needs `adr.implement.stamp` added). The root `packages/forge/AGENTS.md` OS modules table is the canonical reference for Forge module commands and must be kept in sync.

- **C-2 (Command lifecycle):** `commands.proposed: [adr.implement.stamp]` and `commands.changed: [adr.validate]` are correct. The proposed command will move to `added` upon implementation. No issues.

- **C-3 (Module boundaries):** New handler in `packages/forge/os/adr/handlers/` — correct placement within the ADR module. Reuses patterns from `packages/forge/os/rfc/handlers/implement-stamp.ts` without cross-module imports. No issues.

## Axis D — Forward-only compliance

No issues. The RFC does not propose compatibility shims or dual paths. Manual editing is replaced by the command, not maintained alongside it. The prohibition on direct edits to ADR frontmatter (implementation notes) is forward-only.

## Axis E — Agent-facing policy

- **E-1 (Missing step 4.10b gate update):** The rollout (step 5) updates `fo-idea-implement` step 4.10 to use `adr.implement.stamp`, but does not mention updating step 4.10b (the verification gate). Step 4.10b currently says: "If status is not `implemented`, go back to step 4.10 (Stamp implemented) and set `status: implemented`, `implementedAt`, `updatedAt`." This gate text references manual editing and must be updated to reference `adr.implement.stamp`.

- **E-2 (Status gate):** No self-authorizing language. "Agents MAY implement this RFC only after it is accepted" — correct.

- **E-3 (NEEDS CLARIFICATION markers):** No unresolved markers found.

## Axis F — Pragmatism

- **F-1 (Minimal command surface):** `adr.implement.stamp` earns its existence — it mirrors the proven `rfc.implement.stamp` pattern and addresses real gaps (atomic mutation, commit validation, concurrent safety). No flag-on-existing-command alternative is viable.

- **F-2 (Lean contracts):** TypeScript types are minimal — 4 types, 4 rules. No speculative generality. No issues.

- **F-3 (Scope discipline):** `packagesImpacted: ["@warpgogol/forge"]` is correct — only the forge package is touched. `appsImpacted: []` is correct. No issues.

## Axis G — Blind spots

- **G-1 (Lock file .gitignore):** The RFC mentions `.adr-locks/` as the lock file directory (mirrors `.rfc-locks/`), but does not mention adding `.adr-locks/` to `.gitignore`. The `.rfc-locks/` pattern should already be in `.gitignore` — verify and add `.adr-locks/` if not present.

- **G-2 (Post-hoc ADR commit reference):** For post-hoc ADRs (proposed → implemented), the `--implementation-commit` flag is required, but the ADR may document a decision that was implemented across multiple commits or before the ADR was created. The RFC's alternatives section addresses this ("Post-hoc ADRs can reference the commit that created the ADR itself or the commit that implemented the decision"), but the failure modes section could clarify what happens when the referenced commit is the ADR creation commit (which references the ADR id in its changed files by definition).

## Questions for the author

1. Should the `fo-idea-implement` step 4.10b gate text be updated as part of this RFC's rollout, or is it sufficient to update only step 4.10?
2. Is `.rfc-locks/` already in `.gitignore`, and should `.adr-locks/` be added in the same commit?
3. For post-hoc ADRs where the implementation predates the ADR creation, should ADR-IMP-03 accept the ADR creation commit as a valid `--implementation-commit`?
