---
rfcId: RFC-0361
planId: PLAN-RFC-0361-01
status: draft
owner: architecture
createdAt: 2026-07-10
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/ontology"
    - "@gogol/site-kernel-checks"
    - "@gogol/site-kernel"
  services: []
  docs:
    - AGENTS.md
    - docs/requirements.xml
    - docs/technology.xml
    - docs/development-plan.xml
    - docs/knowledge-graph.xml
---

# Implementation Plan: RFC-0361

> **Pilot plan.** RFC-0361 has `status: draft` and `enhancedAt: 2026-07-10`. Implementation requires explicit architecture acceptance first. This plan is structured so it can be executed immediately once the RFC transitions to `accepted`.

> **Cross-RFC dependencies.** The Werkstatt artifacts that `naming.policy.validate` scans (`systems/registry.yaml`, `missions/*/mission.yaml`, `releases/*/release.yaml`, `systems/<id>/bordbuch/events.ndjson`) are defined by RFC-0354 (accepted, not implemented), RFC-0355 (draft), and RFC-0357 (draft). Until those RFCs are implemented, the validator gracefully passes with zero violations when no artifacts exist. RFC-0362 (consistency primitives, draft) provides snapshot/retry semantics — until it lands, the validator reads files directly without retry.

## 1. Objectives

- [ ] O1 — Create `packages/ontology/src/schemas/naming-policy.ts` with centralized regexes and policy descriptors for Sternsystem ids, mission ids, release ids, and Bordbuch event ids (acceptance: naming-policy.ts created, exported from @gogol/ontology)
- [ ] O2 — Implement `naming.policy.validate` command in `@gogol/site-kernel-checks` that validates all naming policies across registry, missions, releases, Bordbücher, and directory/manifest alignment (acceptance: command registered and tested)
- [ ] O3 — `--json` output stable with `validatedSystems`, `validatedMissions`, `validatedReleases`, `validatedBordbuchEntries`, `parseErrors`, `violations` fields (acceptance: --json output stable)
- [ ] O4 — Latin-only enforcement explicit: reject non-ASCII before regex, NFC normalize for diagnostics only (acceptance: Latin-only enforcement explicit)
- [ ] O5 — Corruption tolerance: missing file, parse error, and partial write classes handled per-artifact without aborting scan (acceptance: reports malformed artifacts and continues)
- [ ] O6 — `--system <id>` filter works for scoped validation (acceptance: --system filter works)
- [ ] O7 — Empty-state graceful pass: when no Werkstatt artifacts exist, validator returns pass with zero violations (acceptance: no pre-existing violations or fixed)
- [ ] O8 — `rfc.validate` passes on RFC-0361 (acceptance: rfc.validate passes)

**Out of scope for this plan (gated by other RFCs):**

- Updating `sternsystem.ts`, `mission.ts`, `release.ts` Zod schemas to import centralized regexes — deferred to RFC-0354/0355/0357 implementation plans, which will reference RFC-0361's `naming-policy.ts` as the single source of truth.
- Snapshot/retry semantics for concurrent modification — deferred to RFC-0362 (Werkstatt consistency primitives, draft). Until then, the validator reads files directly.
- Pipeline wiring (`build.check` or `apps-check`) — the RFC specifies standalone initially; pipeline integration is a follow-up after Werkstatt artifacts exist.

## 2. Affected artifacts

### 2.1 Code and commands

- **`packages/ontology/src/schemas/naming-policy.ts`** — new file: centralized regexes (`STERNSYSTEM_ID_REGEX`, `MISSION_ID_REGEX`, `RELEASE_ID_REGEX`, `BORDBUCH_EVENT_ID_REGEX`), policy descriptor objects (`STERNSYSTEM_ID_POLICY`, `MISSION_ID_POLICY`, `RELEASE_ID_POLICY`, `BORDBUCH_EVENT_ID_POLICY`), and `rejectNonAscii(value): { ok: boolean; diagnostic?: string }` helper.
- **`packages/ontology/src/schemas/index.ts`** — barrel re-exports for the four regexes, four policy descriptors, and `rejectNonAscii` helper.
- **`packages/ontology/src/index.ts`** — top-level re-exports for the same symbols.
- **`packages/os/site-kernel-checks/src/structure/naming-policy.ts`** — new file: `runNamingPolicyValidate` handler implementing the consolidated validator.
- **`packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts`** — add `naming.policy.validate` entry to `STRUCTURE_NAMING_COMMANDS` array.
- **`packages/os/site-kernel-checks/src/tests/naming-policy.test.ts`** — new test file: red/green fixture coverage for all validation rules.
- **Site OS command (1 new):**
  - `naming.policy.validate` — workspace scope, read-only, `supportsAllApps: true`

