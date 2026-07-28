---
id: RFC-0333
title: "Add an independent black-box QA runner against built output"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: command
# scope options: app | workspace
scope: app
owners:
  - architecture
reviewers:
  - human:andrii
createdAt: 2026-07-06
updatedAt: 2026-07-07
implementedAt: 2026-07-07
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0268
amendedBy: []
related:
  - RFC-0269
  - RFC-0279
  - RFC-0285
  - RFC-0299
  - DNA-35
commands:
  proposed: []
  added:
    - qa.independent.run
  changed:
    - rfc.acceptance.run
    - rfc.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
  - "@gogol/site-kernel-checks"
satisfies:
  - DNA-35
successSignals:
  - "RFCs can declare `page` acceptance probes — user-observable expectations against the rendered site (URL status, selector presence, text pattern, zero console errors)."
  - "`qa.independent.run --app <app>` serves the built dist/client, executes every page probe from accepted/implemented RFCs relevant to that app in a real headless browser, and fails on any violation — while reading ONLY dist/client and RFC frontmatter, never app or package source."
  - "A regression that the implementing agent's own checks miss (the 'AI test theater' failure mode) is caught by a contour that shares no code path with the implementation."
nonGoals:
  - "No LLM-driven QA in v1 — deterministic probes only (founder decision, 2026-07-06); an exploratory LLM QA agent is a possible phase 2 building on RFC-0299's cached review lane."
  - "No process/sandbox isolation — independence is input isolation (dist + frontmatter only), enforced by module contract and review, not OS-level jails."
  - "No visual regression / screenshot diffing — behavior.snapshot.validate (RFC-0269) and the visual contract system (RFC-0233) own adjacent ground; this RFC adds live-browser behavioral assertions only."
  - "No replacement of app.contract.full — this runner joins the postbuild check family; DNA-35 stands."
acceptance:
  - probe: command-registered
    name: "qa.independent.run"
  - probe: file-exists
    path: "packages/os/site-kernel-checks/src/independent-qa.ts"
  - probe: file-contains
    path: "packages/os/site-kernel/src/rfc/types.ts"
    pattern: "probe: \"page\""
  - probe: run
    command: "site-kernel run rfc.validate"
    expect:
      exitCode: 0
---

# RFC-0333: Add an independent black-box QA runner against built output

## Context

Every existing verification layer in this ecosystem shares a trust root with the code that produced the change: the implementing agent writes the code, the checks, often the content, and then runs the pipelines whose configuration it can also edit. The 2026-07 expert review named the resulting failure mode precisely — **"AI test theater"**: an agent's checks confirm the agent's own understanding, so a misunderstanding produces green checks and a broken site simultaneously.

The autonomy trajectory makes this structural. RFC-0278 defines graduated autonomy levels; RFC-0285 plans the human review budget shrinking toward zero. Humans can only withdraw from the loop if at least one verification contour does **not** share inputs with the implementation contour — the software equivalent of independent verification & validation. RFC-0279 (auditable AI reviewer) and RFC-0299 (cached AI audience review) review _content and approvals_; nothing yet exercises the **built site's behavior** from the outside.

The raw materials exist: acceptance probes (RFC-0268) give RFCs a machine-checkable expectation vocabulary — but all four probe kinds are repo-level (files, commands, registry). Playwright is already a dependency of `@gogol/site-kernel-checks`. `behavior.snapshot.*` (RFC-0269) already locates and walks `dist/client`. What is missing is a probe kind that speaks the visitor's language ("this URL renders, contains this, throws nothing") and a runner that executes it blind to the source.

## Problem

The unprotected invariant is: **at least one automated verification contour must assess the built site using only the deployment artifact and the accepted specifications — never the source that produced it.**

Today:

1. Acceptance probes cannot express "the page at /de/ renders a `.hero` and no console errors" — the vocabulary stops at the repo boundary.
2. All postbuild checks (`behavior.snapshot.validate`, dist walkers) parse HTML statically; nothing executes the site in a browser, so hydration failures, runtime script errors, and broken client-side behavior pass every pipeline.
3. Every check's inputs include the same source tree the implementing agent shaped — no contour is structurally protected from inheriting the implementer's misunderstanding.

## Decision

The acceptance-probe vocabulary gains a `page` kind (amending RFC-0268), and `@gogol/site-kernel-checks` gains a `qa.independent.run` command that executes page probes black-box.

