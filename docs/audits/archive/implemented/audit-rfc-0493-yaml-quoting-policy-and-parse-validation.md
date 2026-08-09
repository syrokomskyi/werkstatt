---
rfcId: RFC-0493
auditId: AUDIT-RFC-0493-01
date: 2026-07-23
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0493

## Verdict: Needs revision

The RFC addresses a real gap (parse validation, quoting style, duplicate keys) and proposes a well-scoped defense-in-depth approach. However, it has multiple structural violations (7 missing required sections per V-13), a bidirectional-amends violation (V-19), and several semantic findings: incorrect pipeline placement claims, a missing `amendedBy` backreference on RFC-0376, and an `eslint-plugin-yml` config that will not work with the current flat-config ESLint setup without additional adapter configuration.

## Mechanical validation (rfc.validate)

**Pass with warnings** (8 violations, all `warning` severity):

- **V-13** (×7): Missing required sections: `## Problem`, `## Decision`, `## Architectural fit`, `## Rollout`, `## Alternatives considered`, `## Acceptance criteria`, `## Implementation notes for agents`. The RFC uses `## Context` and `## Design` but does not include the V-13-required section headings.
- **V-19**: `RFC-0493.amends` includes `RFC-0376`, but `RFC-0376.amendedBy` does not include `RFC-0493`. The backreference must be added to RFC-0376's frontmatter upon implementation.

## Axis A — Structural completeness

**Fails.** Seven required sections are missing (V-13 warnings above). The RFC uses `## Context` (acceptable as context) and `## Design` (partially covers Decision), but the following must be added:

- **`## Problem`** — the `## Context` section describes the problem informally but the required `## Problem` heading is absent.
- **`## Decision`** — the `## Design` section describes _how_ but not the single decision statement in present tense.
- **`## Architectural fit`** — no section explains how this RFC fits the ecosystem architecture, package boundaries, or existing RFC relationships beyond the `amends` reference.
- **`## Rollout`** — the `## Implementation plan` section describes steps but does not describe default behavior, adoption path for existing files, or new-file compliance.
- **`## Alternatives considered`** — the `### Why not yamllint or yq?` and `### Why not just Prettier?` subsections partially cover this, but the required heading is absent.
- **`## Acceptance criteria`** — the `successSignals` frontmatter covers this conceptually, but the required `## Acceptance criteria` section with checkable items is missing.
- **`## Implementation notes for agents`** — no explicit agent-facing behavioral rules section.

Additionally:

- **CLI surface** is partially documented (command name and flags shown) but does not show exact `pnpm exec werkstatt run yaml.parse.validate --json` invocations.
- **File system responsibilities** table is missing — the implementation plan lists files but not in a formal table.
- **Output format** is missing — no `--json` shape documented for `yaml.parse.validate`.
- **Failure modes** are missing — no exit codes or warn-vs-fail behavior specified.

## Axis B — DNA alignment

**No issues.** The RFC does not declare any `satisfies[]` entries and does not establish new DNA invariants. It amends RFC-0376 (which satisfies DNA-18 via `uni.registry.yaml`). The `related: [RFC-0376]` is relevant and not decorative. No DNA conflicts detected.

## Axis C — Ecosystem fit

**Fails on pipeline placement.** The RFC claims:

> `SITES_BUILD_CHECK_PIPELINE` — after `yaml.contract.lint` (which runs in `build.prepare`), before the Astro build.

This is **incorrect**. `yaml.contract.lint` runs in `SITES_BUILD_PREPARE_PIPELINE` (confirmed at `@/home/syrokomskyi/projects/warpgogol/warpgogol-4/packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:17`), not in `SITES_BUILD_CHECK_PIPELINE`. The RFC proposes adding `yaml.parse.validate` to `SITES_BUILD_CHECK_PIPELINE` "after `yaml.contract.lint`" — but `yaml.contract.lint` is not in that pipeline. The RFC should either:

1. Add `yaml.parse.validate` to `SITES_BUILD_PREPARE_PIPELINE` (after `yaml.contract.lint`), or
2. Add it to `SITES_BUILD_CHECK_PIPELINE` as a standalone step (not "after yaml.contract.lint").

Option 1 is more logical: parse validation should happen before generators run, not after the Astro build.

**Package boundaries**: `packagesImpacted` lists `@gogol/site-kernel-checks` and `@gogol/share` — both correct. The command implementation goes in `site-kernel-checks`, and the `yaml` library is already used via `@gogol/share/fs` patterns.

**Compass sync**: The RFC does not identify which `docs/*.xml` files need synchronization. If `yaml.parse.validate` is added to pipelines, `docs/verification-plan.xml` may need updating. The RFC should mention this.

**AGENTS.md updates**: The RFC correctly identifies adding a reference to `docs/policies/generated-file-governance.md` from `AGENTS.md`, but does not specify _which_ `AGENTS.md` (root vs packages). The root `AGENTS.md` is the right target for a workspace-scoped policy.

**Command lifecycle**: `commands.proposed` and `commands.added` both list `yaml.parse.validate` — internally consistent.

