---
rfcId: RFC-0899
auditId: AUDIT-RFC-0899-01
date: 2026-08-21
auditor:
  skill: fo-idea-audit
  model: cascade
verdict: needs-revision
---

# Audit: RFC-0899 — Workshop-level access protection for dev and alt subdomains

## Verdict: Needs revision

The RFC addresses a real problem (unprotected dev/alt subdomains) with a sound high-level approach (runtime middleware + CLI commands), but contains several ecosystem-fit errors (non-existent schema fields, inconsistent flag naming, missing tombstone middleware in chain description), a critical blind spot (Worker secrets cannot be retrieved for `status`), and middleware pseudocode bugs (auth check after `next()`, missing `X-Robots-Tag` on 401, timing-unsafe comparison). These must be fixed before implementation.

## Mechanical validation (rfc.validate)

**Pass** — `rfc.validate --id RFC-0899` returns 0 violations.

## Axis A — Structural completeness

- **A-1 (FAIL):** Missing "Output format" section. The three commands have TypeScript contracts but no documented `--json` output shape. Existing leitstand commands return structured `KernelCommandResult<T>` — the RFC should show the JSON shape for each command's output.
- **A-2 (FAIL):** Missing "Failure modes" section. No exit codes, warn-vs-fail behavior, or error taxonomy documented. What happens when `wrangler secret put` fails for one channel but succeeds for the other? Is the command atomic or best-effort?
- **A-3 (FAIL):** Acceptance criteria don't mention `docs/*.xml` synchronization or `AGENTS.md` updates. Per repository rules, `technology.xml` and `verification-plan.xml` should be updated when new commands are added.

## Axis B — DNA alignment

- **B-1 (PASS):** DNA-73 satisfaction is correct. Runtime middleware preserves the single-artifact invariant — the same build is promoted across dev/alt/main, and the Host header determines behavior at runtime.
- **B-2 (PASS):** DNA-57 (dev/prod egress parity) is correctly addressed — middleware only adds headers and an auth gate, does not modify the HTML body.

## Axis C — Ecosystem fit

- **C-1 (FAIL):** RFC claims `mirrors[0].devSubdomain` and `mirrors[0].altSubdomain` exist in `system-config.yaml` (line 202-203). The actual `mirrorEntrySchema` at `@/packages/werkstatt/src/schemas/sternsystem.ts:66-69` has only `path` and `storageType` fields — no subdomain fields exist. Subdomain URLs are in `deployment.channels.dev.url` and `deployment.channels.alt.url` (`@/packages/werkstatt/src/schemas/leitstand.ts:23-29`). The RFC's subdomain detection design is based on non-existent schema fields and must be rewritten to use `deployment.channels.{dev,alt}.url`.
- **C-2 (FAIL):** RFC uses `--id` flag for all three commands. Every existing leitstand command uses `--site` (with `--system` as alias) — see `@/packages/werkstatt/src/leitstand/leitstand.module.ts:44-53,105-114,157-166`. The RFC must use `--site` for consistency.
- **C-3 (FAIL):** RFC says middleware runs "before all other middleware (language redirect, markdown negotiation)" (line 209) but doesn't mention `retired-tombstones` middleware, which currently runs first in the chain (`@/packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware.template.ts:40-41`). The chain is: tombstone then language redirect then markdown negotiation. The RFC must specify where access protection fits relative to tombstone middleware (should be first, before tombstone, since auth gate should short-circuit before any response logic).
- **C-4 (FAIL):** RFC doesn't identify which `docs/*.xml` files need synchronization. Adding new commands requires updating `docs/technology.xml` (command registry) and `docs/verification-plan.xml` (verification coverage). Per repository rules, these are the primary machine-readable semantic layer.
- **C-5 (WARN):** `packagesImpacted` lists `@warpgogol/werkstatt-site` but the middleware path `packages/werkstatt-site/src/domain/share/middleware/` needs verification. Existing shared middleware is imported from `@warpgogol/werkstatt-site/share/middleware` or `@warpgogol/werkstatt-shared/share/middleware`. The RFC should clarify which package owns the implementation and ensure the subpath export exists.

