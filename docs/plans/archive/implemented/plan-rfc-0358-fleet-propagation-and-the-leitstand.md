---
rfcId: RFC-0358
planId: PLAN-RFC-0358-01
status: draft
owner: architecture
createdAt: 2026-07-09
updatedAt:
scope:
  apps: []
  packages:
    - "@gogol/ontology"
    - "@gogol/site-kernel-handoff"
    - "@gogol/site-kernel-deploy"
    - "@gogol/site-kernel-leitstand"
    - "@gogol/site-kernel"
  services: []
  docs:
    - docs/architecture-dna.md
    - docs/compass-inventory.xml
    - docs/knowledge-graph.xml
    - docs/technology.xml
    - docs/development-plan.xml
    - docs/verification-plan.xml
    - packages/AGENTS.md
    - packages/os/AGENTS.md
    - packages/os/site-kernel-handoff/AGENTS.md
    - packages/os/site-kernel-deploy/AGENTS.md
    - AGENTS.md
---

# Implementation Plan: RFC-0358

> **Pilot plan** — RFC-0358 has `status: draft`. Implementation requires explicit architecture acceptance (`draft → accepted`) before any code changes begin (RFC-0224).

> **Sequential dependencies** — This plan assumes RFC-0357 (release discipline), RFC-0362 (consistency primitives), and RFC-0363 (artifact store) are implemented first or in parallel. Their packages and APIs are referenced as prerequisites. No stubs are created for them.

> **RFC-0354 amendment** — RFC-0358 extends the accepted RFC-0354 `FleetRegistryEntrySchema` with a `deployment` block. The plan includes a governance step that adds `RFC-0354` to RFC-0358's `amends` and `RFC-0358` to RFC-0354's `amendedBy` before acceptance.

> **RFC-0284 coexistence** — RFC-0284 is already implemented with `fleet.*` commands for cross-site status/schedule/killsurface. RFC-0358 uses `leitstand.*` commands for Sternsystem deployment propagation and is a separate but complementary surface. No command names overlap; fleet aggregation may consume Leitstand propagation state in a future RFC.

## 1. Objectives

- [ ] Objective 1 — `DeploymentConfig`, `PropagationResult`, `SecretRef`, and adapter-name Zod schemas defined in `@gogol/ontology` (maps to: "`DeploymentConfig`, `PropagationResult` Zod schemas defined in `@gogol/ontology`")
- [ ] Objective 2 — `FleetRegistryEntrySchema` extended with a `deployment` block in `@gogol/ontology` and RFC-0354/0358 frontmatter updated to reflect the amendment (maps to: "`FleetRegistryEntrySchema` extended with `deployment` block")
- [ ] Objective 3 — `DeploymentAdapter` interface and a small adapter registry live in `@gogol/site-kernel-leitstand` (maps to: "Deployment adapter interface defined in `packages/os/site-kernel-handoff/src/leitstand/adapter.ts`", relocated to new package per user decision)
- [ ] Objective 4 — `cloudflare-pages` adapter implemented as the MVP (maps to: "`cloudflare-pages` adapter implemented (MVP)")
- [ ] Objective 5 — Deployment credentials are secret references only; registry validation rejects literal values (maps to: "Deployment credentials are secret references only; registry validation rejects secret values")
- [ ] Objective 6 — `leitstand.propagate`, `leitstand.status`, `leitstand.rollback`, and `leitstand.health` registered and tested (maps to the four command acceptance criteria)
- [ ] Objective 7 — `--json` output stable for all four commands (maps to: "`--json` output stable for all four commands")
- [ ] Objective 8 — Propagation gated on release being `published`, RFC-0362 locks, RFC-0363 artifact retrieval, and health checks with content verification (maps to the gating/artifact/health acceptance criteria)
- [ ] Objective 9 — Rollback rehydrates the previous published release from RFC-0363 and appends Bordbuch entries (maps to rollback acceptance criteria)
- [ ] Objective 10 — Structured observability logs and metrics emitted for every command (maps to: "Structured observability logs and metrics are emitted for every command")
- [ ] Objective 11 — DNA-49 added to `docs/architecture-dna.md` (maps to: "DNA-49 added to `docs/architecture-dna.md`")
- [ ] Objective 12 — `rfc.validate` passes on RFC-0358 (maps to: "`rfc.validate` passes on this file")

