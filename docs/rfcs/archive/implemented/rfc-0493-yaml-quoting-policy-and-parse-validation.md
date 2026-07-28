---
id: RFC-0493
title: "YAML quoting policy and parse validation"
status: implemented
kind: policy
scope: workspace
owners:
  - architecture
reviewers:
  - human:andrii-syrokomskyi
createdAt: 2026-07-22
updatedAt: 2026-07-22
enhancedAt: 2026-07-23
implementedAt: 2026-07-22
closedAt:
supersedes: []
supersededBy:
amends:
  - RFC-0376
amendedBy: []
related:
  - RFC-0376
satisfies: []
versionBump: patch
commands:
  proposed:
    - yaml.parse.validate
  added:
    - yaml.parse.validate
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@gogol/site-kernel-checks"
  - "@gogol/share"
successSignals:
  - "All .yaml files in the repository parse successfully with the yaml (Eemeli AY) library in YAML 1.2 mode — zero parse errors in CI"
  - "No .yaml file contains duplicate mapping keys — YAML-PARSE-02 fires on any duplicate"
  - "No .yaml file uses single-quoted scalars — yml/plain-scalar ESLint rule enforces plain-or-double-quoted only, with auto-fix"
  - "No .yaml file uses unnecessary double quotes on values that are valid plain scalars — yml/plain-scalar: [error, always] removes them via auto-fix"
  - "Agents produce YAML with plain scalars by default, double quotes only when plain is invalid or ambiguous, and never single quotes"
  - "yaml.parse.validate runs in PACKAGES_CHECK_PIPELINE and SITES_BUILD_PREPARE_PIPELINE, catching agent-authored YAML syntax errors before generators run"
  - "Prettier format check (pnpm format:check) passes on all .yaml files — Prettier normalizes quoting style with singleQuote: false (double quotes when needed)"
  - "The agent guide in docs/policies/generated-file-governance.md has a YAML quoting section with a decision table and examples"
nonGoals:
  - "Does not replace Prettier as the YAML formatter — Prettier remains the primary formatting tool"
  - "Does not introduce yamllint (Python) or yq (Go) — the yaml (Eemeli AY) npm package covers parse validation, and eslint-plugin-yml covers quoting style"
  - "Does not validate YAML schema correctness — only parse validity and duplicate-key detection"
  - "Does not change the YAML-only contract (RFC-0376) — this RFC amends it with quoting and parse-validation rules"
  - "Does not add YAML 1.1 compatibility — the ecosystem is YAML 1.2 only, no backward compatibility (yes/no/on/off are plain strings, not booleans)"
---

# RFC-0493: YAML quoting policy and parse validation

## Problem

AI agents frequently produce YAML with quoting errors, inconsistent quoting styles, and undetected syntax errors. The existing `yaml.contract.lint` (RFC-0376) enforces the **extension contract** (`.yaml` not `.json`, no JSON content in `.yaml` files) but does not validate that `.yaml` files actually parse, does not enforce quoting style, and does not detect duplicate mapping keys. These gaps allow malformed YAML to reach generators and the Astro build, causing runtime failures or silent data loss (duplicate keys overwrite values).

## Decision

Adopt a three-layer defense-in-depth for YAML quality: (1) an agent-facing quoting policy in `docs/policies/generated-file-governance.md` (plain → double → never single), (2) a `yaml.parse.validate` command in `SITES_BUILD_PREPARE_PIPELINE` and `PACKAGES_CHECK_PIPELINE` that parse-checks all `.yaml` files and detects duplicate keys, and (3) `eslint-plugin-yml` with `yml/plain-scalar: ["error", "always"]` to enforce plain scalars with auto-fix.

## Context

AI agents frequently produce YAML with quoting errors: unnecessary quotes on plain-valid strings, missing quotes on strings that would be interpreted as non-string types, and inconsistent quoting styles. The existing `yaml.contract.lint` (RFC-0376) enforces the **extension contract** (`.yaml` not `.json`, no JSON content in `.yaml` files) but does not:

1. **Validate that YAML files actually parse** — a file with a syntax error (bad indentation, unclosed flow collection, invalid block scalar) passes `yaml.contract.lint` as long as it doesn't start with `{` or `[`.
2. **Enforce quoting style** — no rule prevents agents from wrapping every string in unnecessary double quotes or using single quotes.
3. **Detect duplicate mapping keys** — a YAML file with `key: a\nkey: b` silently overwrites the first value in many parsers.

This RFC closes those gaps with three measures:

1. **Agent guide** — a YAML 1.2 quoting policy in `docs/policies/generated-file-governance.md` that teaches agents the plain → double → never-single decision.
2. **`yaml.parse.validate` command** — a fast parse-check of all `.yaml` files using the `yaml` (Eemeli AY) library, reporting parse errors and duplicate keys.
3. **`eslint-plugin-yml`** — ESLint integration with `yml/plain-scalar: ["error", "always"]` to enforce plain scalars and auto-fix unnecessary quotes.

## Design

### 1. YAML 1.2 quoting policy (agent guide)

Add a new section "YAML quoting policy (RFC-0493)" to `docs/policies/generated-file-governance.md`, referenced from `AGENTS.md`.

**Decision algorithm for YAML scalar quoting:**

```
1. Is the value a non-string type (boolean, number, null, date)?
   → Write it as-is (no quotes). YAML 1.2 resolves the type.
     Examples: true, false, null, 42, 3.14, 2026-07-22

2. Is the value a string that is a valid plain scalar?
   → Write it without quotes (plain style).
     A plain scalar is valid when it does NOT:
     - start with an indicator character: ! & * ? | > @ ` # " ' % { [ ,
     - start with - : ? followed by a space
     - contain : (colon+space) anywhere
     - contain # (space+hash) anywhere (starts a comment)
     - start or end with whitespace
     - in flow context (inside {} or []), contain , [ ] { }
     Examples: backend, https://example.org, marathon-stuttgart, linked-public-source

3. Is the value a string that is NOT a valid plain scalar?
   → Use double quotes.
     Examples: "key: value", "has # hash", " starts with space", "true" (string not boolean)

4. Never use single quotes.
   Double quotes support escape sequences (\n, \t, \uXXXX); single quotes do not.
   There is no case where single quotes are needed but double quotes are not.
```

**Quick reference table:**

| Value                       | Quoting | Reason                                  |
| --------------------------- | ------- | --------------------------------------- |
| `name: backend`             | plain   | valid plain scalar                      |
| `url: https://example.org/` | plain   | valid plain scalar                      |
| `enabled: true`             | plain   | boolean, not string                     |
| `count: 42`                 | plain   | number, not string                      |
| `date: 2026-07-22`          | plain   | date type, not string                   |
| `id: "marathon-stuttgart"`  | plain   | valid plain scalar — quotes unnecessary |
| `note: "key: value"`        | double  | contains `: `                           |
| `note: "has # hash"`        | double  | contains ` #`                           |
| `note: "true"`              | double  | string that looks like boolean          |
| `note: "42"`                | double  | string that looks like number           |
| `note: 'escaped'`           | wrong   | single quotes — use double instead      |

**YAML 1.2 note:** In YAML 1.2 (the version this ecosystem uses), `yes`, `no`, `on`, `off` are plain strings, not booleans. They do not need quotes. This is a change from YAML 1.1. Since the ecosystem is YAML 1.2 only with no backward compatibility requirement, agents should not quote these values.

**Generated YAML:** When generating YAML programmatically, build a JS/TS object and serialize it with `yaml.stringify()` from the `yaml` (Eemeli AY) library. Do not hand-compose YAML strings. The serializer produces correct quoting automatically. Run `pnpm format` afterward to normalize style.

### 2. `yaml.parse.validate` command

**Location:** `packages/os/site-kernel-checks/src/yaml-parse-validate.ts`

**Command name:** `yaml.parse.validate`