### 2.2 Configuration and data

- No configuration files modified. The validator reads Werkstatt artifacts (`systems/registry.yaml`, `missions/*/mission.yaml`, `releases/*/release.yaml`, `systems/<id>/bordbuch/events.ndjson`) that do not yet exist in the repository. Their creation is governed by RFC-0354/0355/0357.

### 2.3 Documentation and specs

- **Root `AGENTS.md`** — add a "Werkstatt naming policy (RFC-0361)" section documenting: centralized regexes in `@gogol/ontology` are the single source of truth; `naming.policy.validate` is the consolidated validator; Latin-only enforcement; no `--fix` mode; relationship to `naming.convention.lint` (filenames) and `site.bordbuch.validate` (site-level append-only invariant).
- **Compass XML files** (`docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/knowledge-graph.xml`) — synchronize to reflect the naming policy contract and `naming.policy.validate` command.
- **RFC file** — read-only reference; not modified by this plan.

### 2.4 Validation and pipelines

- **`pnpm --filter @gogol/ontology build:check`** — type-check new schemas.
- **`pnpm --filter @gogol/site-kernel-checks build:check`** — type-check new command handler.
- **`pnpm --filter @gogol/site-kernel-checks test`** — vitest unit tests for naming-policy validator.
- **`pnpm exec site-kernel run rfc.validate RFC-0361`** — RFC validation.
- **`pnpm -s run build:check`** — workspace-level build check (no regression).
- No new pipeline wiring — `naming.policy.validate` is workspace-scoped and invoked manually; it does not join `build.check` or `build.prepare` at this stage. Future wiring is a follow-up after Werkstatt artifacts exist.

## 3. Step sequence

### Step 1. Centralized naming-policy module in `@gogol/ontology`

**Goal:** Define the machine-checkable naming policy contracts as centralized regexes and policy descriptors so all downstream code imports from a single source.

**Agent actions:**

- Create `packages/ontology/src/schemas/naming-policy.ts` with:
  - `STERNSYSTEM_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/`
  - `MISSION_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*-m\d{6}$/`
  - `RELEASE_ID_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*-r\d{6}$/`
  - `BORDBUCH_EVENT_ID_REGEX = /^event-\d{6}$/`
  - `STERNSYSTEM_ID_POLICY` object: `{ regex, charset, description, examples, counterExamples }`
  - `MISSION_ID_POLICY` object: `{ regex, format, description, examples, counterExamples }`
  - `RELEASE_ID_POLICY` object: `{ regex, format, description, examples, counterExamples }`
  - `BORDBUCH_EVENT_ID_POLICY` object: `{ regex, format, description, examples, counterExamples }`
  - `rejectNonAscii(value: string): { ok: boolean; diagnostic?: string }` — checks `/[^\x00-\x7F]/.test(value)`, returns `{ ok: false, diagnostic: "contains non-ASCII code points" }` with the offending characters listed; returns `{ ok: true }` when all characters are ASCII.
  - `normalizeForDiagnostics(value: string): string` — NFC-normalizes a value for diagnostic output only; never used to accept a value.
- Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks to the new file.
- Update `packages/ontology/src/schemas/index.ts` to re-export all four regexes, four policy descriptors, `rejectNonAscii`, and `normalizeForDiagnostics`.
- Update `packages/ontology/src/index.ts` to re-export the same symbols at the package root level.

**Validation:**

- `pnpm --filter @gogol/ontology build:check` passes.

**Completion criterion:** `STERNSYSTEM_ID_REGEX`, `MISSION_ID_REGEX`, `RELEASE_ID_REGEX`, `BORDBUCH_EVENT_ID_REGEX`, their policy descriptors, and the two helpers are exported from `@gogol/ontology` and the package type-checks.

**Human review:** no

---

### Step 2. `naming.policy.validate` command handler