## 2. Affected artifacts

### 2.1 Code and commands

**New schema file in `@gogol/ontology`:**

- `packages/ontology/src/schemas/leitstand.ts` — Zod schemas: `DeploymentAdapterNameSchema`, `DeploymentConfigSchema`, `SecretRefSchema`, `PropagationResultSchema`, `HealthResultSchema`, `HealthCheckSchema`
- `packages/ontology/src/schemas/index.ts` — re-export leitstand schemas and types
- `packages/ontology/src/schemas/sternsystem.ts` — extend `FleetRegistryEntrySchema` with `deployment: DeploymentConfigSchema` (RFC-0354 amendment)

**New package `@gogol/site-kernel-leitstand`:**

- `packages/os/site-kernel-leitstand/package.json` — workspace package with dependencies: `@gogol/site-kernel`, `@gogol/ontology`, `@gogol/site-kernel-handoff`, `@gogol/site-kernel-deploy` (types only), `zod`, `yaml`
- `packages/os/site-kernel-leitstand/tsconfig.json` — extends `tsconfig/node-lib.json`
- `packages/os/site-kernel-leitstand/AGENTS.md` — scope and rules for Leitstand commands
- `packages/os/site-kernel-leitstand/src/index.ts` — public exports and `createLeitstandModule()`
- `packages/os/site-kernel-leitstand/src/adapter.ts` — `DeploymentAdapter` interface and input/result types
- `packages/os/site-kernel-leitstand/src/adapter-registry.ts` — adapter registry: `registerAdapter(name, adapter)`, `resolveAdapter(name)`
- `packages/os/site-kernel-leitstand/src/adapters/cloudflare-pages.ts` — MVP adapter using `wrangler pages deploy` with retries and timeout
- `packages/os/site-kernel-leitstand/src/secrets.ts` — secret reference resolver (`env:`, `github-secret:`, `cloudflare-secret:`)
- `packages/os/site-kernel-leitstand/src/propagate.ts` — `leitstand.propagate` handler
- `packages/os/site-kernel-leitstand/src/status.ts` — `leitstand.status` handler
- `packages/os/site-kernel-leitstand/src/rollback.ts` — `leitstand.rollback` handler
- `packages/os/site-kernel-leitstand/src/health.ts` — `leitstand.health` handler and default health check runner
- `packages/os/site-kernel-leitstand/src/health-checks.ts` — default checks: `homepage-200`, `release-marker`, `sitemap-content`, `llms-content`, `health-endpoint`
- `packages/os/site-kernel-leitstand/src/registry-io.ts` — read/write `systems/registry.yaml` deployment block under RFC-0362 locks
- `packages/os/site-kernel-leitstand/src/operation.ts` — operation-record helpers, heartbeat refresh, lease expiry computation
- `packages/os/site-kernel-leitstand/src/tests/` — unit and integration tests
- `packages/os/site-kernel-leitstand/vitest.config.ts` — test config

**Updated files in `@gogol/site-kernel-handoff`:**

- `packages/os/site-kernel-handoff/src/index.ts` — export any shared helpers reused by Leitstand (e.g., release manifest reader, artifact store caller)
- `packages/os/site-kernel-handoff/AGENTS.md` — clarify that release commands remain here; deployment propagation lives in `@gogol/site-kernel-leitstand`

**Updated files in `@gogol/site-kernel`:**

- `tools/kernel.config.ts` — import and register `createLeitstandModule()`
- `packages/os/site-kernel/src/command-manifest.ts` or generated manifest — new commands appear in the workspace command manifest after registration

**No changes in `@gogol/site-kernel-deploy`:**

