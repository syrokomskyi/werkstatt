---
reviewId: REVIEW-CODE-2026-08-09-01
date: 2026-08-09
reviewer:
  skill: fo-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: fa8de086^...HEAD
filesReviewed:
  - packages/werkstatt-site/src/domain/share/semantic/robots.ts
  - packages/werkstatt-site/src/checks/robots.ts
  - packages/werkstatt-site/src/codegen/app-boilerplate.ts
  - packages/werkstatt-site/src/codegen/templates/app-boilerplate/public/_headers.template
  - packages/werkstatt-site/src/checks/public-surface/security.ts
  - packages/werkstatt-site/src/checks/tests/rfc-0784-robots-headers.test.ts
  - docs/rfcs/rfc-0784-add-agent-discovery-link-headers-and-content-signal-directive-in-robots-txt.md
---

# Code Review: fa8de086^...HEAD (RFC-0784)

## Verdict: Needs revision

Implementation is functionally correct — 13 tests pass, RFC validates, no new type errors. Two findings require attention: a duplicated default `contentSignal` array literal (Axis A) and a duplicated `agentBlock` reading pattern (Axis F).

## Mechanical floor

Pass (with caveats). `build:check` produces 6 pre-existing errors in unrelated files (`resolve-field-path.ts`, `language-redirect.ts`, `navigation.ts`) — confirmed present before this diff. Zero new type errors introduced. `rfc.validate --id RFC-0784` passes. 13/13 new tests pass.

## Axis A — Structural correctness

**A-1 (WARN): Duplicated default `contentSignal` array literal.** The default `["text/html", "text/markdown", "application/ld+json", "text/plain"]` appears twice in `packages/werkstatt-site/src/checks/robots.ts:72-74` and `:77-78` — once in the `robotsRaw` truthy branch and once in the fallback branch. Extract to a `const DEFAULT_CONTENT_SIGNAL` at module level. This is a maintenance hazard: if the default changes, one copy may be missed.

## Axis B — DNA alignment

No issues. DNA-34 (`.well-known/` discovery) is reclassified to feature (RFC-0161) — not a binding invariant. The RFC `satisfies: [DNA-34]` is consistent. No other DNA invariants are touched.

## Axis C — Ecosystem fit

No issues. All changes are within `packages/werkstatt-site` — no cross-workspace boundary changes. No new commands introduced; existing commands (`robots.generate`, `robots.validate`, `public.infrastructure.generate`, `headers.security.validate`) are extended with new rules. Package boundaries respected. No AGENTS.md updates needed (confirmed by doc-audit).

## Axis D — Forward-only compliance

No issues. No compatibility shims, no dual-paths, no legacy code retained. The `{{AGENT_LINK_HEADERS}}` token replaces nothing — it's a new token in an existing template. Existing `HDR-01..04` rules are untouched. Existing `robots.validate` rules are untouched.

## Axis E — Agent-facing clarity

No issues. All new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY` scaffolding with RFC-0784 entries. Comments reference RFC-0784 by ID. Variable names are clear (`agentLinkHeaders`, `agentEnabled`, `contentSignal`). No ungrounded assertions. Test file names follow the `rfc-NNNN-*.test.ts` convention.

## Axis F — Pragmatism

**F-1 (WARN): Duplicated `agentBlock` reading pattern.** The pattern `(manifest as unknown as Record<string, unknown>).agent as { enabled?: boolean } | undefined` appears in both `packages/werkstatt-site/src/codegen/app-boilerplate.ts:341-342` and `packages/werkstatt-site/src/checks/public-surface/security.ts:344-345`. The codebase already has `readAgentBlock` in `packages/werkstatt-site/src/checks/agent/agent-shared.ts` that does exactly this. However, importing from `checks/agent/` into `codegen/` would create a cross-module dependency that may not be desirable. Consider whether a shared helper in a more neutral location (e.g. `share/`) would reduce the duplication, or accept it as two independent reads of the same manifest field.

## Axis G — Blind spots

No issues. The `Content-Signal` directive is a single line — zero performance impact. The 5 Link headers add ~400 bytes to response headers — within HTTP/2 limits (noted in RFC risks section). Edge cases: `agent.enabled: false` correctly omits both Link headers and HDR-07 validation. Empty `contentSignal` array correctly omits the directive. No security/privacy concerns — no user data touched.

## Spec compliance

| Requirement from RFC-0784 | Status | Evidence |
| --- | --- | --- |
| `RobotsPolicy.contentSignal?: string[]` | Done | `robots.ts:32-33` |
| `buildRobotsTxt` emits `Content-Signal:` when present | Done | `robots.ts:43-47` |
| `robots.generate` passes `contentSignal` (or default) | Done | `robots.ts:72-78` |
| `_headers.template` has `{{AGENT_LINK_HEADERS}}` token | Done | `_headers.template:11` |
| `public.infrastructure.generate` resolves token by `agent.enabled` | Done | `app-boilerplate.ts:339-352` |
| `headers.security.validate` HDR-07 rule | Done | `security.ts:343-358` |
| `robots.validate` PUBTXT-CS rule | Done | `robots.ts:175-184` |
| HDR-07 silent when `agent.enabled: false` | Done | `security.ts:346-347` |
| Existing HDR-01..04 unchanged | Done | `security.ts:231-340` |
| Existing robots.validate rules unchanged | Done | `robots.ts:159-170` |
| `rfc.validate` passes | Done | exitCode: 0 |
| isitagentready.com post-deploy | Pending | Requires deploy — deferred by operator decision |

## Questions for the author

1. Should the default `contentSignal` array be extracted to a named constant to avoid the duplication (A-1)?
2. Is the duplicated `agentBlock` reading pattern acceptable, or should a shared helper be extracted (F-1)?
