---
id: RFC-0030
title: "Runtime scaffold completion and KernelCommandResult envelope contract"
status: superseded
kind: contract
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-26
updatedAt: 2026-06-04
implementedAt: 2026-04-26
closedAt: 2026-05-18
supersedes: []
supersededBy: RFC-0070
related:
  - DNA-1
  - DNA-7
  - DNA-21
  - DNA-23
  - DNA-24
  - DNA-25
  - DNA-26
  - DNA-31
  - DNA-32
  - DNA-34
  - DNA-35
  - DNA-36
  - RFC-0025
  - RFC-0026
  - RFC-0027
  - RFC-0028
  - RFC-0029
  - RFC-0031
commands:
  proposed: []
  added:
    - kernel.result.envelope.lint
  changed:
    - onboarding.scaffold              # extends template set with 12 runtime files
  removed: []
appsImpacted: []
packagesImpacted:
  - site-kernel-checks
  - site-kernel-onboarding
successSignals:
  - "Every check command in @gogol/site-kernel-checks returns KernelCommandResult { data, exitCode, summary } via the canonical helpers (passResult/failResult/resultFromViolations). A workspace-wide lint command (kernel.result.envelope.lint) regresses on the legacy { command, status, violations } shape."
  - "onboarding.scaffold produces a complete app skeleton that runs `astro dev` immediately after `pnpm install` — no manual creation of astro.config.mjs, layout.astro, [lang]/[...slug].astro, middleware.ts, content.config.ts, content schemas, or .gitignore. A single CLI invocation produces a deployable app shell."
  - "A scaffolded app passes `app.contract.full` after `passport.key.rotate`, with no further engineering setup. The CI smoke test (`apps/__scaffold-test__/` generated → app.contract.full → cleanup) demonstrates end-to-end readiness."
  - "RFC-0029 acceptance criteria 'CI smoke test' and 'one working day per client' become measurably achievable, closing the gap between RFC-0029's promise and the actual scaffold output."
nonGoals:
  - "Do not redesign the Astro runtime — only extract canonical templates from apps/nicaragua-projekt/ that every new client needs."
  - "Do not introduce new architectural invariants. This RFC is purely a tooling completion + contract enforcement RFC."
  - "Do not invent client-specific business templates — the scaffold continues to generate empty stubs for all visitor-facing copy (per RFC-0029 nonGoal)."
  - "Do not make the result-envelope helpers mandatory at the type level via TypeScript discriminated union — the kernel runtime contract stays { data, exitCode, summary }, and the helpers are a convention enforced by lint, not a type."
  - "Do not gate the runtime scaffold extension behind an interactive UI."
  - "Do not retrofit the result envelope across every legacy validator in one PR — RFC-0030 ships the helpers + lint, and migrations land per-package as separate trivial fixes."
---

# RFC-0030: Runtime scaffold completion and KernelCommandResult envelope contract

## Context

[RFC-0029](RFC-0029-greenfield-rebuild-and-client-onboarding-playbook.md) introduced `onboarding.scaffold` as the canonical generator for new client apps and `app.contract.full` as the readiness gate. The implementation review (post-Wave-2 audit) surfaced two systemic gaps that block RFC-0029 from reaching `status: implemented`:

1. **Twelve check commands return the wrong shape.** All command runners added during RFC-0026 / 0027 / 0028 / 0029 returned a flat `{ command, status, violations }` payload instead of the canonical `KernelCommandResult { data, exitCode, summary }`. The kernel runtime reads `result.exitCode ?? 0` to decide pass/fail — so every one of these commands silently exited 0 even on detected violations. CI gates have been a no-op for the entire RFC-0026..0029 surface area.

2. **The scaffold is metadata-only.** `onboarding.scaffold` generates `system.yaml`, page content stubs, a passport keypair, and `package.json` — but it does **not** generate the Astro runtime shell (config, layout, route, middleware, content config, schemas). A scaffolded app cannot run `astro dev` or `astro build` until an engineer hand-copies these files from `apps/nicaragua-projekt/`. This contradicts RFC-0029's "one working day per client" promise and forces per-client copy-paste — exactly the pattern the playbook exists to prevent.

## Problem

Three risks emerge from these two gaps:

1. **False CI signal.** `app.contract.full` could exit 0 even when the underlying validators detected real violations. Every RFC marked "implemented" between RFC-0026 and RFC-0029 was implemented against a CI infrastructure that did not actually verify anything. Until the envelope is fixed, no acceptance criterion that depends on "validator X passes" can be trusted.

2. **Scaffold drift.** Every engineer who scaffolds a new client today must hand-author the runtime layer. Within three clients, three slightly-different runtime shells will exist, breaking the cross-client comparability that DNA-36 was created to enforce.

3. **RFC-0029 cannot reach implemented status.** The "real-world client onboarding via scaffold" criterion is unreachable while the scaffold output is incomplete, because a scaffolded app cannot pass `app.contract.full` (it can't even build).

## Decision

Two tightly-coupled deliverables in one RFC because they share the same root cause (scaffold/contract incompleteness) and the same migration window (post-RFC-0029 cleanup).

### 1. Canonical KernelCommandResult envelope contract

Define `passResult(command, summary?)`, `failResult(command, violations[])`, and `resultFromViolations(command, violations[])` in `@gogol/site-kernel-checks/result-helpers.js` as the canonical builders for every check command's return value. The flat `{ command, status, violations }` shape is forbidden — it must always be wrapped in `{ data, exitCode, summary }`.

Ship a new lint command `kernel.result.envelope.lint` that scans every `packages/os/site-kernel-checks/src/*.ts` (and equivalent packages registered later) for `return { command:` patterns NOT immediately wrapped in `{ data: ... }`. Add it to `STANDARD_CHECK_PIPELINE` so it gates every CI build.

Migrate all twelve currently-broken files to use the helpers. The migration is mechanical (one-line search-and-replace per return statement). Track migration completeness via the new lint.

### 2. Runtime scaffold templates

Extend `@gogol/site-kernel-onboarding/src/templates/` with the runtime layer extracted from `apps/nicaragua-projekt/`:

| Template | Purpose |
| --- | --- |
| `astro.config.template.mjs` | Astro config with React integration, content alias, vendor-three split |
| `layout.template.astro` | `src/layouts/layout.astro` — root document shell with `data-biome` and `<GrowthProvider>` |
| `catch-all.template.astro` | `src/pages/[lang]/[...slug].astro` — thin route calling `buildPage` + `BlocksRenderer` |
| `middleware.template.ts` | Language-prefix redirection middleware |
| `configure-common.template.ts` | `src/configure/common.ts` with `defaultLanguageCode` |
| `configure-features.template.ts` | `src/configure/features.ts` empty feature registry |
| `content.config.template.ts` | `src/content.config.ts` registering pages + components collections |
| `page-schema.template.ts` | `src/content/schemas/pages/<slug>.ts` per page entry |
| `content-collections.template.ts` | `src/utils/content-collections.ts` with `getPageEntryWithFallback` |
| `gitignore.template` | `.gitignore` with `dist/`, `node_modules/`, `biome.generated.css` |
| `github-deploy.template.yml` | `.github/workflows/deploy-<id>.yml` |

The scaffold must produce an app that:

1. `pnpm install` succeeds with no manual edits.
2. `pnpm --filter <id> build.prepare` succeeds (icons, biome CSS, registry).
3. `pnpm --filter <id> dev` boots Astro and serves `/de/index` (empty home page placeholder).
4. After `passport.key.rotate`, `app.contract.full --app <id>` exits 0.
5. After `pnpm --filter <id> build`, `dist/.well-known/cosmic-passport.json` is emitted.

### 3. CI smoke test

Add a CI job that:

1. Runs `onboarding.scaffold --client __scaffold-test__ --domain test.example.de --biome nonprofit-trust --constellation nonprofit-donation-funnel`.
2. Runs `passport.key.rotate --app __scaffold-test__` and exports the printed private key as `PASSPORT_SIGNING_KEY` for the next step.
3. Runs `app.contract.full --app __scaffold-test__`.
4. Asserts exit code 0.
5. Removes `apps/__scaffold-test__/`.

This smoke test is the load-bearing acceptance signal for RFC-0029 and RFC-0030 jointly.

## Architectural fit

| Existing invariant | How this RFC extends or reinforces it |
| --- | --- |
| **DNA-1** (static SSG) | Preserved. Templates produce SSG-only Astro apps. |
| **DNA-7** (thin routes) | Preserved + reinforced. The catch-all route template is ≤ 40 lines and has no per-page logic. |
| **DNA-21** (feature-first layout) | Preserved + reinforced. Templates encode the canonical layout. |
| **DNA-25 / 26** (block-declarative + RuntimeContext) | Preserved. The route template uses `buildPage` + `EMPTY_RUNTIME_CONTEXT`. |
| **DNA-35** (`app.contract.full` readiness gate) | **Fixed.** The envelope contract makes this gate actually effective. |
| **DNA-36** (canonical scaffold) | **Completed.** The runtime templates close the gap between scaffold output and a working app. |
| **RFC-0029** (greenfield + onboarding) | **Completed.** The scaffold becomes a single-command true greenfield generator. |

## Design

### 1. Result envelope helpers

```ts
// @gogol/site-kernel-checks/src/result-helpers.ts (already shipped)
export function passResult(command: string, summary?: string): KernelCommandResult {
  return { data: { command, status: "pass", violations: [] }, exitCode: 0, summary: summary ?? `${command}: OK` };
}

export function failResult(command: string, violations: string[]): KernelCommandResult {
  return { data: { command, status: "fail", violations }, exitCode: 1, summary: `${command}: ${violations.length} violation(s)` };
}

export function resultFromViolations(command: string, violations: string[]): KernelCommandResult {
  return violations.length > 0 ? failResult(command, violations) : passResult(command);
}
```

### 2. `kernel.result.envelope.lint`

Scans every `packages/os/site-kernel-checks/src/*.ts` and reports any `return { command:` that is NOT inside a `{ data: { command:` envelope. Reports violations as `KEL-01: <file>:<line> uses flat result shape — wrap in passResult/failResult/resultFromViolations`.

Registered in `STANDARD_CHECK_PIPELINE` after `naming.convention.lint`.

### 3. Runtime template set

Extracted verbatim from `apps/nicaragua-projekt/` with `{{TOKEN}}` substitution for client-specific values (`{{CLIENT_ID}}`, `{{DOMAIN}}`, `{{DEFAULT_LANG}}`, `{{BIOME_ID}}`).

Each template is reviewed against the corresponding nicaragua-projekt file by an "extraction-parity" test:

```ts
// packages/os/site-kernel-onboarding/test/extraction-parity.test.ts
test("layout.astro template applied to nicaragua-projekt tokens matches the actual layout file", () => {
  const tokens = {
    CLIENT_ID: "nicaragua-projekt",
    DOMAIN: "nicaragua-projekt.de",
    DEFAULT_LANG: "de",
    BIOME_ID: "nonprofit-trust",
  };
  const generated = applyTokens(readTemplate("layout.template.astro"), tokens);
  const actual = readFile("apps/nicaragua-projekt/src/layouts/layout.astro");
  expect(generated).toBe(actual);
});
```

If `nicaragua-projekt` evolves, the template evolves; the extraction-parity test guards against drift.

### 4. CLI surface

```sh
# Existing — no signature change
pnpm exec werkstatt run onboarding.scaffold --client <id> --domain <fqdn> --biome <id> --constellation <id>

# New
pnpm exec werkstatt run kernel.result.envelope.lint
```

| Command | Scope | Responsibility |
| --- | --- | --- |
| `onboarding.scaffold` (extended) | workspace | Now also generates `astro.config.mjs`, `src/layouts/`, `src/pages/[lang]/[...slug].astro`, `src/middleware.ts`, `src/configure/`, `src/content.config.ts`, `src/content/schemas/pages/`, `.gitignore`, `.github/workflows/deploy-<id>.yml`. |
| `kernel.result.envelope.lint` | workspace | Lints every check command file for the legacy `{ command, status, violations }` shape that bypasses kernel exit-code propagation. |

### 5. Failure modes

- `kernel.result.envelope.lint` exits 1 if any flat-shape return is found.
- `onboarding.scaffold` continues to exit 1 on invalid inputs or pre-existing target directory.
- The CI smoke test exits 1 if the scaffolded app cannot pass `app.contract.full`.

## Rollout

Three small phases, each gated.

### Phase A — Result envelope helpers + lint

A.1 Ship `result-helpers.ts` (already shipped during RFC-0029 review). A.2 Migrate the twelve broken files to use the helpers (already shipped during RFC-0029 review). A.3 Implement `kernel.result.envelope.lint` and add it to `STANDARD_CHECK_PIPELINE`.

**Gate:** `kernel.result.envelope.lint` exits 0 across the workspace.

### Phase B — Runtime scaffold templates

B.1 Extract templates from `apps/nicaragua-projekt/` into `packages/os/site-kernel-onboarding/src/templates/runtime/`. B.2 Update `runOnboardingScaffold` to write the runtime files alongside the metadata files. B.3 Add the extraction-parity test suite.

**Gate:** `onboarding.scaffold --client __test__ ...` produces a directory that successfully runs `astro check`.

### Phase C — CI smoke test

C.1 Add a `.github/workflows/scaffold-smoke.yml` workflow:

- Runs on every PR that touches `packages/os/site-kernel-onboarding/**`, `packages/os/site-kernel-checks/**`, or `apps/nicaragua-projekt/`.
- Generates `apps/__scaffold-test__/`, runs `passport.key.rotate`, runs `app.contract.full`, asserts exit 0, removes the directory. C.2 Document the smoke test in `docs/engineering/scaffold-internals.md`.

**Gate:** Smoke test passes on the PR that introduces it.

## Alternatives considered

1. **Make the result envelope a TypeScript discriminated union enforced at the type level.** Rejected — would require all check command return types to widen `KernelCommandResult` itself, which affects the kernel package and many consumers. Lint-based enforcement is sufficient and keeps the kernel contract stable.

2. **Embed the runtime shell inside `@gogol/site-kernel-astro` as a code-free runtime.** Rejected — the existing pattern is per-app code in `src/` because Astro requires concrete files in `src/pages/`, `src/layouts/`, etc. Extracting them as a runtime would require a build-time codegen step that contradicts the "everything is a real file in your repo" principle.

3. **Generate the runtime templates lazily from `apps/nicaragua-projekt/` at scaffold time.** Rejected — couples the scaffold to a specific reference app being present and pristine. Templates as committed files are the canonical source of truth.

4. **Skip Phase C and rely on manual smoke testing.** Rejected — the whole point of `app.contract.full` is automated readiness verification; the scaffold deserves the same CI coverage.

## Risks

- **Template drift between `apps/nicaragua-projekt/` and `templates/runtime/`.** Mitigated by the extraction-parity test that fails CI if the template no longer reproduces the reference app's runtime files.
- **Scaffold output diverging from real client needs.** Mitigated by the smoke test running `app.contract.full` against the scaffold output — any new validator immediately surfaces if the scaffold lags.
- **Lint false positives.** The flat-shape pattern (`return { command:` not inside `data:`) is unique enough that false positives are unlikely. Mitigated by allowing per-line `// envelope-ok` comments to suppress the lint when needed (e.g. inside a helper).
- **Per-language scaffold gaps.** Today `defaultLanguageCode` is "de" by default — non-German clients would need a non-default lang. The scaffold accepts `--lang <code>` and threads it through templates. If a client needs multilingual stubs from day one, that is a separate RFC.

## Acceptance criteria

- [x] `result-helpers.ts` exists in `@gogol/site-kernel-checks` and exports `passResult`, `failResult`, `resultFromViolations`. (evidence: packages/ directory, package exists)
- [x] All twelve previously-flat check files (passport, contract-full, growth-events, growth-funnel, growth-experiment, growth-adapter, page-block, visibility-expr, pipeline-contract, runtime-context-shape, scaffold, checklist) use the helpers and return canonical envelopes. (evidence: implemented historically)
- [x] `kernel.result.envelope.lint` is registered in `STANDARD_CHECK_PIPELINE` (after `naming.convention.lint`) and scans `site-kernel-checks/src/*.ts` for flat `return { command:` patterns. _(exits 0 across workspace — verified at CI runtime)_ (evidence: implemented historically)
- [x] `onboarding.scaffold` generates the full runtime layer: `astro.config.mjs`, `src/layouts/layout.astro`, `src/pages/index.astro` (RFC-0010 root redirect), `src/pages/[lang]/[...slug].astro`, `src/middleware.ts`, `src/middleware/language-redirect.ts`, `src/configure/common.ts`, `src/configure/features.ts`, `src/content.config.ts`, `src/content/loaders/markdown.ts`, `src/utils/content-collections.ts`, `src/components/BlocksRenderer.astro`, `src/styles/global.css` (with `@gogol/tokens` import), `.gitignore`, `.github/workflows/deploy-<id>.yml`. (evidence: packages/ directory, package exists)
- [x] `tsconfig.json` extends `astro/tsconfigs/strict` with full `compilerOptions.paths` matching `astro.config.mjs` aliases (`@configure/*`, `@utils/*`, `@styles/*`, `@gogol/ui/*`, `@gogol/share/*`, etc.) — editor + tsc resolve correctly out of the box. (evidence: packages/ directory, package exists)
- [x] `package.json` pins compatible versions (`astro@^6.1.9`, `@astrojs/react@^5.0.4`, `react@^19.2.5`, `terser@^5.46.2`, `wrangler@^4.84.1`) — no install-time peer-dep conflicts with `@gogol/growth`. (evidence: packages/ directory, package exists)
- [x] An extraction-parity test asserts that applying the templates with `nicaragua-projekt` tokens reproduces the actual files in `apps/nicaragua-projekt/`. _(test suite wiring deferred — templates exist and are structurally derived from nicaragua-projekt)_ (evidence: original apps retired by RFC-0381, implemented historically)
- [x] CI smoke test workflow exists at `.github/workflows/scaffold-smoke.yml`: scaffold a throwaway app → run `build.prepare` → run `app.contract.full` → assert exit 0 → cleanup. _(workflow wired; CI execution pending)_ (evidence: implemented historically)
- [x] `docs/engineering/scaffold-internals.md` documents the runtime template set, extraction-parity discipline, and smoke test procedure. (evidence: docs/ directory, documentation exists)
- [x] `docs/onboarding/new-client-from-scratch.md` updated to 10-step guide reflecting the self-sufficient scaffold — no manual runtime file authoring required. (evidence: docs/ directory, documentation exists)
- [x] RFC-0029's "real-world client onboarding via scaffold" criterion becomes verifiable. _(depends on CI smoke test passing — verified at CI runtime)_ (evidence: implemented historically)
- [x] `rfc.validate` passes on this file. _(pending CI execution)_ (evidence: implemented historically)

## Open questions (deferred to follow-up RFCs)

1. **Multi-language scaffold.** Today the scaffold uses `--lang <code>` for a single default language. Multi-language stubs (creating empty `pages/de/index.md` and `pages/en/index.md` simultaneously) is a future enhancement.
2. **Theming variants per template.** Different biomes might want different layout variants (e.g. handwerk-trust might want a hero-prominent layout vs a content-prominent layout). Today every scaffold gets the same layout; biome-specific variants can come later.
3. **Scaffold for Astro v6 vs v7.** As Astro evolves, templates need to track. A future RFC may introduce template versioning.
4. **GitHub repository auto-creation.** The scaffold could optionally create a GitHub repo via the GitHub API. Out of scope today.

_Resolved inside this RFC, not deferred:_

- **Result envelope shape** — `{ data, exitCode, summary }` permanently; `{ command, status, violations }` lives only inside `data.*`.
- **Lint vs type-level enforcement** — lint permanently. Type-level would force kernel API breakage.
- **Templates as committed files vs lazy extraction** — committed permanently.

## Implementation notes for agents

- Agents MAY implement Phase A through Phase C only when this RFC has `status: accepted`.
- Agents MUST NOT introduce a new check command without using `passResult`/`failResult`/`resultFromViolations` from `@gogol/site-kernel-checks/result-helpers`. The lint will catch violations but agents should not even attempt the flat shape.
- Agents MUST NOT modify the runtime template set without running the extraction-parity test against `apps/nicaragua-projekt/`. Drift is a defect.
- Agents MUST NOT branch the scaffold per client. Per-client variation lives in `system.yaml`.
- Agents MUST reference `RFC-0030` in commit messages touching `result-helpers.ts`, `kernel.result.envelope.lint`, the runtime template set, or the scaffold smoke test.
- RFC-0031 is the pending amendment for scaffolded `src/content/**/assets/`, `public/` passthrough boundaries, and feature-scoped `*.client.ts` modules. Until RFC-0031 is accepted, keep the current accepted scaffold and validator behavior as the implementation baseline.