**Scope:** `workspace`

**What it does:**

- Collects all `.yaml` files in the workspace (same `collectFiles` pattern as `yaml.contract.lint`, same `EXCLUDE_DIRS`)
- Parses each file with `yaml.parse()` from the `yaml` (Eemeli AY) library, using `uniqueKeys: true` to detect duplicate mapping keys
- Reports diagnostics:
  - `YAML-PARSE-01` (error): file failed to parse — includes the parse error message and line number from the `yaml` library
  - `YAML-PARSE-02` (error): file has duplicate mapping keys — includes the key name and line number

**Diagnostic rules** (registered in `diagnostics/rules/core-infra.ts`):

| Rule ID         | Severity | Message                                    | Command               |
| --------------- | -------- | ------------------------------------------ | --------------------- |
| `YAML-PARSE-01` | error    | YAML file failed to parse: {error message} | `yaml.parse.validate` |
| `YAML-PARSE-02` | error    | YAML file has duplicate mapping key: {key} | `yaml.parse.validate` |

**Command table entry** (in `command-tables/infra-contracts.ts`):

```ts
{
  name: "yaml.parse.validate",
  description:
    "RFC-0493: parse-check all .yaml files. " +
    "YAML-PARSE-01: parse error. " +
    "YAML-PARSE-02: duplicate mapping key.",
  scope: "workspace",
  flags: {},
  reads: ["**/*.yaml"],
  execute: runYamlParseValidate,
},
```

**Pipeline integration:**

- `SITES_BUILD_PREPARE_PIPELINE` — immediately after `yaml.contract.lint` (which runs at step 1 of `build.prepare`, confirmed at `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:17`). Parse validation runs **before generators** so that malformed YAML is caught before any generator reads it. This is earlier than `build.check` and prevents cascading generator failures from bad YAML input.
- `PACKAGES_CHECK_PIPELINE` — added as a standalone step (`yaml.contract.lint` is not in `PACKAGES_CHECK_PIPELINE`). This catches YAML errors in package configs, manifests, and RFC frontmatter.

**Exclusions:** Same `EXCLUDE_DIRS` as `yaml.contract.lint` (`node_modules`, `dist`, `.git`, `.cache`, `.output`, `.astro`, `.turbo`, `.agents`, `.changelog-system`, `.claude`, `.github`, `.vscode`, `.windsurf`, `.wrangler`, `.opencode`, `.werkstatt`, `packages`, `scripts`, `tmp`, `systems`, `missions`, `releases`, `agents`, `logs`, `coverage`, `out`).

**Note on reduced exclude set:** `packages` and `missions` are in `EXCLUDE_DIRS` for `yaml.contract.lint` because that lint is about the JSON-vs-YAML extension contract (and `packages` has `package.json` files that are whitelisted). But `yaml.parse.validate` should check `.yaml` files in `packages` and `missions` — those are authored YAML files that need parse validation. So `yaml.parse.validate` uses a **reduced exclude set** that does NOT exclude `packages` or `missions`.

**Reduced exclude set for `yaml.parse.validate`:**

```
node_modules, dist, .git, .cache, .output, .astro, .turbo,
.agents, .changelog-system, .claude, .github, .vscode,
.windsurf, .wrangler, .opencode, .werkstatt, scripts, tmp,
releases, agents, logs, coverage, out
```

This includes `.yaml` files in `packages/`, `missions/`, `systems/`, `docs/`, `services/`, `integrations/`, `fleet/`, and root-level `.yaml` files.

**CLI invocations:**

```sh
pnpm exec site-kernel run yaml.parse.validate
pnpm exec site-kernel run yaml.parse.validate --json
```

**`--json` output shape:**

```json
{
  "command": "yaml.parse.validate",
  "status": "pass|fail",
  "count": 1,
  "diagnostics": [
    {
      "ruleId": "YAML-PARSE-01",
      "severity": "error",
      "file": "path/to/file.yaml",
      "message": "YAML file failed to parse: ...",
      "fixHint": "Fix the syntax error in the file."
    }
  ],
  "summary": { "error": 0, "warning": 0, "info": 0 }
}
```

