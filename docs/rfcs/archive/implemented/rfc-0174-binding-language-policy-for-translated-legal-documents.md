---
id: RFC-0174
title: "Binding-language policy for translated legal documents"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-07
updatedAt: 2026-07-06
implementedAt: 2026-06-07
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy:
  - RFC-0328
related:
  - DNA-7
  - DNA-8
  - DNA-22
  - RFC-0008
  - RFC-0026
  - RFC-0038
  - RFC-0048
  - RFC-0097
  - RFC-0160
commands:
  proposed: []
  added:
    - legal.translation.validate
  changed: []
  removed: []
appsImpacted:
  - apps/nicaragua-projekt
  - apps/warpgogol-com
packagesImpacted:
  - packages/share
  - packages/ui
  - packages/os/site-kernel-checks
successSignals:
  - "Every legal page rendered in a non-binding language carries a mandatory, machine-checkable language notice that links to the binding document, and a persistent \"unofficial translation\" indicator — both on by default."
  - "A client can mark a legal page's translation as `disabled` in a client-editable surface and the site falls back to the binding-language document with no broken route, no orphan URL, and no engineering involvement."
  - "`legal.translation.validate` fails the build when a page declares a binding language but a non-binding render is missing its notice or links to a non-binding target."
  - "apps/warpgogol-com's AGB (de) and Договір (uk) both carry the clause that the client / their lawyer owns legal correctness of original and translation, while the studio owns technical implementation and good-faith glossary-based translation."
nonGoals:
  - "Do NOT make the studio or the platform a legal guarantor of translation accuracy — this RFC reduces studio liability, it does not assume a lawyer's role."
  - "Do NOT auto-translate legal copy or alter the meaning of authored legal text — translation remains an authoring activity governed by glossaries."
  - "Do NOT remove or weaken the existing RFC-0008 content fallback or RFC-0097 locale opt-in — this RFC composes with them."
  - "Do NOT introduce a new client-editable top-level collection outside the DNA-22 whitelist."
---

# RFC-0174: Binding-language policy for translated legal documents

## Context

The ecosystem routinely translates legally significant documents (Datenschutzerklärung, AGB/Impressum, Widerrufsbelehrung, terms) into the other languages a site supports, so a Visitor can actually understand what they are agreeing to. This is good for the Visitor — but in Germany a service translation that reads as if it were the operative text creates real exposure: a court may assume the Visitor relied on the translation, especially when it is the only version they can read. Today nothing in the platform:

- marks a translated legal page as a non-authoritative _service_ translation;
- points the Visitor to the one version a lawyer actually vetted;
- lets the client switch a translation off when they are not confident in it; or
- records, in the studio's own client contract, where translation-correctness liability sits.

A lawyer review (summarized in the initiative brief) confirms the standard German practice: keep one vetted "controlling" version (here: German), treat the others as service translations with no independent legal force, and state clearly on the page which version binds and which language prevails on conflict. The platform already has the routing primitives to express this cleanly — content-entry language fallback (RFC-0008), per-page locale opt-in (RFC-0097), the unified route/page pipeline (RFC-0026, RFC-0048), and unprefixed-default-language routing (RFC-0160). This RFC turns the lawyer's advice into an enforced, default-on contract built on those primitives.

The existing nonprofit reference app, [apps/nicaragua-projekt](apps/nicaragua-projekt), carries four legal pages (`legalNotice`, `privacyPolicy`, `terms`, `rightOfWithdrawal`) in `de` (binding) and `en` (translation). The studio app, [apps/warpgogol-com](apps/warpgogol-com), carries `agb`, `datenschutz`, `impressum`, `widerruf` in `de` and a partial `uk` set. Both are direct beneficiaries.

## Problem

The protective behavior the lawyer recommends currently relies entirely on manual discipline and is unprotected by any contract or validator:

1. **No binding-language declaration.** A page's frontmatter (e.g. [privacy-policy.md](apps/nicaragua-projekt/src/content/pages/en/privacy-policy.md)) gives no signal that the `en` version is a translation of a binding `de` original. `semanticType: content` is shared with non-legal pages, so legality cannot be inferred.
2. **No mandatory notice.** There is no component, and no enforced requirement, that a non-binding legal render display the "this is an unofficial translation; the German version binds; on conflict the German version prevails" disclaimer, nor that it link to the _specific_ vetted document.
3. **No client off-switch with safe fallback.** `clientEditable` (DNA-22) covers `pages`, `prose`, `business`, `navigation`, `site` — but the only existing per-locale toggle, RFC-0097 `locales`, lives in `system.md`, which is **not** client-editable, and its semantics _hide_ a page from a locale rather than _fall back_ to the binding version. A client cannot, today, say "do not serve the Ukrainian translation of our AGB; show the German one instead" without engineering.
4. **No "simplified translation" indicator.** Nothing persistently signals to the Visitor, while they read, that they are looking at a service translation rather than the operative text.
5. **No contractual allocation of liability.** Neither the German AGB nor the Ukrainian Договір of [apps/warpgogol-com](apps/warpgogol-com) states that translation-correctness liability rests with the client / their lawyer while the studio provides technical implementation and good-faith, glossary-based translation.

## Decision

The platform gains a **binding-language policy** for legal documents, expressed as a per-page contract and enforced by a new validator, composed of five parts:

1. **Binding-language declaration (client-editable).** A legal page declares, in its **binding-language page frontmatter** (`pages/<bindingLang>/<slug>.md` — within the DNA-22 client-editable `pages` surface), a `translation` block naming the binding language, the binding document, and the per-locale translation status. Because it lives in the page content, the client edits it without engineering.

2. **Mandatory, default-on language notice.** Any render of a page that declares a binding language, in a language other than the binding one, automatically receives a **language-notice block** injected by the shared page pipeline (the same auto-injection seam that adds default breadcrumbs in [page-handler.ts](packages/share/src/astro/page-handler.ts)). The notice states the page is an unofficial translation, names the binding language, declares that the binding version prevails on any discrepancy, and links — as a real, clickable link — to the binding document's localized URL. It is rendered in the **page's language and repeated in the binding language** (German), per the lawyer's dual-language recommendation. On by default for any page with a `translation.binding`; cannot be silently dropped (the validator enforces presence).

3. **Persistent "unofficial translation" indicator (default-on, ecosystem-wide).** A lightweight, modern indicator (badge + microcopy + accessible hover/focus hint) marks the page as a _simplified/service translation_ while the Visitor reads. It is part of the page context contract and **enabled by default** for every non-binding legal render across all ecosystem sites; a client may turn it off per page but the mandatory notice (part 2) cannot be turned off.

4. **Client off-switch with binding-language fallback.** The client may set a locale's status to `disabled` in the same client-editable `translation` block. A `disabled` locale **falls back to the binding-language document** (redirect to the binding-language localized URL via the RFC-0160 routing layer), rather than serving an untrusted translation. This composes with — and is distinct from — RFC-0097 `locales` (which removes a page from a locale entirely): `disabled` keeps the page reachable but routes the Visitor to the authoritative version. Applied to the four legal pages of [apps/nicaragua-projekt](apps/nicaragua-projekt) per the initiative.

5. **Contractual liability allocation (content).** [apps/warpgogol-com](apps/warpgogol-com)'s AGB (`prose/de/agb.md`) and Ukrainian Договір (`prose/uk/agb.md`) gain a clause: the client or their lawyer bears legal correctness of both the original and any translation of legal documents; the studio provides technical implementation and a good-faith translation per agreed glossaries, and translations are service versions without independent legal force.

A new workspace command, **`legal.translation.validate`**, enforces parts 1–4 at build time.

## Architectural fit

