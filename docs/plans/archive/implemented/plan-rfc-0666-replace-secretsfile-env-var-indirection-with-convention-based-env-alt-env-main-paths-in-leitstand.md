---
rfcId: RFC-0666
planId: PLAN-RFC-0666-01
status: draft
owner: architecture
createdAt: 2026-08-03
updatedAt:
scope:
  apps: []
  packages:
    - "@warpgogol/ontology"
    - "@warpgogol/site-kernel-handoff"
  services: []
  docs:
    - "packages/os/site-kernel-handoff/AGENTS.md"
    - "systems/registry.yaml"
---

# Implementation Plan: RFC-0666

## 1. Objectives

- [ ] Remove `secretRefSchema` and `SecretRef` from `@warpgogol/ontology/operations` — maps to acceptance criterion "secretRefSchema and SecretRef removed"
- [ ] Change `secretsFile` field in `deploymentChannelSchema` from `secretRefSchema.optional()` to `z.string().optional()` (kept for detection) — maps to "secretsFile field changed to z.string().optional()"
- [ ] Remove `resolveSecretsFilePath` and add `resolveConventionSecretsPath` in `leitstand-commands.ts` — maps to "resolveSecretsFilePath removed" and "resolveConventionSecretsPath added"
- [ ] Wire convention-based secret resolution into `leitstand.dev-deploy`, `leitstand.propagate`, `leitstand.promote`, `leitstand.rollback` — maps to all four "resolves .env.alt/.env.main" criteria
- [ ] Add `.env.alt`/`.env.main` copy step to `release.prepare` — maps to "release.prepare copies .env.alt and .env.main"
- [ ] Add `secretsFile-removed` post-parse validation rule to `sternsystem.validate` — maps to "sternsystem.validate rejects registries with secretsFile fields"
- [ ] Clean `systems/registry.yaml` — remove all `secretsFile` lines — maps to "systems/registry.yaml cleaned"
- [ ] Update `packages/os/site-kernel-handoff/AGENTS.md` — maps to "AGENTS.md updated with convention-based secret resolution rules"

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/operations/leitstand.ts` — remove `secretRefSchema`, `SecretRef`; change `secretsFile` field to `z.string().optional()`
- `packages/ontology/src/operations/index.ts` — remove `secretRefSchema` and `SecretRef` exports
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — remove `resolveSecretsFilePath`; add `resolveConventionSecretsPath`; update 4 command handlers (`dev-deploy`, `propagate`, `promote`, `rollback`); update preflight `secretsFile` check to info-level `.env.alt`/`.env.main` existence check
- `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts` — no changes (adapter already handles `secretsFilePath: string | undefined`)
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts` — add post-parse validation rule `secretsFile-removed`
- `packages/os/site-kernel-handoff/src/release/release-commands.ts` — add `.env.alt`/`.env.main` copy step in `release.prepare`

### 2.2 Configuration and data

- `systems/registry.yaml` — remove `secretsFile: env:WERKSTATT_SECRETS_DEV/ALT/MAIN` lines from all three channel configs (dev, alt, main)

### 2.3 Documentation and specs

- `packages/os/site-kernel-handoff/AGENTS.md` — update Leitstand section: remove "optional secretsFile" from channel model description; add convention-based secret resolution rules

### 2.4 Validation and pipelines

- `pnpm --filter @warpgogol/ontology run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test` — existing leitstand tests with updated fixtures
- `pnpm exec site-kernel run rfc.validate --id RFC-0666`
- `pnpm exec site-kernel run sternsystem.validate --id warpgogol-com`

## 3. Step sequence

### Step 1. Ontology schema changes

**Goal:** Remove dead code from `@warpgogol/ontology/operations` and change `secretsFile` field type.

**Agent actions:**

- In `packages/ontology/src/operations/leitstand.ts`:
  - Remove `export const secretRefSchema = z.string().regex(...)`
  - Remove `export type SecretRef = z.infer<typeof secretRefSchema>`
  - Change `secretsFile: secretRefSchema.optional()` to `secretsFile: z.string().optional()` in `deploymentChannelSchema`
