---
id: RFC-0878
title: "Require explicit --bump major for platform major version bumps"
status: accepted
kind: command
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-08-18
updatedAt: 2026-08-18
enhancedAt: 2026-08-18
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed:
    - ecosystem.commit
  removed: []
appsImpacted: []
packagesImpacted:
  - packages/werkstatt-site
---

## Context

`ecosystem.commit` is the canonical commit command for platform-scope changes. It reads `versionBump` from RFC frontmatter and applies the bump automatically. The `--bump` flag can override the RFC's declared bump type.

The platform version follows SemVer. Major version bumps signal breaking changes to external consumers. They are rare, deliberate events — the platform went from 5.x to 6.x as part of the certification program cutover (RFC-0855), and should not reach 7.0.0 without an equally deliberate decision.

## Problem

`ecosystem.commit` reads the `versionBump` field from RFC frontmatter and applies it automatically. When an RFC declares `versionBump: major`, every `ecosystem.commit --rfc RFC-XXXX` call during implementation bumps the platform major version. A typical multi-step implementation produces 5–10 commits, each incrementing the major version (6.x.x → 7.0.0 → 8.0.0 → ...).

Major version bumps are rare, intentional events that signal breaking changes to consumers. They should not happen automatically on every implementation step commit.

### Incident

RFC-0877 declared `versionBump: major`. During implementation, 5 `ecosystem.commit --rfc RFC-0877` calls bumped the platform from 6.14.34 to 8.1.0 — two major version increases for a single RFC implementation. The version had to be manually reset.

## Decision

`ecosystem.commit` will treat `versionBump: major` in RFC frontmatter as advisory only. When `--bump` is not explicitly set to `major`, the command downgrades to `patch` instead of applying a major bump. This prevents accidental major version inflation during multi-step RFC implementations.

### Behavior change

| RFC `versionBump` | `--bump` flag | Current behavior | New behavior |
| --- | --- | --- | --- |
| `major` | absent | **major bump** | patch bump (major requires `--bump major`) |
| `major` | `--bump major` | major bump | major bump (unchanged) |
| `major` | `--bump patch` | patch bump | patch bump (unchanged) |
| `major` | `--bump minor` | minor bump | minor bump (unchanged — override takes precedence) |
| `minor` | absent | minor bump | minor bump (unchanged) |
| `patch` | absent | patch bump | patch bump (unchanged) |
| `none` | absent | EC-06 block | EC-06 block (unchanged) |

### Rationale

- `minor` and `patch` bumps are safe — they do not signal breaking changes to consumers.
- `major` bumps are consequential — they require consumer migration and must be deliberate.
- The RFC `versionBump` field declares the _eventual_ bump for the RFC's release, not the per-commit bump during implementation.
- The `--bump` flag already exists and takes precedence — this change only affects the default when `--bump` is absent and RFC declares `major`.

## Architectural fit

This change fits within the existing `ecosystem.commit` architecture (RFC-0703, RFC-0754). The `--bump` override mechanism already exists — this change only affects the default fallback when `--bump` is absent. No new commands, no new flags, no structural changes.

## Design

In `packages/werkstatt-site/src/checks/ecosystem-commit.ts`, the bump-type resolution logic (around line 502) currently reads:

```ts
let bumpType: "patch" | "minor" | "major" = "patch";
if (hasValidBumpOverride) {
  bumpType = bumpOverride as "patch" | "minor" | "major";
}
if (rfcId) {
  const { versionBump, found } = await readRfcVersionBump(workspaceRoot, rfcId);
  // ...
  if (versionBump === "minor" || versionBump === "major") {
    if (!hasValidBumpOverride) {
      bumpType = versionBump;
    }
  }
}
```

The change: when `versionBump === "major"` and `!hasValidBumpOverride`, set `bumpType = "patch"` instead of `bumpType = "major"`. The operator must pass `--bump major` explicitly to get a major bump.

## Rollout

1. Update bump-type resolution in `ecosystem-commit.ts`.
2. Add test cases in `ecosystem-commit.test.ts`.
3. Update AGENTS.md with the new rule.
4. No migration needed — existing commits are not affected.

## Alternatives considered

- **Remove `versionBump: major` from all RFCs** — rejected. The field is useful for documenting the intended eventual bump. The problem is automatic application, not the field itself.
- **Block `ecosystem.commit` when RFC has `versionBump: major`** — rejected. Too disruptive. Implementation commits still need to happen; the version bump just shouldn't be major.
- **Add a confirmation prompt for major bumps** — rejected. `ecosystem.commit` is non-interactive. The `--bump` flag is the explicit signal.

## Risks

- **Operator forgets `--bump major` for the final release** — the platform stays on a lower version than intended. Mitigation: the release process includes a version check; the operator can manually bump via `--bump major` on the release commit.
- **Existing RFCs with `versionBump: major`** — their next `ecosystem.commit` will produce a patch bump instead of major. This is the desired behavior. No data migration needed.

## Acceptance criteria

- [ ] `ecosystem.commit --rfc RFC-XXXX` where RFC has `versionBump: major` and no `--bump` flag produces a patch bump, not a major bump (evidence: `packages/werkstatt-site/src/checks/tests/ecosystem-commit.test.ts`, new test case)
- [ ] `ecosystem.commit --rfc RFC-XXXX --bump major` where RFC has `versionBump: major` produces a major bump (evidence: existing test or new test case)
- [ ] `ecosystem.commit --rfc RFC-XXXX` where RFC has `versionBump: minor` and no `--bump` flag still produces a minor bump (evidence: existing tests pass)
- [ ] `ecosystem.commit --rfc RFC-XXXX` where RFC has `versionBump: patch` and no `--bump` flag still produces a patch bump (evidence: existing tests pass)
- [ ] AGENTS.md documents the new behavior (evidence: `AGENTS.md`, Platform-scope commit discipline section)
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- Agents MUST update the `determineBumpType` logic in `packages/werkstatt-site/src/checks/ecosystem-commit.ts` to downgrade `major` to `patch` when `--bump` is not explicitly set to `major`.
- Agents MUST add test cases covering the new behavior.
- Agents MUST NOT change behavior for `minor` or `patch` — only `major` is affected.