**Goal:** Implement the consolidated naming policy validator that scans all Werkstatt artifacts and reports violations without aborting on corrupt files.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/structure/naming-policy.ts` with `runNamingPolicyValidate(input, context)`:
  - **Scope:** workspace — reads from the workspace root, not an app directory.
  - **Flags:** `--system <id>` (optional, filters to one Sternsystem), `--json` (standard envelope), `--migrate-plan <path>` (optional, emits a JSON migration plan; does not rewrite files).
  - **Scan sequence:**
    1. **Registry** (`systems/registry.yaml`):
       - If file does not exist → pass with zero violations (empty state).
       - If file exists but fails YAML parse → report `parse-error` violation, continue.
       - Parse with lenient YAML parse (not strict Zod — strict schema is RFC-0354's job). Extract `systems[]` array.
       - For each entry: validate `id` against `STERNSYSTEM_ID_REGEX` (reject non-ASCII first); validate `cosmicStar` against `StarCatalog` (array membership via `StarCatalog.includes()`); validate `repo` is non-empty string; validate `pinnedPlatform` is semver if present.
       - Cross-entry: duplicate `id` detection; duplicate `cosmicStar` among `active`/`registered`/`paused` systems; reactivation conflict (archived system whose `cosmicStar` is now used by an active/registered system).
    2. **Missions** (glob `missions/*/mission.yaml`):
       - For each file: if parse fails → report `parse-error`, continue.
       - Validate `missionId` against `MISSION_ID_REGEX` (reject non-ASCII first).
       - Validate `systemId` references a registered Sternsystem (from registry parse above).
       - Validate `state` is `open`, `closed`, or `aborted`.
       - Directory/manifest alignment: directory name equals `missionId`.
    3. **Releases** (glob `releases/*/release.yaml`):
       - For each file: if parse fails → report `parse-error`, continue.
       - Validate `releaseId` against `RELEASE_ID_REGEX` (reject non-ASCII first).
       - Validate `systemId` references a registered Sternsystem.
       - Validate `missionId` references a valid mission (from missions parsed above).
       - Validate `semver` is valid semver.
       - Directory/manifest alignment: directory name equals `releaseId`.
    4. **Bordbücher** (glob `systems/<id>/bordbuch/events.ndjson`):
       - For each file: if file does not exist for a registered system → skip (valid lifecycle state); if file exists but is empty → report `partial-write`; if parse fails → report `parse-error`, continue.
       - Parse NDJSON line-by-line. For each entry:
         - Validate `id` against `BORDBUCH_EVENT_ID_REGEX` (reject non-ASCII first).
         - Validate `occurredAt` is ISO 8601 datetime.
         - Validate `kind` is one of the RFC-0361 §1.4 enum values.
         - Validate `missionId` matches `MISSION_ID_REGEX` or is null.
         - Validate `releaseId` matches `RELEASE_ID_REGEX` or is null.
         - Validate `actor` is non-empty string.
         - Validate `summary` is non-empty string.
         - Validate `previousHash` / `hash` are present and well-formed (`sha256:` prefix + 64 hex chars).
       - Sequence checks: `id` is monotonically increasing starting at `event-000001` with no gaps; `occurredAt` is non-decreasing; `previousHash` of each entry matches previous entry's `hash`.
       - Semantic checks: every `mission-open` has a corresponding `mission-close` or `mission-abort`; no orphan `mission-close` or `mission-abort`; every `release-published` references a known release whose `missionId` belongs to the same system.
    5. **Directory/manifest alignment** (cross-cutting):
       - `systems/<id>/` directory name equals registry `id` (case-insensitive duplicate check).
       - `missions/<mission-id>/` directory name equals `mission.yaml` `missionId`.
       - `releases/<release-id>/` directory name equals `release.yaml` `releaseId`.
       - Report case-insensitive duplicates even when the current filesystem permits them.
  - **Corruption tolerance:** each artifact is wrapped in try/catch. Missing file → `missing-artifact` violation. Parse error → `parse-error` violation. Empty/truncated file → `partial-write` violation. The scan continues with remaining artifacts after reporting.
  - **`--system <id>` filter:** if provided, only validate artifacts for that Sternsystem (registry entry, its missions, its releases, its Bordbuch). Cross-system checks (duplicate cosmicStar) still run against the full registry.
  - **No `--fix` mode.** `--migrate-plan <path>` emits a JSON file listing violations with suggested fixes; does not modify any artifacts.
  - **Return:** standard `{ command, status, data, summary }` envelope. `data` contains `validatedSystems`, `validatedMissions`, `validatedReleases`, `validatedBordbuchEntries`, `parseErrors`, `violations` arrays.
- Add Compass `MODULE_CONTRACT` and `CHANGE_SUMMARY` blocks to the new file.

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks build:check` passes.
- Manual smoke test: `pnpm exec site-kernel run naming.policy.validate --json` returns `{ status: "pass", validatedSystems: 0, violations: [] }` (empty state).

**Completion criterion:** `runNamingPolicyValidate` handles all five scan categories, three corruption classes, `--system` filter, and `--json` output; type-checks; empty-state returns pass with zero violations.

**Human review:** no

---

### Step 3. Command registration

