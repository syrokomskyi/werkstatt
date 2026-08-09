---
id: RFC-0096
title: "legal.scaffold — generate Impressum and Datenschutz page stubs for DE/AT/CH locales"
status: implemented
kind: command
scope: app
owners:
  - architecture
reviewers: []
createdAt: 2026-05-24
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0095
  - RFC-0078
commands:
  proposed:
    - legal.scaffold
  added:
    - legal.scaffold
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - os/site-kernel-codegen
  - os/site-kernel-checks
successSignals:
  - Running `legal.scaffold --app <id>` on a fresh DE-locale app creates valid Impressum + Datenschutz page+prose pairs, navigation entries, and labels.md updates in one call.
  - "`footer.legal.validate` passes immediately after `legal.scaffold` without any manual edits."
  - Stub prose reads identity fields (name, location, email, domain) from system.md so the generated text is already filled in for the app.
nonGoals:
  - Producing legally-binding final text — stubs are starting points the operator reviews with their counsel.
  - Supporting non-DE/EU legal regimes in v1 (US Privacy Policy, GDPR-only sites without TMG, etc.) — those become per-locale extensions.
  - Replacing the prose; once the file exists, regeneration is opt-in via `--force`.
---

# RFC-0096: legal.scaffold — generate Impressum and Datenschutz page stubs for DE/AT/CH locales

## Context

RFC-0095 added `footer.legal.validate` to fail any DE/AT/CH-locale app whose `footer.legalIds` is empty (Impressum + Datenschutz are legally mandated by § 5 TMG and DSGVO). The validator gives the agent a clear failure with the exact remediation path, but the actual authoring work is still manual: create two pages, two prose files, three navigation entries, and edit `labels.md` twice — and the boilerplate text is the same for every German site.

During the May 2026 warpgogol-com onboarding this manual authoring took several edits across six files. Every future DE-locale onboarding repeats the same work. The boilerplate is large enough to be worth scaffolding and small enough to fully template.

## Problem

1. **Six files per locale to author manually.** `pages/<lang>/impressum.md`, `pages/<lang>/datenschutz.md`, `prose/<lang>/impressum.md`, `prose/<lang>/datenschutz.md`, `navigation/<lang>/navigation.md` (three new entries: `impressum`, `datenschutz`, `emailContact`), `site/<lang>/labels.md` (populate `legalIds` + `contactIds`).
2. **Identity duplication.** Impressum text needs the operator's name, address, and contact email. These already exist in `system.md` `identity.*` (name, location, domain) and the brief's contact email. Re-typing them invites typos.
3. **No regeneration path.** If the operator's address changes, every legal stub becomes stale silently. A scaffold that reads from `system.md` makes the source of truth obvious.

## Decision

