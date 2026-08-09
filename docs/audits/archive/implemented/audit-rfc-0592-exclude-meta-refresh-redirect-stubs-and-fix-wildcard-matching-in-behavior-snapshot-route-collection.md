---
rfcId: RFC-0592
auditId: AUDIT-RFC-0592-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0592

## Verdict: Needs revision

RFC-0592 proposes two correct fixes (meta-refresh stub exclusion and wildcard root matching), but conflicts with the simultaneously drafted RFC-0595 which addresses the same problem with a different approach (marking redirect routes with `contentHash: null` instead of excluding them). The RFC also doesn't consider the simplest alternative — importing `isHtmlRedirectPage` from its current location without moving it — and misses an existing duplicate `isHtmlRedirectPage` in `site-kernel-checks` with different behavior.

## Mechanical validation (rfc.validate)

Pass — no RFC-0592-specific violations.

## Axis A — Structural completeness

No issues. All required sections are present with real content. Decision is in present tense. CLI surface shows exact command invocations. TypeScript contracts are minimal. File system responsibilities table names concrete paths. Acceptance criteria are checkable and sufficient. Implementation notes are explicit behavioral rules.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-48, DNA-49]` — both are real invariants in `docs/architecture-dna.md:207,211`. The RFC body explains how excluding redirect stubs ensures snapshots accurately represent the deployable surface (DNA-48) and prevents false-negative health checks (DNA-49). `related[]` includes RFC-0588 and RFC-0379, both directly relevant.

## Axis C — Ecosystem fit

- **Missing `related` entry for RFC-0595**: RFC-0595 (draft, same date) proposes marking redirect routes with `contentHash: null` + `redirectTarget` instead of excluding them. RFC-0592 does not mention RFC-0595 in `related[]`. These RFCs address the same problem with conflicting approaches and must cross-reference each other.

- **`packagesImpacted` is incomplete**: `packages/os/site-kernel-checks/src/sitemap-images.ts:32` imports `isHtmlRedirectPage` from `@warpgogol/share/semantic`. If the function is moved from `semantic/image-sitemap` to `redirects`, the semantic barrel re-export changes, and `@warpgogol/site-kernel-checks` is impacted. It should be listed in `packagesImpacted` or the RFC should clarify that the re-export keeps the existing import path working.

- **AGENTS.md update not mentioned**: `packages/os/site-kernel-handoff/AGENTS.md` has a line about `collectRoutes` and RFC-0588 redirect exclusion. The RFC should note that this AGENTS.md section needs updating to mention RFC-0592.

## Axis D — Forward-only compliance

- **Backward-compatible re-export**: The RFC proposes re-exporting `isHtmlRedirectPage` from `@warpgogol/share/semantic/image-sitemap` after moving it to `@warpgogol/share/redirects`. In a forward-only ecosystem, the preferred approach is to update all consumers in the same wave and remove the old export. The only external consumer is `packages/os/site-kernel-checks/src/sitemap-images.ts:32` (importing from `@warpgogol/share/semantic`). The RFC should either: (a) update that consumer to import from `@warpgogol/share/redirects` and remove the re-export, or (b) explicitly justify why the re-export is a permanent design choice, not a compatibility shim.

## Axis E — Agent-facing policy

No issues. Status gate is correct — implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." References RFC-0224 (accepted→implemented) and RFC-0334 (supersede escalation) are correct.

## Axis F — Pragmatism

- **Simplest alternative not considered**: The RFC's alternatives section (§4) considers moving `isHtmlRedirectPage` to a new `@warpgogol/share/html` module (rejected as over-engineering) but does not consider the simplest option: **import `isHtmlRedirectPage` from its current location** (`@warpgogol/share/semantic` or `@warpgogol/share/semantic/image-sitemap`) in `behavior-snapshot-commands.ts` without moving it at all. The function is already publicly exported and accessible. The move adds complexity (re-export, updating module contracts, breaking risk) without clear benefit — the function works where it is.

- **Duplicate `isHtmlRedirectPage` not mentioned**: There is a _different_ `isHtmlRedirectPage` in `packages/os/site-kernel-checks/src/audit/validators/helpers.ts:73` that checks both `<meta http-equiv="refresh">` AND `window.location.replace|href`, while the share version deliberately excludes `window.location` (per its JSDoc comment). The RFC doesn't mention this duplicate. Moving the share version to `@warpgogol/share/redirects` creates a third location for redirect-detection logic, increasing confusion about which is canonical.

## Axis G — Blind spots

- **Existing test will break**: `behavior-snapshot.test.ts:32` currently asserts `expect(isRouteRedirected("/de", rules)).toBe(false)`. The RFC changes this behavior so `/de` matches `/de/*`. The RFC's file system responsibilities table mentions "New tests for meta-refresh exclusion and wildcard root matching" but does not mention **updating the existing test** that asserts the old behavior. The acceptance criteria should include updating the existing test.

- **Interaction with RFC-0595 not analyzed**: If RFC-0595 is also implemented, the two RFCs interact: RFC-0592 excludes redirect stubs from the snapshot, while RFC-0595 marks them with `contentHash: null`. If both are implemented, the exclusion (RFC-0592) takes precedence and RFC-0595's marking logic never sees the stubs. The RFCs need to be reconciled — either one supersedes the other, or they are merged.

## Questions for the author

1. Should RFC-0592 be reconciled with RFC-0595? RFC-0595 marks redirect routes with `contentHash: null` + `redirectTarget` and verifies the redirect itself via health checks (HTTP 307/308 + Location header). RFC-0592 excludes them entirely, meaning broken redirects will never be detected. Which approach should be canonical?

2. Why move `isHtmlRedirectPage` to `@warpgogol/share/redirects` instead of importing it from its current location (`@warpgogol/share/semantic`) in `behavior-snapshot-commands.ts`? The move adds a re-export and touches multiple module contracts. Is there a consumer that benefits from the new location?

3. Should the duplicate `isHtmlRedirectPage` in `packages/os/site-kernel-checks/src/audit/validators/helpers.ts:73` (which has different behavior — includes `window.location` detection) be consolidated as part of this RFC, or should it remain separate?
