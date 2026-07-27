---
id: RFC-0139
title: "Delta-scoped amend author gate: judge an amend batch on what it changed, not on pre-existing whole-app debt"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-06-01
updatedAt: 2026-06-01
implementedAt: 2026-06-01
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0073
  - RFC-0074
  - RFC-0085
  - RFC-0135
  - RFC-0136
commands:
  proposed: []
  added:
    - amend.delta.files
  changed:
    - amend-check.author
    - amend-check.postbuild
    - content.references.validate
    - content.voice.lint
    - content.business.validate
    - page.block.validate
    - page.shell.validate
  removed: []
appsImpacted:
  - webgogol-com
packagesImpacted:
  - os/site-kernel-onboarding
  - os/site-kernel-checks
successSignals:
  - An amend batch passes amend-check.author / amend-check.postbuild iff the files it actually wrote are clean, regardless of pre-existing whole-app validator debt on untouched pages.
  - Each deterministic content validator accepts an optional --scope-files filter; when absent it behaves exactly as today (whole-app), so the greenfield chain and CI are unchanged.
  - amend-check computes the batch's touched file set from the same delta source as audit.delta.run (provenance record → manifest fallback), so author-scoping and audit-scoping agree.
  - Pre-existing failures outside the delta are reported as carried-forward debt (warn/info), never as amend errors.
nonGoals:
  - Weakening any validator's rules, or changing greenfield (whole-app) gating.
  - Fixing the specific pre-existing debt that motivated this RFC (e.g. founder-trust-card schema drift) — that is a separate correctness task.
  - Adding non-regression baselining to app-level audits; audit.delta.run already owns that (RFC-0136).
  - Turning the deterministic validators into incremental watchers; the filter is a one-shot scope, not a cache.
---

# RFC-0139: Delta-scoped amend author gate: judge an amend batch on what it changed, not on pre-existing whole-app debt

## Context

RFC-0135/0136 built the amend-onboarding chain: an immutable per-batch bundle, an app-present precondition, a strengthen / new-route / expand-locale branch (the third intent added during the amend-001 live run), and two composite gates that mirror the RFC-0085 author/post-build split:

- `amend-check.author` → `content.business.validate`, `content.references.validate`, `content.voice.lint`, `page.block.validate`, `content.coverage.delta`.
- `amend-check.postbuild` → `audit.delta.run`, `amend.provenance.validate`.

`audit.delta.run` (RFC-0136) is delta-aware: it reads the batch's touched pageIds from the provenance record (falling back to the input manifest) and carries a non-regression guarantee for the **app-level** RFC-0074 audits.

## Problem

The **author** composite is not delta-scoped. Every validator in `amend-check.author` runs over the **whole app**, so any pre-existing whole-app debt on a page the batch never touched fails the amend batch.

This is not hypothetical — it is exactly what the amend-001 live run hit. The batch added 12 legal documents (6 bilingual legal pages) with zero violations of their own, yet `amend-check.author` failed because `page.block.validate` flagged `pages/de/home.md` (`founder-trust-card` props that the section archetype/manifest schema had drifted out of sync with). The home page has nothing to do with the legal batch, but it blocked the gate.

The deeper issue: `amend-check.author` and `audit.delta.run` differ only in _which_ validator set they dispatch, not in _scope_. Both still run validators app-wide. The audit set happened to pass because the app already satisfies the app-level audits; the author set failed because it contains strict per-page validators that surface carried-forward debt.

Consequence: an amend batch's green/red signal depends on the entire backlog of unrelated content debt, which (a) punishes amend authors for others' debt, (b) tempts agents to "fix" unrelated pages mid-batch (scope creep, exactly what amend-001 had to do), and (c) makes the gate non-monotonic — adding a clean batch can stay red forever.

## Decision

Make the amend author/post-build gates judge a batch on **the files it actually changed**.

1. Add an optional `--scope-files <comma-separated repo-relative paths>` filter to the deterministic content validators that `amend-check` dispatches. When present, the validator evaluates only the listed files. When absent, behaviour is **unchanged** (whole-app) — greenfield and CI are untouched.
2. `amend-check.author` / `amend-check.postbuild` compute the batch's touched file set from the same delta source as `audit.delta.run` and inject it as `--scope-files` into every per-file/per-page deterministic step.
3. Findings on files **outside** the delta are reported as carried-forward debt (`severity: warn`, ruleId suffix `.carried-forward`) — visible in the report, never an amend `error`.
4. App-level audits keep their existing non-regression guarantee via `audit.delta.run` (unchanged); a new route that breaks an untouched page's linking still fails, because that is a _regression caused by the batch_, not pre-existing debt.

## Architectural fit

- Reuses the RFC-0136 delta source (`readBatchDelta`: provenance record → manifest fallback). Author-scope and audit-scope are computed the same way, so they cannot disagree.
- Preserves the RFC-0073/0074 validators as the single source of rule truth; this RFC only adds an input _filter_, never a second rule path.
- Preserves the RFC-0085 author/post-build split and the RFC-0087 single-owner discipline.
- Opt-in flag means zero behavioural change for the greenfield chain (RFC-0075) — the amend chain is the only caller that passes `--scope-files`.

## Design

### `amend.delta.files` — resolve the batch's touched file set

A small helper in `site-kernel-onboarding` (next to `amend.system.merge`). Given `--app` + `--batch`, it returns the repo-relative files the batch is responsible for:

- For each touched `pageId` (from the provenance record, else the manifest):
  - `apps/<id>/src/content/pages/<lang>/<slug>.md` for every locale the page serves (`slug = pageIdToContentFileSlug(pageId)`; locales from `system.md` `locales` or the full `i18n.supported` set);
  - the page's `prose/<lang>/<slug>.md` when its block uses `contentRef: prose/<slug>`.
- Plus business/site files the batch added or modified, taken from the batch's own write set recorded in `a3-author/atoms.yaml` provenance (new `business/<lang>/*.md`).

It emits `{ files: string[] }` (JSON) and is consumed by `amend-check`; it is also runnable standalone for debugging. Resolution is pure (no validation), mirroring how `audit.delta.run` already reasons about the delta.

### Validator `--scope-files` filter

Each listed validator gains the same tiny pre-filter at the top of its file walk:

```
const scope = readFlag(input, "scope-files");
const allow = scope ? new Set(scope.split(",").map(s => s.trim())) : null;
// ...later, per file:
if (allow && !allow.has(relPath)) continue;
```

Applies to: `content.references.validate`, `content.voice.lint`, `content.business.validate`, `page.block.validate`, `page.shell.validate`. (Coverage is already batch-scoped via `content.coverage.delta`; audits stay with `audit.delta.run`.)

The filter is path-exact against the validator's own repo-relative file paths. Unknown paths in the scope set are ignored (a validator may not own every file kind).

### `amend-check` wiring

`runAmendCheckSteps` (RFC-0136) already special-cases which steps receive `--batch`. Extend it so that, for the deterministic per-file steps, it first resolves the scope via `amend.delta.files` once per run and appends `--scope-files <list>` to each. The audit and provenance steps are unchanged. If scope resolution yields an empty set (mis-staged batch), `amend-check` fails fast with `amend-check.empty-delta` rather than silently passing.

### Carried-forward reporting

When a validator is run _without_ a scope (e.g. a manual whole-app invocation), nothing changes. When `amend-check` runs it _with_ a scope, `amend-check` additionally runs a single unscoped pass for visibility and records any out-of-scope failures as `<command>.carried-forward` warnings in the composite report — so pre-existing debt stays on the radar (and can seed a cleanup task) without blocking the batch.

### Output format

`amend-check.author` / `.postbuild` report gains:

```
data.scope.files: string[]          # the delta file set
data.steps[].scopedFindings: n      # errors inside the delta (blocking)
data.carriedForward[]: {command, count}   # out-of-scope debt (non-blocking)
```

### Failure modes

- Empty delta → `amend-check.empty-delta` (error): the batch staged nothing; fix a3-author.
- A scoped validator errors on a delta file → blocking, as today.
- A validator errors only outside the delta → carried-forward warning, non-blocking.

## Rollout

1. Add `amend.delta.files` + register it.
2. Add the `--scope-files` filter to the five validators (pure addition; default path unchanged). Unit-test each: same input, with/without scope.
3. Wire scope injection + carried-forward into `runAmendCheckSteps`.
4. Re-run amend-001: `amend-check.author` must pass on the legal delta **without** the founder-trust-card fix applied (prove the scoping, not the debt fix).
5. `rfc.validate` + `workflow.lint` green; changed packages typecheck clean.

## Alternatives considered

- **Baseline-diff (snapshot all findings at a0, subtract at a3).** Heavier, needs a stored snapshot and stable finding identity; duplicates what file-scoping achieves directly.
- **Fix all pre-existing debt before any amend.** Doesn't scale; makes every batch hostage to unrelated backlog — the precise anti-pattern this RFC removes.
- **Per-pageId scope instead of per-file.** Per-page validators (page.block/shell) could take `--scope-pages`, but references/voice/business operate on files (incl. prose and business), so a uniform `--scope-files` is simpler and covers all five.

## Risks

- A validator that owns a file kind the resolver forgets would silently skip it inside a batch. Mitigation: the resolver is centralized (`amend.delta.files`) and unit-tested against the page+prose+business file kinds; the unscoped carried-forward pass also keeps whole-app coverage visible.
- Scope drift between `audit.delta.run` and `amend.delta.files`. Mitigation: both read the same `readBatchDelta`; share it from one module.

## Acceptance criteria

- [x] `amend.delta.files --app webgogol-com --batch amend-001` lists exactly the 6 legal pageIds' page+prose files (both locales) plus the batch's new business files. (evidence: implemented historically)
- [x] `content.references.validate` / `content.voice.lint` / `content.business.validate` / `page.block.validate` / `page.shell.validate` accept `--scope-files` and, without it, produce byte-identical output to today. (evidence: implemented historically)
- [x] With the founder-trust-card schema drift deliberately re-introduced, `amend-check.author` for amend-001 is **green** (home.md debt is carried-forward, not blocking), and a deliberately broken legal page is **red**. (evidence: implemented historically)
- [x] Greenfield `apps-check.run` / `packages-check.run` behaviour is unchanged. (evidence: implemented historically)
- [x] `rfc.validate` and `workflow.lint` pass. (evidence: implemented historically)

## Implementation notes for agents

- Put `amend.delta.files` in `packages/os/site-kernel-onboarding/src/` and export `readBatchDelta` from a shared spot so `site-kernel-audit` and this helper use one copy.
- The `--scope-files` filter must compare against each validator's _own_ normalized repo-relative path (the same string it prints in findings), to avoid Windows backslash mismatches — reuse the existing `relative(...).replace(/\\/g, "/")` normalization.
- Remember the turbo/dist cache gotcha: rebuild `site-kernel` after changing handlers, and the owning package after changing a validator, before `pnpm exec site-kernel run …`.
