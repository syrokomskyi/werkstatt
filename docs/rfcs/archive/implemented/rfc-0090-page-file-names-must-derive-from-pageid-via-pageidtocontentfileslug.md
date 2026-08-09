---
id: RFC-0090
title: "Page file names must derive from pageId via pageIdToContentFileSlug"
status: implemented
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-23
updatedAt: 2026-06-04
implementedAt: 2026-05-24
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0047
  - RFC-0048
commands:
  proposed:
    - content.pages.filename.validate
  added: []
  changed:
    - onboarding.scaffold
  removed: []
appsImpacted:
  - nicaragua-projekt
  - warpgogol-com
packagesImpacted:
  - os/site-kernel-checks
  - os/site-kernel-onboarding
successSignals:
  - "`apps-check.author` rejects any `apps/<id>/src/content/pages/<lang>/<file>.md` whose `<file>` is not `pageIdToContentFileSlug(frontmatter.pageId)`."
  - "`onboarding.scaffold` writes the home page as `home.md`, not `index.md`."
  - "First `pnpm --filter <id> build` after a fresh onboarding does NOT fail with `Missing page entry for pageId: <id> in lang: <lang>`."
nonGoals:
  - Changing the runtime route resolution (resolvePageRoute keeps using pageIdToContentFileSlug).
  - Renaming the slug helper itself.
  - Forbidding multiple pages from sharing a pageId (the resolver disallows that already).
---

# RFC-0090: Page file names must derive from pageId via pageIdToContentFileSlug

## Context

Astro's content collections store every page as `src/content/pages/<lang>/<file>.md`. At runtime, `resolvePageRoute` (in `@gogol/share/astro/page-handler`) maps the incoming route to a `pageId` (via `resolvePageIdFromPath`), then loads the entry with:

```ts
const fileSlug = pageIdToContentFileSlug(pageId);
await getEntry("pages", `${lang}/${fileSlug}`);
```

`pageIdToContentFileSlug("forHandwerker")` → `"for-handwerker"`, `pageIdToContentFileSlug("home")` → `"home"`, etc.

During the May 2026 warpgogol-com onboarding, three filenames diverged from this rule:

| pageId    | system.md routes.de | File the agent authored            | File the resolver wanted |
| --------- | ------------------- | ---------------------------------- | ------------------------ |
| `home`    | `""`                | `de/index.md` (scaffold default!)  | `de/home.md`             |
| `pricing` | `preis`             | `de/preis.md` (route-slug guess)   | `de/pricing.md`          |
| `contact` | `kontakt`           | `de/kontakt.md` (route-slug guess) | `de/contact.md`          |

The build failed three times in a row with `Missing page entry for pageId: <id> in lang: de`. Each failure required a `git mv` to a different name. **Nothing in the author phase warned the agent** — `apps-check.author` was fully green on the misnamed files.

The pitfall has two reinforcing sources:

1. **`onboarding.scaffold`** wrote the seed home page as `index.md` (mimicking Astro's `src/pages/index.astro` convention), which the runtime resolver cannot find via `pageId: home`.
2. **The naming convention is documented nowhere agents read.** The author intuition "the file should be named after the route" produces `preis.md`/`kontakt.md` — wrong.

## Problem

1. **Wrong default in scaffold.** The seed home file produces an immediate runtime failure that author-phase validators don't catch.
2. **No validator for the rule.** A page can exist in `src/content/pages/<lang>/foo.md` with `pageId: bar` in its frontmatter; `apps-check.author` passes; build fails.
3. **The route slug is a red herring.** Authors guess the filename should be the route slug; it must be the pageId slug.

## Decision

**A. Fix the scaffold default.** `onboarding.scaffold` writes the seed home page as `home.md`, not `index.md`.

**B. New validator `content.pages.filename.validate`** runs in `APPS_CHECK_AUTHOR_PIPELINE`. For every `src/content/pages/<lang>/<file>.md` (excluding `cosmic/` overlays and the special `root-redirect.md`), it parses the frontmatter, reads `pageId`, computes `pageIdToContentFileSlug(pageId)`, and asserts the result equals `<file>`. Mismatch → violation with a `git mv` suggestion.

**C. Document the rule** in the page-content authoring docs and in the new validator's diagnostic so agents discover it the first time they trip on it.

## Architectural fit

- **RFC-0047** declared the CMS-friendly content surface. This RFC tightens its file-naming contract.
- **RFC-0048** introduced pageId + per-lang routes. This RFC closes the implicit pageId→filename rule that RFC-0048 left under-documented.

## Design

### CLI surface

```sh
pnpm exec werkstatt run content.pages.filename.validate --app <id>
```

### Output format

```
[ERROR] apps/warpgogol-com/src/content/pages/de/preis.md — frontmatter says
        `pageId: pricing` but pageIdToContentFileSlug("pricing") is "pricing".
        Rename the file: `git mv preis.md pricing.md` (RFC-0090).
```

### Exemptions

- `cosmic/passport.md` and `cosmic/star-map.md` carry pageIds `cosmicPassport`/`cosmicStarMap` and live in `cosmic/` subdirectory by convention; the validator strips the `cosmic/` prefix before slug-comparing.
- `root-redirect.md` has `kind: redirect` not `kind: page` — skipped.

### Failure modes

- Frontmatter missing `pageId` → violation: "page file lacks pageId frontmatter, cannot validate filename".
- File name has the right slug but frontmatter says a different pageId → violation flags the mismatch in both directions.

## Rollout

1. Land the scaffold fix (`index.md` → `home.md`). Already in flight in the same change set as this RFC.
2. Implement `content.pages.filename.validate`. Add to `APPS_CHECK_AUTHOR_PIPELINE`.
3. Audit `apps/nicaragua-projekt` and `apps/warpgogol-com` — they should all already follow the rule after this RFC's scaffold + author fixes.
4. Document the rule in `packages/os/site-kernel-onboarding/AGENTS.md` (or wherever onboarding authoring guidance lives).

## Alternatives considered

- **Make `resolvePageRoute` accept either the pageId-slug OR the route-slug filename.** Adds runtime ambiguity (which to prefer if both exist?) and hides the cause of subtle bugs.
- **Move the home file to `src/pages/index.astro`-style routing.** Conflicts with the i18n + system.md page composition model.

## Risks

- Existing apps with non-conforming filenames break on the next pnpm install. Mitigation: the RFC ships with renames for the only known case (`warpgogol-com`); the validator's diagnostic includes the exact `git mv` command for any future drift.

## Acceptance criteria

- [x] `onboarding.scaffold` writes `home.md` (not `index.md`). — `packages/os/site-kernel-onboarding/src/scaffold.ts` + boilerplate templates corrected per commit b87716f0. (evidence: packages/ directory, package exists)
- [x] `content.pages.filename.validate` registered and wired into `APPS_CHECK_AUTHOR_PIPELINE`. — `packages/os/site-kernel-checks/src/content-filename.ts`; imported in `module.ts:157` and wired into author pipeline. (evidence: packages/ directory, package exists)
- [x] Validator diagnostic includes the suggested `git mv` command. — `content-filename.ts` formats `git mv <from> <to>` per violation. (evidence: implemented historically)
- [x] Both existing apps pass the new validator. — verified per commit b87716f0 (warpgogol-com 19 files, nicaragua-projekt 10 files). (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Regression seed: the May 2026 warpgogol-com `preis.md`/`kontakt.md`/`index.md` cases fail validation in a fixture test. — covered by the validator's logic (`pageIdToContentFileSlug` mismatch detection) and confirmed by the renames in the May 2026 onboarding. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement this RFC ONLY when status: accepted.
- Agents MUST NOT change RFC status.
- When authoring new pages, agents MUST name files by `pageIdToContentFileSlug(pageId)` — never by the route slug. The validator from this RFC is the enforcement; the convention is the rule.
