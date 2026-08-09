---
rfcId: RFC-0595
auditId: AUDIT-RFC-0595-01
date: 2026-07-30
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0595

## Verdict: Needs revision

RFC-0595 proposes marking redirect routes with `contentHash: null` + `redirectTarget` in the behavior snapshot, but conflicts with the concurrently drafted RFC-0592 which proposes _excluding_ meta-refresh redirect stubs entirely. The RFC also claims `RouteFact` lives in `@warpgogol/ontology` when it is actually a local interface in two `site-kernel-handoff` files, and misidentifies the `behavior.snapshot.generate` source file path. These issues must be resolved before implementation.

## Mechanical validation (rfc.validate)

Pass with 1 warning:

- **V-30 (warning)**: `@warpgogol/ontology` is in `packagesImpacted` but `breaksC` is not `true`. If this RFC modifies `packages/ontology/src/external-surfaces/`, declare `breaksC: true` (RFC-0480). The RFC does not modify external surfaces — it modifies `operations/leitstand.ts` — so the warning may be a false positive. However, the RFC should either clarify that `breaksC` is not needed or remove `@warpgogol/ontology` from `packagesImpacted` if no ontology file is actually changed (see Axis C finding).

## Axis A — Structural completeness

1. **Decision is a single decision in present tense** — pass. "Detect redirect HTML pages and mark them with `contentHash: null` and `redirectTarget`" is clear.

2. **CLI surface** — pass. Shows exact command invocations with flags.

3. **TypeScript contracts** — minor issue. The `RouteFact` interface in the RFC (line 121–127) shows `contentHash: string | null` and `redirectTarget?: string`, but the actual `RouteFact` in the codebase (`behavior-snapshot-commands.ts:34–39`) has `contentHash?: string` (optional, not nullable). The RFC should show the delta from the current shape, not a greenfield interface.

4. **File system responsibilities** — two findings:
   - The RFC lists `packages/os/site-kernel-checks/src/behavior-snapshot-generate.ts` (line 154). The actual file is `packages/os/site-kernel-checks/src/behavior-snapshot.ts` — there is no `behavior-snapshot-generate.ts` file.
   - The RFC lists `packages/ontology/src/operations/leitstand.ts` as the home of `RouteFact` (line 155). `RouteFact` does not exist in `leitstand.ts` — it is a local interface in `behavior-snapshot-commands.ts:34` and `cloudflare-workers.ts:86`. The ontology `leitstand.ts` has `HealthCheck`, `PropagationResult`, `DeploymentConfig`, etc., but no `RouteFact`.

5. **Failure modes** — pass. Four failure modes documented with clear behavior.

6. **Rollout** — pass. Default behavior, existing snapshots, backward compatibility, and pipeline integration are all addressed.

7. **Alternatives considered** — pass. Three real alternatives with rejection reasons.

8. **Risks** — pass. Four risks with mitigations, including agent confusion and false negatives.

9. **Acceptance criteria** — see Axis B and C findings. Criterion "RouteFact schema in @warpgogol/ontology updated" is based on a false premise — `RouteFact` is not in ontology.

10. **Implementation notes** — pass. Explicit behavioral rules, including prohibition on manual `contentHash: null` edits.

## Axis B — DNA alignment

1. **DNA-49 (Fleet propagation)** — pass. The RFC explains how it fixes false positives in per-route content verification for redirect routes. The `satisfies: [DNA-49]` entry is justified.

2. **DNA-53 (Semantic fingerprint governance)** — listed in `related[]` but not in `satisfies[]`. The RFC body says "Redirect routes are exempted from content hashing — they are verified by redirect status + target, not content." This is consistent with DNA-53 — it uses `hashHtml` for content routes and exempts redirects. No conflict.

3. **No new DNA invariant established** — the RFC does not claim to establish a new DNA invariant. Correct.

## Axis C — Ecosystem fit

1. **Critical: Conflict with RFC-0592**. RFC-0592 (draft, created 2026-07-29) proposes excluding meta-refresh redirect stubs from the behavior snapshot entirely via `isHtmlRedirectPage`. RFC-0595 (draft, created 2026-07-30) proposes marking them with `contentHash: null` + `redirectTarget` and keeping them in the snapshot. These are **conflicting approaches to the same problem**:
   - RFC-0592: `if (isHtmlRedirectPage(html)) continue;` — exclude from snapshot
   - RFC-0595: `if (isRedirectPage(html)) { contentHash = null; redirectTarget = extractRedirectTarget(html); }` — keep in snapshot with null hash

   The RFCs do not reference each other. RFC-0595 should either:
   - Supersede RFC-0592 (if the marking approach is preferred over exclusion), or
   - Be superseded by RFC-0592 (if exclusion is preferred), or
   - Merge with RFC-0592 into a single RFC that decides one approach.

   The marking approach (RFC-0595) is arguably richer — it preserves route visibility in the snapshot and enables redirect-target verification. The exclusion approach (RFC-0592) is simpler — fewer routes, no schema change. The RFC must justify its choice over the other and cross-reference RFC-0592.

2. **`RouteFact` location wrong** — the RFC claims `RouteFact` is in `packages/ontology/src/operations/leitstand.ts`. It is not. `RouteFact` is a local interface in:
   - `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts:34–39`
   - `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts:86–89`

   If the RFC intends to move `RouteFact` to ontology for canonical typing, it should say so explicitly. Currently `packagesImpacted` lists `@warpgogol/ontology` but the actual change is in `site-kernel-handoff` local types. Either:
   - Move `RouteFact` to `@warpgogol/ontology/operations` and update both consumers (justifies `packagesImpacted`), or
   - Keep `RouteFact` local and remove `@warpgogol/ontology` from `packagesImpacted`.