- In `packages/ontology/src/operations/index.ts`:
  - Remove `secretRefSchema` from the export list
  - Remove `SecretRef` from the type export list

**Validation:**

- `pnpm --filter @warpgogol/ontology run build:check`

**Completion criterion:** `secretRefSchema` and `SecretRef` no longer exported from `@warpgogol/ontology/operations`; `secretsFile` field is `z.string().optional()`; build passes.

**Human review:** no

---

### Step 2. Add `resolveConventionSecretsPath` and remove `resolveSecretsFilePath`

**Goal:** Replace the env-var indirection function with convention-based path resolution.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`:
  - Remove `async function resolveSecretsFilePath(secretsFileRef: string | undefined): Promise<string | undefined>`
  - Add `function resolveConventionSecretsPath(basePath: string, channel: "dev" | "alt" | "main"): string | undefined`:
    ```ts
    function resolveConventionSecretsPath(
      basePath: string,
      channel: "dev" | "alt" | "main",
    ): string | undefined {
      const envFile = channel === "main" ? ".env.main" : ".env.alt";
      const filePath = path.join(basePath, envFile);
      return existsSync(filePath) ? filePath : undefined;
    }
    ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `resolveSecretsFilePath` removed; `resolveConventionSecretsPath` added; build passes.

**Human review:** no

---

### Step 3. Wire convention-based resolution into leitstand commands

**Goal:** Replace `resolveSecretsFilePath(channelConfig.secretsFile)` calls with `resolveConventionSecretsPath` in all four command handlers.

**Agent actions:**

- In `leitstand.dev-deploy` handler (~line 508):
  - Replace `const secretsFilePath = await resolveSecretsFilePath(channelConfig.secretsFile)` with `const secretsFilePath = resolveConventionSecretsPath(workpiecePath, channel)`
- In `leitstand.propagate` handler (~line 1311):
  - Replace `const secretsFilePath = await resolveSecretsFilePath(channelConfig.secretsFile)` with `const secretsFilePath = resolveConventionSecretsPath(path.join(workspaceRoot, "releases", releaseId), channel)`
- In `leitstand.promote` handler (~line 1577):
  - Replace `const secretsFilePath = await resolveSecretsFilePath(mainConfig.secretsFile)` with `const secretsFilePath = resolveConventionSecretsPath(path.join(workspaceRoot, "releases", releaseId), "main")`
- In `leitstand.rollback` handler (~line 1905):
  - Replace `const secretsFilePath = await resolveSecretsFilePath(channelConfig.secretsFile)` with `const secretsFilePath = resolveConventionSecretsPath(path.join(workspaceRoot, "releases", targetRelease), channel)`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** All four command handlers use `resolveConventionSecretsPath`; no references to `resolveSecretsFilePath` remain; build passes.

**Human review:** no

---

### Step 4. Update preflight checks

**Goal:** Replace `secretsFile` reference-syntax check with info-level `.env.alt`/`.env.main` existence check.

**Agent actions:**

- In `runPreflight` function (~line 294-306):
  - Remove the `credential-ref-syntax` check block that validates `channelConfig.secretsFile` against the `env|github-secret|cloudflare-secret` regex
  - Add an info-level check for convention file existence:
    ```ts
    const envFile = channel === "main" ? ".env.main" : ".env.alt";
    const basePath = /* resolved per command context */;
    const envPath = path.join(basePath, envFile);
    checks.push({
      name: "convention-env-exists",
      passed: true, // info-level — always "passed", detail shows existence
      detail: existsSync(envPath)
        ? `${envFile} found at ${envPath}`
        : `${envFile} not found — using process.env fallback`,
    });
    ```
  - The `basePath` for preflight needs to be passed as a parameter or resolved from the calling context (workpiece path for dev-deploy, release path for propagate/promote/rollback)

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** Preflight no longer checks `secretsFile` syntax; info-level `.env.alt`/`.env.main` existence check added; build passes.