1. **Probe vocabulary extension** in `packages/os/site-kernel/src/rfc/types.ts`:

   ```ts
   export type AcceptanceProbe =
     | { probe: "run"; command: string; expect: { exitCode: number } }
     | { probe: "file-exists"; path: string }
     | { probe: "file-contains"; path: string; pattern: string }
     | { probe: "command-registered"; name: string }
     // RFC-0333: black-box expectation against the rendered site. Executed
     // ONLY by qa.independent.run (needs a built dist); rfc.acceptance.run
     // reports it as skipped.
     | {
         probe: "page";
         /** Route path, leading slash, as a visitor would request it: "/de/", "/en/blog/". */
         path: string;
         /** Expected HTTP status; default 200. */
         expectStatus?: number;
         /** CSS selector that must match at least one element after load. */
         selector?: string;
         /** Regex (JS syntax, "m" flag) that must match the page's visible text. */
         textPattern?: string;
         /** Default false: any browser console error fails the probe. */
         allowConsoleErrors?: boolean;
       };
   ```

   `validateAcceptanceShape` (in `rfc/acceptance.ts`) learns the `page` case — `path` required string starting with `/`; optional fields type-checked — so rule V-22 accepts well-formed page probes and rejects malformed ones.

2. **`rfc.acceptance.run` behavior**: `page` probes are filtered out before `runProbe` and reported per RFC with an **info** diagnostic `RFC-ACC-03`: _"N page probe(s) skipped — run `qa.independent.run --app <app>` against a built dist."_ They never fail the repo-level run.