**Failure modes:**

- Exit code 0: all `.yaml` files parse successfully, no duplicate keys.
- Exit code 1: one or more `.yaml` files have parse errors or duplicate keys.
- All diagnostics are `error` severity — there are no warnings.

**Performance:** The repository contains ~366 `.yaml` files within the reduced exclude set. Parsing each file with the `yaml` library takes ~1–2ms, totaling ~400–700ms. This is negligible compared to the 60–180s spent on image/video generation in the same pipeline. No caching or CI-only mode is needed.

**Edge cases:**

- Empty `.yaml` files (zero bytes): `yaml.parse("")` returns `null` — valid, no diagnostic.
- `.yaml` files with only comments: parse returns `null` — valid, no diagnostic.
- YAML merge keys (`<<: *anchor`): the `yaml` library with `uniqueKeys: true` correctly handles merge keys — they are not reported as duplicates. Merge keys are a YAML feature for alias merging, not duplicate keys.
- Concurrent execution: `yaml.parse.validate` is read-only and safe to run in parallel (e.g., multiple `turbo run build` invocations). No file writes, no shared state.

### 3. `eslint-plugin-yml` integration

**Package:** `eslint-plugin-yml` (npm, by ota-meshi)

**DevDependency:** Added to root `package.json` `devDependencies`.

**ESLint config change** (`eslint.config.js`):

The current `eslint.config.js` uses `typescript-eslint` flat config. `eslint-plugin-yml` supports flat config via its `configs["flat/base"]` export, which provides the `yaml-eslint-parser` and plugin registration. Spread the flat/base config array, then add a separate config object for the `yml/plain-scalar` rule. No separate parser dependency is needed.

```js
import tseslint from "typescript-eslint";
import eslintPluginYml from "eslint-plugin-yml";

export default tseslint.config(
  // ... existing TS config ...
  // RFC-0493: YAML quoting enforcement via eslint-plugin-yml
  ...eslintPluginYml.configs["flat/base"],
  {
    files: ["**/*.yaml"],
    rules: {
      "yml/plain-scalar": ["error", "always"],
    },
  },
);
```

**What `yml/plain-scalar: ["error", "always"]` does:**

- Enforces that scalars use plain style whenever valid in YAML 1.2
- Reports scalars that are quoted but could be plain (unnecessary quotes)
- Supports `--fix` (auto-removes unnecessary quotes)
- Does NOT report scalars that MUST be quoted (e.g., `"true"` as a string, `"key: value"`)
- Does NOT enforce single vs double quote choice — that's Prettier's job

**Prettier interaction:** Prettier with `singleQuote: false` (current config) uses double quotes when quoting is needed. `eslint-plugin-yml` removes unnecessary quotes. Running `pnpm format` (Prettier) then `pnpm lint:yaml --fix` (eslint-plugin-yml) produces the canonical form: plain when valid, double quotes when needed, never single quotes.

**New script in `package.json`:**

```json
"lint:yaml": "eslint --config eslint.config.js **/*.yaml"
```

**CI integration:** `lint:yaml` runs as part of the existing CI lint step (or as a new step alongside `lint:packages`).

### 4. Prettier — no change needed

The current Prettier config (`@/home/syrokomskyi/projects/warpgogol/warpgogol-4/.prettierrc.mjs:48-53`) already has:

- `parser: "yaml"` for `*.{yml,yaml}` files
- `singleQuote: false` (double quotes when quoting is needed)

This is already correct for the "double quotes or plain, never single" policy. No Prettier config change is needed.

## Architectural fit

This RFC amends RFC-0376 (YAML-only contract) and fits within the existing validation architecture:

- **Package boundaries**: The `yaml.parse.validate` command lives in `@gogol/site-kernel-checks` alongside `yaml.contract.lint` — same package, same module pattern, same `collectFiles` infrastructure from `@gogol/share/fs`. No new package boundaries are created.
- **Pipeline placement**: `yaml.parse.validate` is added to `SITES_BUILD_PREPARE_PIPELINE` (after `yaml.contract.lint`) and `PACKAGES_CHECK_PIPELINE`. This matches the existing pattern where `yaml.contract.lint` runs early in `build.prepare` before generators.
- **RFC relationship**: Amends RFC-0376 by adding rules **inside** `.yaml` files (quoting, parse validity, duplicate keys), while RFC-0376 governs **which** files should be `.yaml`. The extension contract is unchanged.
- **Compass sync**: `docs/verification-plan.xml` should be updated to include `yaml.parse.validate` in the `SITES_BUILD_PREPARE_PIPELINE` and `PACKAGES_CHECK_PIPELINE` step lists when this RFC is implemented.
- **AGENTS.md updates**: The quoting policy reference is added to the **root** `AGENTS.md` (workspace-scoped policy, not package-scoped). The existing "Generated-file governance" section in root `AGENTS.md` already references `docs/policies/generated-file-governance.md`.
- **Command lifecycle**: `commands.proposed` and `commands.added` both list `yaml.parse.validate` — the command is proposed and added in the same RFC, which is the standard pattern for policy RFCs that introduce a new validation command.

## Alternatives considered

### Why not yamllint or yq?

`yamllint` (Python) and `yq` (Go) are external runtime dependencies. This monorepo is Node.js/TypeScript-only. The `yaml` (Eemeli AY) npm package is already a project dependency and covers parse validation + duplicate-key detection. `eslint-plugin-yml` is a Node.js ESLint plugin that covers quoting-style enforcement with auto-fix. Adding Python or Go runtimes for YAML tooling would violate the ecosystem's tooling boundary.

### Why not just Prettier?

Prettier normalizes quoting when run (`pnpm format`), but it does not **gate** — an agent can commit unformatted YAML and CI won't catch it unless `pnpm format:check` is in the pipeline. `eslint-plugin-yml` with `yml/plain-scalar` provides a CI-gateable lint rule with auto-fix. `yaml.parse.validate` catches parse errors that Prettier would silently reformat (or fail on). Together they form a defense-in-depth: agent guide (prevention) → Prettier (normalization) → eslint-plugin-yml (enforcement) → yaml.parse.validate (validation).

### Why not extend `yaml.contract.lint` instead of a new command?

`yaml.contract.lint` checks file extensions and JSON-in-YAML content — it does not parse file contents. Adding parse validation to it would change its scope from "extension contract" to "extension + content contract", violating the one-responsibility principle. A separate command keeps the concerns clean: `yaml.contract.lint` governs which files should be YAML; `yaml.parse.validate` governs whether YAML files are valid.

## Rollout

- **Default behavior**: `yaml.parse.validate` runs as `error` severity from the first deployment. No warning-mode transition period — the ecosystem is forward-only.
- **Existing files**: Before adding `yaml.parse.validate` to pipelines, run it once manually (`pnpm exec site-kernel run yaml.parse.validate`) to surface any existing parse errors. Fix all errors in a separate commit, then add the pipeline steps.
- **New files**: All new `.yaml` files must parse cleanly from the moment the pipeline step is active. Agents authoring YAML should follow the quoting policy in `docs/policies/generated-file-governance.md`.
- **`eslint-plugin-yml` auto-fix**: Run `pnpm lint:yaml --fix` in a **separate commit** before enabling the `error` severity in CI. This isolates the cosmetic quote-removal diff from functional changes. After the auto-fix commit, `pnpm lint:yaml` should pass with zero violations.
- **CI integration**: `lint:yaml` runs as part of the existing CI lint step alongside `lint:packages`.

## Acceptance criteria

