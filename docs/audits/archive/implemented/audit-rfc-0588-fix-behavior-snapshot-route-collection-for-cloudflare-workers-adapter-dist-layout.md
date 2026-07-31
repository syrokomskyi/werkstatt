---
rfcId: RFC-0588
auditId: AUDIT-RFC-0588-01
date: 2026-07-29
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0588

## Verdict: Needs revision

Two of the three bugs described in this RFC are already fixed in commit `89085ed` ("fix(leitstand): fix preflight checks and behavior snapshot for Cloudflare Workers deploy"). The RFC should be scoped down to bug 3 only (redirect exclusion in `collectRoutes`), or restructured to acknowledge the already-applied fixes. Additionally, `parseRedirectRules` is not exported from `site-kernel-checks` and has a different type shape than the RFC proposes, creating a reuse gap.

## Mechanical validation (rfc.validate)

Pass — `rfc.validate RFC-0588 --json` reports zero violations.

## Axis A — Structural completeness

- **Bugs 1 and 2 are already fixed.** `release.prepare` already detects `dist/client/` at `@/packages/os/site-kernel-handoff/src/release/release-commands.ts:263-265` (`clientDistDir = existsSync(path.join(distDest, "client")) ? ... : distDest`). `readBehaviorSnapshot` already unwraps `behaviorSnapshot` at `@/packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts:101-102` (`parsed.behaviorSnapshot ?? parsed`). The RFC's Problem section, Design section, and acceptance criteria items 1–2 describe these as unfixed bugs. The RFC must acknowledge the existing implementation.

- **`commands.changed` lists `release.prepare` but the change is already applied.** The `release.prepare` entry should be removed or annotated as "already implemented in commit `89085ed`". Only `behavior.snapshot.capture` needs the redirect exclusion change.

- **Acceptance criteria items 1 and 2 are already satisfiable.** They reference `<line>` placeholders but the evidence lines already exist (`release-commands.ts:263-265`, `cloudflare-workers.ts:101-102`). These criteria should either be marked as already met or removed.

- **`resolveHtmlDir` is described as a new exported helper** but the implementation is already inline in `release-commands.ts:263-265` as an unnamed ternary. The RFC's TypeScript contracts section shows it as a standalone function, but the code doesn't export it. The implementation note says it "MUST be exported from `release-commands.ts` or moved to `@warpgogol/site-kernel-astro`" — this is unnecessary unless another consumer needs it.

## Axis B — DNA alignment

No issues. DNA-48 (Release discipline) and DNA-49 (Fleet propagation) are correctly referenced in `satisfies[]`. The RFC body explains how each bug fix upholds these invariants: accurate route paths in behavior snapshots (DNA-48) and correct health verification probes (DNA-49).

## Axis C — Ecosystem fit

- **`packagesImpacted` is incomplete.** The RFC lists only `@warpgogol/site-kernel-handoff`, but the implementation notes propose reusing `parseRedirectRules` from `@warpgogol/site-kernel-checks/src/public-surface/managed-public.ts`. If the function is exported or extracted, `@warpgogol/site-kernel-checks` (or `@warpgogol/share` if extracted there) must be listed in `packagesImpacted`.

- **`parseRedirectRules` is not exported.** The function at `@/packages/os/site-kernel-checks/src/public-surface/managed-public.ts:54` is module-private (no `export` keyword). The RFC says "reuse from `site-kernel-checks`" but this requires either exporting it or extracting it to a shared package. The RFC should specify which approach will be taken.

- **Type shape mismatch.** The existing `parseRedirectRules` returns `RedirectRule` with `to: string | undefined` and a `line: string` field. The RFC's proposed `RedirectRule` interface has `to: string` (required) and no `line` field. Reuse requires reconciling these types. The RFC's TypeScript contracts section should match the existing type or explain the migration.

## Axis D — Forward-only compliance

No issues for the remaining unfixed work (bug 3). The `readBehaviorSnapshot` dual-path (`raw.behaviorSnapshot ?? raw`) is already in the code and handles both wrapped and unwrapped snapshot formats. This is not a backward compatibility shim — it's a defensive reader for two valid formats. No forward-only violation.

## Axis E — Agent-facing policy

- **RFC status vs. reality gap.** The RFC is in `draft` status but bugs 1 and 2 are already implemented in commit `89085ed`. This creates ambiguity: an agent reading the RFC might re-implement already-applied fixes or create duplicate code. The RFC should either: (a) acknowledge the existing implementation in the Context/Problem sections and scope the Decision to bug 3 only, or (b) be structured to formalize the already-applied changes (marking criteria 1–2 as already met with evidence).

- No self-authorizing language found. Implementation notes correctly reference RFC-0224, RFC-0330, RFC-0334.

## Axis F — Pragmatism

- **RFC should be scoped down.** Two of three bugs are already fixed. The RFC's value is now limited to bug 3 (redirect exclusion in `collectRoutes`). Consider splitting the already-fixed bugs into a separate "already implemented" section or removing them entirely.

- **`resolveHtmlDir` export is unnecessary.** The inline ternary at `release-commands.ts:263-265` works correctly. Exporting it as a standalone function adds surface area without a concrete consumer. The implementation note should relax the "MUST be exported" requirement.

## Axis G — Blind spots

- **Pattern matching for redirect rules.** The RFC's `isRouteRedirected(routePath, rules)` function needs to match route paths against redirect source patterns (e.g., `/de/*` should match `/de/agb`). The existing `parseRedirectRules` in `managed-public.ts` does simple whitespace splitting and does NOT implement glob-to-regex conversion. The RFC does not specify how `*` and `:splat` patterns are converted to matchers. This is the core logic of bug 3 and needs more detail.

- **410 Gone redirects not considered.** RFC-0589 (related, also in draft) handles 410 Gone tombstones in middleware. Routes that return 410 are also prerendered and would mismatch in health checks. The RFC only mentions 301/308 redirects. The `isRouteRedirected` function should also exclude 410-redirected routes, or the RFC should explicitly state that 410 handling is deferred to RFC-0589.

- **`_redirects` file location ambiguity.** The RFC's file system responsibilities table lists `releases/<id>/dist/client/_redirects`, but `collectRoutes` receives `distDir` (already resolved to `dist/client/`). The code reads `_redirects` at `path.join(distDir, "_redirects")` (line 128). This is consistent but the RFC should clarify that `_redirects` is read from the same `distDir` passed to `collectRoutes`, not from a hardcoded release path.

## Questions for the author

1. Bugs 1 and 2 are already fixed in commit `89085ed`. Should this RFC be scoped down to bug 3 (redirect exclusion) only, or should it formalize the already-applied fixes with evidence?

2. `parseRedirectRules` in `managed-public.ts` is module-private and has a different `RedirectRule` type shape (`to: string | undefined`, includes `line` field). Will you export it as-is (and adapt the consumer), extract a shared helper to `@warpgogol/share`, or duplicate the logic? Which package will own the shared function?

3. How will `isRouteRedirected` convert glob patterns (`/de/*`, `:splat`) to route matchers? The existing `parseRedirectRules` does not implement pattern matching — only parsing. What about 410 Gone redirects (RFC-0589)?