- The RFC lists `@gogol/site-kernel-deploy` as impacted, but the package currently only owns `client.export`. The new `secrets.ts` and adapter logic live in `@gogol/site-kernel-leitstand` per the user decision. If future adapters need deployment-specific exports, they can consume `@gogol/site-kernel-leitstand`.

**No new site-kernel-checks command table:**

- `leitstand.*` commands are operator-driven deployment commands, not automated checks. They are registered via `createLeitstandModule()` in `tools/kernel.config.ts`, not via `site-kernel-checks` command tables. RFC-0284's `fleet.*` commands remain in `src/command-tables/28-fleet-leitstand.ts`; no overlap or relocation is needed.

**Registry validation:**

- The plan does not rely on a fully implemented `sternsystem.validate` command. The Leitstand preflight (Step 6) validates the deployment block using the Zod schema from Step 3. If `sternsystem.validate` is available, it should also validate the block, but the implementation is not blocked on it.

### 2.2 Configuration and data

- `systems/registry.yaml` — new `deployment` block per system (tracked). The schema extension is validated by `@gogol/ontology`.
- `releases/<system-id>-r<NNNNNN>/` — local release workspace (gitignored); read for preflight and verification
- `.werkstatt/artifacts/releases/` — RFC-0363 durable artifact store; `leitstand.propagate` and `leitstand.rollback` rehydrate `dist/` from here
- `.werkstatt/locks/` — RFC-0362 `deployment:<system-id>` lock files (gitignored)
- `.werkstatt/operations/` — RFC-0362 operation records for propagation/rollback (gitignored)
- Root `.gitignore` — already covers `systems/*`, `releases/`, `missions/`, `.werkstatt/` via RFC-0354/RFC-0362

### 2.3 Documentation and specs

- `docs/rfcs/rfc-0358-fleet-propagation-and-the-leitstand.md` — referenced, not modified by this plan
- `docs/rfcs/rfc-0354-establish-the-sternsystem-bundle-contract-and-fleet-registry.md` — frontmatter updated to add `RFC-0358` to `amendedBy`
- `docs/architecture-dna.md` — add DNA-49 (Fleet propagation) entry
- `docs/technology.xml` — add Leitstand commands and deployment adapter surface to the command/technology inventory
- `docs/development-plan.xml` — add RFC-0358 implementation wave and dependency links to RFC-0357, RFC-0362, RFC-0363
- `docs/verification-plan.xml` — add verification evidence requirements for propagation, rollback, and health checks
- `docs/knowledge-graph.xml` — add the new package and command ownership edges
- `docs/compass-inventory.xml` — add the new package, commands, and RFC-0358 to the rollout inventory
- `packages/AGENTS.md` — add shared rule: deployment commands live in `@gogol/site-kernel-leitstand`; credentials are secret references only
- `packages/os/AGENTS.md` — add OS-level rule: Leitstand commands use RFC-0362 locks and RFC-0363 artifacts; no direct deployment outside adapters
- `packages/os/site-kernel-handoff/AGENTS.md` — clarify handoff vs. Leitstand boundaries
- `packages/os/site-kernel-leitstand/AGENTS.md` — new package-specific rules
- `packages/os/site-kernel-deploy/AGENTS.md` — note that deployment adapters live in `@gogol/site-kernel-leitstand`
- `AGENTS.md` — add Leitstand/RF-0358 to the RFC governance or agent policy section if needed

### 2.4 Validation and pipelines

