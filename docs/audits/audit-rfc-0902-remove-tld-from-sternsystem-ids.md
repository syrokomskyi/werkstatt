---
rfcId: RFC-0902
auditId: AUDIT-RFC-0902-01
date: 2026-08-21
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0902

## Verdict: Needs revision

RFC-0902 is architecturally sound and forward-only compliant, but has a contradiction between `commands.added` and the RFC body regarding `sternsystem.id.validate`, and the output format example doesn't match the actual `SternsystemViolation` type in the codebase. Two V-19 warnings (missing `amendedBy` backreferences) and an empty `reviewers` field need fixing before implementation.

## Mechanical validation (rfc.validate)

Pass with 2 warnings targeting RFC-0902:

- **V-19**: `RFC-0902.amends includes RFC-0354, but RFC-0354.amendedBy does not include RFC-0902` (warning)
- **V-19**: `RFC-0902.amends includes RFC-0790, but RFC-0790.amendedBy does not include RFC-0902` (warning)

The 357 errors in the full `rfc.validate` run are all from other (archived) RFCs — V-22 probe format warnings and V-13 missing sections in `decision-log.generated.md`. None target RFC-0902.

## Axis A — Structural completeness

- **A-1 — `commands.added` contradiction**: The frontmatter lists `sternsystem.id.validate` in `commands.added`, but the RFC body (line 123) explicitly states: "No new standalone command is added. The TLD check is integrated into the existing `sternsystem.validate` and `sternsystem.register` commands. The `commands.added` entry `sternsystem.id.validate` in frontmatter refers to the internal validation function, not a separate CLI command — it is callable programmatically by other kernel commands." This is contradictory. If `sternsystem.id.validate` is not a kernel command with a module registration, handler, and CLI surface, it must not appear in `commands.added`. Internal utility functions are not kernel commands. Either remove it from `commands.added` or register it as a real kernel command with scope, module, and handler.

- **A-2 — Output format mismatch**: The RFC's output format example (lines 178-192) shows fields `ruleId`, `severity`, `systemId`, `field`, `message`. The actual `SternsystemViolation` type in `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt/src/sternsystem/sternsystem-validate.ts:58` is `{ systemId: string; rule: string; message: string }` — it uses `rule` (not `ruleId`), has no `severity` field, and has no `field` field. The RFC's TypeScript contract (lines 155-162) also uses `ruleId` and `severity` which don't exist in the actual type. The implementation will need to either extend the `SternsystemViolation` type or use the existing field names.

## Axis B — DNA alignment

- **B-1 — V-19 backreferences missing**: The RFC amends RFC-0354 and RFC-0790, but neither has RFC-0902 in their `amendedBy` arrays. RFC-0354 (`amendedBy` at line 20-26) and RFC-0790 (`amendedBy` at line 31) both need `RFC-0902` appended. This is a mechanical fix for the enhance step.

- **B-2 — DNA text update path**: The RFC says it "tightens" DNA-44 and DNA-45 by adding "no TLD suffix" to their descriptions. DNA-44 text says "Established by RFC-0354, updated by RFC-0790." After this RFC is implemented, the DNA text needs to say "updated by RFC-0902" and include the TLD restriction. The RFC's acceptance criteria (line 289) correctly includes "DNA-44 and DNA-45 updated to mention 'no TLD suffix' requirement." Good.

## Axis C — Ecosystem fit

- **C-1 — `sternsystem.id.validate` registration ambiguity**: If `sternsystem.id.validate` is a real kernel command (as `commands.added` suggests), it needs to be registered in a module — likely `sternsystem.module.ts`. The RFC doesn't specify which module registers it, its scope (`workspace`), or its flags. If it's not a real command, remove it from `commands.added`.

- **C-2 — Schema error messages**: The RFC (line 171) says to update `kebabRe` error messages in `packages/werkstatt/src/schemas/sternsystem.ts` to mention "no TLD suffix." The schema at `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt/src/schemas/sternsystem.ts:36` has `kebabRe = /^[a-z0-9]+(-[a-z0-9]+)*$/` used in `systemConfigSchema`, `systemStateSchema`, and `serviceEntrySchema`. The regex itself can't enforce TLD absence (as the RFC acknowledges in "Alternatives considered"). The error message update is cosmetic — the actual enforcement is in `hasTldSuffix()`. This is fine but should be noted: the Zod schema error message is a lint hint, not enforcement.

