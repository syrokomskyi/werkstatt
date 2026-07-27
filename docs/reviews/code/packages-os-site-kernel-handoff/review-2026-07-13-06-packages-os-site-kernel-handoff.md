---
reviewId: REVIEW-CODE-2026-07-13-01
date: 2026-07-13
reviewer:
  skill: wg-review
  model: claude-sonnet-4-20250514
verdict: needs-revision
diffRange: 665060a65...HEAD
filesReviewed:
  - packages/ontology/src/operations/leitstand.ts
  - packages/ontology/src/operations/index.ts
  - packages/fingerprint/src/normalizers/html.ts
  - packages/fingerprint/src/normalizers/index.ts
  - packages/fingerprint/src/index.ts
  - packages/fingerprint/src/normalizers/html.test.ts
  - packages/os/site-kernel-handoff/src/behavior-snapshot/behavior-snapshot-commands.ts
  - packages/os/site-kernel-handoff/src/leitstand/adapter.ts
  - packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts
  - packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.test.ts
  - packages/os/site-kernel-handoff/src/leitstand/adapters/index.ts
  - packages/os/site-kernel-handoff/src/leitstand/leitstand-commands.ts
  - packages/os/site-kernel-handoff/src/leitstand/index.ts
  - packages/os/site-kernel-handoff/AGENTS.md
  - docs/architecture-dna.md
  - docs/rfcs/rfc-0379-implement-the-cloudflare-workers-leitstand-adapter-with-health-verification.md
  - docs/rfcs/verification/rfc-0379.generated.yaml
  - systems/registry.yaml
---

# Code Review: 665060a65...HEAD (RFC-0379 cloudflare-workers Leitstand adapter)

### Verdict: Needs revision

The diff implements the cloudflare-workers adapter, channel model, health verification, and command handler rewrite per RFC-0379. The mechanical floor passes and the forward-only discipline is strong. However, three findings on axes A, E, and G require revision before merge: a duplicated secrets-resolution function, a missing artifact-store rehydration path, and a health verdict logic bug where network failures can mask content mismatches.

### Mechanical floor

Pass — `build:check` and `test` pass for `@gogol/ontology`, `@gogol/fingerprint`, and `@gogol/site-kernel-handoff` (49 tests, 15 in fingerprint including 6 new).

### Axis A — Structural correctness

**Finding A-1: Duplicated secrets-resolution logic.** `resolveSecretsFilePath` is defined twice with identical behavior — once in `cloudflare-workers.ts:49-56` and once in `leitstand-commands.ts:112-121`. Both parse `env:VAR_NAME` references and read `process.env`. The adapter copy is unused because `leitstand-commands.ts` resolves the secrets file path before passing it to `adapter.propagate()`. The adapter's `sourceDotenv` then reads the resolved path. The adapter-side `resolveSecretsFilePath` (lines 49-56) is dead code.

**Finding A-2: `readReleaseManifest` uses naive YAML parsing.** `leitstand-commands.ts:85-102` parses YAML by regex-matching `^(\w+):\s*(.*)$` line by line. This fails on nested keys, multi-line values, quoted strings with colons, and arrays. The `release.yaml` format is real YAML and the repo has `yaml` as a dependency of `@gogol/site-kernel-handoff`. Use `yaml.parse()` instead.

### Axis B — DNA alignment

**DNA-49 (fleet propagation)** — Pass. Channel model (`alt`/`main`), per-channel `lastPropagated`, health verification via `@gogol/fingerprint`, `resolveAdapter` throws for unimplemented adapters. DNA-49 text updated.

**DNA-42 (Compass markup)** — Pass. All new source files carry `MODULE_CONTRACT` and `CHANGE_SUMMARY`.

**DNA-51 (Werkstatt primitives)** — Pass. `leitstand.propagate` and `leitstand.rollback` use `acquireLock`/`releaseLock`/`generateOperationId` from `@gogol/site-kernel-handoff/werkstatt`.

### Axis C — Ecosystem fit

**Finding C-1: `normalizeHtml` attribute stripping also strips value-bearing attributes.** `html.ts:46-51` strips all attributes matching `DYNAMIC_ATTR_PREFIXES` but also strips their values entirely (`return "${whitespace}${name}"`), dropping the `=value` part. For `crossorigin` and `integrity` this is fine (boolean/no-value), but `data-*` attributes with values like `data-page="home"` lose their value. Since `data-testid` is preserved, this is intentional for dynamic attrs, but the function name `normalizeAttributes` suggests it normalizes, not strips values. This is acceptable for hashing purposes but should be documented.

**Package boundaries** — Pass. Imports flow `packages/os → packages/ontology` and `packages/os → packages/fingerprint`, never cross-app.

**AGENTS.md updates** — Pass. `packages/os/site-kernel-handoff/AGENTS.md` has a new Leitstand section documenting channel model, adapter resolution, and health verification.

### Axis D — Forward-only compliance

Pass. `cloudflare-pages` and `vercel` removed from adapter enum. No backward compatibility shims. `resolveAdapter` throws for unimplemented adapters — no fallback-to-null. Old flat `target`/`credentials`/`lastPropagation` fields replaced directly with channel model.

### Axis E — Agent-facing clarity