- [x] `docs/policies/generated-file-governance.md` has a "YAML quoting policy (RFC-0493)" section with the decision algorithm and quick reference table. (evidence: docs/policies/generated-file-governance.md:91-148, `grep -n "YAML quoting policy" docs/policies/generated-file-governance.md`)
- [x] Root `AGENTS.md` references the YAML quoting policy section. (evidence: AGENTS.md:209, `grep -n "RFC-0493" AGENTS.md`)
- [x] `pnpm exec site-kernel run yaml.parse.validate` exits 0 on the current repository (all existing `.yaml` files parse, no duplicate keys). (evidence: `pnpm exec site-kernel run yaml.parse.validate` → 0 error(s), 0 warning(s))
- [x] `pnpm exec site-kernel run yaml.parse.validate --json` returns the documented output shape with `diagnostics` array and `summary` object. (evidence: `pnpm exec site-kernel run yaml.parse.validate --json` → data.diagnostics=[], data.summary={error:0,warning:0,info:0})
- [x] `yaml.parse.validate` is registered in `command-tables/infra-contracts.ts` with `scope: "workspace"` and `reads: ["**/*.yaml"]`. (evidence: packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts:296-304)
- [x] `YAML-PARSE-01` and `YAML-PARSE-02` are registered in `diagnostics/rules/core-infra.ts`. (evidence: packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts:492-502)
- [x] `{ command: "yaml.parse.validate" }` is in `SITES_BUILD_PREPARE_PIPELINE` after `yaml.contract.lint`. (evidence: packages/os/site-kernel-checks/src/pipelines/build-prepare.ts:19-20)
- [x] `{ command: "yaml.parse.validate" }` is in `PACKAGES_CHECK_PIPELINE`. (evidence: packages/os/site-kernel-checks/src/pipelines/packages-check.ts:177-178)
- [x] `packages/os/site-kernel-checks/src/tests/yaml-parse-validate.test.ts` has red/green fixtures for `YAML-PARSE-01` and `YAML-PARSE-02`. (evidence: packages/os/site-kernel-checks/src/tests/yaml-parse-validate.test.ts:75-98, `pnpm --filter @gogol/site-kernel-checks exec vitest run src/tests/yaml-parse-validate.test.ts` → 4 passed)
- [x] `eslint-plugin-yml` is in root `package.json` `devDependencies`. (evidence: package.json:42, `pnpm list eslint-plugin-yml` → 1.19.1)
- [x] `eslint.config.js` has the YAML config block with `yml/plain-scalar: ["error", "always"]`. (evidence: eslint.config.js:50-57, uses flat/base spread pattern with languageOptions.parser — `language: "yml/yaml"` was replaced by flat/base spread which provides the parser automatically)
- [x] `pnpm lint:yaml` exits 0 after auto-fix. (evidence: `pnpm lint:yaml` → exit 0, zero violations)
- [x] RFC-0376 frontmatter `amendedBy` includes `RFC-0493`. (evidence: docs/rfcs/archive/implemented/rfc-0376-migrate-generated-artifacts-and-project-configs-from-json-to-yaml.md:30-31, `pnpm exec site-kernel run rfc.validate RFC-0493` → 0 violations)

## Implementation notes for agents

- **When authoring YAML**: Follow the quoting policy decision algorithm (plain → double → never single). Use `yaml.stringify()` for generated YAML, not hand-composed strings.
- **When `yaml.parse.validate` fails**: Read the diagnostic `message` and `fixHint`. Fix the syntax error or duplicate key in the offending file. Do not suppress or skip the validation.
- **When `eslint-plugin-yml` fails**: Run `pnpm lint:yaml --fix` to auto-remove unnecessary quotes. Then run `pnpm format` to normalize remaining style. Commit the cosmetic fix separately from functional changes.
- **When adding a new `.yaml` file**: Ensure it parses by running `pnpm exec site-kernel run yaml.parse.validate` locally before committing.
- **Generated YAML files**: Files with the `GENERATED` marker are exempt from manual quoting fixes — fix the generator's `yaml.stringify()` call instead, then regenerate.
- **Do not add `yaml.contract.lint` to `PACKAGES_CHECK_PIPELINE`** — it is not there currently and this RFC does not add it. Only `yaml.parse.validate` is added to `PACKAGES_CHECK_PIPELINE`.