- `rfc.validate` — must pass on RFC-0358 after frontmatter update
- `pnpm --filter @gogol/site-kernel-leitstand run build:check` — typecheck and tests
- `pnpm --filter @gogol/ontology run build:check` — schema validation
- `pnpm --filter @gogol/site-kernel-handoff run build:check` — no regression
- `pnpm exec site-kernel run leitstand.propagate --release webgogol-com-r000001 --json` — pilot
- `pnpm exec site-kernel run leitstand.health --system webgogol-com --json` — pilot
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0358` — evidence artifact (RFC-0330, for probe-bearing RFCs created on or after 2026-07-07)
- No new pipeline steps required at this stage; propagation is operator-driven, not part of `apps-check` or `apps-check-postbuild`

## 3. Step sequence

### Step 1. Fix RFC-0358 / RFC-0354 governance references

**Goal:** Make the RFC-0354 schema amendment explicit in the RFC frontmatter before acceptance.

**Agent actions:**

- Edit `docs/rfcs/rfc-0358-fleet-propagation-and-the-leitstand.md` frontmatter:
  - Add `RFC-0354` to `amends`
  - Add `RFC-0358` to `related` if not already present
- Edit `docs/rfcs/rfc-0354-establish-the-sternsystem-bundle-contract-and-fleet-registry.md` frontmatter:
  - Add `RFC-0358` to `amendedBy`
- Run `pnpm exec site-kernel run rfc.validate RFC-0354 RFC-0358 --json` and fix any violations
- Commit both RFC files with a governance-reference commit

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0354 RFC-0358 --json` passes

**Completion criterion:** Both RFC files have consistent `amends`/`amendedBy` references and pass `rfc.validate`.

**Human review:** Yes — architecture role must approve the amendment to the accepted RFC-0354.

---

### Step 2. Scaffold the `@gogol/site-kernel-leitstand` package

**Goal:** Create the new workspace package that will own the Leitstand command surface and adapter interface.

**Agent actions:**

- Create `packages/os/site-kernel-leitstand/package.json` with workspace deps and a `build:check` script
- Create `packages/os/site-kernel-leitstand/tsconfig.json`
- Create `packages/os/site-kernel-leitstand/vitest.config.ts`
- Create `packages/os/site-kernel-leitstand/AGENTS.md` with package scope and rules
- Add the package to `pnpm-workspace.yaml` if it is not already covered by the `packages/os/*` glob
- Add a `turbo.json` if the package participates in the root pipeline
- Run `pnpm install` to register the workspace dependency graph

**Validation:**

- `pnpm --filter @gogol/site-kernel-leitstand run build:check` passes (empty package should still typecheck)
- `pnpm exec site-kernel run command.manifest.generate` includes no Leitstand commands yet (they are added in step 6)

**Completion criterion:** The package exists, is installable, and has a green empty build:check.

**Human review:** No.

---

### Step 3. Land Zod schemas in `@gogol/ontology`

**Goal:** Define the type contracts before any command implementation begins.

**Agent actions:**

- Create `packages/ontology/src/schemas/leitstand.ts` with:
  - `DeploymentAdapterNameSchema` (enum: `cloudflare-pages`, `cloudflare-workers`, `netlify`, `vercel`)
  - `SecretRefSchema` (regex `^(env|github-secret|cloudflare-secret):[A-Z0-9_]+$/`)
  - `DeploymentConfigSchema` (adapter, target, healthUrl, credentials, propagation state fields)
  - `PropagationResultSchema` (systemId, releaseId, state, deploymentUrl, timestamps, healthChecks)
  - `HealthResultSchema` and `HealthCheckSchema`
- Extend `packages/ontology/src/schemas/sternsystem.ts`:
  - Add `deployment: DeploymentConfigSchema.optional()` to `FleetRegistryEntrySchema`
- Update `packages/ontology/src/schemas/index.ts` to re-export the new schemas and types
- Add `packages/ontology/src/tests/leitstand-schema.test.ts` with parse/validation fixtures (valid config, invalid secret value, missing adapter)

**Validation:**

- `pnpm --filter @gogol/ontology run build:check` passes
- `pnpm --filter @gogol/ontology test` (if available) passes the new schema fixtures
- `pnpm exec site-kernel run sternsystem.validate` (or a new dedicated registry validator) accepts a registry with a deployment block and rejects literal credentials

**Completion criterion:** `@gogol/ontology` exports the schemas, the registry schema accepts the deployment block, and invalid deployment configs fail parse.

**Human review:** No.

---

### Step 4. Define the `DeploymentAdapter` interface and registry

**Goal:** Provide the abstraction layer that keeps vendor-specific logic out of command handlers.

**Agent actions:**

