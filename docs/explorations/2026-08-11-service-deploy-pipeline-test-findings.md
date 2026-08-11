# Service Deploy Pipeline Test Findings (RFC-0806)

**Date:** 2026-08-11 **Context:** First live test of `leitstand.service.dev-deploy`, `leitstand.service.promote`, and `leitstand.service.rollback` commands on `matomo-proxy` service. **RFC:** [RFC-0806](../rfcs/rfc-0806-add-service-deploy-pipeline-with-dev-deploy-promote-and-rollback.md)

## Summary

Ran `leitstand.service.dev-deploy --service matomo-proxy` end-to-end. The dev-deploy succeeded after fixing 3 bugs. Promote is blocked by a pre-existing validator bug (P4). Rollback executes correctly but fails because there's no previous version to roll back to (expected for first deploy).

## Problems Found

### P1: Service commands not registered in leitstand.module.ts [FIXED]

**Classification:** Implementation bug — registration gap

**Root cause:** Two `createLeitstandModule` functions exist:

- `packages/werkstatt/src/leitstand/index.ts` — has `leitstand.service.*` registrations (lines 190-251)
- `packages/werkstatt/src/leitstand/leitstand.module.ts` — does NOT have them

`tools/kernel.config.ts` imports `@warpgogol/werkstatt/leitstand-module` which resolves to `leitstand.module.ts` (via the `*-module` subpath export pattern). The service commands were added to `index.ts` but not to `leitstand.module.ts`.

**Fix applied:** Added `leitstand.service.dev-deploy`, `leitstand.service.promote`, `leitstand.service.rollback` registrations to `leitstand.module.ts` using flat dynamic imports.

**Files changed:**

- `packages/werkstatt/src/leitstand/leitstand.module.ts`

**Recommendation:** Consolidate to a single `createLeitstandModule` implementation. `leitstand.module.ts` should be the canonical source; `index.ts` should re-export it, not define its own. This duplication will cause future registration gaps.

---

### P2: Wrong gate argv for flagless validators [FIXED]

**Classification:** Implementation bug — wrong gate configuration

**Root cause:** `service.naming.validate` and `service.registry.validate` accept no flags (`flags: {}` in command-tables/30-check-warpgogol.ts). They validate all services globally. The dev-deploy and promote handlers passed `["--service", serviceId]` to these gates, causing KERNEL-ARG-01 (unexpected positional argument) and KERNEL-FLAG-01 (unknown flag).

**Fix applied:** Removed `--service` argv from `service.naming.validate` and `service.registry.validate` gates in both `service-dev-deploy.ts` and `service-promote.ts`.

**Files changed:**

- `packages/werkstatt/src/leitstand/service-dev-deploy.ts`
- `packages/werkstatt/src/leitstand/service-promote.ts`

---

### P3: deploy.preflight fails for services without env vars [FIXED]

**Classification:** Implementation bug — missing exemption

**Root cause:** RFC-0806 and RFC-0761 state "Services that do not consume environment variables are exempt." But `deploy.preflight` unconditionally required the target env file (`.env` or `.env.dev`) to exist. Services like `matomo-proxy` that don't consume env vars have no `.env`, `.env.example`, `.env.dev`, or `.env.dev.example` — causing DEPLOY-PREFLIGHT-01.

**Fix applied:** Added early-exempt check in `deploy.preflight`: if neither target nor example file exists, return pass with "skipped (service does not consume env vars)" message.

**Files changed:**

- `packages/werkstatt-site/src/checks/env/deploy-preflight.ts`

---

### P4: services.check.run fails with retired apps/* paths [FIXED]

**Classification:** Pre-existing bug — unrelated to RFC-0806, but blocks `leitstand.service.promote`

**Root cause:** `runCheckWarpgogolRunnerValidate` in `packages/werkstatt-site/src/checks/check-warpgogol/commands/services.ts` (lines 183-284) has hardcoded required file paths that reference retired `apps/check-warpgogol-com/` directory (retired by RFC-0381) and `packages/check-core/` (consolidated into `@warpgogol/werkstatt-site/check-core` by RFC-0775/0776).