3. **New command `qa.independent.run`** (app scope, `supportsAllApps: true`, `mutatesState: false`) in new module `packages/os/site-kernel-checks/src/independent-qa.ts`, registered via a new command table (mirror `command-tables/24-behavior-snapshot.ts`). Execution:
   1. Resolve `apps/<app>/dist/client`; missing → **QA-IND-02** error (mirror SNAP-02's posture).
   2. Collect `page` probes from every RFC where `status` is `accepted` or `implemented` AND (`scope: workspace` OR `appsImpacted` includes the app). Zero probes → info diagnostic, exit 0 (cheap no-op — this makes pipeline wiring safe before any RFC declares page probes).
   3. Start a local static file server over `dist/client` on an ephemeral port (`node:http`; resolve `/x/` → `/x/index.html`, honor `404.html` for misses; **first grep site-kernel-checks for an existing dist static-server helper** — e.g. anything the Lighthouse or link-check lane uses — and reuse it; write a new one only if none exists).
   4. Launch Playwright Chromium headless once; for each probe: collect console errors, `goto` the path, assert in order — HTTP status (`expectStatus` ?? 200), `selector` matches ≥1 element, `textPattern` matches `document.body.innerText`, console-error count is 0 unless `allowConsoleErrors`.
   5. Emit one **QA-IND-01** error diagnostic per failed assertion (file = the declaring RFC, message names the probe path, the assertion, expected vs actual). Exit 1 on any error.

4. **Independence invariant** (module contract non-goals, binding on all future edits): this module MUST NOT import from `apps/*`, `backs/*`, `packages/ui`, `packages/share` rendering code, or any module that participates in producing dist. Its only inputs are `dist/client` bytes, RFC frontmatter, app discovery, Playwright, Node stdlib, and this RFC's own assertion logic.

   The invariant is enforced by an import-boundary unit test that scans `independent-qa.ts` (and any local helpers it imports) for forbidden specifiers/path prefixes: `apps/`, `backs/`, `@gogol/ui`, `@gogol/share`, `@gogol/business`, `@gogol/growth`, `@gogol/growth-adapters`, `@gogol/passport`, `@gogol/nebula`, `@gogol/star-map`, and relative paths escaping into those packages. A reviewer grep is not sufficient for this RFC.

5. **Pipeline wiring**: append `qa.independent.run` to `APPS_CHECK_POSTBUILD_PIPELINE` (`packages/os/site-kernel-checks/src/pipelines/apps-check-postbuild.ts`) after `behavior.snapshot.validate`. The zero-probe fast path keeps this free until adopted.

## Architectural fit

- **RFC-0268**: clean amendment — one new union member, shape validation extended, existing probes and runner untouched.
- **RFC-0269 (behavior snapshot)**: complementary — the snapshot freezes the _static_ projection (meta, JSON-LD, headers); this RFC asserts _live_ behavior (rendering, scripts, console). Reuses its dist-location conventions.
- **RFC-0279 / RFC-0299**: those review content and approvals with AI; this is the deterministic behavioral leg of the same independent-review family. Phase 2 (LLM exploration) would compose with RFC-0299's caching.
- **RFC-0285 / autonomy**: this contour is a precondition for shrinking human review — it is the check that does not inherit the implementer's assumptions.
- **DNA-35**: strengthened, not diluted — the runner joins the postbuild family that `app.contract.full` aggregates; no parallel gate is created.

## Design

### CLI surface

```sh
pnpm exec site-kernel run qa.independent.run --app warpgogol-com
pnpm exec site-kernel run qa.independent.run --all
pnpm exec site-kernel run qa.independent.run --app warpgogol-com --rfc RFC-0322   # single-RFC filter
pnpm exec site-kernel run qa.independent.run --app warpgogol-com --json
```

Flags: `rfc` (string, optional — restrict to one RFC's probes). `app`/`all` per standard app-scope conventions.

### TypeScript contracts

```ts
// packages/os/site-kernel-checks/src/independent-qa.ts

export interface PageProbeExecution {
  rfcId: string;
  probe: Extract<AcceptanceProbe, { probe: "page" }>;
  ok: boolean;
  /** One entry per failed assertion: "status", "selector", "textPattern", "console". */
  failures: Array<{ assertion: string; expected: string; actual: string }>;
  durationMs: number;
}

export interface IndependentQaResult {
  command: "qa.independent.run";
  status: "pass" | "fail";
  app: string;
  probeCount: number;
  executions: PageProbeExecution[];
  diagnostics: Diagnostic[];
}
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel/src/rfc/types.ts` | `page` member on `AcceptanceProbe` |
| `packages/os/site-kernel/src/rfc/acceptance.ts` | Shape validation for `page`; skip + `RFC-ACC-03` info in `rfc.acceptance.run` |
| `packages/os/site-kernel-checks/src/independent-qa.ts` | New: probe collection, static server (or reused helper), Playwright execution, diagnostics |
| `packages/os/site-kernel-checks/src/tests/independent-qa-import-boundary.test.ts` | New: automated forbidden-import boundary for the black-box runner |
| `packages/os/site-kernel-checks/src/command-tables/` | New table registering `qa.independent.run` (next free number prefix) |
| `packages/os/site-kernel-checks/src/command-tables/index.ts` | Table wired in |
| `packages/os/site-kernel-checks/src/pipelines/apps-check-postbuild.ts` | Step appended after `behavior.snapshot.validate` |
| `apps/<app>/dist/client` | Read-only input |
| `docs/rfcs/*.md` | Read-only input (frontmatter probes) |
| `packages/os/site-kernel-checks/src/tests/independent-qa.test.ts` | New: probe collection scoping, assertion matrix against a fixture dist, zero-probe fast path, QA-IND-02 |

### Output format

```json
{
  "command": "qa.independent.run",
  "status": "fail",
  "app": "warpgogol-com",
  "probeCount": 3,
  "executions": [
    {
      "rfcId": "RFC-0322",
      "probe": { "probe": "page", "path": "/de/", "selector": ".slot-counter" },
      "ok": false,
      "failures": [
        { "assertion": "selector", "expected": ".slot-counter (>=1 element)", "actual": "0 elements" }
      ],
      "durationMs": 412
    }
  ],
  "diagnostics": [
    { "ruleId": "QA-IND-01", "severity": "error", "file": "docs/rfcs/rfc-0322-....md", "message": "RFC-0322 page probe /de/: selector \".slot-counter\" matched 0 elements." }
  ]
}
```

Pretty mode: one line per probe (`[ok]`/`[FAIL] RFC-0322 /de/ selector .slot-counter`), then the standard diagnostics rendering.

### Failure modes

- Missing dist → QA-IND-02 error, exit 1 (postbuild pipelines guarantee dist exists; standalone callers get a clear message to build first).
- Zero collected probes → info `QA-IND-03`, exit 0.
- Navigation timeout (fixed 30s per probe) → probe fails with `assertion: "status"`, `actual: "timeout"`.
- Browser launch failure (missing Playwright browsers) → single error diagnostic naming `npx playwright install chromium`, exit 1; never a stack-trace crash.
- Probes from `draft`/`rejected` RFCs: never collected — only accepted/implemented specifications are binding.

## Rollout

1. Land the vocabulary extension + shape validation first (safe alone: V-22 accepts the new kind, acceptance.run skips it).
2. Land the runner + tests (fixture dist with a passing and a failing page committed under the test directory).
3. Wire into `apps-check-postbuild` — free until adoption thanks to the zero-probe fast path.
4. Adopt: the next visitor-facing RFC (e.g. anything touching rendered pages) declares its first `page` probes; from then on the contour accumulates coverage RFC by RFC.
5. Phase 2 (separate RFC, deliberately out of scope): LLM-driven exploratory QA over the same served dist, composed with RFC-0299 caching.

## Alternatives considered

- **LLM QA agent in v1**: rejected by founder decision (2026-07-06) — token cost per run, non-determinism, and partial overlap with RFC-0299; deterministic probes first, exploration later.
- **Static HTML assertions instead of a browser** (extend behavior.snapshot): rejected as the _only_ mechanism — it cannot see hydration failures, runtime console errors, or client-script behavior, which are exactly the regressions the implementing agent's own contour misses most often.
- **A separate QA spec file per app** (instead of probes in RFC frontmatter): rejected — it would create a second hand-authored expectation registry that drifts from the RFCs; keeping expectations in the RFC that motivated them preserves the spec-to-check trace and reuses the whole RFC-0268 toolchain (V-22, evidence via RFC-0330).
- **Executing page probes inside rfc.acceptance.run**: rejected — acceptance.run is fast and repo-level by contract (RFC-0268 non-goal: probes must not require builds); page probes require a built dist and a browser.
- **Process-level sandboxing of the runner**: rejected for v1 — input isolation delivers the verification independence; OS-level isolation adds ops complexity without changing what the runner can conclude.

## Risks

- **Independence erosion by future edits** (someone imports a rendering helper "for convenience"): guarded by the module-contract non-goals plus the import-boundary test. If that test becomes too weak, ratchet it into a package-wide lint; do not remove the boundary.
- **Flakiness** (timeouts, port collisions): mitigated by static serving (no dev server), ephemeral-port allocation, single browser instance, fixed timeout; page probes assert on stable structure (selectors), not timing.
- **Probe rot**: an accepted RFC's page probe can outlive the feature's redesign. The failing run points at the RFC; the fix is a superseding/amending RFC — which is the correct pressure, not a bug.
- **Pipeline cost growth**: linear in declared probes, one browser per app run; acceptable and visible (durations in output). If it grows hot, per-probe parallelism is a local optimization.

## Acceptance criteria

- [x] `page` member added to `AcceptanceProbe`; `validateAcceptanceShape` accepts well-formed and rejects malformed page probes (tests for both). (evidence: implemented historically)
- [x] `rfc.acceptance.run` skips page probes with `RFC-ACC-03` info and never executes them (test). (evidence: implemented historically)
- [x] `qa.independent.run` registered (app scope, `supportsAllApps`, `mutatesState: false`, `rfc` flag declared); `kernel-flags-lint` passes. (evidence: implemented historically)
- [x] Probe collection scoping tested: workspace-scope RFC probes apply to every app; app-scope only to listed apps; draft/rejected RFCs excluded; `--rfc` filter works. (evidence: implemented historically)
- [x] Assertion matrix tested against a fixture dist: status, selector, textPattern, console-error, allowConsoleErrors — each with a passing and a failing case. (evidence: implemented historically)
- [x] Zero-probe fast path exits 0 with QA-IND-03 info; missing dist exits 1 with QA-IND-02. (evidence: implemented historically)
- [x] Automated import-boundary test fails on forbidden imports from apps/_, backs/_, rendering packages, or local helpers that reach them. (evidence: original apps retired by RFC-0381, implemented historically)
- [x] Wired into `apps-check-postbuild` after `behavior.snapshot.validate`; pipeline still green on apps with no page probes. (evidence: implemented historically)
- [x] `command.manifest.generate` regenerated; `rfc.validate` passes on this file. (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Before writing a static server, grep `packages/os/site-kernel-checks/src` for an existing dist-serving helper (`createServer`, `http.createServer`) and reuse it; two static servers in one package is a defect.
- The independence invariant is binding: importing anything that participates in producing dist into `independent-qa.ts` violates this RFC — escalate via `rfc.supersede.propose` (RFC-0334) if you believe it is unavoidable, do not "just import it".
- Keep helper files local to the runner under the same import-boundary test. Moving the forbidden import one file away is still a violation.
- Frontmatter probe collection reuses `listRfcFiles` / `readAndParseRfc` — parse frontmatter only; never read RFC bodies here.
- Register the command table following the existing numeric-prefix convention in `command-tables/`.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions (emitting RFC-0330 evidence if that RFC is implemented); reference `rfc-0333` in commits.
- Agents MUST NOT weaken the independence invariant, the skip behavior in acceptance.run, or the accepted/implemented-only collection rule without a superseding RFC.
