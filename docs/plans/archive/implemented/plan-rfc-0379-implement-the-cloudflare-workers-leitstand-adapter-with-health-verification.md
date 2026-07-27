---
rfcId: RFC-0379
planId: PLAN-RFC-0379-01
status: draft
owner: architecture
createdAt: 2026-07-12
updatedAt:
scope:
  apps:
    - apps/webgogol-com
  packages:
    - "@gogol/ontology"
    - "@gogol/fingerprint"
    - "@gogol/site-kernel-handoff"
  services: []
  docs:
    - docs/architecture-dna.md
    - packages/AGENTS.md
---

# Implementation Plan: RFC-0379

## 1. Objectives

- [ ] O1 — Ontology schema carries channels, per-channel lastPropagated with operational state, and the updated adapter enum — maps to acceptance criterion [deploymentConfigSchema carries channels.alt?/channels.main and lastPropagated...]
- [ ] O2 — Adapter interfaces (PropagateInput, RollbackInput, HealthInput) updated with channel-derived fields — maps to acceptance criterion [cloudflare-workers adapter implemented...]
- [ ] O3 — cloudflare-workers adapter wraps wrangler deploy with injectable CommandRunner — maps to acceptance criterion [cloudflare-workers adapter implemented with injectable command runner...]
- [ ] O4 — resolveAdapter throws for unimplemented adapters; only cloudflare-workers and null resolve — maps to acceptance criterion [resolveAdapter throws adapter-not-implemented...]
- [ ] O5 — Channel gating: main requires healthy alt of same release; no bypass flag — maps to acceptance criterion [leitstand.propagate --channel main refuses...]
- [ ] O6 — leitstand.status shows both channels by default; optional --channel filter — maps to acceptance criterion [leitstand.status shows both channels...]
- [ ] O7 — Preflight validates artifact hashes, channel presence, credential syntax, wrangler, size limits — maps to acceptance criterion [Preflight validates...]
- [ ] O8 — Health verification with deterministic probe selection and @gogol/fingerprint HTML normalization — maps to acceptance criterion [Health verification selects probe routes...]
- [ ] O9 — Artifact-store rehydration for propagate and rollback — maps to acceptance criterion [Propagate and rollback rehydrate dist...]
- [ ] O10 — Secret redaction tested invariant — maps to acceptance criterion [Secret values never appear...]
- [ ] O11 — DNA-49 descriptive text updated in architecture-dna.md — maps to acceptance criterion [DNA-49 descriptive text updated...]
- [ ] O12 — packages/AGENTS.md rule for lastPropagated writes — maps to acceptance criterion [Bordbuch entries...]
- [ ] O13 — Behavior snapshot enhanced with per-route content hashes — prerequisite for O8

## 2. Affected artifacts

### 2.1 Code and commands

- `packages/ontology/src/operations/leitstand.ts` — schema changes: adapter enum, deploymentChannelSchema, lastPropagatedChannelSchema, deploymentConfigSchema
- `packages/os/site-kernel-handoff/src/leitstand/adapter.ts` — updated PropagateInput/RollbackInput/HealthInput interfaces, new CommandRunner type
- `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts` — new adapter module
- `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts` — channel gating, preflight, rehydration, resolveAdapter change, status/health/rollback channel wiring
- `packages/os/site-kernel-handoff/src/leitstand/index.ts` — command flag registration (--channel on all four commands)
- `packages/fingerprint/src/normalizers/html.ts` — new HTML normalizer
- `packages/fingerprint/src/normalizers/index.ts` — register HTML normalizer in dispatcher
- `packages/fingerprint/src/index.ts` — export normalizeHtml
- `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts` — enhance RouteFact with optional contentHash, compute per-route normalized HTML hash during capture
- Site OS commands (no new commands): `leitstand.propagate`, `leitstand.rollback`, `leitstand.health`, `leitstand.status` — flag changes only

### 2.2 Configuration and data

