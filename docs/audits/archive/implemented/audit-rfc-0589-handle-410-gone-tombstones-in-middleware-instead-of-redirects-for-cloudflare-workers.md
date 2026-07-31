---
rfcId: RFC-0589
auditId: AUDIT-RFC-0589-01
date: 2026-07-29
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0589

## Verdict: Needs revision

The RFC correctly identifies a real deployment blocker (410 in `_redirects` is unsupported by Cloudflare Workers) and the proposed direction (middleware-based 410 handling) is architecturally sound. However, the RFC has critical gaps in middleware integration (how the tombstone middleware chains into the existing root middleware), command ownership conflicts (`public.infrastructure.generate` vs `routes.generate`), missing adapter-type resolution for the validator, and an unexplained status code expansion from `[301, 308, 410]` to `[200, 301, 302, 303, 307, 308]`.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **Decision** is clear and present tense: "buildRetiredPageRoutesBlock no longer emits 410 entries." Good.
- **CLI surface** shows exact command invocations. Good.
- **TypeScript contracts** show minimal signatures. However, `buildRetiredTombstoneMiddleware` returns `string` but the comment says "Generate src/middleware/retired-tombstones.ts" — the contract doesn't show how this string is written to a file or wired into a template. The function signature is incomplete for its stated purpose.
- **File system responsibilities** table names concrete paths. However, it omits `packages/os/site-kernel-checks/src/generator-ownership.ts` which must be updated to register the new middleware file in `GENERATOR_OWNERSHIP_MAP`.
- **Output format** documents the `--json` shape for `redirect.map.validate`. Good.
- **Failure modes** covers edge cases. The "non-Cloudflare Workers sites" case is speculative — see Axis F.
- **Rollout** describes default behavior and existing-site migration. Good.
- **Alternatives considered** has 5 real alternatives with rejection reasons. Good.
- **Risks** includes middleware performance, ordering, and validator false positives. Good.
- **Acceptance criteria** are checkable but missing one: no criterion verifies the middleware is chained into the root `src/middleware.ts` (the existing middleware entry point).
- **Implementation notes** are explicit. Good.

## Axis B — DNA alignment

- **DNA-49 (Fleet propagation)**: The RFC `satisfies: [DNA-49]`. DNA-49 is about the Leitstand deploying published releases to targets via adapter plugins. The 410-in-`_redirects` issue blocks `wrangler deploy`, which blocks propagation. The fit is reasonable but indirect — the RFC fixes a build-time generation bug, not a propagation mechanism. A stronger justification would explain that DNA-49's "preflight checks passing" gate cannot pass when `_redirects` contains unsupported status codes.
- `related[]` includes DNA-49, RFC-0149, RFC-0318, RFC-0487, RFC-0509, RFC-0587, RFC-0588. All are relevant.
- **RFC-0487 conflict**: RFC-0487 (implemented) has success signal "redirect.map.validate --app warpgogol-com passes with 410 entries for retired routes." This RFC makes 410 entries FAIL validation. The RFC lists RFC-0487 in `related[]` but does not list it in `amends[]`. This should be an amendment to RFC-0487's success signal contract, or at minimum the RFC should explicitly state it supersedes that success signal.

## Axis C — Ecosystem fit

- **Package boundaries**: Changes are in `site-kernel-codegen` and `site-kernel-checks`. Correct — no app logic in packages.
- **Pipeline placement**: `public.infrastructure.generate` is called during `build.prepare`. The RFC says the middleware file is generated alongside `_headers` and `_redirects`. However, `public.infrastructure.generate` currently only writes to `public/` — it has never written to `src/`. This is a scope expansion for the command. The more natural owner is `routes.generate`, which already owns `src/middleware.ts` and `src/middleware/language-redirect.ts`.
- **Generator ownership**: The new file `src/middleware/retired-tombstones.ts` must be registered in `GENERATOR_OWNERSHIP_MAP` in `packages/os/site-kernel-checks/src/generator-ownership.ts`. The RFC does not mention this.
- **Middleware chaining**: The existing root middleware at `src/middleware.template.ts` (owned by `routes.generate`) chains `languageRedirectMiddleware` and `devNormalize` via `sequence()`. The RFC does not describe how the new tombstone middleware is chained into this existing middleware. `routes.generate` is not listed in `commands.changed`, but `src/middleware.template.ts` must be updated to import and chain the tombstone middleware. This is a missing changed command.
- **Template path inconsistency**: The RFC says the template goes in `packages/os/site-kernel-codegen/src/templates/app-boilerplate/src/middleware/retired-tombstones.template.ts`. The existing language-redirect middleware template is at `packages/os/site-kernel-codegen/src/templates/service/src/middleware/language-redirect.ts.template` — different directory (`service/` vs `app-boilerplate/`) and different naming convention (`*.ts.template` vs `*.template.ts`). The RFC should follow the existing convention or justify the deviation.
- **AGENTS.md updates**: The Risks section says "AGENTS.md should document that 410 is still in the retiredRoutes schema but handled by middleware, not _redirects." The RFC does not list any AGENTS.md in its file system responsibilities or identify which one needs updating.
- **Compass sync**: The RFC does not mention whether any `docs/*.xml` files need synchronization. Since this changes `public.infrastructure.generate` behavior and the redirect validation contract, `docs/verification-plan.xml` may need updating.
- **Command lifecycle**: `commands.changed` lists `public.infrastructure.generate` and `redirect.map.validate`. Missing: `routes.generate` (must update `src/middleware.template.ts` to chain tombstone middleware).