## Axis D — Forward-only compliance

**No issues.** The RFC is forward-only: it adds new validation without maintaining a parallel path. The `eslint-plugin-yml` integration is additive (new lint rule), not a dual-path. No backward compatibility shims proposed. The amend to RFC-0376 changes the contract directly by adding quoting and parse-validation rules.

## Axis E — Agent-facing policy

**No issues.** The RFC does not contain self-authorizing language. The quoting policy in `## Design` section 1 provides clear agent-facing behavioral rules (the decision algorithm and quick reference table). The `status: draft` frontmatter is correct — no implementation permission is granted.

**Storage policy**: Not applicable — the RFC does not touch persistence.

## Axis F — Pragmatism

**Fails on `eslint-plugin-yml` config compatibility.** The RFC proposes this ESLint config block:

```js
import yml from "eslint-plugin-yml";

export default tseslint.config(
  {
    files: ["**/*.yaml"],
    languageOptions: {
      parser: yml.parsers[".yaml"],
    },
    plugins: { yml },
    rules: {
      "yml/plain-scalar": ["error", "always"],
    },
  },
);
```

The current `eslint.config.js` (`@/home/syrokomskyi/projects/warpgogol/warpgogol-4/eslint.config.js`) uses `typescript-eslint` flat config with a custom `local-rules` plugin only. The proposed config uses `yml.parsers[".yaml"]` — but `eslint-plugin-yml` flat-config support requires `eslint-plugin-yml/flat` or the `yaml-eslint-parser` package as a separate parser dependency. The RFC should specify the correct import path for flat config (e.g., `import yml from "eslint-plugin-yml/flat"` or the equivalent for the current version) and verify compatibility with ESLint 10.x (the repo uses `eslint: ^10.7.0`).

**Minimal command surface**: `yaml.parse.validate` earns its existence — it checks parse validity and duplicate keys, which `yaml.contract.lint` does not do. Not a flag on an existing command.

**Scope discipline**: `appsImpacted: []` is correct (workspace-scoped command). `packagesImpacted` lists only the two packages actually touched.

## Axis G — Blind spots

**Partially covered, with gaps:**

- **Performance**: The RFC mentions `collectFiles` and the reduced exclude set but does not estimate file count or cost. The existing `yaml.contract.lint` scans `.json`, `.jsonc`, `.yml`, `.yaml` files; `yaml.parse.validate` would scan only `.yaml` files but must _read and parse_ each one (not just check extensions). This is significantly more expensive — parsing ~100–200 YAML files on every `build.prepare` or `build.check`. The RFC should estimate the cost and consider whether this should be cached or run only in CI.

- **False positives**: The RFC does not estimate the false-positive rate for `YAML-PARSE-02` (duplicate keys). YAML merge keys (`<<: *anchor`) can trigger false duplicate-key reports in some parser configurations. The RFC should clarify whether `uniqueKeys: true` in the `yaml` library handles merge keys correctly.

- **Edge cases**: The RFC does not consider empty `.yaml` files (zero bytes) — `yaml.parse("")` returns `null`, which is valid. It does not consider `.yaml` files with only comments. It does not consider concurrent execution (two builds running `yaml.parse.validate` simultaneously — safe, since it's read-only).

- **Migration path**: The RFC correctly notes that existing YAML files may have parse errors (Risks section) but does not describe a migration window or suppression mechanism. If the first run surfaces 50 parse errors across the repo, the RFC should describe how to handle the transition (e.g., run once, fix all, then add to pipeline).

- **`eslint-plugin-yml` auto-fix risk**: The RFC proposes running `pnpm lint:yaml --fix` to auto-fix existing YAML files. This could produce a large cosmetic diff across many files. The RFC mentions this in Risks but does not estimate the number of affected files or whether the auto-fix should be done in a separate commit.

## Questions for the author

1. **Pipeline placement**: Should `yaml.parse.validate` run in `SITES_BUILD_PREPARE_PIPELINE` (after `yaml.contract.lint`, before generators) rather than `SITES_BUILD_CHECK_PIPELINE`? The RFC claims it goes "after `yaml.contract.lint`" in `SITES_BUILD_CHECK_PIPELINE`, but `yaml.contract.lint` is not in that pipeline — it is in `SITES_BUILD_PREPARE_PIPELINE`. Parse validation before generators run would catch errors earlier.

2. **ESLint flat-config compatibility**: Has the proposed `eslint-plugin-yml` config been tested with ESLint 10.x flat config? The current `eslint.config.js` uses `typescript-eslint` flat config only. What is the correct import path (`eslint-plugin-yml/flat` vs `eslint-plugin-yml`), and does `yml.parsers[".yaml"]` work in flat config without an additional `yaml-eslint-parser` dependency?

3. **Performance budget**: What is the estimated cost of parsing all `.yaml` files in the repo on every `build.prepare` or `build.check`? The reduced exclude set includes `packages/`, `missions/`, `systems/`, `docs/` — this could be 200+ files. Should `yaml.parse.validate` be cached or run only in CI, or is the parse cost negligible (~1–2ms per file)?
