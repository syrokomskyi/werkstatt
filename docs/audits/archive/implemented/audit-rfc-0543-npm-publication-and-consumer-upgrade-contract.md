---
rfcId: RFC-0543
auditId: AUDIT-RFC-0543-01
date: 2026-07-26
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0543

## Verdict: Needs revision

The RFC solves a real gap (no upgrade path for npm consumers, incomplete package metadata, hardcoded version) and the `forge.upgrade` design is sound and additive. However, the `commands` frontmatter omits `forge.publish.check`, the proposed `repository.url` points to a non-existent GitHub repo, and several design details need clarification before implementation: the `forge.publish.check` vs `prepublishOnly` ambiguity, the `forge.syncedVersion` schema placement, and path resolution in the compiled (`dist/`) context.

## Mechanical validation (rfc.validate)

Pass — zero violations.

## Axis A — Structural completeness

1. **`forge.publish.check` missing from `commands` frontmatter.** The Design (§ Publication hygiene check), Rollout (step 4), and Acceptance criteria all reference `forge.publish.check`, but it is absent from `commands.proposed` and `commands.added`. The frontmatter only lists `forge.upgrade` in `proposed`/`added` and `forge.init`/`forge.doctor` in `changed`. If `forge.publish.check` is a new command, it must appear in `commands.proposed`; if it is a `prepublishOnly` script enhancement, the RFC must resolve the ambiguity (see finding 2).

2. **`forge.publish.check` vs `prepublishOnly` ambiguity.** § Publication hygiene check says "A `forge.publish.check` command (or a `prepublishOnly` script enhancement)". The acceptance criterion repeats the ambiguity: "`forge.publish.check` (or `prepublishOnly` enhancement) verifies…". The RFC must pick one. A `prepublishOnly` script enhancement is simpler (no new command registration, runs in the monorepo before publish); a standalone command is more testable and reusable. The design should commit to one approach.

3. **`forge.upgrade` listed in both `proposed` and `added`.** For a draft-status RFC, a new command should be in `proposed` only (it moves to `added` upon implementation). Having the same command in both buckets is redundant and confusing. Compare RFC-0540 and RFC-0542, which leave `proposed` empty and list only in `added`/`changed`.

4. **`repository.url` is factually incorrect.** The proposed metadata (line 121) specifies `"url": "https://github.com/warpgogol/forge.git"`, but the actual git remote is `git@github.com:syrokomskyi/warpgogol-4.git`. There is no `warpgogol/forge` repo on GitHub. The URL should point to the monorepo (`https://github.com/syrokomskyi/warpgogol-4.git`) with `"directory": "packages/forge"`, or whatever the canonical public remote will be.

5. **`forge.syncedVersion` schema placement is unclear.** The YAML example (line 154) shows a new top-level `forge:` section, but the current `forgeConfigSchema` (`packages/forge/src/config/forge-config.ts:79`) has no `forge` top-level key — the schema is `schema`, `project`, `paths`, `bindings`. The RFC should explicitly state where in the schema this field lives, whether it requires a schema version bump (`forge/config@1` → `forge/config@2`), and whether it is optional (nullable, default `null`) so existing configs don't break.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-54]` is correct — the RFC body (§ Architectural fit, line 104) explains how `forge.upgrade` is the forward-only carrier of binding-default additions (RFC-0540) into consumer configs, respecting the de-hardcoding seam. No conflicts with existing DNA invariants.

## Axis C — Ecosystem fit

1. **Does not reference `resolveForgeRoot`.** § forge.upgrade command step 1 (line 143) says "Read the installed `@wgogol/forge` version from `node_modules/@wgogol/forge/package.json`", hardcoding the `node_modules` path. The existing `resolveForgeRoot` function (`packages/forge/src/config/forge-config.ts:201`) already handles both monorepo (`packages/forge`) and npm-installed (`node_modules/@wgogol/forge`) paths. The RFC should reference `resolveForgeRoot` instead of hardcoding `node_modules`.

2. **`packages/forge/AGENTS.md` update not mentioned.** The acceptance criteria mention updating `README.md` (line 246) but not `packages/forge/AGENTS.md`. The AGENTS.md file documents the forge command surface (OS modules table, command list); adding `forge.upgrade` to `forgeCoreModule` requires updating the OS modules table and command documentation there.