- Create `packages/os/site-kernel-leitstand/src/adapter.ts` with the `DeploymentAdapter` interface and `PropagateInput`, `RollbackInput`, `HealthInput`, `PropagateResult`, `HealthResult` types (imported from `@gogol/ontology`)
- Create `packages/os/site-kernel-leitstand/src/adapter-registry.ts` with:
  - `registerAdapter(name, adapter)` — used by adapter modules and tests
  - `resolveAdapter(name)` — used by command handlers; throws on unknown adapter
- Create `packages/os/site-kernel-leitstand/src/secrets.ts` with `resolveSecretRef(ref, systemId?)` that resolves `env:`, `github-secret:`, `cloudflare-secret:` references and rejects non-matching strings
- Export the above from `packages/os/site-kernel-leitstand/src/index.ts`
- Add tests in `packages/os/site-kernel-leitstand/src/tests/adapter-registry.test.ts` and `secrets.test.ts`

**Validation:**

- `pnpm --filter @gogol/site-kernel-leitstand run build:check` passes
- Adapter registry tests pass: unknown adapter fails, registered adapter resolves
- Secret resolver tests pass: valid env refs resolve, invalid values throw

**Completion criterion:** The adapter interface, registry, and secret resolver are defined and tested without any vendor-specific code.

**Human review:** No.

---

### Step 5. Implement the `cloudflare-pages` MVP adapter

**Goal:** Provide one working adapter that deploys a `dist/` directory to Cloudflare Pages.

**Agent actions:**

- Create `packages/os/site-kernel-leitstand/src/adapters/cloudflare-pages.ts` implementing `DeploymentAdapter`
  - `propagate` runs `wrangler pages deploy <dist> --project-name <target>` with a configurable timeout and retry/backoff
  - `rollback` is implemented as `propagate` of the rollback target release (the interface requires it, but the Leitstand handler orchestrates the target selection)
  - `health` delegates to the default health check runner plus any Cloudflare-specific checks
- Add `wrangler` to `package.json` as a dev/peer dependency or rely on the monorepo's installed `wrangler`
- Add tests in `packages/os/site-kernel-leitstand/src/tests/adapters/cloudflare-pages.test.ts` using mocked `exec` to verify command construction and retry behavior
- Add a fixture `dist/` tree for adapter tests

**Validation:**

- `pnpm --filter @gogol/site-kernel-leitstand run build:check` passes
- Cloudflare Pages adapter tests pass
- Adapter does not hardcode any system ID or secret value

**Completion criterion:** The adapter can be constructed with a target name and credentials, and a mocked deploy call produces the expected `wrangler pages deploy` invocation.

**Human review:** No.

---

### Step 6. Implement the four Leitstand command handlers

**Goal:** Provide the full command surface: propagate, status, rollback, health.

**Agent actions:**

- Create `packages/os/site-kernel-leitstand/src/health-checks.ts` with default checks and exponential backoff runner
- Create `packages/os/site-kernel-leitstand/src/propagate.ts` implementing the 12-step flow from RFC-0358 §2, including:
  - `release.validate` call (via `@gogol/site-kernel-handoff`)
  - RFC-0362 `deployment:<system-id>` lock acquisition and heartbeat refresh
  - RFC-0363 `artifact.store.get` call when local `dist/` is absent or stale
  - Preflight checks (artifact hashes, size limit, target, credentials)
  - Operation record `started` / `completed` / `failed`
  - Registry update and Bordbuch append on success
  - Failure handling with lease clear and Bordbuch failure event
- Create `packages/os/site-kernel-leitstand/src/status.ts` reading registry and recent Bordbuch entries
- Create `packages/os/site-kernel-leitstand/src/rollback.ts` implementing the 8-step flow from RFC-0358 §4
- Create `packages/os/site-kernel-leitstand/src/health.ts` running health checks against a deployed site
- Create `packages/os/site-kernel-leitstand/src/operation.ts` for operation-record and lease helpers
- Create `packages/os/site-kernel-leitstand/src/registry-io.ts` for registry read/write under locks
- Create `packages/os/site-kernel-leitstand/src/index.ts` `createLeitstandModule()` registering all four commands with `mutatesState: true` on propagate/rollback and `scope: "workspace"`
- Wire `createLeitstandModule()` into `tools/kernel.config.ts`