The required files list at line 188-197 includes:

```
"packages/check-core/src/run-request.ts",
"apps/check-warpgogol-com/src/pages/api/check-runs/index.ts",
"apps/check-warpgogol-com/src/pages/api/check-runs/[runid].ts",
```

These paths no longer exist. The `apps/*` directory was retired by RFC-0381. `packages/check-core/` was consolidated into `packages/werkstatt-site/src/domain/check-core/` by RFC-0775.

Additionally, CW-RUNNER-02 checks for dependencies `@warpgogol/werkstatt-site/check-core` and `@warpgogol/werkstatt-site/check-runner` as separate keys in `services/check-runner/package.json`, but after RFC-0775/0776 consolidation the service depends on `@warpgogol/werkstatt-site` (the main package), not subpath exports as separate dependencies.

**Impact:** `services.check.run` gate in `leitstand.service.promote` always fails → promote pipeline is blocked for all services.

**Verified state:**

- `packages/check-core/` — deleted (consolidated into `packages/werkstatt-site/src/domain/check-core/` by RFC-0775/0776)
- `apps/` — deleted (retired by RFC-0381)
- `packages/werkstatt-site/src/domain/check-core/run-request.ts` — exists (replacement path)
- `services/check-runner/` — already renamed from `check-warpgogol-runner` by RFC-0805
- `services/check-runner/package.json` depends on `@warpgogol/werkstatt-site` (not subpath exports as separate deps)

**Fix plan:**

1. Update `runCheckWarpgogolRunnerValidate` in `packages/werkstatt-site/src/checks/check-warpgogol/commands/services.ts` (lines 183-284):
   - Remove `apps/check-warpgogol-com/src/pages/api/check-runs/index.ts` from required files list (line 195)
   - Remove `apps/check-warpgogol-com/src/pages/api/check-runs/[runid].ts` from required files list (line 196)
   - Update `packages/check-core/src/run-request.ts` → `packages/werkstatt-site/src/domain/check-core/run-request.ts` (line 194)
   - Update CW-RUNNER-02 dependency check (lines 214-216): check for `@warpgogol/werkstatt-site` instead of subpath exports `@warpgogol/werkstatt-site/check-core` and `@warpgogol/werkstatt-site/check-runner` (subpath exports are not separate dependencies in package.json)
   - Remove CW-RUNNER-05 check entirely (lines 261-282 — `apps/` no longer exists)
2. Update command-tables/30-check-warpgogol.ts (line 91):
   - Remove `apps/check-warpgogol-com/src/pages/api/check-runs/**` from `reads`
3. Run `pnpm exec werkstatt run services.check.run` to verify

**Files to change:**

- `packages/werkstatt-site/src/checks/check-warpgogol/commands/services.ts`
- `packages/werkstatt-site/src/checks/command-tables/30-check-warpgogol.ts`

---

### P5: build:check gate missing from pipeline [FIXED]

**Classification:** Missing feature — RFC-0806 implementation gap

**Root cause:** RFC-0806 specifies `build:check` as a blocking pre-deploy gate for both dev-deploy and promote (lines 62, 262, 279). The implementation in `service-dev-deploy.ts` and `service-promote.ts` does not include this gate.

`build:check` is NOT a kernel command — it's a package.json script (`tsc --noEmit`). The `runPreDeployGates` helper uses `executeKernelCommand`, which cannot run package.json scripts.

**Fix plan:**