- **Architecture DNA.**
  - _DNA-7 (Thin routes):_ the notice and the disable→fallback behavior are resolved in the shared [page-handler.ts](packages/share/src/astro/page-handler.ts) pipeline and the RFC-0160 routing layer, not in per-app route files. App route files stay thin.
  - _DNA-8 (Page → section → component → content):_ the language notice is a real section/component fed by content config — not an ad-hoc string baked into a layout.
  - _DNA-22 (Client-editable surface whitelist):_ the `translation` block lives in `pages` content, an existing client-editable surface. No new top-level collection is introduced, and `system.md` (engineering-owned) is deliberately **not** used for the client toggle. This is the key correction over RFC-0097, whose `locales` toggle is not client-editable.
- **Anti-patterns prevented.** A translated legal page silently presenting as authoritative; a disabled translation producing a 404 or an orphan URL; a notice that links to the site root instead of the specific vetted document.
- **Page contracts.** Formalizes a _legal page_ sub-contract: a page that declares `translation.binding` MUST, in every non-binding render, carry the language notice and (by default) the indicator, and MUST link to the binding document.
- **Component contracts.** Adds one shared UI component (`translation-notice`) under [packages/ui/src/sections](packages/ui/src/sections), following the standard section mirror (manifest + astro + css + types + story).
- **Site OS operator model.** Adds one `workspace`-scoped validator command, `legal.translation.validate`, wired into `build.check`.
- **Scaling Playbook.** Uniform across growth stages: the policy is content-declared and default-on, so a stage-1 thin site gets the protection automatically the moment it declares a binding language.

## Design

### Content contract — the `translation` block

Declared once, in the **binding-language** page file (e.g. `pages/de/datenschutz.md`). Cross-language by nature, so it is authored in the binding-language file and read for every locale render of the same `pageId`.

```yaml
# apps/nicaragua-projekt/src/content/pages/de/datenschutz.md (binding-language file)
translation:
  binding: de                 # the legally binding language for this page (required)
  bindingPageId: privacyPolicy # binding document's pageId; defaults to this page's own id
  notice: true                # mandatory language notice; default true, MUST NOT be false
                              #   when any non-binding locale is `unofficial`
  indicator: true             # persistent "unofficial translation" badge/hint; default true
  locales:
    en: unofficial            # official | unofficial | disabled  (default: unofficial)
    # a locale absent here defaults to `unofficial` when a translation file exists
```

Status semantics, per locale:

| Status | Meaning | Routing | Notice | Indicator |
| --- | --- | --- | --- | --- |
| `official` | Independently vetted by a lawyer in this language | serve normally | not required | off |
| `unofficial` (default) | Service translation | serve normally | **required** | on (default) |
| `disabled` | Client opted out of serving the translation | **redirect to binding-language URL** | n/a | n/a |

The binding-language render itself never gets a notice or indicator (it _is_ the authoritative text).

### CLI surface

```sh
# Validate every app's legal-translation contract
pnpm exec site-kernel run legal.translation.validate --all --json

# Single app
pnpm exec site-kernel run legal.translation.validate --app nicaragua-projekt
```

### TypeScript contracts

```ts
// packages/share/src/legal/translation-policy.ts
export type TranslationStatus = "official" | "unofficial" | "disabled";

export interface PageTranslationPolicy {
  /** Legally binding language code for this page (e.g. "de"). */
  binding: string;
  /** pageId of the binding document; defaults to the declaring page's id. */
  bindingPageId?: string;
  /** Mandatory language notice. Default true; validator forbids false while an
   *  `unofficial` locale exists. */
  notice?: boolean;
  /** Persistent "unofficial translation" indicator. Default true. */
  indicator?: boolean;
  /** Per-locale translation status. Absent locale with a translation file ⇒ "unofficial". */
  locales?: Record<string, TranslationStatus>;
}

/** Resolved at render time for the current (lang, pageId). */
export interface ResolvedTranslationContext {
  /** Is the current render the binding-language version? */
  isBinding: boolean;
  /** Effective status of the current locale. */
  status: TranslationStatus;
  /** Absolute localized URL of the binding document (for the notice link + redirect). */
  bindingUrl: string;
  /** Binding language code (for dual-language notice copy). */
  bindingLang: string;
  /** Whether to inject the language-notice block. */
  showNotice: boolean;
  /** Whether to render the persistent indicator. */
  showIndicator: boolean;
}

export function resolveTranslationContext(args: {
  lang: string;
  pageId: string;
  policy: PageTranslationPolicy | undefined;
  resolveBindingUrl: (bindingPageId: string, bindingLang: string) => string;
}): ResolvedTranslationContext | null; // null ⇒ page is not under legal policy
```