**Validation:**

- `pnpm exec site-kernel run command.manifest.generate` and `pnpm exec site-kernel run command.manifest.validate` include the four commands with correct metadata
- `pnpm exec site-kernel run leitstand.status --system webgogol-com --json` returns a pass/fail envelope (will fail because no deployment block exists yet; verify the error message is correct)
- `pnpm --filter @gogol/site-kernel-leitstand run build:check` passes
- Unit tests for handlers pass

**Completion criterion:** All four commands are registered, typecheck, and have unit tests covering success, failure, and lock-contention paths.

**Human review:** No.

---

### Step 7. Add observability logging and metrics

**Goal:** Every command emits structured JSON logs and metrics to `stderr` as specified in RFC-0358 §Observability.

**Agent actions:**

- Create `packages/os/site-kernel-leitstand/src/logger.ts` with a small structured logger that writes to `stderr`
- Emit a `command` log line at start/end of each handler with `operationId`, `systemId`, `releaseId`, `command`, `state`, `durationMs`
- Emit metric lines for `leitstand.propagation.duration`, `leitstand.health.pass_rate`, `leitstand.rollback.count`
- Ensure resolved secrets are never logged
- Add tests in `packages/os/site-kernel-leitstand/src/tests/logger.test.ts`

**Validation:**

- Tests assert log lines contain required fields and no secrets
- `pnpm --filter @gogol/site-kernel-leitstand run build:check` passes

**Completion criterion:** All four handlers produce at least one structured log line and the three specified metrics are emitted in the expected shape.

**Human review:** No.

---

### Step 8. Update AGENTS.md and Compass XML documentation

**Goal:** Keep the instruction layer and machine-readable semantic layer synchronized with the new code.

**Agent actions:**

- Update `packages/os/site-kernel-leitstand/AGENTS.md` with command ownership, adapter rules, secret rules, and validation commands
- Update `packages/os/site-kernel-handoff/AGENTS.md` to clarify that deployment propagation is owned by `@gogol/site-kernel-leitstand`
- Update `packages/os/site-kernel-deploy/AGENTS.md` to reference the new Leitstand package
- Update `packages/AGENTS.md` and `packages/os/AGENTS.md` with the credential-reference-only rule and RFC-0362 lock requirement
- Update `docs/architecture-dna.md` to add DNA-49 (Fleet propagation)
- Update `docs/technology.xml`, `docs/development-plan.xml`, and `docs/verification-plan.xml` to include Leitstand commands, adapter surface, and verification evidence
- Update `docs/knowledge-graph.xml` if it tracks command ownership or package boundaries

**Validation:**

- `pnpm exec site-kernel run compass.audit.validate` (or equivalent Compass lint) passes
- `pnpm exec site-kernel run docs.links.validate` (if exists) passes
- Manual review: every new command, schema, and package is referenced in at least one AGENTS.md or XML file

**Completion criterion:** All affected AGENTS.md and XML files reflect the new package, commands, and DNA-49.

**Human review:** Yes — documentation changes, especially `docs/architecture-dna.md` DNA additions, require architecture approval.

---

### Step 9. Add tests and fixtures

**Goal:** Cover the command surface, adapter, and failure modes with unit and integration tests.

**Agent actions:**

- Create `packages/os/site-kernel-leitstand/src/tests/fixtures/`:
  - `release-manifest.yaml` with RFC-0363 artifact reference
  - `dist/` tree with `.well-known/webgogol-release.json`, `sitemap.xml`, `llms-full.txt`
  - `registry-with-deployment.yaml` and `registry-without-deployment.yaml`
  - `invalid-registry-with-secret.yaml`
