---
id: RFC-0032
title: "Enforce app-agnostic utility extraction to @gogol/share"
status: implemented
# kind options: architecture | contract | command | policy | deprecation
kind: policy
# scope options: app | workspace
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-04-28
updatedAt: 2026-06-04
implementedAt: 2026-04-28
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0022
commands:
  proposed:
    - share.utility.lint
  added:
    - share.utility.lint
  changed: []
  removed: []
appsImpacted:
  - nicaragua-projekt
packagesImpacted:
  - share
  - site-kernel-checks
successSignals:
  - "A new `share.utility.lint` command is registered in `site-kernel-checks` and added to `STANDARD_CHECK_PIPELINE`."
  - "Running `share.utility.lint` on any app with a duplicate app-local utility exits non-zero and lists the offending files and functions."
  - "All existing apps pass `share.utility.lint` without changes on the day this RFC is accepted."
nonGoals:
  - "Do not auto-migrate duplicated utilities from apps into @gogol/share. Detection only — migration is manual."
  - "Do not lint packages/* for duplication against @gogol/share. The rule applies to apps/* only."
  - "Do not detect import-path aliasing tricks that hide a re-implementation; false negatives are acceptable at the cost of false positives."
  - "Do not enforce this rule retroactively on files that predate the RFC-0022 extraction."
---

# RFC-0032: Enforce app-agnostic utility extraction to @gogol/share

## Context

[RFC-0022](RFC-0022-unify-semantic-and-astro-infrastructure-in-shared-package.md) established `@gogol/share` as the canonical home for app-agnostic shared utilities (entity-ID normalisation, i18n helpers, base Zod schemas, block builder, RuntimeContext, etc.). The package's own README documents the rule: a utility belongs in `@gogol/share` if it is (1) app-agnostic — no `astro:content` or app-local imports; (2) has a stable API; (3) is used or will be used by more than one app.

This rule is currently a documentation-only convention. No OS command verifies it. Any developer or agent may silently re-implement or duplicate an existing `@gogol/share` utility inside an `apps/*` workspace without any automated feedback.

## Problem

The invariant "do not re-implement app-agnostic utilities inside `apps/*`" relies entirely on manual discipline and code review. No command in `STANDARD_CHECK_PIPELINE` detects:

1. A function in `apps/*/src/utils/` or `apps/*/src/helpers/` whose signature and logic duplicate an export of `@gogol/share`.
2. An inline reimplementation of `toDataEntryId`, `createLocalizationHelpers`, `getEntryLanguage`, `buildPage`, `RuntimeContext`, etc., scattered across app-local files.
3. A new app-local helper that is trivially extractable (no `astro:content`, no app-local imports) and thus should live in `@gogol/share` from day one.

Without a check, the monorepo will gradually accumulate cross-app divergence in utility implementations — the exact problem RFC-0022 was designed to prevent.

## Decision

A new `share.utility.lint` command is introduced in `@gogol/site-kernel-checks`. It:

- Scans `apps/*/src/utils/**/*.ts`, `apps/*/src/helpers/**/*.ts`, and `apps/*/src/lib/**/*.ts` for exported functions/constants whose names match the closed export list of `@gogol/share`.
- Fails with a violation for each match, identifying the file, export name, and the canonical `@gogol/share` sub-path that already provides it.
- Additionally flags any TypeScript file inside `apps/*/src/` that imports from a path outside `@gogol/share` for utilities that are on the canonical export list (i.e., the function is imported from somewhere other than the package that owns it).
- The command is **workspace-scoped**, scans all apps in a single pass, and is added to `STANDARD_CHECK_PIPELINE` after `naming.convention.lint`.

The canonical export list is derived at lint time by reflecting on `@gogol/share`'s barrel exports (`src/index.ts` re-exports) — no hardcoded list is maintained separately.

## Architectural fit

| Existing invariant | How this RFC extends or reinforces it |
| --- | --- |
| RFC-0022 (shared utilities) | **Enforced.** Turns a documentation rule into a build gate. |
| `STANDARD_CHECK_PIPELINE` | Extended with `share.utility.lint` after `naming.convention.lint`. |
| Site OS operator model | New command is `scope: workspace`, `supportsAllApps: true`, no `mutatesState`. |

## Design

### CLI surface

```sh
pnpm exec werkstatt run share.utility.lint
pnpm exec werkstatt run share.utility.lint --json
```

Scope: `workspace`. No per-app `--app` flag — the command always scans all apps.

