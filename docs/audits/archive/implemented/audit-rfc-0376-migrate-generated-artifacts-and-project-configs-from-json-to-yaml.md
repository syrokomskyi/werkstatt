---
rfcId: RFC-0376
auditId: AUDIT-RFC-0376-01
date: 2026-07-12
auditor:
  skill: wg-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0376

## Verdict: Needs revision

The RFC is structurally sound and addresses a real ecosystem inconsistency, but it has two critical gaps: it renames `uni.registry.json` (established by DNA-18/RFC-0023) without amending RFC-0023, and it completely ignores the `json.generated.marker.validate` command that becomes dead code after migration. Several commands in `commands.changed` are misclassified — they only read whitelisted JSON and need no changes.

## Mechanical validation (rfc.validate)

Pass. 10 V-19 warnings (amended RFCs don't yet list RFC-0376 in `amendedBy`) — expected for a draft RFC, resolved during implementation.

## Axis A — Structural completeness

- **Decision** is present-tense and clear: "Migrate all Category B and C files from JSON to YAML."
- **CLI surface** shows exact `pnpm exec werkstatt run yaml.contract.lint --json` invocations.
- **File system responsibilities** table is extensive and names concrete paths.
- **Output format** documents the `--json` shape with examples.
- **Rollout** describes a big-bang approach with 16 numbered steps.
- **Alternatives considered** has 7 real alternatives with rejection reasons.
- **Risks** covers YAML parsing strictness, file expansion, external consumers, and library version compatibility.
- **Acceptance criteria** are checkable and cover the decision's scope.
- **Implementation notes** are explicit behavioral rules.

No issues.

## Axis B — DNA alignment

- **FAIL — DNA-18 conflict (critical).** DNA-18 (established by RFC-0023) states: "`uni.registry.json` at the workspace root is the only machine-readable index of the UI surface." The RFC renames `uni.registry.json` to `uni.registry.yaml` in the file system responsibilities table and `commands.changed` list, but does **not** list RFC-0023 in `amends[]`. Renaming a DNA-named artifact is a DNA invariant change — the RFC must amend RFC-0023 and update the DNA-18 text from `uni.registry.json` to `uni.registry.yaml`.
- **`satisfies[]` is empty.** The RFC does not declare any DNA invariants it satisfies or extends. Given that it changes DNA-18's artifact name, this is a gap — the RFC should at minimum reference DNA-18 in its body and explain the rename.
- `related[]` includes RFC-0375 (generated-file detection) but does not include RFC-0023. RFC-0023 should be in `amends[]`, not just related.

## Axis C — Ecosystem fit

- **FAIL — `json.generated.marker.validate` command not addressed (critical).** This command (`packages/os/site-kernel-checks/src/json-generated-marker.ts`, registered in `command-tables/35-json-generated-marker.ts`, running in `packages-check` pipeline) validates `.generated.json` files for field-based markers and advisory fields (JSON-01..06). After migration, there are no `.generated.json` files — this command becomes dead code. The RFC must list it in `commands.removed[]` or `commands.changed[]` (adapted to validate `.generated.yaml` files with comment-based markers).
- **FAIL — `commands.changed` list is inflated with commands that don't need changes.** `tsconfig.shape.lint` (the RFC says `tsconfig.shape.validate`, but the actual command name is `tsconfig.shape.lint`) only reads `tsconfig.json` files, which are whitelisted and stay JSON. `env.contract.validate` reads `.env.example` files, which are not JSON at all. These commands do not need changes. The RFC should audit each command in the `changed` list and remove false positives.
- **FAIL — Compass sync not mentioned.** The RFC changes repository-wide file format conventions but does not identify which `docs/*.xml` files need synchronization (root AGENTS.md Compass document duties). At minimum, `docs/technology.xml` and `docs/source-markup.xml` likely reference `.generated.json` or `.json` file extensions that need updating.
- **FAIL — `readJsonFile` shared helper not addressed.** `packages/AGENTS.md` documents `readJsonFile<T>(path)` from `@gogol/share/fs` as a canonical helper. The RFC doesn't mention whether a `readYamlFile` helper needs to be added to the shared helpers catalog or whether all callers should switch to `yaml.parse(await readFile(...))`. At least 3 files in `site-kernel-checks/src` use `readJsonFile`.
- **Pipeline placement** is correct: `build.prepare` for `yaml.contract.lint` is justified — it runs before generators and checks the repository's source state.
- **AGENTS.md updates** are mentioned — the RFC has an "AGENTS.md changes" section documenting the YAML-only contract.
- **Cosmic naming** is not relevant — the RFC doesn't touch manifests or component/section/page contracts.

## Axis D — Forward-only compliance

No issues. The RFC is explicitly big-bang, forward-only. No compatibility shims, no dual-paths, no feature flags. Legacy `.generated.json` files are deleted, not maintained alongside `.generated.yaml`. `buildGeneratedJsonAdvisory()` is removed, not kept as dead code.

## Axis E — Agent-facing policy

- **Status gate** is correct: "Agents MAY implement code changes ONLY when this RFC has status `accepted` (or `implemented`)."
- **Implementation notes** are explicit behavioral rules with MUST/MUST NOT.
- **Anti-fabrication** is not relevant — no content authoring in acceptance criteria.
- **Storage policy** is not relevant — no persistence changes.

No issues.

## Axis F — Pragmatism

- **FAIL — `commands.changed` list needs pruning.** The RFC lists ~60 commands in `commands.changed`. Several are misclassified:
  - `tsconfig.shape.validate` (actual name: `tsconfig.shape.lint`) — reads only `tsconfig.json` (whitelisted). No change needed.
  - `env.contract.validate` — reads `.env.example` (not JSON). No change needed.
  - `content.source.binding.validate` — needs verification.
  - `breadcrumb.generate` — needs verification. The RFC should distinguish commands that actually read/write Category B/C JSON files from commands that only read Category A (whitelisted) JSON files.
- **Minimal command surface** — `yaml.contract.lint` earns its existence. No existing command can be extended to enforce the YAML-only contract.
- **Existing patterns** — the RFC correctly reuses `buildGeneratedHeader()` and the `import.meta.glob` + `?raw` + parse pattern already proven in the codebase.
- **Scope discipline** — `appsImpacted` and `packagesImpacted` are appropriately scoped.

## Axis G — Blind spots

- **FAIL — Performance of `yaml.contract.lint`.** The command scans the entire repository on every `build.prepare`. The RFC says it excludes `node_modules/`, `dist/`, `.git/`, `.cache/` but doesn't specify the scan cost (file count, I/O patterns) or whether it uses `collectFiles` from `@gogol/share/fs` (the canonical helper per `packages/AGENTS.md`). For a monorepo with hundreds of files, this could add measurable time to every build. The RFC should specify that it uses `collectFiles` and estimate the scan cost.
- **FAIL — `@gogol/fingerprint` package (DNA-53) not addressed.** The fingerprint package provides `stableJsonHash` and `stableJsoncHash` for content addressing. If generated artifacts are now YAML, the fingerprint package may need a `stableYamlHash` function, or the existing `stableJsonHash` calls on migrated files need to switch to `stableYamlHash`. The RFC doesn't mention this.
- **False positives** — the RFC doesn't estimate the false-positive rate for `yaml.contract.lint`. During the migration window (between renaming files and updating readers), the lint will flag files that are mid-migration. The RFC should describe whether there's a migration order that avoids this (e.g., update readers first, then rename, or rename + update readers in one commit per file).
- **Edge cases** — the RFC considers large generated files (`uni.registry.yaml` ~2500 lines) but doesn't consider empty states (a new app with no generated artifacts — `yaml.contract.lint` should pass trivially) or concurrent execution (two builds running `yaml.contract.lint` simultaneously — read-only, so safe, but not stated).
- **External consumers** — the RFC mentions verifying that deployment scripts don't read `service.config.json` directly, but doesn't mention `wrangler.jsonc` (Cloudflare) which is whitelisted and stays JSONC, not YAML. This is correct but should be explicit.

## Questions for the author

1. **DNA-18 rename.** DNA-18 says `uni.registry.json` is the canonical UI index. You rename it to `uni.registry.yaml` but don't amend RFC-0023. Should RFC-0023 be added to `amends[]`, and should the DNA-18 text in `docs/architecture-dna.md` be updated from `uni.registry.json` to `uni.registry.yaml`?
2. **`json.generated.marker.validate` command.** This command validates `.generated.json` files for field-based markers (JSON-01..06). After migration, there are no `.generated.json` files. Should this command be removed (`commands.removed[]`), or should it be adapted to validate `.generated.yaml` files with comment-based markers (`commands.changed[]`)?
3. **`commands.changed` pruning.** `tsconfig.shape.lint` only reads `tsconfig.json` (whitelisted, stays JSON). `env.contract.validate` reads `.env.example` (not JSON). Why are these in `commands.changed`? Can you audit each command in the list and remove those that only interact with Category A (whitelisted) files?
4. **`readJsonFile` shared helper.** `@gogol/share/fs` exports `readJsonFile<T>(path)` as a canonical helper. Should a `readYamlFile<T>(path)` helper be added to the shared helpers catalog, or should callers use `yaml.parse(await readFile(path, "utf-8"))` directly? If a new helper is added, should it be registered in `dedup-helper-lint`'s reserved-identifier map?
5. **`@gogol/fingerprint` impact.** DNA-53 establishes `@gogol/fingerprint` as the canonical hash package with `stableJsonHash`/`stableJsoncHash`. Do any fingerprint consumers need to switch from `stableJsonHash` to a YAML-aware hash for migrated files? Does the fingerprint package need a `stableYamlHash` function?