- `systems/registry.yaml` — no migration needed (currently empty `systems: []`)
- `.werkstatt/secrets/<system-id>/*.env` — local gitignored secrets files (convention, not created by this plan)

### 2.3 Documentation and specs

- `docs/architecture-dna.md` — DNA-49 descriptive text: "MVP: Cloudflare Pages" → "MVP: Cloudflare Workers"
- `packages/AGENTS.md` — rule: agents MUST NOT write `deployment.lastPropagated` outside Leitstand command handlers
- `docs/rfcs/rfc-0379-*.md` — read-only reference
- Compass XML sync: `docs/technology.xml` (if deployment adapter surface is documented), `docs/development-plan.xml` (if Leitstand milestones are tracked)

### 2.4 Validation and pipelines

- No new pipeline commands. All four leitstand commands are workspace-scoped, not pipeline-integrated.
- `pnpm exec site-kernel run rfc.validate RFC-0379 --json`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/fingerprint run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0379` (acceptance probes declared)

## 3. Step sequence

### Step 1. Ontology schema changes

**Goal:** Update the Zod schemas in `@gogol/ontology` to carry the channel model, per-channel lastPropagated with operational state, and the updated adapter enum.

**Agent actions:**

- In `packages/ontology/src/operations/leitstand.ts`:
  - Change `deploymentAdapterNameSchema` from `z.enum(["cloudflare-pages", "cloudflare-workers", "netlify", "vercel"])` to `z.enum(["cloudflare-workers", "netlify", "null"])`
  - Add `deploymentChannelSchema` with `workerName: z.string()`, `url: z.string().url()`, `secretsFile: secretRefSchema.optional()`
  - Add `lastPropagatedChannelSchema` with `releaseId`, `at`, `healthy`, `state` (enum: succeeded/failed/failed-stale/in-progress), `operationId`, `leaseExpiresAt` (nullable datetime)
  - Replace `deploymentConfigSchema` fields: remove `target`, `healthUrl`, `credentials`, `lastPropagatedRelease`, `lastPropagationAt`, `lastPropagationState`, `lastPropagationOperationId`, `propagationLeaseExpiresAt`; add `channels: z.object({ alt: deploymentChannelSchema.optional(), main: deploymentChannelSchema })` and `lastPropagated: z.record(z.enum(["alt", "main"]), lastPropagatedChannelSchema).default({})`
  - Update `DeploymentConfig` type export
- Update `MODULE_CONTRACT` and `CHANGE_SUMMARY` Compass scaffolding

**Validation:**

- `pnpm --filter @gogol/ontology run build:check`

**Completion criterion:** `deploymentAdapterNameSchema` enum is `["cloudflare-workers", "netlify", "null"]`; `deploymentConfigSchema` carries `channels` and `lastPropagated` with per-channel operational state; TypeScript compilation passes.

**Human review:** No

---

### Step 2. Behavior snapshot per-route content hashes

**Goal:** Enhance `behavior.snapshot.capture` to compute and store a normalized HTML content hash for each route, giving health checks a real content baseline.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts`:
  - Add `contentHash?: string` to the `RouteFact` interface
  - In `collectRoutes`, after finding each `index.html`, read its content and compute `normalizeHtml(content)` from `@gogol/fingerprint`
  - Store the hash on the route fact