- Create unit tests for:
  - `propagate.ts`: release not published, lock held, stale lock, adapter not found, artifact unavailable, health check failure, success path
  - `status.ts`: no deployment block, in-progress state, succeeded state
  - `rollback.ts`: no previous release, previous release artifact missing, success path
  - `health.ts`: all checks pass, release-marker mismatch, sitemap hash mismatch, retry exhaustion
  - `cloudflare-pages.ts`: command construction, timeout, retry
  - `secrets.ts`: valid and invalid refs
  - `registry-io.ts`: lock ordering, atomic write, schema validation
- Run the full test suite

**Validation:**

- `pnpm --filter @gogol/site-kernel-leitstand test` passes with high coverage of the new handlers
- `pnpm --filter @gogol/site-kernel-leitstand run build:check` passes

**Completion criterion:** The test suite has passing tests for every failure mode listed in RFC-0358 §Failure modes and every success signal.

**Human review:** No.

---

### Step 10. Seed `systems/registry.yaml` with the pilot deployment block

**Goal:** Provide the data needed for the pilot propagation of `webgogol-com-r000001`.

**Agent actions:**

- Ensure `systems/registry.yaml` exists and is tracked (from RFC-0354 implementation)
- Add a `deployment` block to the `webgogol-com` entry:
  - `adapter: cloudflare-pages`
  - `target: webgogol-com`
  - `healthUrl: https://webgogol.com/health`
  - `credentials: { accountIdRef: env:CF_ACCOUNT_ID, apiTokenRef: env:CF_API_TOKEN }`
  - `lastPropagatedRelease: null` initially
- Validate the registry with `pnpm exec site-kernel run sternsystem.validate --id webgogol-com --json` (or the new Leitstand registry validator)
- Commit the registry change separately

**Validation:**

- `pnpm exec site-kernel run sternsystem.validate --id webgogol-com --json` passes (or equivalent registry validator)
- The registry file parses and the deployment block is schema-valid

**Completion criterion:** `systems/registry.yaml` has a valid deployment block for `webgogol-com` with secret references only.

**Human review:** Yes — registry data is curated and requires operator/architecture approval because it points to a production deployment target.

---

### Step 11. Pilot: propagate `webgogol-com-r000001` and verify health

**Goal:** Prove the end-to-end propagation flow against a real deployment target.

**Agent actions:**

- Ensure the pilot release `webgogol-com-r000001` is prepared/published via RFC-0357 (prerequisite)
- Set environment variables `CF_ACCOUNT_ID` and `CF_API_TOKEN` in the operator environment or CI
- Run `pnpm exec site-kernel run leitstand.propagate --release webgogol-com-r000001 --json`
- Run `pnpm exec site-kernel run leitstand.health --system webgogol-com --json`
- Verify the deployment URL serves the release marker and the registry is updated with `lastPropagatedRelease`
- If health checks fail, use `leitstand.rollback --system webgogol-com` to revert and capture the failure log
- Append the pilot result to the Bordbuch as a `deployment` event

**Validation:**

- `leitstand.propagate` returns `state: succeeded` and `2/2` (or more) health checks passed
- `leitstand.status` shows the deployed release and healthy state
- The live site returns the expected `release-marker` content

**Completion criterion:** Pilot release is live, healthy, and registry propagation state is `succeeded`.

**Human review:** Yes — production deployment to `webgogol.com` requires explicit operator/architecture approval and coordination.

---

### Step 12. Run validation suite and emit verification evidence

**Goal:** Meet all RFC-0224 transition preconditions and RFC-0330 evidence requirements.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate --id RFC-0358 --json`
- Run `pnpm --filter @gogol/site-kernel-leitstand run build:check`
- Run `pnpm --filter @gogol/ontology run build:check`
- Run `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0358` (if acceptance probes are declared)
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0358` to produce `docs/rfcs/verification/rfc-0358.generated.json`
- Review the evidence file and commit it
- Run a full workspace `pnpm run build:check` to verify no regression

**Validation:**

- All validation commands return `pass`
- The verification evidence file is present and committed
- `git status` is clean except for the evidence file and any final doc updates

**Completion criterion:** All required checks pass and the RFC-0330 evidence artifact is committed.