3. **Compass sync not addressed.** If the RFC changes the forge package's role or command surface, `docs/technology.xml` (the `pkg-forge` role description) may need synchronization. The RFC should identify which `docs/*.xml` files need updates, per root AGENTS.md Compass document duties.

## Axis D — Forward-only compliance

No issues. `forge.upgrade` is purely additive — it syncs skills and adds missing binding defaults without removing or deprecating existing functionality. No backward compatibility layers, shims, or dual-paths are proposed. `forge.syncedVersion` is a new field with no legacy path to maintain.

## Axis E — Agent-facing policy

No issues. The RFC correctly states "Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented)" (line 251). Implementation notes are explicit behavioral rules with MUST NOT constraints. No self-authorizing language. The "sole publication source" constraint (line 253) and "no publish without `forge.publish.check`" constraint (line 254) are clear agent-facing policy.

## Axis F — Pragmatism

1. **`forge.publish.check` as a standalone command may be over-engineered.** The check runs only before `npm publish` from this monorepo — it is not a consumer-facing command. A `prepublishOnly` script enhancement (e.g. `pnpm run clean && pnpm run build && node scripts/publish-check.mjs`) is simpler, avoids registering a command that consumers never need, and keeps the check colocated with the publish workflow. The RFC should justify why a registered command is preferred over a script, or commit to the script approach.

2. **`forge.upgrade` earns its existence.** It solves a real problem that `forge.init` (skip-with-warning) cannot: syncing new skills and adding missing binding defaults to existing consumer configs. The alternatives section (line 227) correctly rejects `npm update && forge init` and full `forge.yaml` rewrite.

3. **`UpgradeResult` type is minimal and sufficient.** No speculative generality, no unused optional fields.

## Axis G — Blind spots

1. **`VERSION` path resolution in compiled context.** § Version source (line 133) says `bin/cli.ts` `VERSION` reads from the adjacent `package.json` at runtime via `fileURLToPath` + `readFileSync`. In the published package, `bin/cli.ts` is compiled to `dist/bin/cli.js`; the `package.json` is at the package root (two levels up from `dist/bin/`, not adjacent). The RFC should specify the path resolution strategy that works in both source (`packages/forge/bin/cli.ts` → `packages/forge/package.json`) and compiled (`node_modules/@wgogol/forge/dist/bin/cli.js` → `node_modules/@wgogol/forge/package.json`) contexts.

2. **`forge.syncedVersion` absent in existing configs.** § forge.upgrade step 2 (line 144) compares against `forge.syncedVersion` and exits if equal. But existing consumer configs (created before this RFC) will not have the field. The RFC should specify: treat absent/null as "never synced" and proceed with the full upgrade, not exit 0.

3. **`forge.scaffold` not mentioned.** `forge.scaffold` creates a new project from a stack profile. Should it also write `forge.syncedVersion`? The RFC only mentions `forge.init` (line 155, step 3 of Rollout). If `forge.scaffold` creates a `forge.yaml`, it should set `forge.syncedVersion` too, or the first `forge.upgrade` in a scaffolded project would be a no-op (null → null).

4. **Monorepo `forge.upgrade` behavior.** The RFC's step 1 hardcodes `node_modules/@wgogol/forge`, but in this monorepo the package is at `packages/forge`. While `forge.upgrade` is primarily a consumer command, the RFC should acknowledge that running it in the monorepo (where `resolveForgeRoot` resolves to `packages/forge`) is supported and behaves identically.

## Questions for the author

1. Is `forge.publish.check` a new registered command or a `prepublishOnly` script enhancement? The design and acceptance criteria must commit to one — the current "or" makes the criterion uncheckable.
2. What is the correct `repository.url`? The proposed `https://github.com/warpgogol/forge.git` does not match the actual remote (`syrokomskyi/warpgogol-4`). Will a public `warpgogol/forge` repo be created, or should the URL point to the monorepo?
3. Where does `forge.syncedVersion` live in `forgeConfigSchema`? Is it a new top-level `forge:` section, or under `project`? Is it optional (nullable) so existing configs don't break? Does it require a schema version bump?
