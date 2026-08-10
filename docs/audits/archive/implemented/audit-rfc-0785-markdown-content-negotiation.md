---
rfcId: RFC-0785
auditId: AUDIT-RFC-0785-01
date: 2026-08-09
auditor:
  skill: fo-idea-audit
  model: unknown
verdict: needs-revision
---

# Audit: RFC-0785

## Verdict: Needs revision

RFC-0785 proposes a Cloudflare Pages Function for markdown content negotiation, but RFC-0149 explicitly retired Pages Functions and deleted all `functions/` directories in favor of the Astro Cloudflare adapter. The RFC's own alternatives section acknowledges Astro middleware as a valid option, yet the Decision and Design commit to the retired approach. Additionally, the markdown twin path resolution (`/about/` → `/about.md`) contradicts RFC-0166's actual output layout (`/about/index.md`).

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

- **A-1 (Decision vs Design contradiction):** The Decision (line 95) says "scaffolds a Cloudflare Pages Function (`functions/[[path]].ts`)", but the Architectural fit (line 102) and Alternatives #4 (line 241) acknowledge Astro middleware as a valid alternative. The RFC must pick one approach in the Decision and commit to it — not defer to "implementation decision" while the Design section already specifies Pages Function contracts.
- **A-2 (Output format missing `--json` shape):** The Output format section (lines 183–215) shows HTTP examples but does not document the `--json` output shape of `agent.markdown-negotiation.generate` itself. The command table entry pattern in the codebase (`@/packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts`) expects `writes`, `reads`, and a `--json` envelope.
- **A-3 (File system responsibilities table uses non-existent path):** The proposed template path `packages/werkstatt-site/src/codegen/templates/app-boilerplate/functions/markdown-negotiation.template.ts` (line 177) introduces a `functions/` subdirectory under `app-boilerplate/` that does not exist in the codebase. Existing middleware templates live at `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware.template.ts`.

## Axis B — DNA alignment

- **B-1 (DNA-34 reclassified to feature):** `satisfies: [DNA-34]` (line 33) references DNA-34, but `docs/architecture-dna.md` line 153 states: "Reclassified to feature (RFC-0161) — governed as a product feature by RFC-0028, not enforced as binding DNA." The RFC claims to satisfy a DNA invariant that is no longer binding. The `satisfies[]` field should reference an active DNA invariant or be empty if none applies.
- **B-2 (Related DNA-34 is decorative):** The `related: [DNA-34]` entry (line 25) is the same reclassified invariant. Content negotiation for markdown is not semantically related to Ed25519 VC signing or `.well-known/` discovery — the connection is tenuous.

## Axis C — Ecosystem fit

- **C-1 (Direct conflict with RFC-0149):** RFC-0149 (implemented) explicitly retired Pages Functions: "functions/ is deleted from every app" (line 97 of RFC-0149), "No functions/ directory exists in any @app" (success signal, line 55). RFC-0785 proposes creating `functions/[[path]].ts` — this is a regression to the pre-RFC-0149 model. The RFC must either supersede RFC-0149 (which is unlikely to be warranted for this feature) or use the established Astro middleware pattern.
- **C-2 (Existing middleware infrastructure not referenced):** The codebase has a mature middleware chain at `packages/werkstatt-site/src/codegen/templates/app-boilerplate/src/middleware.template.ts` that already sequences `tombstoneMiddleware`, `languageRedirectMiddleware`, and `devNormalize`. Content negotiation belongs in this chain. The RFC does not reference this existing infrastructure.
- **C-3 (scope mismatch):** Frontmatter `scope: workspace` (line 8) but the command is described as `scope: app` (line 103, line 113). The frontmatter should say `app`.
- **C-4 (appsImpacted empty):** `appsImpacted: []` (line 48) but this feature affects all sites with `agent.enabled !== false`. Should list impacted sites or use `apps/*` convention.
- **C-5 (Command table reference correct):** The RFC correctly identifies `packages/werkstatt-site/src/checks/command-tables/29-agent-surface.ts` (line 179) as the command table to amend. The existing agent surface generators (`agent.manifest.generate`, `agent.openapi.generate`, etc.) follow the same `scope: app`, `supportsAllSites: true` pattern.