**Human review:** no

---

### Step 5. Add `secretsFile-removed` validation rule to `sternsystem.validate`

**Goal:** Reject registries that still contain `secretsFile` fields.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-validate.ts`:
  - After registry parsing (inside the `for (const entry of systems)` loop, after existing checks):
    ```ts
    // RFC-0666: secretsFile field is removed — reject if still present
    if (entry.deployment?.channels) {
      for (const [ch, chConfig] of Object.entries(entry.deployment.channels)) {
        if (chConfig?.secretsFile) {
          violations.push({
            systemId: entry.id,
            rule: "secretsFile-removed",
            message: `channel '${ch}' still contains 'secretsFile' field — remove it. See RFC-0666.`,
          });
        }
      }
    }
    ```

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `sternsystem.validate` rejects registries with `secretsFile` set; build passes.

**Human review:** no

---

### Step 6. Add `.env.alt`/`.env.main` copy step to `release.prepare`

**Goal:** Copy env files from workpiece to release directory so propagate/promote have stable convention paths.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/release/release-commands.ts`:
  - In `runReleasePrepare`, after the `dist` copy step (after `copyDir(workpieceDist, distDest)` or the distribution reuse path), add:
    ```ts
    // RFC-0666: Copy .env.alt and .env.main from workpiece to release directory
    for (const envFile of [".env.alt", ".env.main"]) {
      const srcEnv = path.join(workpieceDir, envFile);
      const destEnv = path.join(stagingDir, envFile);
      if (existsSync(srcEnv)) {
        await fs.copyFile(srcEnv, destEnv);
        logger.info(`  Copied ${envFile} to release`);
      } else {
        logger.warn(`  ${envFile} not found in workpiece — propagate/promote will use process.env fallback`);
      }
    }
    ```
  - The copy goes into `stagingDir` (before `atomicMoveDir`), so the files are carried to the final release directory atomically

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`

**Completion criterion:** `release.prepare` copies `.env.alt`/`.env.main` from workpiece to release directory; missing files produce a warning, not an error; build passes.

**Human review:** no

---

### Step 7. Clean `systems/registry.yaml`

**Goal:** Remove all `secretsFile` lines from the registry.

**Agent actions:**

- In `systems/registry.yaml`:
  - Remove `secretsFile: env:WERKSTATT_SECRETS_DEV` from `dev` channel
  - Remove `secretsFile: env:WERKSTATT_SECRETS_ALT` from `alt` channel
  - Remove `secretsFile: env:WERKSTATT_SECRETS_MAIN` from `main` channel

**Validation:**

- `pnpm exec site-kernel run sternsystem.validate --id warpgogol-com`

**Completion criterion:** No `secretsFile` fields in `systems/registry.yaml`; `sternsystem.validate` passes with 0 violations.

**Human review:** no

---

### Step 8. Update `packages/os/site-kernel-handoff/AGENTS.md`

**Goal:** Document the convention-based secret resolution rules.

**Agent actions:**

- In `packages/os/site-kernel-handoff/AGENTS.md`, Leitstand section:
  - Change line 37 from "Each channel has `workerName`, `url`, and optional `secretsFile` (a secret reference, never a raw value)." to "Each channel has `workerName` and `url`."
  - Add a new bullet: "RFC-0666: Secret resolution uses convention-based `.env.alt`/`.env.main` paths, not `secretsFile` env-var indirection. `leitstand.dev-deploy` reads `<workpiece>/.env.alt`; `leitstand.propagate` reads `<release>/.env.alt`; `leitstand.promote` reads `<release>/.env.main`; `leitstand.rollback` reads `<release>/.env.<channel>`. `release.prepare` copies `.env.alt`/`.env.main` from the workpiece to the release directory. If the convention file does not exist, the adapter falls back to `filterEnv(process.env)`. `sternsystem.validate` rejects registries with `secretsFile` fields."
  - Update preflight description (line 43): remove "secret reference syntax is valid" and add "convention `.env.alt`/`.env.main` file existence (info-level)"

**Validation:**

- Visual inspection of AGENTS.md

**Completion criterion:** AGENTS.md reflects convention-based secret resolution; no mention of `secretsFile` as a valid field.

**Human review:** no

---

### Step 9. Update and run tests

**Goal:** Update existing leitstand test fixtures and add new tests for convention-based resolution.

**Agent actions:**

- Update existing leitstand test fixtures: remove `secretsFile` from channel configs in test registries (all tests that create `fleetRegistrySchema` fixtures)
- Add unit test for `resolveConventionSecretsPath`: returns path when file exists, returns `undefined` when file does not exist, correct file per channel
- Add unit test for `sternsystem.validate` `secretsFile-removed` rule: registry with `secretsFile` produces violation, registry without produces none
- Add unit test for `release.prepare` env copy: `.env.alt`/`.env.main` copied from workpiece to release directory; missing files produce warning
- Run `pnpm --filter @warpgogol/site-kernel-handoff test`

**Validation:**

- `pnpm --filter @warpgogol/site-kernel-handoff test`

**Completion criterion:** All tests pass; new tests cover `resolveConventionSecretsPath`, `secretsFile-removed` rule, and `release.prepare` env copy.

**Human review:** no

---

### Final Step. Documentation sync, review, fix, and acceptance criteria verification

**Goal:** Synchronize documentation, run code review and fix, verify acceptance criteria, and stamp the RFC as implemented.

**Agent actions:**

- Verify `packages/os/site-kernel-handoff/AGENTS.md` is updated (Step 8)
- Run `pnpm exec site-kernel run rfc.validate --id RFC-0666`
- Run `pnpm --filter @warpgogol/ontology run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- Run `pnpm --filter @warpgogol/site-kernel-handoff test`
- Run `pnpm exec site-kernel run sternsystem.validate --id warpgogol-com`
- **Run code review:** invoke `fo-review` via the `skill` tool on all session code changes
- **Run fix if needed:** if `fo-review` reported findings, invoke `fo-fix`
- **Check off acceptance criteria:** verify each criterion in the RFC against the implemented code
- **Stamp the RFC as implemented:** run `pnpm exec site-kernel run rfc.implement.stamp --id RFC-0666 --implementation-commit <sha>`