Add `legal.scaffold` — an app-scope kernel command that for each DE/AT/CH locale in `system.md` `i18n.supported` writes the six artifacts in one pass, sourcing every app-specific value from `system.md` (per RFC-0087's content-driven generation contract).

### CLI surface

```sh
pnpm exec werkstatt run legal.scaffold --app <id>
pnpm exec werkstatt run legal.scaffold --app <id> --force   # overwrite existing stubs
```

### Inputs (read from `system.md`)

| Field                                  | Used in                                                |
| -------------------------------------- | ------------------------------------------------------ |
| `identity.tagline` / `identity.domain` | Impressum + Datenschutz title and description          |
| `identity.legal.responsibleName` (new) | Impressum "Verantwortlich gemäß § 55 Abs. 2 RStV" line |
| `identity.legal.address` (new)         | Impressum address block                                |
| `identity.legal.email` (new)           | Impressum contact + Datenschutz controller email       |
| `i18n.supported` keys                  | Locale loop (`de`, `de-AT`, `de-CH`)                   |

`identity.legal.*` is added to `SystemManifest` schema in the same change. Apps that lack these fields receive scaffolded stubs with `NEED_THIS_<FIELD>` placeholders so `need.markers.validate` (RFC-0095) catches them at build time.

### Outputs (per DE-locale `<lang>`)

```
apps/<id>/src/content/pages/<lang>/impressum.md           # GENERATED_MARKER
apps/<id>/src/content/pages/<lang>/datenschutz.md         # GENERATED_MARKER
apps/<id>/src/content/prose/<lang>/impressum.md           # GENERATED_MARKER
apps/<id>/src/content/prose/<lang>/datenschutz.md         # GENERATED_MARKER
apps/<id>/src/content/navigation/<lang>/navigation.md     # merged-edit (preserve existing targets)
apps/<id>/src/content/site/<lang>/labels.md               # merged-edit (preserve existing keys)
```

All page + prose files carry the RFC-0081 `GENERATED_MARKER` so subsequent runs of `legal.scaffold` can safely overwrite — operator edits land in non-generated regions (e.g. prepended hand-edits before the marker block) or by removing the marker.

Navigation and labels are MERGE edits: `legal.scaffold` adds three nav targets (`impressum`, `datenschutz`, `emailContact`) and populates `footer.legalIds` + `footer.contactIds` without touching unrelated keys. Idempotent — running twice writes 0 files the second time (per RFC-0087).

### Template content (per locale)

Templates live in `packages/os/site-kernel-codegen/src/templates/legal/<lang>/` and follow RFC-0080 `.template.md` suffix policy. Initial set:

- `de/impressum.template.md` — § 5 TMG block, Verantwortlich nach § 55 RStV, Haftungsausschluss, Urheberrecht.
- `de/datenschutz.template.md` — Verantwortlicher, Server-Logs (anonymized), no third-party trackers, DSGVO rights, contact for data requests.
- `de-AT/impressum.template.md` — § 5 E-Commerce-Gesetz + § 25 MedienG variant.
- `de-CH/impressum.template.md` — Swiss DSG variant.

All four address only the minimum-compliance text; extended cases (newsletter, cookies, embedded YouTube/maps) are intentionally NOT covered in v1 — operators add them per their counsel's recommendation.

## Architectural fit

- **RFC-0078** introduced `kernel.wire` for tools/ wiring. RFC-0096 follows the same idea for legal content.
- **RFC-0081** introduced `GENERATED_MARKER`. RFC-0096 emits it on every generated file so re-runs are safe.
- **RFC-0087** required generators to be single-owner, content-driven, idempotent. RFC-0096 is registered in `GENERATOR_OWNERSHIP_MAP` as the sole owner of the six output paths; reads everything from `system.md`; writes 0 files on the second invocation.
- **RFC-0090** required page filenames to match `pageIdToContentFileSlug(pageId)`. The scaffold writes `impressum.md` (slug = "impressum") and `datenschutz.md` (slug = "datenschutz") — both already conformant.
- **RFC-0095** added `footer.legal.validate`. RFC-0096 is the natural author-time companion: scaffold fills the gap, validator confirms it stays filled.

## Design

### Pipeline placement

Run order: `legal.scaffold` runs in the `02-scaffold` onboarding phase, after `onboarding.scaffold` and before `system-md.compile`. Doesn't run automatically during `apps-check.author` — it's an explicit setup command, not a continuous validator.

The onboarding workflow (`.agents/workflows/02-scaffold.md`) gets a step: "Run `legal.scaffold --app <id>` if any supported locale is in `de`/`de-AT`/`de-CH`. Skip otherwise."

### Failure modes

- App not yet scaffolded → command exits 1 with `"system.md not found at <path>; run onboarding.scaffold first"`.
- No DE/AT/CH locale → command exits 0 with `"no DE/AT/CH locale; nothing to scaffold"`.
- Existing files without GENERATED_MARKER → command exits 1 with `"<path> exists and lacks GENERATED_MARKER; refusing to overwrite (use --force)"`.
- `identity.legal.responsibleName/address/email` missing in `system.md` → command writes the stub with `NEED_THIS_RESPONSIBLENAME` / etc. placeholders. `need.markers.validate` (RFC-0095) catches these at build time.

### Output format

```
[OK] legal.scaffold: 6 file(s) written for locale "de":
       - apps/warpgogol-com/src/content/pages/de/impressum.md          (created)
       - apps/warpgogol-com/src/content/pages/de/datenschutz.md        (created)
       - apps/warpgogol-com/src/content/prose/de/impressum.md          (created)
       - apps/warpgogol-com/src/content/prose/de/datenschutz.md        (created)
       - apps/warpgogol-com/src/content/navigation/de/navigation.md    (merged 3 targets)
       - apps/warpgogol-com/src/content/site/de/labels.md              (merged legalIds + contactIds)
```

Re-run:

```
[OK] legal.scaffold: 0 file(s) written for locale "de" (idempotent).
```

## Rollout

1. Extend `SystemManifest` schema (`packages/os/site-kernel-content/src/system-manifest.ts`) with `identity.legal.{responsibleName, address, email}`.
2. Create `packages/os/site-kernel-codegen/src/templates/legal/de/` with the four templates.
3. Implement `runLegalScaffold` in `packages/os/site-kernel-codegen/src/legal-scaffold.ts`. Register the command via `kernel.wire`.
4. Register all six output paths in `GENERATOR_OWNERSHIP_MAP` (RFC-0087) so `generator.ownership.lint` confirms single-ownership.
5. Update `.agents/workflows/02-scaffold.md` with the new step (run if DE-locale).
6. Backfill: nicaragua-projekt — `legal.scaffold` produces the same Impressum stubs nicaragua already has; running with `--force` would reset hand-edits, so the rollout includes a one-time migration note.
7. Update `packages/os/site-kernel-codegen/AGENTS.md` and root `AGENTS.md` with the new command.

## Alternatives considered

- **Per-locale Markdown snippets in `@gogol/share` consumed by a shared layout.** Couples the legal text to the runtime layer — operators can't edit per-app without forking share. Scaffold + GENERATED_MARKER keeps text editable.
- **Generate at build time, not scaffold time.** Hides the legal text from the operator. Authors should see the actual prose in `src/content/` so they can review it before launch.
- **Use external services (e.g. iubenda).** Adds a third-party dependency for content most apps need only the minimum-compliance version of.

## Risks

- Stub text is not legal advice. Mitigation: every template carries a top-of-file comment "Stub for boilerplate compliance only — review with counsel before production launch" that the prose builder strips on render but the operator sees in source.
- `identity.legal.email` may differ from a general contact email (legal notices vs sales). Mitigation: separate field; if absent, falls back to `identity.email`.
- A new locale (e.g. `de-LU`) isn't supported in v1. Mitigation: emit a `[HINT]` listing recognized locales; operator either adds a template or files a follow-up RFC.

## Acceptance criteria

- [x] `identity.legal.{responsibleName, address, email}` added to `SystemManifest` schema with safe optional types. (evidence: implemented historically)
- [x] `packages/os/site-kernel-codegen/src/templates/legal/de/` ships four templates (impressum / datenschutz page+prose). (evidence: packages/ directory, package exists)
- [x] `legal.scaffold` command registered, scope: app, supportsAllApps: true. (evidence: implemented historically)
- [x] All six output paths declared in `GENERATOR_OWNERSHIP_MAP`; `generator.ownership.lint` exits 0. (evidence: implemented historically)
- [x] `pnpm exec werkstatt run legal.scaffold --app <fresh-DE-app>` produces a working footer immediately; `footer.legal.validate` exits 0 after one run. (evidence: implemented historically)
- [x] Second run of the same command writes 0 files (idempotency per RFC-0087). (evidence: implemented historically)
- [x] `.agents/workflows/02-scaffold.md` updated with the new step. (evidence: implemented historically)
- [x] Root `AGENTS.md` mentions `legal.scaffold` under the onboarding section. (evidence: AGENTS.md:1, agent guide updated)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted (currently: proposed). Promotion is a human action.
- Agents MUST NOT change RFC status.
- Templates are static text intentionally — do NOT add cookie consent, analytics, or newsletter clauses here without a new RFC, because those reach into user-facing flows that need explicit operator opt-in.
- The Datenschutz template assumes no third-party trackers / no cookies. Apps that add Plausible, GA, or any embed MUST extend the prose manually; the scaffold's purpose is the minimum-compliance baseline only.