## Axis D — Forward-only compliance

- No compatibility shims or dual-paths proposed. Good.
- The 410 entries are removed from `_redirects` generation — not kept behind a flag. Good.
- The `retiredRoutes` schema is unchanged — 410 is still valid in the manifest. Good.
- No backward compatibility layer for existing releases with 410 in `_redirects`. The RFC says "re-run public.infrastructure.generate and release.prepare." This is forward-only. Good.

## Axis E — Agent-facing policy

- **Status gate**: The RFC is `draft` and implementation notes say "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)." Good.
- **Implementation notes** reference RFC-0224 (accepted→implemented transition), RFC-0334 (supersede escalation), RFC-0330 (verification evidence). Good.
- **Anti-fabrication**: No content authoring claims. Good.
- **Storage policy**: No persistence changes. Good.

## Axis F — Pragmatism

- **Validator status code expansion**: The RFC's `VALID_REDIRECT_STATUSES = [200, 301, 302, 303, 307, 308]` is a significant expansion from the current `[301, 308, 410]`. This adds 200, 302, 303, 307. The RFC does not discuss this expansion — it focuses only on removing 410. Adding 200 (rewrite/proxy) and 302/303/307 should be justified or removed from scope. The current validator only allows 301 and 308 — expanding to 6 codes is scope creep.
- **Non-Cloudflare Workers adapter check**: The RFC says "The validator checks the system's adapter type before rejecting 410" and "410 may still be valid for other platforms." The only adapters in the fleet are `cloudflare-workers` and `null` (testing). No other platform exists. This is speculative generality for a platform that doesn't exist. Either drop the adapter check (reject 410 unconditionally) or justify why a future platform might support 410 in `_redirects`.
- **Adapter type resolution**: `SystemManifest` has no `adapter` or `deployment` field. The deployment adapter is in `systems/registry.yaml` under `deployment.adapter`. The validator (`runRedirectMapValidate`) would need to load the registry to access this. The RFC does not describe how the validator resolves the adapter type. This is an operational gap.
- **`appsImpacted` is empty**: The first real-world propagation was `warpgogol-com-r000001`. `warpgogol-com` has 410 entries in its `_redirects` and will be impacted. `appsImpacted` should list `warpgogol-com`.
- **`fixHint` update**: The current REDIR-03 fixHint says "Use 301, 308, or 410 for public URL retirement." After this RFC, 410 is invalid. The RFC's output format example shows the violation message but does not mention updating the fixHint text.

## Axis G — Blind spots

- **Middleware ordering**: The RFC says "the generated middleware is ordered first" but does not describe how this ordering is achieved. The existing `src/middleware.template.ts` chains `languageRedirectMiddleware` first, then `devNormalize`. The tombstone middleware should run before or after language redirect? If a retired route like `/widerruf/` is language-prefixed (`/de/widerruf/`), the language redirect might fire first. The RFC should specify the ordering relative to the language redirect.
- **Middleware performance**: The RFC mentions Set-based lookup for exact matches. Good. But wildcard routes (`/<slug>/*`) require pattern matching — the RFC should specify the matching strategy (regex, prefix match, etc.).
- **Empty state**: "buildRetiredTombstoneMiddleware with no 410 routes returns empty string. No middleware file is generated." Good. But if no middleware file is generated, the root `src/middleware.ts` must not import it — otherwise the build fails. The RFC should describe the conditional import strategy.
- **Concurrent execution**: Not addressed. Two `public.infrastructure.generate` runs in parallel could race on the middleware file. This is low-risk since the command is typically run in a build pipeline.
- **Existing releases**: The RFC says "Releases with 410 in _redirects will fail redirect.map.validate after implementation." This is correct but could break CI for existing release branches. The RFC should mention whether existing releases need re-validation or are grandfathered.

## Questions for the author

1. How does the tombstone middleware integrate into the existing `src/middleware.ts` chain? Which command updates `src/middleware.template.ts` to import and `sequence()` the tombstone middleware? Should `routes.generate` be listed in `commands.changed`?

2. Where does `redirect.map.validate` obtain the system's deployment adapter type? `SystemManifest` has no adapter field — the adapter is in `systems/registry.yaml`. Does the validator need to load the registry, or should the adapter type be propagated to the manifest?

3. Should `public.infrastructure.generate` own the `src/middleware/retired-tombstones.ts` file, or should `routes.generate` (which already owns `src/middleware.ts` and `src/middleware/language-redirect.ts`) be the owner? The current scope of `public.infrastructure.generate` is `public/` only — generating `src/` files is a scope expansion.

4. The `VALID_REDIRECT_STATUSES` expands from `[301, 308, 410]` to `[200, 301, 302, 303, 307, 308]`. Is this expansion in scope for this RFC, or should it be limited to removing 410? Adding 200 (rewrite) and 302/303/307 is a separate concern.

5. Should this RFC amend RFC-0487, whose success signal "redirect.map.validate passes with 410 entries" is directly contradicted by this RFC?
