---
rfcId: RFC-0784
auditId: AUDIT-RFC-0784-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0784

## Verdict: Needs revision

The RFC is well-structured and its core decision (additive output in two existing generators) is sound. Three findings need resolution before implementation: no build-time validation for the new output, an unresolved `agent.enabled: false` implementation decision, and a Compass sync gap.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

No issues. Decision is present-tense and single. CLI surface shows exact invocations. TypeScript contracts are minimal. File system table names concrete paths. Output format documents both `_headers` and `robots.txt` content. Failure modes section correctly states "no new failure modes" (additive output). Rollout covers existing apps, new apps, and `agent.enabled: false`. Alternatives section has 3 real alternatives with rejection reasons. Risks include header size, spec instability, rel value status, and agent misinterpretation. Acceptance criteria are checkable (10 items, mix of unit-testable and post-deploy external checks). Implementation notes have explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-34]` is a valid DNA entry. The RFC body explains how Link headers extend `/.well-known/` discovery: "Link headers are the HTTP-level analogue of `.well-known/` discovery, providing an alternative discovery path for agents that inspect headers before fetching well-known files." DNA-34 is reclassified to feature (RFC-0161), but the entry still exists in `docs/architecture-dna.md` and satisfies the `^DNA-\d+$` validation rule. `related[]` references (DNA-34, RFC-0052, RFC-0315, RFC-0286, RFC-0783) are all relevant and non-decorative.

## Axis C — Ecosystem fit

- **C-1: Compass sync not addressed.** The RFC changes generated output (`_headers`, `robots.txt`) but does not mention whether any `docs/*.xml` Compass files need synchronization. While the changes are additive to existing generators (no new commands, no new contracts), the RFC should explicitly state "No Compass XML changes required" or list affected files. Root AGENTS.md Compass document duties require identifying synchronization needs for changes to shared package contracts.

No other issues. Package boundaries are correct (all changes in `packages/werkstatt-site`). Pipeline placement is correct (both commands already run in `build.prepare`). Command lifecycle buckets are internally consistent (`commands.changed` lists two existing registered commands — confirmed via codebase grep). Cosmic naming is N/A (no manifest or component changes).

## Axis D — Forward-only compliance

No issues. No compatibility shims, bridges, or dual-paths. The `contentSignal` field is a new optional field, not a compatibility layer. `Link:` headers are additive to the `_headers` template. No legacy code paths maintained behind a flag.

## Axis E — Agent-facing policy

No issues. No self-authorizing language. Implementation notes reference RFC-0224 (accepted→implemented transition), RFC-0330 (verification evidence), RFC-0334 (supersede escalation). No content authoring claimed. No cookies or persistence. No NEEDS CLARIFICATION markers found.

## Axis F — Pragmatism

No issues. No new commands — both changes are internal to existing generators. TypeScript contracts are minimal (one optional field on `RobotsPolicy`). Existing patterns are extended, not duplicated. `packagesImpacted` lists only `packages/werkstatt-site` (confirmed: all three touched files are in this package). `appsImpacted: []` is correct (no app-specific changes needed — all apps get new output on next `build.prepare`). `nonGoals` are meaningful (RFC-0783, RFC-0785, RFC-0786 all exist and cover the excluded topics).

## Axis G — Blind spots

- **G-1: No build-time validation for new output.** The RFC adds `Link:` headers to `_headers` and `Content-Signal:` to `robots.txt` but does not add validation rules to `headers.security.validate` (HDR-01..04) or `robots.validate` (PUBTXT-*). Acceptance criteria 6 and 7 only require existing rules to "still pass" — they do not require new rules to enforce the new output. If a future template regression removes `Link:` headers, no validator catches it. The only enforcement is external (isitagentready.com, acceptance criteria 8–9). The RFC should either add validation rules (e.g. `HDR-05: Link header present`) or explicitly state that enforcement is deferred to external checks with a rationale.

- **G-2: Unresolved `agent.enabled: false` implementation decision.** The Rollout section presents two options for `agent.enabled: false` apps: (a) "Link headers pointing to `/.well-known/api-catalog` and `/.well-known/mcp/server-card.json` are still emitted — the endpoints may not exist, but the `Link:` header is a hint, not a guarantee" or (b) "Alternatively, `public.infrastructure.generate` can conditionally omit agent-surface Link headers when `agent.enabled: false` — this is an implementation decision." The RFC does not pick one. Since the `_headers.template` is static (no `{{TOKEN}}` for `agent.enabled`), option (b) would require adding conditional token substitution logic to the generator. The RFC should resolve this before implementation.

- **G-3: Default `contentSignal` value logic unclear.** The RFC says "The default `contentSignal` value is `["text/html", "text/markdown", "application/ld+json", "text/plain"]` when the site has markdown twins" and "robots.generate passes `contentSignal` from `system.md` robots block (or default)." But the TypeScript contract shows `contentSignal?: string[]` on `RobotsPolicy` — if absent, `buildRobotsTxt()` omits the line. The default-setting logic is described in prose but not in the contract. It's unclear whether the default is set in `buildRobotsTxt()` (as a fallback) or in `robots.generate` (before calling `buildRobotsTxt()`). The implementation notes say "If `Content-Signal:` is absent from `system.md` robots block, `buildRobotsTxt()` omits the line silently" — this contradicts the default value idea. If there's a default, the line is never omitted (for sites with markdown twins). The RFC should clarify: does `robots.generate` always pass a default, or does `buildRobotsTxt()` have fallback logic?

## Questions for the author

1. Should `headers.security.validate` and `robots.validate` gain rules to enforce the presence of `Link:` headers and `Content-Signal:` directive? Or is external verification (isitagentready.com) the sole enforcement mechanism? If the latter, should the RFC state this explicitly with a rationale (e.g. "external audit is the enforcement layer for agent discovery signals")?

2. When `agent.enabled: false`, should the `Link:` headers for `/.well-known/api-catalog` and `/.well-known/mcp/server-card.json` be omitted from `_headers` (requires conditional template logic), or always emitted (producing 404s when followed)? The RFC presents both options as an "implementation decision" — which one is chosen?

3. Where is the default `contentSignal` value set — in `robots.generate` (caller passes default when `system.md` doesn't specify it) or in `buildRobotsTxt()` (function has fallback logic)? The current prose is contradictory: the Failure modes section says "buildRobotsTxt() omits the line silently" when absent, but the same section says there's a default value "when the site has markdown twins."