**Validation:**

- `git status` — no uncommitted changes
- `pnpm exec site-kernel run rfc.validate --id RFC-0666`
- All acceptance criteria checked off

**Completion criterion:** All documentation updated; code review passed; all acceptance criteria verified; RFC stamped as `implemented`.

**Human review:** no — automated via `rfc.implement.stamp`

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0666`
- `pnpm --filter @warpgogol/ontology run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff run build:check`
- `pnpm --filter @warpgogol/site-kernel-handoff test`
- `pnpm exec site-kernel run sternsystem.validate --id warpgogol-com`

### 4.2 Evidence artifacts

- Commit messages referencing `RFC-0666` in the subject line
- `rfc.implement.stamp` produces the implemented transition

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Operator confusion — `WERKSTATT_SECRETS_*` env vars ignored | Step 5 (`sternsystem.validate` rejects `secretsFile`) + Step 7 (registry cleanup) + Step 8 (AGENTS.md) |
| Release without env files | Step 6 (`release.prepare` copies with warning, not error) — same fallback as today |
| Agent misinterpretation — re-add `secretsFile` or create `.env.dev` | Step 5 (`sternsystem.validate` enforcement) + Step 8 (AGENTS.md explicit rules) |

## 6. Escalation triggers

- If implementation reveals that `secretsFile` was actually used by some external consumer (not found in audit), run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0666 --reason "secretsFile has active consumers" --invariant "DNA-40"` instead of removing it.
- If the `z.string().optional()` detection approach causes Zod parsing issues in `fleetRegistrySchema`, escalate to a schema-level `.refine()` rejection instead.