- The snapshot JSON now carries per-route `contentHash` for HTML routes

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`

**Completion criterion:** `RouteFact` has optional `contentHash`; `behavior.snapshot.capture` populates it for HTML routes; compilation passes.

**Migration note:** Any existing snapshots in test fixtures or `.werkstatt/` that pre-date this change will lack `contentHash`. Re-capture them with `behavior.snapshot.capture` after this step. The registry is currently empty (`systems: []`), so no production snapshots need migration — only test fixtures if they exist.

**Human review:** No

---

### Step 3. HTML normalizer in @gogol/fingerprint

**Goal:** Add an HTML normalizer to `@gogol/fingerprint` so health checks can semantically compare deployed HTML responses.

**Agent actions:**

- Create `packages/fingerprint/src/normalizers/html.ts`:
  - Export `normalizeHtml(content: string): string` — parse HTML, strip dynamic attributes (data-\* except data-testid, nonce, integrity, crossorigin with dynamic values), normalize whitespace, produce `byteHash` of the normalized structure
  - Use a lightweight HTML parser (e.g., `node-html-parser` or a regex-based structural normalizer if no parser is available as a dependency)
  - Add Compass scaffolding (`MODULE_CONTRACT`, `CHANGE_SUMMARY`)
- In `packages/fingerprint/src/normalizers/index.ts`:
  - Import `normalizeHtml` and register it for `.html` and `.htm` extensions in `normalizeFile`
- In `packages/fingerprint/src/index.ts`:
  - Export `normalizeHtml` from the root entry point

**Validation:**

- `pnpm --filter @gogol/fingerprint run build:check`

**Completion criterion:** `normalizeHtml` is exported from `@gogol/fingerprint`; `normalizeFile` dispatches to it for `.html` files; compilation passes.

**Human review:** No

---

### Step 4. Adapter interface and CommandRunner type

**Goal:** Update the `DeploymentAdapter` interfaces to carry channel-derived fields and define the injectable `CommandRunner` type.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/leitstand/adapter.ts`:
  - Add `CommandRunner` type: `type CommandRunner = (cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string, string> }) => Promise<{ exitCode: number; stdout: string; stderr: string }>`
  - Update `PropagateInput`: replace `target: string` and `credentials: Record<string, string>` with `channel: "alt" | "main"`, `workerName: string`, `url: string`, `secretsFilePath: string | undefined`
  - Update `RollbackInput`: replace `target: string` with `channel`, `workerName`, `url`, `secretsFilePath`
  - Update `HealthInput`: add `channel: "alt" | "main"`
  - Update `MODULE_CONTRACT` and `CHANGE_SUMMARY`

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check` (will fail until Step 5 updates command handlers — expected)

**Completion criterion:** Interfaces carry channel fields; `CommandRunner` type is exported from `adapter.ts`.

**Human review:** No

---

### Step 5. cloudflare-workers adapter implementation

**Goal:** Implement the concrete adapter that wraps `wrangler deploy` with an injectable command runner.

**Agent actions:**

- Create `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts`:
  - Export `createCloudflareWorkersAdapter(exec?: CommandRunner): DeploymentAdapter`
  - Default `CommandRunner` uses `node:child_process` `execFile` or `spawn` wrapped in a promise
  - `propagate`: resolve `secretsFile` env ref to a file path, source the dotenv file into process env, run `pnpm exec wrangler deploy --name <workerName> --secrets-file <path>` with `cwd` set to the rehydrated dist context, assert exit code 0 and deployment URL presence in stdout
  - `rollback`: same as propagate but for the target release
  - `health`: fetch probe routes from the behavior snapshot in deterministic priority order (home pages per language, legal pages, sitemap.xml/llms.txt, remaining alphabetical, first N), normalize each response with `normalizeHtml`, compare against snapshot `contentHash` where available, retry with exponential backoff (5 attempts, ~2 min total), return `{ state, checks[] }`
  - `secretsFile` resolution: read the env var named in the `env:` reference, interpret its value as a file path, read and parse the dotenv file, merge vars into `process.env`
  - Never log or echo secret values or resolved file contents
  - Add Compass scaffolding
- Create `packages/os/site-kernel-handoff/src/leitstand/adapters/index.ts` to re-export

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`

**Completion criterion:** `createCloudflareWorkersAdapter` is exported; adapter shells out to wrangler with injectable runner; health checks use `normalizeHtml` and deterministic probe selection.

**Human review:** No

---

### Step 6. Command handler updates — channel gating, preflight, rehydration, resolveAdapter

**Goal:** Wire the four leitstand commands to the channel model, add preflight and rehydration, and replace `resolveAdapter`.

**Agent actions:**

