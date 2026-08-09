---
id: RFC-0576
title: "Migrate content.links.validate and mirroring.validate to canonical Diagnostics"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: architecture
# scope options: app | workspace
scope: workspace
owners:
  - architecture
# Set by the deciding human together with the status change (RFC-0335).
# Draft scaffolds must keep this empty; do not prefill a default identity.
# Format: human:<handle> (agent:<id> reserved — see RFC-0335).
# Default reviewer when none is specified by the operator: human:andrii-syrokomskyi
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-28
updatedAt: 2026-07-29
enhancedAt: 2026-07-29
implementedAt: 2026-07-29
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related:
  - RFC-0203
  - RFC-0206
  - RFC-0205
# RFC-0331: DNA invariants this RFC implements, protects, or extends.
# Required for architecture/contract RFCs created on or after 2026-07-07.
# Entries must match ^DNA-\d+$ and exist in docs/architecture-dna.md.
satisfies:
  - DNA-11
# RFC-0396: Traceability to a vendored spec node: "<spec-id>/<node-id>", e.g. "pbp/RFC-PBP-020".
# Set by spec.materialize; leave commented for non-spec RFCs.
# specRef:
# RFC-0478: Platform versioning enforcement. Declares the SemVer delta this RFC
# produces when implemented. Required for post-cutoff implemented RFCs (V-29).
# Values: minor (Breaks-B, requires migrator), patch (safe), none (prose-only),
# major (architectural, manually reserved). Default: patch.
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - content.links.validate
    - mirroring.validate
    - page.blocks.mirror.validate
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/site-kernel-checks"
successSignals:
  - "content.links.validate emits canonical Diagnostics with registered LINK-01..03 ruleIds and fixHints"
  - "mirroring.validate emits canonical Diagnostics with registered MIRROR-MISSING ruleId and fixHint pointing to source file"
  - "page.blocks.mirror.validate emits canonical Diagnostics via diagnosticsResult with registered MIRROR-01..03 ruleIds"
  - "parseUrl normalizes trailing slashes for non-root paths before route lookup"
nonGoals:
  - "Does not change localizeUrl or route generation output"
  - "Does not add new validation commands"
  - "Does not change the set of rules each validator checks — only the output shape and fixHint content"
# RFC-0268: OPTIONAL machine-checkable acceptance probes, executed on-demand
# via `pnpm exec werkstatt run rfc.acceptance.run --id <this-rfc-id>` (never
# automatically inside build pipelines). Closed probe vocabulary — see
# docs/rfcs/rfc-0268-make-rfc-acceptance-criteria-machine-checkable.md.
# acceptance:
#   - probe: run
#     command: "site-kernel run some.command.validate --app warpgogol-com"
#     expect:
#       exitCode: 0
#   - probe: file-exists
#     path: "packages/share/src/some-new-module.ts"
#   - probe: command-registered
#     name: "some.new.command"
#   - probe: file-contains
#     path: "AGENTS.md"
#     pattern: "Some new governance paragraph"
---

# RFC-0576: Migrate content.links.validate and mirroring.validate to canonical Diagnostics

## Context

RFC-0203 established a canonical `Diagnostic` model (`{ ruleId, severity, message, file, line, fixHint, evidence, data }`) and a rule-id registry (`DIAGNOSTIC_RULES` in `packages/os/site-kernel-checks/src/diagnostics/rules/`). RFC-0206 added `content.links.validate` with internal LINK-01..03 rule codes. RFC-0205 added `page.blocks.mirror.validate` with MIRROR-01 and fixHints.

Despite these foundations, three validators still emit non-canonical results:

1. `content.links.validate` (`content-links.ts`) uses the legacy `resultFromViolations` shim — violations are string messages with `ruleId = "content.links.validate"` (coarse). The internal LINK-01..03 codes are embedded in the string but not in the `Diagnostic.ruleId` field. No `fixHint` is emitted.
2. `mirroring.validate` (`checks/mirroring.ts`) returns a custom result shape (`{ data: { checkedPages }, exitCode, summary }`) — violations appear only in the summary string, not in a `diagnostics[]` array. Agents parsing `ForgeCommandResult.data.diagnostics` miss them entirely.
3. `page.blocks.mirror.validate` (`page-blocks-mirror.ts`) has a custom interface with `fixHint` fields, but MIRROR-01 is not registered in `DIAGNOSTIC_RULES` and the result is not built via `diagnosticsResult`.

