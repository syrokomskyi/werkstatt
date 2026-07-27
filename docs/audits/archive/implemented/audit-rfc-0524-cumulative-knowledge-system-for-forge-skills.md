---
rfcId: RFC-0524
auditId: AUDIT-RFC-0524-01
date: 2026-07-25
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
rfcPath: docs/rfcs/rfc-0524-cumulative-knowledge-system-for-forge-skills.md
---

# Audit: RFC-0524

## Verdict: Needs revision

The RFC has an undeclared hard dependency on RFC-0523 (granular skill concerns taxonomy): its TypeScript contract and `skill-create` condition use a four-level `concerns` enum that does not exist in the current codebase. Additionally, knowledge files live in `packages/forge/skills/` — the source for the npm-published `@wgogol/forge` package — creating a portability concern that the RFC does not address.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0524` reports zero violations.

## Axis A — Structural completeness

- **TypeScript contract uses a non-existent enum.** Line 166 shows `concerns: "read-only" | "document-only" | "content-mutation" | "code-mutation"`, but the actual `ForgeSkillEntry` in `packages/forge/src/registry.ts:23` has `concerns: "document-only" | "implementation"`. The four-level enum is proposed by RFC-0523 (draft, not yet implemented). The RFC presents it as the current state without acknowledging the dependency.
- **Missing `--json` output format.** The RFC does not document the JSON shape for SKILL-13 violations or `forge.doctor` stale knowledge warnings. Axis A requires CLI surface to document the `--json` shape.
- **`forge.doctor` integration undescribed.** The RFC says `forge.doctor` reports stale knowledge files but does not describe how this integrates with the existing doctor command's bindings validation (RFC-0393).

## Axis B — DNA alignment

- **DNA-54 satisfaction is weak.** DNA-54 states: "Canonical forge skill bodies must not contain hardcoded project-specific literals." The RFC adds a `knowledge?: string[]` field to `ForgeSkillEntry` and a SKILL-13 validation rule for knowledge file existence. Neither enforces, protects, or extends the bindings contract. The RFC's `satisfies: [DNA-54]` is not justified — the RFC should either explain the connection to DNA-54 more clearly or drop the `satisfies` entry.

## Axis C — Ecosystem fit

- **Undeclared dependency on RFC-0523.** The RFC uses the four-level `concerns` enum from RFC-0523 in two places: (1) the TypeScript contract (line 166) and (2) the `skill-create` prompt condition (line 208: `concerns: content-mutation | code-mutation`). RFC-0523 is not listed in `related[]`, `amends[]`, or `supersedes[]`. If RFC-0523 is not implemented first, RFC-0524's contracts are invalid against the current codebase.
- **SKILL-13 numbering depends on RFC-0523.** The existing validator (`packages/forge/src/validators/skill-validate.ts`) implements SKILL-01..SKILL-11. RFC-0523 introduces SKILL-12. RFC-0524 introduces SKILL-13. This numbering is correct only if RFC-0523 is implemented first. The RFC should declare this ordering dependency.
- **Command lifecycle buckets.** `commands.changed` lists `forge.skill.validate`, `forge.init`, `forge.doctor`. These are existing registered commands — the bucket assignment is correct. No issues.

## Axis D — Forward-only compliance

No issues. The RFC is purely additive — it adds an optional `knowledge` field and a new validation rule. No backward compatibility layers, no shims, no dual-paths.

## Axis E — Agent-facing policy

- **Status gate.** The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 256). No self-authorizing language.
- **Implementation notes.** References RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation). Correct.
- **Anti-fabrication.** Not applicable — the RFC does not claim content will be auto-generated.
- **Storage policy.** Not applicable — no persistence changes.

## Axis F — Pragmatism

- **Mutation contract contradiction.** The RFC says `forge.init` syncs knowledge files from `packages/forge/skills/` to `.agents/skills/` (line 187), and `.agents/` is read-only. But the Risk section (line 230) says "skills read from source (`packages/forge/skills/`), not from `.agents/`". If skills read from source, the sync to `.agents/` is unnecessary for knowledge files. The RFC should clarify whether skills read from source or from `.agents/`, and justify the sync if reading from source.
- **`versionBump: patch` may be understated.** The RFC adds an optional field (non-breaking) but also adds a new validation rule (SKILL-13) that could cause `forge.skill.validate` to fail for skills that declare `knowledge:` files that don't exist yet. This is new enforcement, not just a patch. Consider whether `minor` is more appropriate given the new validation behavior.

## Axis G — Blind spots

- **Knowledge file portability.** `packages/forge/skills/` is the source for `@wgogol/forge`, published to npm (per `packages/forge/AGENTS.md`). Knowledge files — especially L0 (`qa-log.md`) — accumulate project-specific Q&A from WGogol sessions. When forge is deployed to another project, these WGogol-specific knowledge files would be synced via `forge.init`. The RFC does not address this portability concern. Forge is supposed to be portable (DNA-54, RFC-0393). Options: (a) knowledge files are project-local (live in `.agents/skills/`, not `packages/forge/skills/`), (b) knowledge files are `.gitignore`d and never published, (c) knowledge files ship empty and each project accumulates its own.
- **L0 growth in published package.** The RFC acknowledges L0 grows indefinitely (~600KB after 200 runs) but dismisses it as "acceptable for git". It does not address that L0 lives in a npm-published package. 600KB of WGogol-specific Q&A in an npm package is a cleanliness concern.
- **Concurrent execution.** Two agents running the same skill simultaneously could both append to L0 and clobber each other's entries. The RFC does not address concurrent writes to knowledge files.

## Questions for the author

1. Should RFC-0524 declare RFC-0523 in `related[]` and explicitly state that SKILL-13 numbering depends on SKILL-12 from RFC-0523 being implemented first?
2. How should knowledge files be handled when `@wgogol/forge` is published to npm — should they ship empty, be excluded from the package, or live in `.agents/skills/` (project-local) instead of `packages/forge/skills/`?
3. If skills read from source (`packages/forge/skills/`) per the Risk section, what is the purpose of syncing knowledge files to `.agents/skills/` via `forge.init`?
4. How does the `concerns` field in the TypeScript contract relate to the current binary enum (`document-only | implementation`) if RFC-0523 is not yet implemented?