- In `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts`:
  - **resolveAdapter**: return `createCloudflareWorkersAdapter()` for `"cloudflare-workers"`, `nullAdapter` for `"null"`, throw `adapter-not-implemented` for `"netlify"` or any other value
  - **runLeitstandPropagate**: parse `--channel` flag (default `alt`); if `main`, check `deployment.lastPropagated.alt` has same `releaseId` with `healthy: true` (skip if no `alt` channel defined); run preflight (artifact hash via `artifact.store.get`, channel presence, credential ref syntax, wrangler binary resolution, dist size check); rehydrate dist from artifact store if missing/stale; call adapter with channel-derived fields; write `lastPropagated.<channel>` with `state`, `operationId`, `leaseExpiresAt`
  - **runLeitstandStatus**: read both `lastPropagated.alt` and `lastPropagated.main`; accept optional `--channel` to filter; output both channels in a table format
  - **runLeitstandRollback**: parse `--channel` (required); rehydrate dist; call adapter with channel fields; update `lastPropagated.<channel>`
  - **runLeitstandHealth**: parse `--channel` (default `alt`); call adapter health with channel and deployment URL from `channels.<channel>.url`
  - Update `LeitstandPropagateData`, `LeitstandStatusData`, `LeitstandRollbackData`, `LeitstandHealthData` interfaces to carry channel info
  - Remove all `cloudflare-pages` default references (replace with `cloudflare-workers` or `null`)
  - Remove `target`/`credentials` usage; replace with channel-derived `workerName`/`url`/`secretsFilePath`