## Implementation plan

### Step 1: Agent guide

1. Add "YAML quoting policy (RFC-0493)" section to `docs/policies/generated-file-governance.md` after the existing "YAML-only contract" section.
2. Add a reference line to `AGENTS.md` in the "Generated-file governance" section.

### Step 2: `yaml.parse.validate` command

1. Create `packages/os/site-kernel-checks/src/yaml-parse-validate.ts` with `runYamlParseValidate` function.
2. Register `YAML-PARSE-01` and `YAML-PARSE-02` in `packages/os/site-kernel-checks/src/diagnostics/rules/core-infra.ts`.
3. Add command entry to `packages/os/site-kernel-checks/src/command-tables/infra-contracts.ts`.
4. Add `{ command: "yaml.parse.validate" }` to `SITES_BUILD_PREPARE_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/build-prepare.ts`, immediately after `yaml.contract.lint`.
5. Add `{ command: "yaml.parse.validate" }` to `PACKAGES_CHECK_PIPELINE` in `packages/os/site-kernel-checks/src/pipelines/packages-check.ts`.
6. Add test file `packages/os/site-kernel-checks/src/tests/yaml-parse-validate.test.ts` with red/green fixtures.

### Step 3: `eslint-plugin-yml` integration

1. Add `eslint-plugin-yml` to root `package.json` `devDependencies`.
2. Add YAML config block to `eslint.config.js`.
3. Add `lint:yaml` script to `package.json`.
4. Run `pnpm install` to install the new devDependency.
5. Run `pnpm lint:yaml --fix` to auto-fix existing YAML files (remove unnecessary quotes).
6. Run `pnpm format` to normalize any remaining style differences.

### Step 4: Verification

1. `pnpm --filter @gogol/site-kernel-checks test` — new test passes.
2. `pnpm --filter @gogol/site-kernel-checks build:check` — pipeline passes with new step.
3. `pnpm lint:yaml` — zero violations after auto-fix.
4. `pnpm format:check` — zero formatting drift.
5. `pnpm exec site-kernel run yaml.parse.validate` — zero parse errors.

## Risks

- **Existing YAML files may have parse errors** that were silently tolerated. The first run of `yaml.parse.validate` may surface errors that need fixing. This is expected — the errors were always there, just undetected. **Migration path**: run `yaml.parse.validate` once manually before adding it to pipelines; fix all surfaced errors in a separate commit; then add the pipeline steps. This prevents a single bulk-fix commit mixed with pipeline wiring.
- **Existing YAML files may have unnecessary quotes** that `eslint-plugin-yml --fix` will remove. This produces a one-time diff across many files. The diff is cosmetic (quote removal) and does not change semantics. **Migration path**: run `pnpm lint:yaml --fix` in a separate commit before enabling `error` severity in CI. This isolates the cosmetic diff from functional changes.
- **`eslint-plugin-yml` adds a new devDependency** with its own dependency tree. The package is maintained by ota-meshi (the same author as `eslint-plugin-astro`), widely used, and has no native dependencies.
- **Mission workpiece YAML files** are validated by `yaml.parse.validate` because `missions` is NOT in the reduced exclude set. This is intentional — agent-authored YAML in mission workpieces is the most common source of parse errors. But it means a mission with a YAML syntax error will fail `build:check` until the error is fixed in the workpiece.

## Amends RFC-0376

This RFC amends RFC-0376 (YAML-only contract) by adding:

- Quoting policy (plain → double → never single)
- Parse validation requirement
- Duplicate-key detection requirement

The extension contract (`.yaml` not `.json`, no `.yml`, no JSON content in `.yaml`) from RFC-0376 is unchanged. This RFC adds rules **inside** `.yaml` files, while RFC-0376 governs **which** files should be `.yaml`.