3. **`behavior.snapshot.generate` is a check command, not a handoff command** — the RFC lists `behavior.snapshot.generate` in `commands.changed`. This command is registered in `site-kernel-checks/src/command-tables/build-infra.ts:101` and its implementation is in `site-kernel-checks/src/behavior-snapshot.ts`. It uses a completely different type (`RouteBehavior`, not `RouteFact`) and a different snapshot format (YAML with meta/routes/headers/redirects, not the JSON wrapper with contentHash). The RFC's acceptance criterion "behavior.snapshot.generate applies the same redirect detection" needs to clarify what "same" means across two different snapshot formats that serve different purposes (RFC-0269 golden snapshot vs RFC-0357 release snapshot).

4. **`packagesImpacted` missing `@warpgogol/site-kernel-checks`** — if `behavior.snapshot.generate` is in `commands.changed`, then `@warpgogol/site-kernel-checks` should be in `packagesImpacted`. It is currently listed only as `@warpgogol/site-kernel-handoff` and `@warpgogol/ontology`.

5. **Package boundaries** — pass. No cross-boundary imports proposed.

## Axis D — Forward-only compliance

1. **Backward compatibility section contradicts forward-only discipline** — the Rollout section (line 186) says: "the health check handles both old format (non-null contentHash for redirect routes) and new format (contentHash: null + redirectTarget). Old format routes are compared as before." This is a dual-path: the health check supports both old and new snapshot formats simultaneously. The forward-only discipline requires that existing snapshots be regenerated, not that the health check support both formats indefinitely. The RFC should state that existing snapshots must be regenerated via `behavior.snapshot.generate` / `behavior.snapshot.capture` and that the health check only supports the new format.

2. **No compatibility shim** — the `contentHash: string | null` change is a schema widening, not a shim. This is acceptable if consumers are updated in the same wave. But the "backward compatibility" language should be removed in favor of "regenerate existing snapshots."

## Axis E — Agent-facing policy

1. **Status gate** — pass. The RFC is `draft` and does not contain self-authorizing language. Implementation notes correctly state "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)."

2. **Implementation notes reference correct governance rules** — pass. References RFC-0224 (accepted→implemented), RFC-0334 (supersede escalation).

3. **Anti-fabrication** — pass. No content authoring claims.

4. **Storage policy** — pass. No persistence changes.

## Axis F — Pragmatism

1. **Minimal command surface** — pass. No new commands. Two changed commands.

2. **Lean contracts** — the `redirectTarget` field is optional and only present when `contentHash` is `null`. This is minimal. The `isRedirectPage` and `extractRedirectTarget` helper signatures are clean.

3. **Existing patterns** — the RFC does not mention that `isHtmlRedirectPage` already exists in `@warpgogol/share/semantic/image-sitemap.ts:47` and detects exactly the same condition (`<meta http-equiv="refresh">`). RFC-0592 proposes moving it to `@warpgogol/share/redirects`. RFC-0595 proposes new `isRedirectPage` and `extractRedirectTarget` functions without referencing the existing one. The RFC should reuse `isHtmlRedirectPage` rather than creating a parallel detector, and should reference RFC-0592's move.

4. **Scope discipline** — `appsImpacted: []` is correct (no app changes). `packagesImpacted` is inaccurate (see Axis C).

## Axis G — Blind spots

1. **Performance** — pass. Redirect detection is a regex test per HTML file. Negligible cost.

2. **False positives** — the RFC addresses this in Failure modes (line 177–179): non-redirect pages with meta-refresh for auto-refresh would be marked as redirects. The RFC correctly identifies this as acceptable for static marketing sites.

3. **Edge cases** — the RFC considers the case where `redirectTarget` cannot be parsed (`"unknown"`). But it does not consider:
   - **Multi-hop redirects**: `/de` → `/de/` → `/`. The meta-refresh stub redirects to `/de/` which itself redirects to `/`. The `redirectTarget` would be `/de/`, not `/`. The health check would verify 307/308 to `/de/`, not `/`. Is this correct?
   - **Redirect to external URL**: meta-refresh could redirect to an external URL. The health check's `Location` header check would need to handle absolute URLs vs relative paths.

4. **Migration path** — the RFC says existing snapshots will continue to work (old format). But the forward-only discipline (Axis D) says this dual-path should not exist. The RFC should state that the next `release.prepare` regenerates the snapshot with the new format, and old snapshots are not supported.

5. **Security/privacy** — pass. No user data or PII involved.

## Questions for the author

1. **RFC-0592 conflict**: RFC-0592 (draft) proposes excluding meta-refresh redirect stubs from the snapshot entirely. RFC-0595 proposes marking them with `contentHash: null` + `redirectTarget`. Which approach should prevail? Should one RFC supersede the other, or should they merge? The marking approach is richer (enables redirect-target verification) but the exclusion approach is simpler (no schema change). Justify the choice.

2. **`RouteFact` canonical location**: `RouteFact` is currently a local interface in `behavior-snapshot-commands.ts` and `cloudflare-workers.ts`, not in `@warpgogol/ontology`. Should this RFC move it to ontology for canonical typing (justifying `packagesImpacted`), or keep it local and remove `@warpgogol/ontology` from `packagesImpacted`?

3. **`behavior.snapshot.generate` scope**: This command uses `RouteBehavior` (not `RouteFact`) and produces a YAML snapshot (not the JSON wrapper). What does "applies the same redirect detection" mean for this different format? Should `RouteBehavior` gain a `redirectTarget` field too, or should the golden snapshot exclude redirect stubs (as RFC-0592 proposes)?