Additionally, `parseUrl` in `content-links.ts` does not normalize trailing slashes. `localizeUrl` generates paths without trailing slashes (e.g., `/uk/tsina`), but authors commonly write links with trailing slashes (e.g., `/uk/tsina/`). This creates false-positive LINK-03 errors that require manual investigation of `parseUrl` and `localizeUrl` source code to diagnose.

## Problem

DNA-11 (Language mirroring) is enforced by `mirroring.validate` and `page.blocks.mirror.validate`, but their output is not machine-parseable — agents cannot programmatically extract violations from `ForgeCommandResult.data.diagnostics` because these validators don't populate it.

`content.links.validate` validates internal links (supporting DNA-4 canonical content), but its LINK-01..03 rule codes are not registered in `DIAGNOSTIC_RULES`, so `diagnostic.shape.lint` (DSL-02) cannot enforce their presence, and the fix-pattern catalog (`.agents/skills/wg-mission-complete/fix-patterns.md`) cannot reference them programmatically.

None of these three validators emit `fixHint` fields in their `Diagnostic` output (where they produce Diagnostics at all). Agents encountering LINK-03 or mirroring errors must read validator source code to determine the remediation — there is no actionable fixHint in the console output.

The trailing slash mismatch between `localizeUrl` (no trailing slash) and authoring conventions (with trailing slash) creates false-positive LINK-03 errors. This is a recurring pattern during mission completion: every agent session that touches prose links encounters this issue and must independently discover the root cause.

## Decision

`content.links.validate`, `mirroring.validate`, and `page.blocks.mirror.validate` are migrated to emit canonical `Diagnostic[]` via `diagnosticsResult` with registered ruleIds (LINK-01..03, MIRROR-MISSING, MIRROR-01..03) and actionable `fixHint` fields. `parseUrl` in `content-links.ts` normalizes trailing slashes for non-root paths before route lookup. `mirroring.validate` preserves its current error/warning distinction by emitting error-severity diagnostics for default-language missing pages and warning-severity diagnostics for non-default-language missing pages, all under the registered MIRROR-MISSING ruleId.

## Architectural fit

- **DNA-11 (Language mirroring):** `mirroring.validate` and `page.blocks.mirror.validate` are the primary enforcement commands. This RFC makes their output machine-parseable, enabling programmatic fix resolution.
- **RFC-0203 (canonical Diagnostic model):** This RFC completes the migration that RFC-0203 started — three remaining unmigrated validators are brought into the canonical model.
- **RFC-0206 (content link validation):** This RFC enriches the output of `content.links.validate` with registered ruleIds and fixHints, as RFC-0206 envisioned but did not fully implement.
- **RFC-0205 (page.blocks.mirror.validate):** This RFC registers MIRROR-01 and migrates the result builder to `diagnosticsResult`.
- **Site OS operator model:** No new commands. Three existing commands change their output shape from non-canonical to canonical — `ForgeCommandResult.data.diagnostics` is populated in all cases.
- **Scaling Playbook:** Applies uniformly — all sites use the same validators regardless of growth stage.

## Design

### CLI surface

No CLI surface changes. The three commands are invoked identically:

```sh
pnpm exec werkstatt run content.links.validate --site <id>
pnpm exec werkstatt run mirroring.validate --site <id>
pnpm exec werkstatt run page.blocks.mirror.validate --site <id>
```

The `--json` output shape changes: `data.diagnostics` is now populated with canonical `Diagnostic[]` in all cases (previously: `content.links.validate` had coarse diagnostics, `mirroring.validate` had none, `page.blocks.mirror.validate` had custom-shape diagnostics).

### TypeScript contracts

#### Rule registry additions

In `packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts`:

```ts
// LINK-01: anchor link target not found on the page (same-page #anchor or cross-page #anchor)
rule("LINK-01", "Anchor link target not found on page", "content.links.validate", "error"),

// LINK-02: same-page anchor must not carry a path or language prefix
rule("LINK-02", "Same-page anchor must not carry path prefix", "content.links.validate", "error"),

// LINK-03: internal path does not resolve to a known route
rule("LINK-03", "Internal path does not resolve to a known route", "content.links.validate", "error"),

// MIRROR-MISSING: page exists in one language but not another
// severityDefault is "error" (default-language missing); non-default-language
// missing pages emit warning-severity diagnostics under the same ruleId.
rule("MIRROR-MISSING", "Page missing in a declared language", "mirroring.validate", "error"),

// MIRROR-01: localized page is missing a block or has wrong block type vs default-language twin
rule("MIRROR-01", "Localized page block missing or type mismatch vs default-language twin", "page.blocks.mirror.validate", "error"),

// MIRROR-02: localized block is missing a prop that exists in default-language twin
rule("MIRROR-02", "Localized block missing prop vs default-language twin", "page.blocks.mirror.validate", "error"),

// MIRROR-03: localized block labels object is missing a key from default-language twin
rule("MIRROR-03", "Localized block labels missing key vs default-language twin", "page.blocks.mirror.validate", "error"),
```

#### parseUrl normalization

In `packages/os/site-kernel-checks/src/content-links.ts`:

```ts
function parseUrl(value: string): { path: string | null; anchor: string | null } {
  const hashIndex = value.indexOf("#");
  if (hashIndex === 0) {
    return { path: null, anchor: value };
  }
  let path: string;
  let anchor: string | null = null;
  if (hashIndex > 0) {
    path = value.slice(0, hashIndex);
    anchor = value.slice(hashIndex);
  } else {
    path = value;
  }
  // Normalize trailing slash for non-root paths so that /uk/tsina/ matches
  // route map entry /uk/tsina (localizeUrl produces no trailing slash).
  if (path.length > 1 && path.endsWith("/")) {
    path = path.slice(0, -1);
  }
  return { path, anchor };
}
```

#### fixHint patterns

For `content.links.validate`:

- LINK-01 (anchor not found):
  ```
  fixHint: `Anchor "${anchor}" not found on page "${pageId}". Add the anchor to system.md anchors registry for this page, or add a matching heading in the prose file, or fix the anchor text.`
  ```
- LINK-02 (same-page anchor with path prefix):
  ```
  fixHint: `Same-page anchor must not carry a path or language prefix. Use "${anchor}" instead of "${value}".`
  ```
- LINK-03 (unresolved internal path):
  ```
  fixHint: `Internal path "${path}" does not resolve to a known route. Check the route map in system.md or remove the link.`
  ```

For `mirroring.validate` (MIRROR-MISSING) — one diagnostic per missing (page, lang) pair:

```
fixHint: `Create src/content/pages/${missingLang}/${pageId}.md (copy structure from src/content/pages/${sourceLang}/${pageId}.md). Add ${missingLang}: route in system.md pages[].routes.`
```