## Axis D — Forward-only compliance

- **D-1 (Pages Function is a backward step):** RFC-0149 was a clean break: "There is no backward-compatibility path: do not leave functions/, onRequest* signatures, context.env access" (line 283 of RFC-0149). RFC-0785 reintroduces `functions/` and `onRequest*` signatures. This violates the forward-only discipline — the ecosystem moved away from Pages Functions, and this RFC proposes going back.
- **D-2 (No dual-path proposed):** The RFC does not propose keeping both Pages Functions and middleware — it picks Pages Functions exclusively. This is forward-only in intent, but the chosen direction is backward.

## Axis E — Agent-facing policy

- **E-1 (Self-authorizing language):** Line 102 says "if the site already uses the Astro Cloudflare adapter, the negotiation logic could be an Astro middleware instead of a standalone Pages Function. This is an implementation decision." This defers a fundamental architectural choice to implementation time. The RFC must make this decision in the Design section, not defer it.
- **E-2 (No NEEDS CLARIFICATION markers):** No unresolved markers found.
- **E-3 (Implementation notes reference correct governance):** Lines 265–273 reference RFC-0224, RFC-0330, RFC-0334 correctly.

## Axis F — Pragmatism

- **F-1 (Twin path resolution is wrong):** `resolveMarkdownTwinPath` (lines 163–167) maps `/about/` → `/about.md`. But RFC-0166 generates twins as `index.md` files inside route directories (e.g. `/about/index.md`, see RFC-0166 line 115: `dist/agb/index.md`). The function should map `/about/` → `/about/index.md`, not `/about.md`.
- **F-2 (Same-origin fetch recursion):** The Pages Function (line 149) uses `fetch(twinUrl)` to retrieve the `.md` twin from the same origin. RFC-0166 explicitly rejected this pattern: "a same-origin worker that fetches itself recurses unless routed through a SELF/ASSETS service binding" (RFC-0166, line 61). The Astro middleware approach avoids this entirely by using `next()` or direct asset access.
- **F-3 (New command earns its existence):** `agent.markdown-negotiation.generate` follows the established `agent.*.generate` pattern. This is reasonable — it's not a flag on an existing command.

## Axis G — Blind spots

- **G-1 (Performance: fetch on every negotiated request):** The Pages Function fetches the `.md` twin via `fetch()` on every request with `Accept: text/markdown`. The middleware approach could intercept the response stream or use the `ASSETS` binding directly, avoiding a second HTTP round-trip.
- **G-2 (Cache poisoning mitigation incomplete):** The RFC correctly sets `Vary: Accept` (line 222), but does not address how the Cloudflare CDN caches Pages Function responses. The `Cache-Control: public, max-age=300` header (line 157) allows CDN caching, but without `Vary: Accept` at the CDN level, the response might be cached without the vary header. The RFC should specify CDN-level cache behavior.
- **G-3 (i18n path edge cases underspecified):** The `resolveMarkdownTwinPath` function handles trailing slashes and root path, but does not address: (a) pages with `llms.depth: "off"` that have no twin, (b) the default language which is served without a URL prefix (RFC-0160), (c) non-page routes like `/api/`, `/.well-known/`. The middleware must skip these.
- **G-4 (No test coverage plan):** The Risks section (line 247) mentions "edge cases need test coverage" but does not describe what tests should be written. The acceptance criteria do not include a unit test requirement for `resolveMarkdownTwinPath`.

## Questions for the author

1. Why does the RFC propose a Cloudflare Pages Function when RFC-0149 explicitly retired Pages Functions and deleted all `functions/` directories? Should the RFC be rewritten to use Astro middleware (the established pattern), or does it intend to supersede RFC-0149?
2. The `resolveMarkdownTwinPath` function maps `/about/` → `/about.md`, but RFC-0166 generates twins as `/about/index.md`. Which path layout is correct, and has the author verified against actual generated output?
3. DNA-34 is reclassified to feature (RFC-0161) and no longer binding. Which active DNA invariant does this RFC actually satisfy, or should `satisfies[]` be empty?
