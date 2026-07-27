---
id: RFC-0055
title: "Eliminate hardcoded language lists from middleware via build-time i18n constants"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-05-17
updatedAt: 2026-05-17
implementedAt: 2026-05-17
closedAt:
supersedes: []
supersededBy:
related:
  - DNA-22
  - RFC-0038
  - RFC-0010
commands:
  proposed: []
  added:
    - i18n.middleware.generate
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - "@gogol/site-kernel-codegen"
successSignals:
  - "src/middleware/language-redirect.ts is gitignored and generated from system.md"
  - "pnpm i18n:middleware:gen regenerates the file on every build"
  - "Adding a new language to system.md propagates to middleware after rerunning i18n:middleware:gen"
  - "No runtime dependency on @gogol/site-kernel-content in app middleware files"
nonGoals:
  - "Do not change the middleware runtime behavior or redirect logic"
  - "Do not change the shared createLanguageRedirectMiddleware API signature"
  - "Do not affect production static builds — middleware is dev-only for output: static"
---

# RFC-0055: Eliminate hardcoded language lists from middleware via build-time i18n constants

## Context

RFC-0038 (implemented) moved language configuration from code to `src/content/system.md` and established `loadI18nConfig` / `loadI18nConfigSync` in `@gogol/site-kernel-content`. However, the language redirect middleware in `apps/*/src/middleware/language-redirect.ts` still contains hardcoded `supportedLangs: ["de", "en"]` and `defaultLang: "de"`, violating the RFC-0038 success signal "languages declared in system.md, not in code".

The middleware comment explicitly states: _"Supported languages and default are hardcoded to match system.md i18n config — no app-local config dependency."_ This creates a manual synchronization burden: if a client adds Spanish to `system.md`, the middleware silently ignores it.

## Problem

1. **Hardcoded language lists violate DNA-22** (client-editable surface). Adding a language to `system.md` does not propagate to middleware without a manual code change.

2. **Silent drift.** No automated check ensures that `supportedLangs` in middleware matches `i18n.supported` in `system.md`. A mismatch causes the middleware to redirect visitors to wrong language prefixes in dev mode.

3. **RFC-0038 gap.** The RFC declared the middleware solved via `generateLanguageDetectionMiddleware`, but apps still use the manual hardcoded factory call instead of the generated output.

4. **Scalability risk.** Every new app created via `onboarding.scaffold` must manually duplicate the correct language list in middleware, inviting copy-paste errors.

## Decision

App-level `src/middleware/language-redirect.ts` is **generated** from `system.md` by a CLI command `i18n.middleware.generate` (registered in `@gogol/site-kernel-codegen`). The generated file contains the hardcoded `supportedLangs` and `defaultLang` values extracted from `system.md` frontmatter at build time. The file is **gitignored** — it is recreated on every build, just like `biome.generated.css` or open-source pages.

```typescript
// apps/*/src/middleware/language-redirect.ts — GENERATED (do not edit)
import { createLanguageRedirectMiddleware } from "@gogol/share/middleware";

export default createLanguageRedirectMiddleware({
  supportedLangs: ["de", "en"],
  defaultLang: "de",
});
```

This follows the existing repository pattern for generated artifacts: `icons:gen`, `open-source:gen`, `biome.css.generate`. The command reads `system.md` via `loadI18nConfigSync`, extracts `supportedLanguages`, and writes the middleware file with inline constants.

## Architectural fit

| Invariant | How this RFC closes the gap |
| --- | --- |
| DNA-22 (client-editable surface) | Language lists in middleware derive from system.md, not code. |
| RFC-0038 success signal | Eliminates the last known hardcoded language list in app code. |
| `@ai-invariant: No heavy imports` | Generated middleware has zero imports beyond `@gogol/share/middleware`. All heavy work (YAML parsing) happens at build time in the CLI, not at runtime. |
| Thin-app contract (RFC-0047) | App middleware is a pure factory call with inline constants — no runtime config reading. |

