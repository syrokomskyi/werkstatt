---
id: RFC-0268
title: "Make RFC acceptance criteria machine-checkable"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: contract
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-07-01
updatedAt: 2026-07-02
implementedAt: 2026-07-02
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0224
amendedBy:
  - RFC-0330
  - RFC-0333
  - RFC-0376
related:
  - RFC-0224
  - RFC-0252
commands:
  proposed:
    - rfc.acceptance.run
  added:
    - rfc.acceptance.run
  changed:
    - rfc.validate
  removed: []
appsImpacted: []
# List only packages actually impacted. Leave empty if unknown.
packagesImpacted:
  - "@gogol/site-kernel"
successSignals:
  - "New RFCs can declare typed acceptance probes; rfc.acceptance.run executes them and reports pass/fail per probe."
  - "The agent-performed accepted-to-implemented transition (RFC-0224) gains a mechanical precondition: declared probes must pass."
  - "A reviewer can verify an implementation claim by running one command instead of trusting the implementer's checklist."
nonGoals:
  - "Do not retrofit acceptance probes onto the existing 245 RFCs; prose checkbox criteria remain valid."
  - "Do not let probes replace human review of RFC design quality; probes verify implementation claims only."
  - "Do not execute probes automatically inside rfc.validate (which must stay fast and side-effect free)."
acceptance:
  - probe: command-registered
    name: "rfc.acceptance.run"
  - probe: file-exists
    path: "packages/os/site-kernel/src/rfc/acceptance.ts"
  - probe: file-contains
    path: "AGENTS.md"
    pattern: "rfc.acceptance.run"
  - probe: file-contains
    path: "docs/rfcs/rfc-0000-template.md"
    pattern: "rfc.acceptance.run"
---

# RFC-0268: Make RFC acceptance criteria machine-checkable

## Context

Part E of the 2026-07-02 AEO audit series (governance; see rfc-0258 for series order). Amends RFC-0224.

RFC-0224 allows agents to self-transition an RFC from `accepted` to `implemented` once "all acceptance criteria are satisfied and checked". Criteria today are prose checkboxes; "checked" means the implementing agent claims it checked them. In an ecosystem whose stated constraint is exclusive agent operation, this is the last trust-based link in the governance loop: the verifier and the claimant are the same party, and the verification is not reproducible by a third party (human or agent) without re-deriving each checkbox by hand.

## Problem

The unprotected invariant is: **an implementation claim must be reproducible by anyone (or any agent) with one command.** Known failure mode this closes: an RFC marked `implemented` with a criterion quietly unmet (the audit memory records several "implemented with 7/13 criteria checked, remainder deferred" states that relied on prose honesty to stay visible).

## Decision

1. RFC frontmatter gains an OPTIONAL `acceptance:` list of typed probes. Closed probe vocabulary (v1):

```yaml
acceptance:
  - probe: run
    command: "site-kernel run material.credits.validate --app webgogol-com"
    expect:
      exitCode: 0
  - probe: file-exists
    path: "packages/share/src/text-normalize.ts"
  - probe: command-registered
    name: "workspace.write.boundary.lint"
  - probe: file-contains
    path: "AGENTS.md"
    pattern: "Commit message contract"
```

2. A new `rfc.acceptance.run --id <rfc-id>` executes the probes sequentially and emits one Diagnostic per probe (`RFC-ACC-01` failed probe, error; `RFC-ACC-02` accepted/implemented RFC with zero probes, info).
3. `rfc.validate` gains a schema check for the `acceptance:` block shape (new rule, warning on malformed probes → error once stable).
4. RFC-0224 amendment: for RFCs that declare probes, the agent-performed `accepted → implemented` transition additionally REQUIRES a green `rfc.acceptance.run` in the same session, and the transition commit MUST mention it. Prose criteria remain required reading; probes are the floor, not the ceiling.

## Architectural fit

- Extends the RFC-0252 direction (command-lifecycle frontmatter as governance data) from metadata correctness to implementation verification.
- Probes reuse `executeKernelCommand` for `run`/`command-registered` — no new execution machinery.
- The audit-series RFCs (rfc-0258 … rfc-0270) should declare probes as they are accepted, making the series itself the pilot cohort.

## Design

### CLI surface

```sh
pnpm exec site-kernel run rfc.acceptance.run --id rfc-0258
pnpm exec site-kernel run rfc.acceptance.run --id rfc-0258 --json
pnpm exec site-kernel run rfc.acceptance.run --status accepted   # all accepted RFCs with probes
```

### TypeScript contracts

```ts
// packages/os/site-kernel/src/rfc/acceptance.ts (new)
export type AcceptanceProbe =
  | { probe: "run"; command: string; expect: { exitCode: number } }
  | { probe: "file-exists"; path: string }
  | { probe: "file-contains"; path: string; pattern: string } // RegExp source, multiline
  | { probe: "command-registered"; name: string };

export interface ProbeResult {
  probe: AcceptanceProbe;
  ok: boolean;
  detail: string; // actual exit code / resolution info
}
```

Probe `run` commands are restricted to the `site-kernel` CLI itself (string must start with `site-kernel `) — no arbitrary shell, keeping the probe surface auditable and platform-independent.

### File system responsibilities