- **C-3 — `naming-policy.ts` examples**: The current `STERNSYSTEM_ID_POLICY.examples` at `@/home/syrokomskyi/projects/warpgogol/werkstatt/packages/werkstatt/src/schemas/naming-policy.ts:25` is `["warpgogol-com", "nicaragua-projekt"]`. The RFC correctly identifies that `warpgogol-com` must change to `warpgogol`. But `MISSION_ID_POLICY.examples` (line 39) and `RELEASE_ID_POLICY.examples` (line 47) also use `warpgogol-com` as a prefix. The RFC doesn't mention updating these — they will become counter-examples after migration. The enhance step should add acceptance criteria or implementation notes for updating all `*POLICY.examples` that reference `warpgogol-com`.

## Axis D — Forward-only compliance

No issues. The RFC is explicitly destructive: "No backward compatibility is maintained. No migration script is provided." The implementation notes forbid shims, legacy readers, and TLD-stripping helpers. This is a clean break — forward-only compliant.

## Axis E — Agent-facing policy

- **E-1 — Empty `reviewers`**: `reviewers: []` will fail V-25 when stamping as `implemented`. Add at least `human:andrii-syrokomskyi` before the status transition.

- **E-2 — Implementation notes**: The notes correctly reference RFC-0224 for accepted→implemented transition, mention supersede escalation on invariant conflict, and forbid backward-compatibility shims. Good.

- **E-3 — No NEEDS CLARIFICATION markers**: No unresolved markers found.

## Axis F — Pragmatism

- **F-1 — `sternsystem.id.validate` in `commands.added`**: If this is just an internal function (`hasTldSuffix` is already a pure function in `naming-policy.ts`), it doesn't need to be declared as a kernel command. The RFC already proposes adding `hasTldSuffix()` to `naming-policy.ts` — that IS the reusable internal function. Declaring `sternsystem.id.validate` as a command is redundant unless other kernel commands need to call it via `executeKernelCommand` (which would be over-engineering for a simple set-lookup function).

- **F-2 — `KNOWN_TLDS` set**: Conservative and maintainable. The decision to hardcode rather than use an external package is justified. Adding TLDs is a code change, not an RFC — reasonable for a living allowlist.

## Axis G — Blind spots

- **G-1 — `MISSION_ID_POLICY` and `RELEASE_ID_POLICY` examples**: The RFC doesn't mention that `MISSION_ID_POLICY.examples` (`warpgogol-com-m000001`) and `RELEASE_ID_POLICY.examples` (`warpgogol-com-r000001`) in `naming-policy.ts` also need updating after the rename. These will be stale references to the old ID.

- **G-2 — `fleet/*.generated.yaml` files**: The rollout (line 244) mentions `fleet/fleet.sites.yaml` regeneration but doesn't mention `fleet/fleet.plan.generated.yaml`, `fleet/fleet.status.generated.yaml`, or `fleet/agent-catalog.generated.yaml`. These generated files also reference the old site ID and need regeneration.

- **G-3 — Performance**: The TLD check is O(n) where n is the number of hyphen-separated segments (typically 1-3). Negligible. Not mentioned in the RFC but trivial enough to omit.

- **G-4 — Concurrent execution**: Two agents running `sternsystem.register` simultaneously with TLD-suffixed IDs would both be rejected — no race condition risk. The validation is read-only and idempotent.

## Questions for the author

1. Is `sternsystem.id.validate` a real kernel command with module registration, scope, and handler? If yes, specify the module and scope. If no, remove it from `commands.added` — the `hasTldSuffix()` function in `naming-policy.ts` is the reusable unit.
2. Should the `SternsystemViolation` type be extended to include `severity` and `field` fields as the RFC's output format example suggests, or should the RFC's output format example be corrected to match the existing `{ systemId, rule, message }` shape?
3. Are `MISSION_ID_POLICY.examples` and `RELEASE_ID_POLICY.examples` in `naming-policy.ts` (which use `warpgogol-com` as prefix) in scope for this RFC, or should they be updated in a separate cleanup?