**Goal:** Wire `naming.policy.validate` into the command table so it is discoverable via `pnpm exec site-kernel run`.

**Agent actions:**

- In `packages/os/site-kernel-checks/src/command-tables/07-structure-naming.ts`:
  - Import `runNamingPolicyValidate` from `../structure/naming-policy.ts` (or via the validators re-export shim if one exists).
  - Add entry to `STRUCTURE_NAMING_COMMANDS` array:
    ```ts
    {
      name: "naming.policy.validate",
      description:
        "Validate naming policies for Sternsystem ids, mission ids, release ids, and Bordbuch entries across all Werkstatt artifacts (RFC-0361).",
      scope: "workspace",
      supportsAllApps: true,
      execute: runNamingPolicyValidate,
    },
    ```
- Verify the command appears in `pnpm exec site-kernel run --list` output.

**Validation:**

- `pnpm exec site-kernel run naming.policy.validate --json` works from the workspace root.
- `pnpm --filter @gogol/site-kernel-checks build:check` passes.

**Completion criterion:** `naming.policy.validate` is registered, discoverable, and executable from the workspace root.

**Human review:** no

---

### Step 4. Unit tests

**Goal:** Provide red/green fixture coverage for all validation rules and corruption classes.

**Agent actions:**

- Create `packages/os/site-kernel-checks/src/tests/naming-policy.test.ts` with test cases:
  - **Empty state:** no `systems/registry.yaml` → pass, zero violations.
  - **Sternsystem id valid:** `webgogol-com` passes `STERNSYSTEM_ID_REGEX`.
  - **Sternsystem id invalid — non-ASCII:** `nicaragüa-projekt` → `sternsystem-id-kebab-case-latin-only` violation, non-ASCII diagnostic reported.
  - **Sternsystem id invalid — uppercase:** `Webgogol-Com` → violation.
  - **Sternsystem id invalid — consecutive hyphens:** `webgogol--com` → violation.
  - **Mission id valid:** `webgogol-com-m000001` passes.
  - **Mission id invalid — wrong sequence width:** `webgogol-com-m1` → violation.
  - **Mission id invalid — uppercase:** `webgogol-com-M000001` → violation.
  - **Release id valid:** `webgogol-com-r000001` passes.
  - **Release id invalid — wrong prefix:** `webgogol-com-x000001` → violation.
  - **Bordbuch event id valid:** `event-000001` passes.
  - **Bordbuch event id gap:** `event-000001` then `event-000003` → gap violation.
  - **Bordbuch hash-chain break:** `previousHash` mismatch → violation.
  - **Bordbuch orphan mission-close:** `mission-close` without preceding `mission-open` → violation.
  - **cosmicStar not in StarCatalog:** `FooStar` → violation.
  - **cosmicStar duplicate:** two active systems with same star → violation.
  - **cosmicStar reactivation conflict:** archived system reactivated when star is in use → violation.
  - **Directory/manifest mismatch:** directory `Webgogol-Com` vs manifest `webgogol-com` → violation.
  - **Parse error:** corrupt YAML → `parse-error` violation, scan continues.
  - **Missing file:** registry references system with no directory → `missing-artifact` violation.
  - **`--system` filter:** only validates artifacts for the specified system.
  - **`--json` output:** stable shape with all required fields.
- Use the existing fixture pattern from `tests/site-bordbuch.test.ts` (mkdtemp + mkdir + writeFile).

**Validation:**

- `pnpm --filter @gogol/site-kernel-checks test -- naming-policy` passes.
- All test cases pass.

**Completion criterion:** All test cases pass; coverage includes all §1 naming rules, §2 scan categories, corruption classes, and `--system` filter.

**Human review:** no

---

### Step 5. Documentation and Compass sync

**Goal:** Update AGENTS.md and Compass XML files to reflect the naming policy contract.

**Agent actions:**

- **Root `AGENTS.md`** — add a "Werkstatt naming policy (RFC-0361)" section:
  - Centralized regexes in `@gogol/ontology/src/schemas/naming-policy.ts` are the single source of truth for id format validation.
  - `naming.policy.validate` is the consolidated validator for all Werkstatt artifacts.
  - Latin-only enforcement: reject non-ASCII before regex; NFC normalize for diagnostics only.
  - No `--fix` mode; `--migrate-plan` emits a plan only.
  - Relationship to `naming.convention.lint` (filenames, DNA-6) and `site.bordbuch.validate` (site-level append-only invariant, RFC-0276) — complements, does not replace.
  - Cross-RFC dependency: RFC-0354/0355/0357 schema implementations MUST import from `naming-policy.ts`.