### TypeScript contracts

```ts
interface ShareUtilityViolation {
  app: string;           // e.g. "nicaragua-projekt"
  file: string;          // relative path from app root
  exportName: string;    // e.g. "toDataEntryId"
  rule: "duplicate-export" | "wrong-import-source";
  canonicalImport: string; // e.g. "@gogol/share/content"
  message: string;
}
```

### File system responsibilities

| Path                          | Role                                                      |
| ----------------------------- | --------------------------------------------------------- |
| `apps/*/src/utils/**/*.ts`    | Scanned for duplicate exports                             |
| `apps/*/src/helpers/**/*.ts`  | Scanned for duplicate exports                             |
| `apps/*/src/lib/**/*.ts`      | Scanned for duplicate exports                             |
| `apps/*/src/**/*.ts`          | Scanned for wrong import sources                          |
| `packages/share/src/index.ts` | Source of canonical export names (reflected at lint time) |

### Output format

```json
{
  "command": "share.utility.lint",
  "status": "fail",
  "violations": [
    {
      "app": "nicaragua-projekt",
      "file": "src/utils/entry-id.ts",
      "exportName": "toDataEntryId",
      "rule": "duplicate-export",
      "canonicalImport": "@gogol/share/content",
      "message": "toDataEntryId is already exported by @gogol/share/content. Remove the local copy and import from the canonical path."
    }
  ]
}
```

### Failure modes

- Exits non-zero when any violation is found.
- Warnings only (non-zero exit deferred to a future wave) if a utility is found in `apps/*/src/` but not yet exported from `@gogol/share` — this is advisory, not blocking.
- `--json` output follows the `KernelCommandResult` envelope contract (RFC-0030).

## Rollout

1. **Wave 0 (this RFC draft):** Command is defined and registered but is a no-op pass until Wave 1.
2. **Wave 1 (after RFC accepted):** Command implemented and added to `STANDARD_CHECK_PIPELINE`. All existing apps must pass on day one — if any violations exist at implementation time, they are fixed in the same PR that introduces the command.
3. **Wave 2 (ongoing):** New apps scaffolded via `site-kernel-onboarding` automatically include `share.utility.lint` via `STANDARD_CHECK_PIPELINE` spread in their `kernel.config.ts`.

## Alternatives considered

1. **Lint imports only (not exports).** Rejected. Import-source linting alone misses entirely local re-implementations that are never imported from `@gogol/share`.
2. **Document the rule more prominently.** Rejected. Documentation-only rules have already proven insufficient — RFC-0022 documented the rule; this RFC enforces it.
3. **Per-app allowlist for known exceptions.** Considered for future extension. Initial wave has no allowlist to keep the rule strict and avoid carve-out accumulation.

## Risks

- **False positives on legitimately different utilities with the same name.** Mitigated by matching both name and signature shape (not just export name).
- **`@gogol/share` barrel reflection fragility.** If the barrel is split or re-organised, the reflected list may shrink. Mitigated by `share.utility.lint` having a snapshot test of the expected export list.
- **Maintenance burden of keeping the canonical list current.** Mitigated by deriving the list from the actual barrel at lint time — no manual list.

## Acceptance criteria

- [x] `share.utility.lint` registered in `site-kernel-checks` with `scope: workspace` (evidence: implemented historically)
- [x] Command derives canonical export list from `@gogol/share/src/index.ts` at lint time (evidence: packages/ directory, package exists)
- [x] `duplicate-export` rule implemented and tested (evidence: implemented historically)
- [x] `wrong-import-source` rule implemented and tested (evidence: implemented historically)
- [x] `--json` output follows RFC-0030 envelope contract (evidence: implemented historically)
- [x] Added to `STANDARD_CHECK_PIPELINE` after `naming.convention.lint` (evidence: implemented historically)
- [x] All existing apps pass on the day the command is introduced (no pre-existing violations, or fixed in same PR) (evidence: implemented historically)
- [x] `rfc.validate` passes on this file (evidence: implemented historically)

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has `status: accepted`.
- Agents MUST NOT change the `status` field of this RFC.
- Implementation lives in `packages/os/site-kernel-checks/src/share-utility.ts` (new file) and registers via `createStandardCheckModule` in `module.ts`.
- Agents MUST add a snapshot test for the canonical export list to prevent silent shrinkage.
- Agents MUST reference `RFC-0032` in commit messages or PR descriptions when implementing.