**Finding E-1: `normalizeHtml` returns a hash, not normalized HTML.** The function name `normalizeHtml` implies it returns normalized HTML content. It actually returns `byteHash(collapsed)` — a `sha256:...` string. An agent calling `normalizeHtml(html)` expecting HTML output will get a hash. Rename to `hashHtml` or `normalizeHtmlToHash`, or have it return the normalized HTML and let callers hash separately. This is a clarity gap that will confuse future agents.

**Finding E-2: `readBehaviorSnapshot` in the adapter uses `process.cwd()` instead of an injected workspace root.** `cloudflare-workers.ts:223` calls `readBehaviorSnapshot(process.cwd(), input.releaseId)`. The `HealthInput` interface does not include `workspaceRoot`, so the adapter relies on the process CWD being the workspace root. This is fragile — if the adapter is ever called from a different CWD (e.g., a test), it will fail silently. The command handler in `leitstand-commands.ts` has `workspaceRoot` in its context but does not pass it to `adapter.health()`.

### Axis F — Pragmatism

Pass. Four commands, four flags — no command bloat. `--channel` is a flag on existing commands, not a new command. The adapter interface is lean. No speculative generality (netlify is in the enum but `resolveAdapter` throws for it).

### Axis G — Blind spots

**Finding G-1: Health verdict logic bug — `anyNetworkFailure` can mask content mismatches.** `cloudflare-workers.ts:299-303`:

```ts
const state = anyNetworkFailure && !allPassed
  ? "unknown"
  : allPassed
    ? "healthy"
    : "unhealthy";
```

If some probes have network failures (`anyNetworkFailure = true`) AND other probes have content hash mismatches (`allPassed = false`), the state is `"unknown"` — but it should be `"unhealthy"` because content mismatch is a hard fail regardless of network issues. The RFC says: "only content mismatch is a hard fail." The current logic makes a content mismatch look like a network issue when any network failure also occurs. Fix: `anyNetworkFailure && allPassed ? "unknown" : allPassed ? "healthy" : "unhealthy"` — or track content mismatches separately.

**Finding G-2: No artifact-store rehydration.** The RFC acceptance criteria require: "Propagate and rollback rehydrate dist from the RFC-0363 artifact store when the local copy is absent or stale." The preflight check `dist-present` notes "will need rehydration" when dist is missing, but no rehydration logic follows. If `dist` is absent, `adapter.propagate()` is called with a non-existent `distPath`, and `wrangler deploy` will fail. This is a missing acceptance criterion.

**Finding G-3: `sourceDotenv` mutates `process.env` globally.** `cloudflare-workers.ts:58-72` reads a `.env` file and sets `process.env[key]` for each key not already set. This is a process-wide side effect that persists after the command completes. In a test or pipeline context, this leaks environment variables across tests. Consider scoping to the child process env only.

### Spec compliance

| Requirement from RFC-0379 | Status | Evidence |
| --- | --- | --- |
| cloudflare-workers adapter with injectable CommandRunner | Done | `cloudflare-workers.ts:130` `createCloudflareWorkersAdapter(exec?: CommandRunner)` |
| resolveAdapter throws for netlify and unimplemented | Done | `leitstand-commands.ts:82` throws `adapter-not-implemented` |
| deploymentConfigSchema carries channels.alt?/channels.main and per-channel lastPropagated | Done | `leitstand.ts:37-49` |
| cloudflare-pages and vercel removed from enum | Done | `leitstand.ts:16` enum is `cloudflare-workers \| netlify \| null` |
| DNA-49 text updated | Done | `architecture-dna.md:207` |
| leitstand.propagate --channel main refuses without healthy alt | Done | `leitstand-commands.ts:250-257` |
| leitstand.status shows both channels by default | Done | `leitstand-commands.ts:396-401` |
| Preflight validates artifact hashes, channel presence, credential syntax, wrangler availability, size limits | Partial | Preflight checks release manifest, channel, credential syntax, dist — but NOT artifact hashes (RFC-0363/0364), wrangler availability, or Workers size limits |
| Health verification with deterministic probe selection and exponential backoff | Done | `cloudflare-workers.ts:95-108` `selectProbeRoutes`, `111-128` `fetchWithRetry` |
| Propagate and rollback rehydrate dist from artifact store | Missing | No rehydration logic exists; preflight notes "will need rehydration" but does not implement it |
| Secret values never appear in registry, output, or logs | Done | Registry stores `secretsFile` references only; test `cloudflare-workers.test.ts:84-92` verifies redaction |
| Bordbuch entries record channel, verdicts, release ids | Done | `leitstand-commands.ts:321-337` and `534-549` |
| RFC-0358 deferred acceptance criteria checked off | Missing | RFC-0358 acceptance criteria not explicitly referenced or checked off in this diff |
| rfc.validate passes | Done | Verified — "All 1 RFC(s) passed validation" |

### Questions for the author

1. The health verdict logic at `cloudflare-workers.ts:299-303` returns `"unknown"` when there are both network failures and content mismatches. Should a content mismatch always be `"unhealthy"` regardless of concurrent network failures? (G-1)
2. The RFC requires artifact-store rehydration when dist is absent or stale, but no rehydration logic is implemented. Is this deferred to a follow-up, or was it intentionally descoped? (G-2)
3. `normalizeHtml` returns a hash string, not normalized HTML. Should the function be renamed to avoid confusion for future agents calling it? (E-1)