- **Compass XML files** — synchronize `docs/requirements.xml`, `docs/technology.xml`, `docs/development-plan.xml`, `docs/knowledge-graph.xml` to reflect the naming policy contract and `naming.policy.validate` command.

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0361` passes.
- `pnpm -s run build:check` passes (no regression from doc changes).

**Completion criterion:** AGENTS.md has the naming policy section; Compass XML files are synchronized; `rfc.validate` and `build:check` pass.

**Human review:** no

---

### Step 6. Full validation and evidence

**Goal:** Run the complete validation suite to confirm no regression and emit verification evidence.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0361 --json` — confirm pass.
- Run `pnpm --filter @gogol/ontology build:check` — confirm pass.
- Run `pnpm --filter @gogol/site-kernel-checks build:check` — confirm pass.
- Run `pnpm --filter @gogol/site-kernel-checks test` — confirm all tests pass.
- Run `pnpm -s run build:check` — confirm workspace-level pass.
- Run `pnpm exec site-kernel run naming.policy.validate --json` — confirm empty-state pass.
- (If RFC-0330 is implemented) Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0361` and commit the evidence file.

**Validation:**

- All commands above return exit code 0.

**Completion criterion:** All validation commands pass; evidence file committed (if RFC-0330 is implemented).

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0361`
- `pnpm --filter @gogol/ontology build:check`
- `pnpm --filter @gogol/site-kernel-checks build:check`
- `pnpm --filter @gogol/site-kernel-checks test`
- `pnpm -s run build:check`
- `pnpm exec site-kernel run naming.policy.validate --json`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0361` (RFC-0330, for probe-bearing RFCs created on or after 2026-07-07 — if implemented)

### 4.2 Deferred acceptance criteria

The RFC acceptance criterion "Existing Zod schemas updated to import centralized regexes" cannot be checked in this plan because the target schemas (`sternsystem.ts`, `mission.ts`, `release.ts`) do not exist yet — they are defined by RFC-0354 (accepted, not implemented), RFC-0355 (draft), and RFC-0357 (draft). When those RFCs are implemented, their plans must reference `naming-policy.ts` as the single source of truth for id format regexes. This plan creates the contract; the schema imports are deferred to those implementation plans.

### 4.3 Evidence artifacts

- `docs/rfcs/verification/rfc-0361.generated.json` — verification evidence (RFC-0330, if implemented)
- Commit messages referencing `RFC-0361` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Pre-existing violations in registry/missions/releases | Step 2: empty-state graceful pass — no artifacts exist yet, so zero violations. Step 4: test case confirms empty state. |
| Centralized regexes diverge from inline schema patterns | Step 1: regexes are the single source of truth. RFC-0354/0355/0357 implementation plans will reference `naming-policy.ts`. AGENTS.md (Step 5) documents the cross-RFC contract. |
| Non-ASCII characters pass the regex in some engines | Step 1: `rejectNonAscii` helper checks `/[^\x00-\x7F]/` before regex. Step 2: validator calls `rejectNonAscii` first. Step 4: test case for `nicaragüa-projekt`. |
| Sequence overflow (`m999999`, `r999999`) | Step 2: regex `\d{6}` enforces exactly six digits. Overflow is a hard stop requiring a new RFC — documented in RFC §1.2/§1.3. |
| Concurrent writes during validation | Step 2: validator reads files directly (no retry until RFC-0362 lands). Plan notes this as transitional tech debt. When RFC-0362 is implemented, upgrade to snapshot/retry. |
| `naming.policy.validate` is slow on large fleets | Not a risk for this plan — no artifacts exist yet. Performance is advisory only per RFC. |
| Corrupt artifact aborts entire scan | Step 2: each artifact wrapped in try/catch with three corruption classes. Step 4: test cases for parse error and missing file. |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-6 (kebab-case filenames) or DNA-23 (cosmic naming), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0361 --reason "..." --invariant "DNA-N"` instead of working around it (RFC-0334).
- If the existing `bordbuchEventSchema` in `@gogol/surface` (which uses `mission-\d{6}` id format) conflicts with RFC-0361's `event-\d{6}` format, note that they are different ledgers: `@gogol/surface` is the site-level Bordbuch (RFC-0276), RFC-0361 validates the Werkstatt-level Bordbuch (RFC-0355). No conflict — do not merge them.
- If RFC-0354/0355/0357 schema implementations cannot import from `naming-policy.ts` due to a circular dependency, run `rfc.supersede.propose` with `--reason "circular dependency between ontology and site-kernel-checks"` instead of duplicating regexes inline.
