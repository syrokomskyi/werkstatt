---
rfcId: RFC-0572
auditId: AUDIT-RFC-0572-01
date: 2026-07-28
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0572

## Verdict: Needs revision

The RFC is structurally sound and the forward-only supersede of RFC-0514 is architecturally correct. However, the `versionBump` is set to `minor` while the migrator `fromVersion`/`toVersion` are not specified, the `contactRequirementMessage` prop is described as "re-added" but was never in the current manifest (it was removed by RFC-0514), and the Implementation notes section still contains template placeholder comments instead of explicit agent behavioral rules.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0572` exits 0 with zero violations.

## Axis A — Structural completeness

- **A-1 (Implementation notes):** The `Implementation notes for agents` section (lines 249–264) still contains the template HTML comment `<!-- Rules that govern how AI agents interact with this RFC. Be explicit. Agents read this section for behavioral policy. -->` and the commented-out examples. The actual behavioral rules are inside the comment block as template guidance, not as explicit rules. The RFC must replace the comment with real agent-facing rules: status gate, forward-only reminder, migrator-only discipline, and the explicit "MUST NOT re-add structured fields" rule.

- **A-2 (CLI surface):** The CLI surface section says "No new commands" and shows the removed command commented out. This is correct but minimal — it should also mention `props.types.generate` as the regeneration command for the generated types file, since the Design section references it but the CLI surface does not list it.

## Axis B — DNA alignment

- **B-1 (satisfies DNA-17):** The RFC claims `satisfies: [DNA-17]` (Uni manifest contract). The body explains that the manifest `propsSchema` is modified — removing `emailField`/`phoneField`, re-adding `contactRequirementMessage`. This is a valid use of DNA-17: the manifest remains the authoritative source. However, the RFC does not mention `props.types.generate` as the regeneration step that keeps the generated types in sync with the manifest — this is a DNA-17 obligation (the manifest is authoritative; types are generated from it). The Design section mentions it in the file table but the Architectural fit section should explicitly state that generated types are regenerated.

## Axis C — Ecosystem fit

- **C-1 (Migrator version numbers):** The RFC declares `versionBump: minor` but does not specify the migrator's `fromVersion`/`toVersion`. The existing RFC-0514 migrator uses `fromVersion: "4.18.0"` / `toVersion: "4.19.0"`. The RFC-0572 migrator must declare its own `fromVersion`/`toVersion` (e.g. `fromVersion: "4.19.0"` / `toVersion: "4.20.0"`) to advance the cursor correctly. The Design section lists `rfc-0572.ts` but does not specify these values.

- **C-2 (AGENTS.md updates):** The acceptance criteria mention updating `site-kernel-checks/AGENTS.md` (removing `contact-form.ts` from the module table). This is correct. But the RFC should also check whether `packages/ui/AGENTS.md` or `packages/ui/src/sections/send-message/` has any AGENTS.md that references the structured fields — if so, those need updating too. The RFC should list all AGENTS.md files that need updates, not just the checks package.

- **C-3 (Command table entry):** The RFC says `contact.form.validate` is removed from command tables. The file `packages/os/site-kernel-checks/src/command-tables/09-build-artifacts.ts` line 453 has the entry. The RFC should explicitly name this file in the file system responsibilities table (it currently says `packages/os/site-kernel-checks/src/command-tables/` generically).

## Axis D — Forward-only compliance

No issues. The RFC is a clean supersede — structured fields are removed entirely, no dual-path, no compatibility shim. The migrator strips `emailField`/`phoneField` and re-adds `contactRequirementMessage`. This is forward-only.

## Axis E — Agent-facing policy

- **E-1 (Template placeholder in Implementation notes):** As noted in A-1, the Implementation notes section contains template comments instead of explicit rules. This is an agent-facing policy gap — agents reading this RFC will not find clear behavioral rules. The section must be filled with real rules.

- **E-2 (Status gate):** The RFC is `status: draft`. The Implementation notes must explicitly state that agents MAY NOT implement code changes until the RFC reaches `accepted` status. The current template comment mentions this but it is inside a comment block, not as a real rule.

## Axis F — Pragmatism

- **F-1 (contactRequirementMessage "re-added"):** The RFC says `contactRequirementMessage` is "re-added" to the manifest. But the current manifest (version 1.1.0) does NOT have `contactRequirementMessage` — it was removed by RFC-0514. The RFC should say "added" (not "re-added"), or clarify that it is restoring a prop that existed pre-RFC-0514 but was removed. This is a terminology precision issue, not a design flaw.

- **F-2 (PHONE_EXTRACT_REGEX pattern):** The TypeScript contracts section shows `PHONE_EXTRACT_REGEX = /(?:\+?\d[\d\s\-()]{7,}\d)/`. This pattern is very permissive — it matches any 9+ digit sequence with optional spaces, hyphens, and parentheses. The RFC should acknowledge that this pattern may produce false positives (e.g. matching long numbers in addresses or dates) and describe how the client-side validation mitigates this (the `contactRequirementMessage` hint lets the visitor verify before submitting).

## Axis G — Blind spots

- **G-1 (Migrator idempotency):** The RFC says the migrator is idempotent (RFC-0479) but does not describe what happens when the migrator runs on a site that has already been migrated (e.g. a site that never had `emailField` because it was created after RFC-0572). The migrator should be a no-op in that case — the RFC should state this explicitly.

- **G-2 (Migrator and phoneField):** The RFC-0514 migrator added `emailField` but NOT `phoneField` (phoneField was optional). The RFC-0572 migrator must strip both `emailField` AND `phoneField` from sites that have them. But some sites may have `phoneField` (added manually post-migration) and some may not. The migrator must handle both cases: strip `emailField` if present, strip `phoneField` if present, add `contactRequirementMessage` if not present.

- **G-3 (Existing RFC-0514 migrator):** The RFC-0514 migrator (`rfc-0514.ts`) is still in the registry. The RFC does not address whether the RFC-0514 migrator should be removed from the registry or kept. Since the registry is append-only (per `packages/os/site-kernel-handoff/AGENTS.md`), the RFC-0514 migrator stays. The RFC-0572 migrator runs after it. The RFC should state that the RFC-0514 migrator remains in the registry (append-only) and the RFC-0572 migrator runs after it — sites that already ran RFC-0514 will have `emailField` which RFC-0572 strips.

## Questions for the author

1. What are the migrator's `fromVersion` and `toVersion` values? The RFC declares `versionBump: minor` but does not specify the version range. The RFC-0514 migrator used `4.18.0 → 4.19.0`; RFC-0572 should use `4.19.0 → 4.20.0` or similar.

2. The `Implementation notes for agents` section contains template comments instead of explicit rules. What are the actual agent-facing behavioral rules for this RFC? (status gate, forward-only, migrator-only, MUST NOT re-add structured fields)

3. The `PHONE_EXTRACT_REGEX` pattern is very permissive. Has the operator considered the false-positive rate (e.g. matching long numbers in addresses, dates, or postal codes)? Is the `contactRequirementMessage` hint sufficient mitigation, or should the pattern be tightened?
