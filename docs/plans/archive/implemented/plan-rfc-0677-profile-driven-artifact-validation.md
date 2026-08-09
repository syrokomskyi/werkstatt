---
rfcId: RFC-0677
planId: PLAN-RFC-0677-01
status: draft
owner: architecture
createdAt: 2026-08-04
updatedAt:
scope:
  apps: []
  packages:
    - packages/forge
  services: []
  docs:
    - packages/forge/AGENTS.md
    - docs/command-manifest.generated.yaml
    - docs/COMMANDS.md
---

# Implementation Plan: RFC-0677

## 1. Objectives

- [ ] Objective 1 — Extend `profileArtifactSchema` validate object with `outputFormat` and `violationPattern` fields (acceptance criterion: schema extension)
- [ ] Objective 2 — Extend `forge.validate` handler with `--artifact` filtering, violation parsing, `passed`/`allPassed` fields (acceptance criteria: handler extension, CLI flags, JSON output)
- [ ] Objective 3 — Add `--artifact` flag to `forge.validate` command registration in `core.module.ts` (acceptance criterion: command registration)
- [ ] Objective 4 — Write unit tests for `--artifact` filtering, violation parsing (JSON and plain), empty-state handling (acceptance criteria: unit tests)
- [ ] Objective 5 — Update documentation and regenerate manifests (acceptance criteria: AGENTS.md, command manifest)
- [ ] Objective 6 — Run heavy checks and stamp RFC as implemented (acceptance criterion: rfc.validate passes)

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/forge/src/profiles/profile-schema.ts` — extend `validate` object in `profileArtifactSchema` with `outputFormat` and `violationPattern`
- `packages/forge/os/core/handlers/validate.ts` — extend `ForgeValidateArtifactResult` with `passed` and `violations`, extend `ForgeValidateResult` with `allPassed`, add `--artifact` filtering, add violation parsing logic
- `packages/forge/os/core/core.module.ts` — add `--artifact` flag to `forge.validate` command registration
- `packages/forge/os/core/handlers/lifecycle-handlers.test.ts` — add unit tests for new functionality

### 2.2 Configuration and data

- `packages/forge/profiles/editframe-html.yaml` — optionally add `outputFormat` to `validate` object (if `editframe check` supports JSON)

### 2.3 Documentation and specs

- `packages/forge/AGENTS.md` — update `forge.validate` documentation to reflect `--artifact` flag and violation parsing
- `docs/command-manifest.generated.yaml` — regenerate via `command.manifest.generate`
- `docs/COMMANDS.md` — regenerate via `docs.commands.generate`

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript type check
- `pnpm --filter @warpgogol/forge run test` — unit tests
- `pnpm exec werkstatt run rfc.validate --id RFC-0677` — RFC validation

## 3. Step sequence

### Step 1. Extend profile schema with outputFormat and violationPattern

**Goal:** Add optional `outputFormat` and `violationPattern` fields to the existing `validate` object in `profileArtifactSchema`.

**Agent actions:**

- Edit `packages/forge/src/profiles/profile-schema.ts` — add `outputFormat: z.enum(["plain", "json"]).optional()` and `violationPattern: z.string().optional()` to the `validate` z.object
- Update the `ProfileArtifact` TypeScript interface to include the new fields on the `validate` property

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compiles

**Completion criterion:** `profileArtifactSchema` validate object includes `outputFormat` and `violationPattern` as optional fields; `ProfileArtifact` interface matches; TypeScript compiles.

**Human review:** no

---

### Step 2. Extend forge.validate handler with --artifact filtering and violation parsing

**Goal:** Add `--artifact <id>` filtering, violation parsing (JSON and plain text), `passed`/`allPassed` fields to the existing `runValidate` handler.

**Agent actions:**

- Edit `packages/forge/os/core/handlers/validate.ts`:
  - Extend `ForgeValidateArtifactResult` with `passed: boolean` and `violations: Array<{ file, line?, column?, severity, message }>`
  - Extend `ForgeValidateResult` with `allPassed: boolean`
  - Read `--artifact` flag from `input.flags["artifact"]`
  - Filter `profile.artifacts` by `--artifact` if provided; return exit 1 if not found
  - After executing validate command, parse violations:
    - If `outputFormat === "json"`: parse stdout as JSON, extract violations
    - If `outputFormat === "plain"` and `violationPattern` is set: apply regex with named capture groups to stderr/stdout
    - If neither: violations array is empty (backward compatible)
  - Set `passed = exitCode === 0`
  - Set `allPassed = artifacts.every(a => a.passed)`
  - Handle empty-state: artifacts without `validate` command get `passed: true`, `violations: []`, exit code 0

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compiles
- Existing tests still pass: `pnpm --filter @warpgogol/forge run test -- --run lifecycle-handlers`

**Completion criterion:** `runValidate` handler supports `--artifact` filtering, parses violations based on `outputFormat`/`violationPattern`, and returns `passed`/`allPassed` fields. Existing tests pass.

**Human review:** no

---

### Step 3. Add --artifact flag to command registration

**Goal:** Register the `--artifact` flag on `forge.validate` in `core.module.ts`.

**Agent actions:**

- Edit `packages/forge/os/core/core.module.ts` — add `artifact` flag to `forge.validate` command registration:
  ```ts
  artifact: {
    kind: "string",
    description: "Validate only the specified artifact id.",
  },
  ```

**Validation:**

- `pnpm --filter @warpgogol/forge run build:check` — TypeScript compiles

**Completion criterion:** `forge.validate` command registration includes `--artifact` flag with kind "string".

**Human review:** no

---

### Step 4. Write unit tests

**Goal:** Add unit tests for `--artifact` filtering, violation parsing (JSON and plain text), and empty-state handling.

**Agent actions:**

- Edit `packages/forge/os/core/handlers/lifecycle-handlers.test.ts`:
  - Test: `--artifact composition` filters to a single artifact
  - Test: `--artifact unknown` returns exit 1 with "Artifact unknown not declared"
  - Test: `--json` output includes `violations` array when validate command fails (mock `execAsync` to return non-zero exit with JSON output containing violations)
  - Test: violation parsing with `outputFormat: "json"` extracts structured violations from stdout
  - Test: violation parsing with `violationPattern` regex extracts structured violations from plain text stderr
  - Test: artifacts without `validate` command are skipped with `passed: true` and exit code 0
  - Test: `allPassed` is `false` when any artifact fails

**Validation:**

- `pnpm --filter @warpgogol/forge run test -- --run lifecycle-handlers`

**Completion criterion:** All new tests pass; existing tests still pass.

**Human review:** no

---

### Step 5. Update documentation and regenerate manifests

**Goal:** Update `packages/forge/AGENTS.md` with `forge.validate` documentation reflecting `--artifact` and violation parsing. Regenerate command manifest.

**Agent actions:**

- Edit `packages/forge/AGENTS.md` — update the `forge.validate` entry in the OS modules table and/or domain-aware commands section to document `--artifact` flag and violation parsing in `--json`
- Run `pnpm exec werkstatt run command.manifest.generate` to update `docs/command-manifest.generated.yaml`
- Run `pnpm exec werkstatt run docs.commands.generate` to update `docs/COMMANDS.md`

**Validation:**

- `git diff docs/command-manifest.generated.yaml` shows `--artifact` flag added to `forge.validate`

**Completion criterion:** AGENTS.md updated; command manifest and COMMANDS.md regenerated.

**Human review:** no

---

### Final Step. Heavy checks, review, fix, and stamp

**Goal:** Run heavy checks, code review, fix findings, verify acceptance criteria, and stamp RFC as implemented.

**Agent actions:**

- Run `pnpm --filter @warpgogol/forge run build:check` — TypeScript
- Run `pnpm --filter @warpgogol/forge run test` — all tests
- Run `pnpm exec werkstatt run rfc.validate --id RFC-0677` — RFC validation
- Run `fo-review` on all session code changes
- Run `fo-fix` if review has findings
- Check off acceptance criteria with `(evidence: ...)` annotations
- Run `pnpm exec werkstatt run rfc.implement.stamp --id RFC-0677 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec werkstatt run rfc.validate --id RFC-0677` — 0 violations
- Review report exists in `docs/reviews/code/`

**Completion criterion:** All acceptance criteria checked off with evidence; RFC stamped as `implemented`.

**Human review:** no

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec werkstatt run rfc.validate --id RFC-0677`
- `pnpm --filter @warpgogol/forge run build:check`
- `pnpm --filter @warpgogol/forge run test`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0677` in the subject line
- Review report in `docs/reviews/code/`

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Violation parsing fragility (regex) | Step 2: `outputFormat: "json"` is recommended; `violationPattern` is fallback only |
| Command execution time | Step 2: `--artifact` flag allows validating single artifact |
| False negatives (exit 0 with warnings) | Step 2: violations array populated regardless of exit code |
| Timeout (hanging validate command) | Step 2: existing `execAsync` behavior preserved; `--timeout` is future extension |
| Empty-state (no validate commands) | Step 2: artifacts without validate get `passed: true`, exit 0 |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-54, run `pnpm exec werkstatt run rfc.supersede.propose --id RFC-0677 --reason "..." --invariant "DNA-54"` instead of working around it.