- In `packages/os/site-kernel-handoff/src/leitstand/index.ts`:
  - Add `--channel` flag to `leitstand.propagate`, `leitstand.health`, `leitstand.status` registrations
  - Add `--channel` as required flag to `leitstand.rollback`
  - Update command descriptions to mention channels

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run build:check`

**Completion criterion:** All four commands carry `--channel`; main-channel gate refuses without healthy alt; preflight runs before deploy; rehydration wired; `resolveAdapter` throws for unimplemented adapters; no `cloudflare-pages` references remain.

**Human review:** No

---

### Step 7. Unit tests

**Goal:** Cover the adapter, channel gating, preflight, health verdict mapping, rehydration, and secret redaction with unit tests.

**Agent actions:**

- Create test files in `packages/os/site-kernel-handoff/src/leitstand/adapters/`:
  - `cloudflare-workers.test.ts` — stub `CommandRunner`, verify wrangler invocation, exit code handling, deployment URL extraction, secretsFile resolution
  - Health check tests — stub `fetch`, verify probe selection order, normalization, retry logic, verdict mapping (healthy/unhealthy/unknown)
- Create or extend `packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.test.ts`:
  - Channel gate test: main refuses without healthy alt
  - Channel gate test: main proceeds with healthy alt of same release
  - Channel gate test: no alt channel → direct to main allowed
  - Preflight failure tests: missing artifact, missing channel, bad credential ref, wrangler not found
  - resolveAdapter test: throws for netlify, returns adapter for cloudflare-workers, returns nullAdapter for null
  - Status test: shows both channels
  - Secret redaction test: verify no secret values in output
- Create `packages/fingerprint/src/normalizers/html.test.ts`:
  - Verify HTML normalization strips dynamic attributes, is whitespace-invariant, produces stable hash

**Validation:**

- `pnpm --filter @gogol/site-kernel-handoff run test` (or `build:check` if no test runner)
- `pnpm --filter @gogol/fingerprint run test` (or `build:check`)

**Completion criterion:** All test files pass; channel gate, preflight, health verdict, rehydration, redaction, and resolveAdapter behaviors are covered.

**Human review:** No

---

### Step 8. Documentation — DNA-49 and AGENTS.md

**Goal:** Update DNA-49 descriptive text and add the AGENTS.md rule for lastPropagated writes.

**Agent actions:**

- In `docs/architecture-dna.md`:
  - Change DNA-49 text from "(MVP: Cloudflare Pages)" to "(MVP: Cloudflare Workers)"
- In `packages/AGENTS.md`:
  - Add a rule in the appropriate section: "Agents MUST NOT write `deployment.lastPropagated` outside the Leitstand command handlers (`runLeitstandPropagate`, `runLeitstandRollback`). The registry `lastPropagated` field is written only under RFC-0362 locks by the Leitstand."
- Compass XML sync:
  - Check `docs/technology.xml` for deployment adapter surface references and update to reflect `cloudflare-workers` as the MVP adapter (remove `cloudflare-pages`/`vercel` if present)
  - Check `docs/development-plan.xml` for Leitstand milestones and update channel model references if present
  - Check `docs/knowledge-graph.xml` for deployment-related entity references and update if needed

**Validation:**

- `pnpm exec site-kernel run rfc.validate RFC-0379 --json`

**Completion criterion:** DNA-49 text says "MVP: Cloudflare Workers"; `packages/AGENTS.md` contains the lastPropagated write rule.

**Human review:** No

---

### Step 9. Final validation and evidence

**Goal:** Run the full validation suite and emit verification evidence.

**Agent actions:**

- Run `pnpm exec site-kernel run rfc.validate RFC-0379 --json` — must pass
- Run `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0379` — must pass (file-exists probe for adapter, run probe for status)
- Run `pnpm --filter @gogol/ontology run build:check`
- Run `pnpm --filter @gogol/fingerprint run build:check`
- Run `pnpm --filter @gogol/site-kernel-handoff run build:check`
- Run `pnpm exec site-kernel run rfc.verification.emit --id RFC-0379` (RFC-0330)
- Commit the verification evidence file

**Validation:**

- All commands above pass

**Completion criterion:** `rfc.validate` passes; acceptance probes pass; `build:check` passes for all three packages; verification evidence file is committed.

**Human review:** No

---

## 4. Validation suite

### 4.1 Required checks

- `pnpm exec site-kernel run rfc.validate RFC-0379 --json`
- `pnpm --filter @gogol/ontology run build:check`
- `pnpm --filter @gogol/fingerprint run build:check`
- `pnpm --filter @gogol/site-kernel-handoff run build:check`
- `pnpm exec site-kernel run rfc.acceptance.run --id RFC-0379`
- `pnpm exec site-kernel run rfc.verification.emit --id RFC-0379` (RFC-0330)

### 4.2 Evidence artifacts

- `docs/rfcs/verification/rfc-0379.generated.json` — verification evidence (RFC-0330)
- Commit messages referencing `RFC-0379` in the subject line (RFC-0265 commit hygiene)

## 5. Risks and mitigation

| Risk (from RFC) | Mitigation (plan step) |
| --- | --- |
| wrangler output format or flags drift across versions | Step 5: adapter asserts on exit code + deployment URL presence, not log text |
| Health probes flake on cold Workers or propagation delay | Step 5: exponential backoff with bounded attempts; verdict distinguishes unknown (network) from unhealthy (content mismatch) |
| Secrets leak into logs or JSON output | Step 5: redaction in adapter; Step 7: redaction test as a tested invariant |
| Behavior snapshot facts too coarse for content verification | Step 2: enhance snapshot with per-route contentHash; Step 3: HTML normalizer for semantic comparison |
| Agents bypass the alt→main gate by editing the registry | Step 6: lastPropagated written only under RFC-0362 locks; Step 8: AGENTS.md rule |

## 6. Escalation triggers

- If implementation reveals an invariant conflict with DNA-49 or DNA-52, run `pnpm exec site-kernel run rfc.supersede.propose --id RFC-0379 --reason "..." --invariant "DNA-N"` instead of working around it.
- If the HTML normalizer proves too inaccurate for health verification (too many false positives), escalate via a new RFC rather than disabling the check silently.
- If `wrangler deploy` flags change in a way that breaks the adapter contract, create an amending RFC rather than patching the adapter inline.