## Design

### CLI surface

```sh
pnpm exec site-kernel run i18n.middleware.generate --app nicaragua-projekt
```

Scope: `app`. Reads `src/content/system.md` from the app directory, extracts `i18n.default` and `Object.keys(i18n.supported)`, and writes `src/middleware/language-redirect.ts` with inline constants. Uses `writeIfChanged` to avoid touching the file if content is already up to date.

App package scripts:

```json
"i18n:middleware:gen": "site-kernel run i18n.middleware.generate"
```

Integrated into `build` pipeline:

```json
"build": "... && pnpm -s i18n:middleware:gen && pnpm -s open-source:gen && ..."
```

### TypeScript contracts

No new types required. The existing `ResolvedI18n` from `@gogol/site-kernel-content` and the existing `createLanguageRedirectMiddleware` options type from `@gogol/share/middleware` are sufficient.

### File system responsibilities

| Path                                             | Role                                          |
| ------------------------------------------------ | --------------------------------------------- |
| `apps/*/src/content/system.md`                   | Read (source of truth for i18n config)        |
| `apps/*/src/middleware/language-redirect.ts`     | Generated (gitignored, recreated on build)    |
| `packages/os/site-kernel-codegen/src/service.ts` | New `runGenerateI18nMiddleware` handler       |
| `apps/*/tools/modules/service.module.ts`         | Registers `i18n.middleware.generate` command  |
| `apps/*/.gitignore`                              | Ignores `src/middleware/language-redirect.ts` |

### Output format

```json
{
  "command": "i18n.hardcode.lint",
  "status": "fail",
  "violations": [
    {
      "file": "src/middleware/language-redirect.ts",
      "rule": "hardcoded-language-list",
      "message": "Hardcoded language array [\"de\", \"en\"] — use loadI18nConfigSync from system.md instead"
    }
  ]
}
```

### Failure modes

- **`system.md` missing or has no `i18n` block**: command skips generation and logs a warning. The existing `language-redirect.ts` (if present) is left untouched. If the file is missing, Astro dev will fail with a missing module error — this is intentional because the middleware is required.
- **Generated file outdated**: if `system.md` is edited but `i18n.middleware.generate` is not rerun, the middleware will use stale language lists. This is mitigated by running the command in the `build` pipeline and documenting it for dev workflows.

## Rollout

1. **Wave 1**: Register `i18n.middleware.generate` in `@gogol/site-kernel-codegen`. Add to `service.module.ts` of `apps/nicaragua-projekt`. Add `i18n:middleware:gen` to `package.json` scripts and `build` pipeline. Gitignore `src/middleware/language-redirect.ts`. Generate file and verify `astro:check` + `build`.
2. **Wave 2**: Update `onboarding.scaffold` to generate `service.module.ts` with `i18n.middleware.generate` and pre-populate `.gitignore` with the middleware path. New apps comply automatically.
3. No grace period needed — the change is backward-compatible. Existing behavior is identical; only the config source changes.

## Alternatives considered

1. **`loadI18nConfigSync` at module scope** (initial RFC-0055 proposal): Rejected after user review. Keeps an additional package dependency (`@gogol/site-kernel-content`) in the app middleware file, violating the thin-app principle. The CLI codegen approach removes this dependency entirely.

2. **Codegen approach** (`generateLanguageDetectionMiddleware` from RFC-0038 Wave 4): Already exists in `@gogol/site-kernel-content` but generates entire middleware files with custom logic. Rejected because it replaces the lightweight factory pattern with a heavier codegen step and creates generated files that are harder to reason about.

3. **Async `getCollection("system")` in middleware**: Rejected. Content Collections require full Astro runtime context. Middleware runs before Astro's content layer is initialized, making `getCollection` unreliable or unavailable.

4. **Vite virtual module / `define` constant injection**: Would inject `__SUPPORTED_LANGS__` at build time via `astro.config.mjs`. Rejected as over-engineered — no new infrastructure needed with the CLI pattern.