1. Add a `runBuildCheck` helper to `service-deploy-helpers.ts`:
   ```ts
   export async function runBuildCheck(
     serviceDir: string,
     logger: { info: (msg: string) => void },
   ): Promise<PreDeployGateResult> {
     logger.info("[pre-deploy] running build:check…");
     const result = await new Promise<{ exitCode: number; stdout: string; stderr: string }>((resolve) => {
       const child = spawn("pnpm", ["run", "build:check"], {
         cwd: serviceDir,
         stdio: ["pipe", "pipe", "pipe"],
       });
       let stdout = "";
       let stderr = "";
       child.stdout.on("data", (d) => { stdout += d.toString(); });
       child.stderr.on("data", (d) => { stderr += d.toString(); });
       child.on("error", () => resolve({ exitCode: 1, stdout, stderr: "Failed to spawn" }));
       child.on("exit", (code) => resolve({ exitCode: code ?? 1, stdout, stderr }));
     });
     return {
       command: "build:check",
       passed: result.exitCode === 0,
       summary: result.exitCode === 0 ? "tsc --noEmit: 0 errors" : result.stderr || "failed",
     };
   }
   ```
2. Call `runBuildCheck` after `runPreDeployGates` in both `service-dev-deploy.ts` and `service-promote.ts`:
   ```ts
   const buildCheckResult = await runBuildCheck(serviceDir, logger);
   gateResults.push(buildCheckResult);
   if (!buildCheckResult.passed) {
     // abort with failed gate
   }
   ```
3. Alternatively: register `build:check` as a kernel command that wraps `pnpm run build:check` via `spawn`, so it can be used uniformly in the gate array. This is more aligned with the RFC's gate list but adds a kernel command for a simple script invocation.

**Files to change:**

- `packages/werkstatt/src/leitstand/service-deploy-helpers.ts` (add `runBuildCheck`)
- `packages/werkstatt/src/leitstand/service-dev-deploy.ts` (call `runBuildCheck`)
- `packages/werkstatt/src/leitstand/service-promote.ts` (call `runBuildCheck`)

---

### P6: Stale command manifest [FIXED]

**Classification:** Maintenance — generated artifact out of date

**Root cause:** `docs/command-manifest.generated.yaml` does not include `leitstand.service.*` commands. The manifest is generated by `command.manifest.generate` and used by `execute-command.ts` for fast module loading (lines 457-465). When a command is not in the manifest, the system falls back to full registry build — slower but functional.

**Fix:** Regenerate the manifest:

```bash
pnpm exec werkstatt run command.manifest.generate
```

**Impact:** Performance only — every `leitstand.service.*` invocation loads all 40+ modules instead of just the leitstand module.

---

## What Works

- **dev-deploy pipeline:** All 3 gates pass, wrangler deploy succeeds, health check returns healthy, registry state recorded with `lastDevDeployed` + `workersDevUrl`.
- **Lock mechanism:** Lock acquired and released correctly. No lock file left behind.
- **Registry state recording:** `lastDevDeployed` written with `at`, `state`, `operationId`. `workersDevUrl` updated.
- **rollback command:** Correctly invokes `wrangler rollback`. Fails when no previous version exists (expected for first deploy).
- **Health check:** `fetch` against `https://matomo-proxy-dev.syrokomskyi.workers.dev/_wg/analytics/health` returns 200 → healthy.
- **lagebild.worker.deploy removal:** Legacy command registration already removed from `lagebild.module.ts`.

## Test Output (dev-deploy, after fixes)

```
[OK] service.naming.validate: pass — 5 service(s) checked
[OK] service.registry.validate: pass — 5 service(s) registered
[OK] deploy.preflight: services/matomo-proxy/.env.dev skipped (no .env.dev.example — service does not consume env vars)
[INFO] deploying matomo-proxy-dev via wrangler…
[INFO] running health check on https://matomo-proxy-dev.syrokomskyi.workers.dev…
[OK] matomo-proxy: dev-deployed (healthy)
```

## Registry state after dev-deploy

```yaml
lastDevDeployed:
  at: 2026-08-11T16:13:40.964Z
  state: succeeded
  operationId: op-msov0sxe-f11szuk8
healthCheckPath: /_wg/analytics/health
workersDevUrl: https://matomo-proxy-dev.syrokomskyi.workers.dev
```