For `page.blocks.mirror.validate` (MIRROR-01, MIRROR-02, MIRROR-03) — fixHints already exist in the custom interface; they are preserved verbatim when migrating to `diagnosticsResult`.

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/os/site-kernel-checks/src/content-links.ts` | Migrate to `diagnosticsResult`, register LINK-01..03, add fixHints, normalize `parseUrl`, remove from DSL-04 baseline |
| `packages/os/site-kernel-checks/src/checks/mirroring.ts` | Migrate from custom result to `diagnosticsResult`, register MIRROR-MISSING, add fixHint, preserve error/warning severity distinction |
| `packages/os/site-kernel-checks/src/page-blocks-mirror.ts` | Migrate to `diagnosticsResult`, register MIRROR-01..03 (fixHints already present) |
| `packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts` | Add LINK-01..03, MIRROR-MISSING, MIRROR-01..03 to registry |
| `packages/os/site-kernel-checks/src/diagnostics/dsl04-baseline.generated.yaml` | Remove `content-links.ts` entry (migrated off `resultFromViolations` shim); regenerate via `diagnostic.shape.lint --write-baseline` |

### Output format

Before (content.links.validate):

```json
{
  "command": "content.links.validate",
  "status": "fail",
  "diagnostics": [
    { "ruleId": "content.links.validate", "severity": "error", "message": "src/content/prose/uk/ratgeber.md:18 — [LINK-03] Internal path "/uk/tsina/" does not resolve" }
  ]
}
```

After:

```json
{
  "command": "content.links.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "LINK-03",
      "severity": "error",
      "file": "src/content/prose/uk/ratgeber.md",
      "line": 18,
      "message": "Internal path "/uk/tsina" does not resolve to a known route",
      "fixHint": "Check the route map in system.md or remove the link."
    }
  ]
}
```

Before (mirroring.validate) — no diagnostics array at all, just a summary string.

After:

```json
{
  "command": "mirroring.validate",
  "status": "fail",
  "diagnostics": [
    {
      "ruleId": "MIRROR-MISSING",
      "severity": "error",
      "file": "src/content/pages/de/ratgeber-category-kosten.md",
      "message": "ratgeber-category-kosten: missing in [de] (exists in: uk)",
      "fixHint": "Create src/content/pages/de/ratgeber-category-kosten.md (copy structure from src/content/pages/uk/ratgeber-category-kosten.md). Add de: route in system.md pages[].routes."
    }
  ]
}
```

### Data shape changes

The `data` field of `ForgeCommandResult` changes for two validators:

- **`mirroring.validate`**: `data.checkedPages` is removed. The new `data` shape is `CheckResult` (`{ command, status, diagnostics, summary }`). No pipeline or agent reads `data.checkedPages` — it was only used in the summary string.
- **`page.blocks.mirror.validate`**: `data.pagesCompared` and `data.violations[]` are removed. The new `data` shape is `CheckResult`. The `pagesCompared` count is preserved in the summary string only.

### Failure modes

- All three validators exit non-zero (exitCode: 1) when any error-severity diagnostic is emitted, same as current behavior.
- `mirroring.validate` emits warning-severity diagnostics for non-default-language missing pages — these do not fail the pipeline (exit 0), preserving current behavior where only default-language missing sets `hasErrors = true`.
- Warnings (if any) do not fail the pipeline — same as `diagnosticsResult` default behavior.
- `parseUrl` trailing slash normalization only affects route lookup — the original link text in the diagnostic message preserves the author's original spelling for clarity.
- Root path `/` is never normalized (preserved as-is).

## Rollout

- **No flag day.** All three validators already run in `build.check` pipelines. The output shape changes from non-canonical to canonical, but the exit-code behavior is identical (exit 1 on errors, exit 0 on warnings-only).
- **No migration path needed for apps.** Apps do not consume validator output programmatically — only the kernel pipeline and agents do.
- **Agent-facing improvement.** Agents parsing `ForgeCommandResult.data.diagnostics` now find all violations in the canonical array with `fixHint` fields. The `fix-patterns.md` catalog in `wg-mission-complete` can reference LINK-01..03, MIRROR-MISSING, and MIRROR-01..03 by ruleId.
- **Trailing slash normalization** is a pure bug fix — existing links that were false-positive LINK-03 will now pass. No app changes needed.
- `diagnostic.shape.lint` (DSL-02) will now enforce that these three validators use registered ruleIds — future drift is prevented.
- **DSL-04 baseline shrink.** `content-links.ts` is removed from `dsl04-baseline.generated.yaml` after migration. `mirroring.ts` and `page-blocks-mirror.ts` are not in the baseline (they use custom result shapes, not `resultFromViolations`). Regenerate the baseline via `pnpm exec werkstatt run diagnostic.shape.lint --write-baseline`.

## Alternatives considered

1. **fixHints only (no migration to diagnosticsResult).** Keep `resultFromViolations` but embed fixHint in the string message. Rejected: string-embedded fixHints are not machine-parseable; agents would need regex extraction. The canonical `Diagnostic.fixHint` field exists specifically for this purpose.

2. **Normalize trailing slash in `localizeUrl` instead of `parseUrl`.** Add trailing slashes to route map entries. Rejected: `localizeUrl` is used by route generation, sitemap, canonical URLs, and all generated links — changing it has unbounded blast radius. `parseUrl` is only used by the validator; the blast radius is contained.

3. **No trailing slash normalization — rely on fixHint to guide authors.** Rejected: trailing slash on internal links is a common and legitimate authoring convention. Rejecting it creates false positives that require manual investigation on every mission completion. The root cause is a mismatch between two internal functions, not an authoring error.

4. **Register MIRROR-01 but leave `page.blocks.mirror.validate` on its custom result builder.** Rejected: the custom builder produces `PageBlocksMirrorResult` which is not a `CheckResult` — agents parsing `ForgeCommandResult.data.diagnostics` miss these violations. Full migration to `diagnosticsResult` is needed for consistency.

## Risks

- **False positive reduction from trailing slash normalization.** This is intentional — `/uk/tsina/` now matches `/uk/tsina`. If a route genuinely does not exist, the error still fires. No false-negative risk.
- **Agent misinterpretation.** Agents that previously parsed the summary string of `mirroring.validate` will need to parse `data.diagnostics` instead. This is an improvement — the canonical array is structured and documented.
- **diagnostic.shape.lint enforcement.** After migration, DSL-02 will enforce that these validators use registered ruleIds. If a future change adds a new ruleId without registering it, the lint will fail. This is the intended behavior.
- **Performance.** No impact — `diagnosticsResult` is a pure function that builds the result object. `parseUrl` normalization is a single `endsWith` + `slice` check.
- **Maintenance burden.** Three files are modified in one package. The rule registry gains 8 entries (LINK-01..03, MIRROR-MISSING, MIRROR-01..03). Low ongoing maintenance.

## Acceptance criteria

- [x] LINK-01, LINK-02, LINK-03 registered in `DIAGNOSTIC_RULES` in `packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts` (evidence: commit d09ae3c, lines 498-513)
- [x] MIRROR-MISSING registered in `DIAGNOSTIC_RULES` in `packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts` (evidence: commit d09ae3c, lines 515-520)
- [x] MIRROR-01, MIRROR-02, MIRROR-03 registered in `DIAGNOSTIC_RULES` in `packages/os/site-kernel-checks/src/diagnostics/rules/content-surface.ts` (evidence: commit d09ae3c, lines 522-537)
- [x] `content.links.validate` emits canonical `Diagnostic[]` via `diagnosticsResult` with LINK-01..03 ruleIds and fixHints (evidence: commit feb33d0, content-links.ts:303-312)
- [x] `mirroring.validate` emits canonical `Diagnostic[]` via `diagnosticsResult` with MIRROR-MISSING ruleId and fixHint pointing to source file to copy; default-language missing = error severity, non-default missing = warning severity (evidence: commit b74543b, mirroring.ts:124-141)
- [x] `page.blocks.mirror.validate` emits canonical `Diagnostic[]` via `diagnosticsResult` with MIRROR-01..03 ruleIds (existing fixHints preserved) (evidence: commit b8c4e5a, page-blocks-mirror.ts:274-275)
- [x] `parseUrl` in `content-links.ts` strips trailing slash for non-root paths before route lookup (evidence: commit feb33d0, content-links.ts:183-185)
- [x] `diagnostic.shape.lint` passes for all three migrated validators (DSL-02: registered ruleIds) (evidence: no LINK/MIRROR DSL-02 errors in lint output)
- [x] `content-links.ts` removed from `dsl04-baseline.generated.yaml` (DSL-04: no longer uses `resultFromViolations` shim) (evidence: commit 4bc4e8a)
- [x] Existing apps pass validation without changes (trailing slash normalization only reduces false positives) (evidence: build:check passes, 14/14 RFC-0576 tests pass)
- [x] `rfc.validate` passes on this file (evidence: no RFC-0576 errors in rfc.validate output)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MAY transition this RFC from `accepted` to `implemented` per RFC-0224 preconditions; reference this RFC ID in commits.
- Agents MUST NOT weaken or remove enforcement rules established by this RFC without a new RFC that supersedes it.
- If implementation reveals an invariant conflict, run `rfc.supersede.propose` instead of working around it (RFC-0334).
- The `parseUrl` trailing slash normalization is a pure bug fix — it MAY be implemented in the same commit as the migration. It does not require a separate RFC.
- The fixHint content for each rule MAY be refined during implementation as long as it remains actionable (an agent or human can execute it without reading validator source code).
- `page.blocks.mirror.validate` already has fixHints in its custom interface — these MUST be preserved verbatim when migrating to `diagnosticsResult`.