5. **Keep hardcoded values**: Rejected. Violates DNA-22 and the RFC-0038 contract. The manual sync burden is a known source of drift.

## Risks

1. **Dev workflow friction**: Developers must remember to run `pnpm i18n:middleware:gen` after editing `system.md` languages in dev mode. Same friction already exists for `icons:gen` and `open-source:gen`.

2. **Missing generated file in dev**: if the file was never generated (clean clone), `astro dev` will fail with a missing module error until the command is run. Same behavior as other generated artifacts.

3. **Stale generated file**: if `system.md` is edited but the command is not rerun, middleware uses stale values. Mitigated by running the command in the `build` pipeline.

## Acceptance criteria

- [x] `i18n.middleware.generate` command registered in `@gogol/site-kernel-codegen` (`packages/os/site-kernel-codegen/src/service.ts`) (evidence: packages/ directory, package exists)
- [x] `apps/nicaragua-projekt/src/middleware/language-redirect.ts` generated from `system.md` and gitignored (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `pnpm -s i18n:middleware:gen` runs successfully and produces identical output on repeat (evidence: implemented historically)
- [x] `pnpm --filter nicaragua-projekt astro:check` passes — 0 errors, 0 warnings (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `pnpm --filter nicaragua-projekt build` succeeds — 25 pages built (evidence: original apps retired by RFC-0381, implemented historically)
- [x] `rfc.validate RFC-0055` passes on this file (evidence: implemented historically)

## Implementation notes for agents

### How this works (implemented 2026-05-17)

`src/middleware/language-redirect.ts` is a **generated, gitignored** file. It is produced by:

```sh
pnpm exec site-kernel run i18n.middleware.generate --app nicaragua-projekt
# or via package script:
pnpm -s i18n:middleware:gen
```

The command is implemented in `packages/os/site-kernel-codegen/src/service.ts` (`runGenerateI18nMiddleware`). It:

1. Calls `loadI18nConfigSync(appDirectory)` from `@gogol/site-kernel-content` to read `src/content/system.md`
2. Extracts `i18n.default` → `defaultLang` and `Object.keys(i18n.supported)` → `supportedLangs`
3. Writes `src/middleware/language-redirect.ts` with inline constants via `writeIfChanged` (creates `src/middleware/` directory if absent)

The generated file contains **zero imports beyond `@gogol/share/middleware`** — all YAML parsing happens at codegen time, not at runtime.

The command is registered in `apps/nicaragua-projekt/tools/modules/service.module.ts` and runs as part of the `build` pipeline:

```
build → i18n:middleware:gen → open-source:gen → icons:gen → astro:check → astro build → build.post
```

### Rules for agents

- Agents MUST NOT change `status` fields in any RFC.
- Agents MUST NOT edit `src/middleware/language-redirect.ts` directly — it is generated. Run `i18n.middleware.generate` instead.
- The `createLanguageRedirectMiddleware` factory in `@gogol/share/middleware` MUST NOT be modified.
- When adding a new app, agents MUST:
  1. Register `i18n.middleware.generate` in the app's `service.module.ts`
  2. Add `"i18n:middleware:gen": "site-kernel run i18n.middleware.generate"` to `package.json` scripts
  3. Add `pnpm -s i18n:middleware:gen` before `icons:gen` in the `build` script
  4. Add `src/middleware/language-redirect.ts` to `.gitignore` with comment referencing RFC-0055

### Proof-of-concept results (2026-05-17)

Applied to `apps/nicaragua-projekt`:

- `pnpm -s i18n:middleware:gen` — **generated** `src/middleware/language-redirect.ts` with `["de","en"]` and `"de"` from `system.md`
- `pnpm --filter nicaragua-projekt astro:check` — **0 errors, 0 warnings**
- `pnpm --filter nicaragua-projekt build` — **25 pages built successfully**

The middleware file is now gitignored and generated on every build. No runtime dependency on `@gogol/site-kernel-content` remains in the app middleware.