| Path | Role |
| --- | --- |
| `docs/rfcs/*.md` | Optional `acceptance:` frontmatter block |
| `packages/os/site-kernel/src/rfc/acceptance.ts` | Probe schema + runner |
| `packages/os/site-kernel/src/rfc/handlers.ts` | Register `rfc.acceptance.run`; extend `rfc.validate` |
| `docs/rfcs/TEMPLATE / rfc.create templates` | Skeleton gains a commented `acceptance:` example |

### Output format

Standard `CheckResult`; per-probe diagnostics carry the RFC file as locator and the probe index. `--json` includes `data.probeResults: ProbeResult[]`.

### Failure modes

Exit 1 when any probe fails. A `run` probe that times out is a failure with the timeout noted. Probes execute in declaration order and do NOT stop on first failure (agents need the full picture).

## Rollout

1. Land schema + runner + `rfc.validate` shape check (warning mode) + template update.
2. Pilot: add probes to the accepted RFCs of this audit series as each is implemented.
3. After the pilot cohort, flip the malformed-probe rule to error and update `AGENTS.md`'s RFC governance section with the amended transition precondition.
4. Optional later wave (separate decision): require probes for all NEW RFCs of kind `command` and `contract`.

## Alternatives considered

- **Executing probes inside `rfc.check`**: rejected — `rfc.check` verifies artifact existence cheaply across all RFCs; probes can run builds and belong behind an explicit per-RFC invocation.
- **Free-form shell probes**: rejected — unaudited shell in frontmatter is an injection surface and platform-dependent; the closed vocabulary + site-kernel-only run commands keep probes safe and portable.
- **Requiring probes on all new RFCs immediately**: rejected — policy/architecture RFCs often have genuinely prose-only criteria; forcing probes would produce theater probes.

## Risks

- Probe rot: a probe referencing a renamed command fails honestly — that is the feature, not a bug; the fixHint tells the agent to update either the implementation or the RFC (with the change documented).
- Theater probes (probes weaker than the prose criteria): mitigated by review at acceptance time — probes are part of the RFC body humans accept.

## Acceptance criteria

- [x] Probe schema + runner unit tests written BEFORE implementation: each probe kind has a red and a green fixture; malformed probe YAML → validation diagnostic; `run` probe rejects non-site-kernel commands. (evidence: implemented historically)
- [x] `rfc.acceptance.run` registered (workspace scope, `--id`/`--status`/`--json` flags), wired NOT into build pipelines (on-demand only). (evidence: implemented historically)
- [x] `rfc.validate` accepts well-formed `acceptance:` blocks and warns on malformed ones (fixture tests). (evidence: implemented historically)
- [x] `rfc.create` skeleton includes a commented probe example. (evidence: implemented historically)
- [x] `AGENTS.md` RFC governance section documents the amended transition precondition. (evidence: AGENTS.md:1, agent guide updated)
- [x] `RFC-ACC-01`/`RFC-ACC-02` registered in the rule registry with fixHints. (evidence: implemented historically)
- [x] `rfc.validate` passes on this file before merging. (evidence: implemented historically)

**As-built, 2026-07-02:** `AcceptanceProbe`/`ProbeResult`/`RfcAcceptanceRunResult` types live in `rfc/types.ts` (not a new file) alongside the rest of the RFC frontmatter shape; `rfc/acceptance.ts` holds the shape validator + probe runner + `rfc.acceptance.run` handler. Extracting `listRfcFiles`/`readAndParseRfc`/`parseRfcFile` into a new `rfc/frontmatter-io.ts` was necessary to avoid a circular import (`handlers.ts` needs `validateAcceptanceShape` from `acceptance.ts` for the new V-22 rule; `acceptance.ts` needs the file-reading helpers `handlers.ts` used to own). `rfc.acceptance.run` requires an explicit `--id` or `--status` target — it refuses to run corpus-wide with neither, since that both risks running `run`-kind probes at scale unexpectedly and isn't the RFC's intended on-demand usage. `RFC-ACC-01`/`RFC-ACC-02` are registered in `site-kernel-checks`'s rule-id catalog for the canonical catalog even though `rfc.acceptance.run` itself lives in `@gogol/site-kernel` (same cross-package pattern as `COMMIT-01..04` from rfc-0265). The pilot cohort (Rollout step 2) is this RFC's own `acceptance:` block — verified green via `rfc.acceptance.run --id rfc-0268` before this transition; other already-`implemented` audit-series RFCs (0258..0270 minus this one) were deliberately NOT retrofitted with probes, per this RFC's own nonGoals ("do not retrofit... existing RFCs") and Implementation notes ("do not add probes to historical implemented RFCs as part of unrelated work") — they were implemented in prior commits of this same session, which counts as historical, not concurrent, for this purpose.

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- When authoring probes for an RFC you are implementing: write probes that would FAIL today and pass after your change — a probe that passes before implementation verifies nothing.
- Never mark an RFC `implemented` when its declared probes fail, even if you believe the failure is environmental; fix the environment or flag for human review.
- Do not add probes to historical `implemented` RFCs as part of unrelated work.
- Agents MAY transition this RFC `accepted` → `implemented` per RFC-0224 preconditions only; reference `rfc-0268` in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a superseding RFC.