## Axis D — Forward-only compliance

- **D-1 (PASS):** No backward compatibility layers proposed. Clean new feature with no legacy state to preserve.

## Axis E — Agent-facing policy

- **E-1 (PASS):** Correctly states agents MAY implement only when status is `accepted` (line 254). References RFC-0224 for accepted-to-implemented transition.
- **E-2 (PASS):** No self-authorizing language. No NEEDS CLARIFICATION markers. Implementation notes are clear and bounded.

## Axis F — Pragmatism

- **F-1 (PASS):** Three commands (protect, unprotect, status) each earn their existence. The PIN auto-generation feature is practical.
- **F-2 (PASS):** The middleware concept is sound — runtime Host check is the correct approach for single-artifact deployments.
- **F-3 (WARN):** The `leitstand.access.status` command's "show the PIN" feature (line 90) is pragmatically useful but technically infeasible — see G-1.

## Axis G — Blind spots

- **G-1 (FAIL):** `leitstand.access.status` claims to "show the PIN" (line 90, 120) but Cloudflare Worker secrets cannot be retrieved via the `wrangler secret` API. `wrangler secret list` only shows secret names, not values. There is no `wrangler secret get` command. The RFC must either: (a) store the PIN in `system-state.yaml` as a non-secret field (acknowledging it's not truly secret), or (b) drop the "show PIN" feature and only report whether protection is active (boolean).
- **G-2 (FAIL):** Middleware pseudocode (line 160) calls `next()` before the auth check, rendering the full page for unauthenticated requests. The auth check must happen BEFORE `next()` to short-circuit unauthorized access without rendering the page. The correct order is: check Host, check PIN configured, check auth header, only call `next()` if authenticated, then set `X-Robots-Tag` on the response.
- **G-3 (FAIL):** The 401 response (line 176-179) doesn't include `X-Robots-Tag: noindex, nofollow, noai, noimageai`. Only successful responses get the header (line 161). The 401 challenge page must also have `noindex` headers to prevent search engines from indexing the auth prompt page.
- **G-4 (FAIL):** No mention of how `wrangler secret put` targets the correct Worker. Dev and alt channels have different worker names (`deployment.channels.dev.workerName` / `deployment.channels.alt.workerName` from `system-config.yaml`). The command must run `wrangler secret put ACCESS_PIN` separately for each Worker, using `--name <workerName>` or a temporary `wrangler.json` with the correct worker name.
- **G-5 (FAIL):** Auth comparison uses `===` (line 171) which is vulnerable to timing attacks. While the PIN is only 4 digits (low security), the RFC should use a constant-time comparison function to establish good practice.
- **G-6 (WARN):** The `btoa()` function is used in the pseudocode (line 171). This is available in Cloudflare Workers runtime, but the RFC should note this dependency explicitly and confirm compatibility with the Astro Cloudflare adapter.

## Questions for the author

1. **Subdomain detection:** The RFC references `mirrors[0].devSubdomain` / `mirrors[0].altSubdomain` which don't exist in the schema. Should the middleware use `deployment.channels.{dev,alt}.url` from `system-config.yaml` instead, or rely solely on `host.startsWith("dev.")` / `host.startsWith("alt.")` pattern matching?
2. **PIN retrieval:** `wrangler secret` API cannot retrieve secret values. Should `leitstand.access.status` store the PIN in `system-state.yaml` (not a real secret), or should it only report `protected: boolean` without showing the PIN?
3. **Middleware chain order:** Should access protection run before or after `retired-tombstones` middleware? Running it first means 401 short-circuits before tombstone logic; running it after means tombstone 410 responses are unprotected.