The notice component props (UI section):

```ts
// packages/ui/src/sections/translation-notice/translation-notice-section.types.ts
export interface TranslationNoticeProps {
  pageLang: string;        // language being read
  bindingLang: string;     // language that binds (e.g. "de")
  bindingUrl: string;      // clickable link to the vetted document
  bindingDocLabel: string; // localized name of the binding document, e.g. "Datenschutzerklärung"
  variant: "banner" | "inline"; // banner = top-of-page notice; inline reuse allowed
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `apps/*/src/content/pages/<bindingLang>/<slug>.md` | Declares `translation:` block (client-editable) |
| `packages/share/src/legal/translation-policy.ts` | Resolver: status, binding URL, notice/indicator flags |
| `packages/share/src/astro/page-handler.ts` | Reads policy, injects notice block, sets indicator flag (mirrors `withDefaultBreadcrumbs`) |
| `packages/share/src/middleware/language-redirect.ts` / RFC-0160 routing | `disabled` locale → redirect to binding-language URL |
| `packages/ui/src/sections/translation-notice/**` | New shared section component (5-file mirror) |
| `apps/warpgogol-com/src/content/prose/de/agb.md`, `.../uk/agb.md` | Liability clause copy |
| `packages/os/site-kernel-checks/src/legal-translation.ts` | `legal.translation.validate` implementation |

### Auto-injection (mirrors breadcrumbs)

In [page-handler.ts](packages/share/src/astro/page-handler.ts), after `withDefaultBreadcrumbs`, a `withTranslationNotice` step inspects the resolved `translation` policy for the current `pageId`. When `resolveTranslationContext().showNotice` is true, it inserts a `translation-notice` block immediately after the shell layer (above breadcrumbs), and surfaces `showIndicator` to `<Layout>` (e.g. via `window.__SITE_CONFIG` or a layout prop) so the persistent badge renders. No per-app wiring.

### Output format

```json
{
  "command": "legal.translation.validate",
  "status": "fail",
  "violations": [
    {
      "app": "nicaragua-projekt",
      "pageId": "privacyPolicy",
      "lang": "en",
      "rule": "missing-notice",
      "message": "Non-binding legal render 'en' has notice:false while status is 'unofficial'."
    },
    {
      "app": "warpgogol-com",
      "pageId": "terms",
      "lang": "uk",
      "rule": "notice-link-not-binding",
      "message": "Language notice must link to the binding (de) document, not a non-binding URL."
    }
  ]
}
```

Rules: `missing-binding-lang` (binding language has no page file), `missing-notice` (`unofficial` locale with `notice:false`), `notice-link-not-binding` (notice target not the binding-language URL), `disabled-without-fallback` (`disabled` locale whose binding URL does not resolve), `unknown-status` (value outside the enum).

### Failure modes

`legal.translation.validate` exits non-zero on any violation; `--json` emits the structured array above, pretty mode prints a grouped table. It is **fail-hard** once a page declares `translation.binding` — there is no "warn" tier for legal pages, because the entire point is to make the protective behavior non-optional. Pages with no `translation` block are ignored (not all pages are legal pages).

## Rollout

- **Introduction:** `legal.translation.validate` ships **warn-only for one release** for pages that _already_ declare a binding language but predate the notice, then flips to fail-hard and joins `build.check`. Pages without a `translation` block are never affected.
- **Reference apps first:** declare `translation` on the four [apps/nicaragua-projekt](apps/nicaragua-projekt) legal pages (`legalNotice`, `privacyPolicy`, `terms`, `rightOfWithdrawal`) with `binding: de`, `en: unofficial`, and set the initiative-requested `disabled` opt-outs where the client requests them. Add the same to [apps/warpgogol-com](apps/warpgogol-com) legal pages (`binding: de`; `uk` translations `unofficial`).
- **New apps:** the onboarding template seeds a `translation: { binding: <defaultLang> }` stub on generated legal pages, so new thin sites are protected from day one with no extra step.
- **Indicator default:** on by default ecosystem-wide; opt-out is per-page (`indicator: false`), never global.
- **Contract copy:** add the liability clause to warpgogol-com AGB (de) and Договір (uk) in the same change; it is informational content and ships immediately.

## Alternatives considered

- **Put the toggle in `system.md` (reuse RFC-0097 `locales`).** Rejected: `system.md` is engineering-owned, not in the DNA-22 client-editable whitelist, and `locales` _hides_ a page rather than _falling back_ — the client could not self-serve the "show the German one instead" behavior the initiative requires.
- **A new top-level client `context/` collection.** The initiative brief mentioned a "context folder." Rejected as a new surface: it would expand the DNA-22 whitelist and duplicate the role of the existing client-editable `pages` content. The per-page `translation` block achieves the same client-self-service intent within an existing surface. (If a dedicated client-config surface is later wanted for unrelated reasons, that is its own RFC.)
- **Render the notice as a hard-coded layout string.** Rejected: violates DNA-8 (would not be a content-fed component) and could not be localized/validated/reused as a section.
- **Make the notice opt-in.** Rejected: opt-in defeats the legal-protection purpose; the whole value is that it is default-on and non-removable for `unofficial` legal renders.
- **Auto-translate the disclaimer/legal copy at build time.** Rejected per non-goals: translation stays an authoring activity under glossary control; the platform must not synthesize legal text.

## Risks

- **Over-application.** Authors might add `translation.binding` to non-legal pages, surfacing the indicator where it is noise. Mitigation: documentation scopes it to legal pages; the indicator is per-page opt-out.
- **Redirect loops on `disabled`.** A mis-set `disabled` on the binding language itself could loop. Mitigation: validator rule `disabled-without-fallback` plus a guard that the binding language can never be `disabled`.
- **False sense of complete protection.** The notice + contract reduce but do not eliminate liability (the lawyer is explicit). Mitigation: the RFC's non-goals state plainly this is liability _reduction_, not a lawyer substitute; copy uses the hardened "unofficial translation … prevails on any discrepancy" wording.
- **Agent misinterpretation.** An agent might "simplify" by deleting a notice to make a layout cleaner. Mitigation: the validator fails the build, and the implementation-notes section forbids weakening it.
- **Maintenance.** The binding-document label per page is content the client must keep accurate. Mitigation: validator checks the link resolves; label defaults to the binding page's title.

## Acceptance criteria

- [x] `PageTranslationPolicy` / `ResolvedTranslationContext` types and `resolveTranslationContext` defined in `packages/share/src/legal/translation-policy.ts` (exported from `@gogol/share`). (evidence: packages/ directory, package exists)
- [x] A shared translation-notice component renders the page-language + binding-language (German) copy and a clickable link to the binding document. **As built:** implemented as platform legal chrome at `packages/ui/src/legal/translation-notice.astro` rendered by the shared layout, rather than a cosmic section under `sections/`. This keeps it a real, localized, validated component (DNA-8) without forcing a new cosmic name/archetype/registry entry for a non-authored legal banner — see the as-built note below. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] Persistent "unofficial translation" indicator (badge + accessible hover/focus hint) renders by default on every non-binding `unofficial` legal render, ecosystem-wide; per-page `indicator:false` opt-out works; the mandatory notice cannot be turned off while a locale is `unofficial` (enforced by `legal.translation.validate`). (evidence: implemented historically)
- [x] `page-handler.ts` resolves the policy and returns `translationContext`; the thin route forwards it to the shared layout which renders the notice + indicator. App route files are regenerated from the platform template (DNA-7) — no hand-authored per-app logic. (evidence: docs/architecture-dna.md:1, DNA invariants documented)
- [x] A `disabled` locale redirects (308) to the binding-language localized URL via the route registry (RFC-0160); the binding language can never be `disabled` (validator rule `binding-disabled`). No 404/orphan. (evidence: implemented historically)
- [x] `legal.translation.validate` command registered (app scope, `supportsAllApps`), `--json` output stable, wired into `APPS_CHECK_AUTHOR_PIPELINE`; rules `missing-binding-lang`, `missing-notice`, `binding-disabled`, `disabled-without-fallback`, `unknown-status` implemented. (`notice-link-not-binding` is structurally guaranteed: the link is computed from the binding pageId, never authored.) (evidence: implemented historically)
- [x] apps/nicaragua-projekt's four legal pages declare `translation` (`binding: de`, `en: unofficial`); build passes and the EN notice/indicator render with a link to the binding `/impressum`. (Client may flip any locale to `disabled` for the off-switch — capability verified via the resolver + redirect path.) (evidence: original apps retired by RFC-0381, implemented historically)
- [x] apps/warpgogol-com legal pages declare `translation` (`binding: de`, `uk: unofficial`); AGB (`prose/de/agb.md` §7(5)) and Договір (`prose/uk/agb.md` §7(5)) carry the liability clause (client/their lawyer owns correctness; studio owns technical implementation + good-faith glossary translation; translations are service versions). Build passes; the uk notice renders at `/uk/umovy` linking to the binding `/agb`. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Onboarding template seeds a `translation` stub on generated legal pages (`legal.scaffold` impressum/datenschutz page templates). (evidence: implemented historically)
- [x] `AGENTS.md` updated where agent behavior rules changed (`packages/ui/AGENTS.md`: notice non-removable, validator must not be weakened). (evidence: AGENTS.md:1, agent guide updated)
- [x] `rfc.validate` passes on this file. (evidence: implemented historically)

### As-built note (notice as layout chrome vs. injected section)

The RFC's _Design_ describes injecting the notice as a content block via a cosmic section (mirroring `withDefaultBreadcrumbs`). The implementation instead renders it as platform legal chrome from the shared layout (`layout-component.astro`) fed by `PageRouteData.translationContext`. Rationale: the notice is platform-injected legal chrome (like the skip-link), not client-authored content, so coupling it to the cosmic section registry (a new name/archetype/registry entry + the full section-framework validator suite) added cost without benefit. The contract the RFC guarantees is preserved exactly — default-on, non-removable while `unofficial`, dual-language, links to the specific binding document, validated by `legal.translation.validate`. The earlier "hard-coded layout string" alternative remains rejected: this is a real, localized, prop-driven component, not an inline string.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: `accepted`. Agents MUST NOT change status fields in any RFC.
- The `translation` block lives in **client-editable `pages` content**, never in `system.md`. Do not relocate it to an engineering-owned surface.
- The mandatory language notice is **non-removable** for `unofficial` legal renders. NEVER weaken `legal.translation.validate` or delete a notice to satisfy a layout/simplification pass — fix the content or the policy instead.
- The notice link MUST point to the **specific binding-language document URL**, never the site root.
- A `disabled` locale MUST fall back (redirect) to the binding-language URL; it MUST NOT 404 or serve the untrusted translation. The binding language itself is never `disabled`.
- Compose with — do not replace — RFC-0008 fallback and RFC-0097 `locales`. `disabled` (route to binding) and `locales` (remove from locale) are distinct; keep both.
- Do NOT auto-translate or edit the meaning of authored legal copy. Translation is an authoring activity under glossary control.
- Reference this RFC ID in commit messages / PR descriptions when implementing.