**Human review:** No — the validation commands are automated; however, the architecture role must approve the `accepted → implemented` transition.

---

### Step 13. Transition RFC-0358 to implemented and finalize

**Goal:** Close the implementation phase per RFC-0224.

**Agent actions:**

- Edit `docs/rfcs/rfc-0358-fleet-propagation-and-the-leitstand.md` frontmatter:
  - Set `status: implemented`
  - Set `implementedAt: YYYY-MM-DD`
- Commit with a message referencing `RFC-0358` in the subject line (RFC-0265)
- Optionally create a follow-up issue or task for any deferred items (e.g., additional deployment adapters)

**Validation:**

- `pnpm exec site-kernel run rfc.validate --id RFC-0358 --json` passes after status change

**Completion criterion:** RFC-0358 is marked `implemented` with a valid date and passes `rfc.validate`.

**Human review:** Yes — only the architecture role can approve the `accepted → implemented` transition. Do not change status until approval is granted.

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate --id RFC-0358`
- `pnpm exec site-kernel run rfc.validate --id RFC-0354` (after frontmatter amendment)
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/site-kernel-leitstand run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check` (regression check)
- `pnpm --filter @gogol/site-kernel run build:check` (regression check)
- `pnpm --filter @gogol/site-kernel-leitstand test`
- `pnpm exec site-kernel run command.manifest.validate` (if available) or `pnpm exec site-kernel run command.manifest.generate` to verify command metadata
- `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0358` (if acceptance probes declared)
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0358` (RFC-0330 evidence artifact)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0358.generated.json` — RFC-0330 verification evidence
- Commit messages referencing `RFC-0358` in the subject line (RFC-0265 commit hygiene)
- Pilot Bordbuch `deployment` event recording the `webgogol-com-r000001` propagation

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| Cloudflare Pages API rate limits or outages | Step 5 implements adapter retry/backoff; Step 11 runs pilot to validate real-world behavior. |
| Health check false positives (transient 5xx) | Step 6 implements exponential backoff (5/10/20s) in `health-checks.ts`; Step 9 tests retry exhaustion. |
| Health checks pass on stale or cached content | Step 6 implements content-verification checks (`release-marker`, `sitemap-content`, `llms-content`) bound to the release behavior snapshot. |
| Rollback target release artifact deleted from local `releases/` | Step 6 restores from RFC-0363 artifact store in `rollback.ts`; Step 3 tests artifact rehydration. |
| Adapter interface too narrow for future vendors | Step 4 keeps the interface minimal; vendor config lives in the registry `deployment` block, not the interface. |
| Concurrent propagations for the same system | Step 6 uses RFC-0362 `deployment:<system-id>` locks and leases; Step 9 tests lock contention. |
| Orphaned `in-progress` state after a crash | Step 6 uses RFC-0362 heartbeat/timeout; Step 9 tests stale-lock recovery. |
| Registry deployment block drift or corruption | Step 3 validates the deployment block via Zod before any mutation; Step 10 validates the pilot registry. |
| Dependency RFCs (0357, 0362, 0363) are not implemented | Step 1 notes the pilot plan; the implementation is blocked until those RFCs land. |

## 6. Escalation triggers

- If implementation reveals that `FleetRegistryEntrySchema` cannot be extended without breaking RFC-0354 accepted invariants, run: `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0358 --reason "FleetRegistryEntrySchema extension conflicts with DNA-45" --invariant "DNA-45"`
- If the `cloudflare-pages` adapter requires behavior that cannot be expressed through the `DeploymentAdapter` interface without vendor-specific leakage into command handlers, run: `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0358 --reason "Adapter interface too narrow for safe propagation" --invariant "DNA-49"`
- If secret reference resolution reveals a need to store secrets in the registry, run: `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0358 --reason "Secret references cannot cover production credential models" --invariant "DNA-49"`
- If RFC-0284 (fleet Leitstand) and RFC-0358 (deployment Leitstand) must merge or rename to avoid operator confusion, run: `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0358 --reason "Leitstand namespace collision with RFC-0284" --invariant "DNA-45"`
