---
rfcId: RFC-0826
auditId: AUDIT-RFC-0826-01
date: 2026-08-13
auditor:
  skill: fo-idea-audit
  model: claude-sonnet-4-20250514
verdict: needs-revision
---

# Audit: RFC-0826

## Verdict: Needs revision

The RFC's primary example and acceptance criterion reference a QStash callback flow on `lagebild-sync` that does not exist — the service only exposes `/health` and returns 404 for all other paths. Additionally, `dependsOn` is missing RFC-0825 (required for the pipeline integration acceptance criterion), and `.env.test` is introduced without justification against the existing `.env.dev` convention.

## Mechanical validation (rfc.validate)

Pass — zero violations, zero markers.

## Axis A — Structural completeness

- **Helper ownership ambiguity (lines 204–205):** The file system table lists `dev-url-resolver.ts` and `test-env.ts` as responsibilities of this RFC, but RFC-0823 (lines 200–202) already claims ownership of these helpers. The table should note "created by RFC-0823, consumed by this RFC" or remove them.

## Axis B — DNA alignment

No issues. `satisfies: [DNA-66]` is correct — DNA-66 is real (established by RFC-0823), and the RFC body explains how it implements the L2 integration layer.

## Axis C — Ecosystem fit

- **Missing `dependsOn: RFC-0825` (line 47):** The acceptance criterion "leitstand.service.dev-deploy calls service.integration.run after smoke tests" (line 266) requires RFC-0825's smoke test step to exist in `service-dev-deploy.ts`. The current `service-dev-deploy.ts` (`@/packages/werkstatt/src/leitstand/service-dev-deploy.ts:148-153`) has only a health check — no smoke test step. Without RFC-0825 implemented, this acceptance criterion cannot be satisfied. RFC-0825 should be added to `dependsOn`.
- **Missing `AGENTS.md` update identification:** The RFC introduces a `.env.test` convention and integration test requirement for services but does not identify `services/AGENTS.md` as needing an update. The existing `services/AGENTS.md` documents `.env.example`, `.env.dev.example`, and the dev channel contract — `.env.test` is a new convention that belongs in the same guide.
- **Compass sync not addressed:** The RFC does not state whether `docs/*.xml` files need synchronization. Since this is a testing infrastructure change (no repository-wide requirements or shared package contract changes), it likely needs no Compass sync — but the RFC should state this explicitly.

## Axis D — Forward-only compliance

No issues. No backward compatibility layers, no shims, no dual-path constructions.

## Axis E — Agent-facing policy

- **QStash callback example tests a non-existent endpoint (lines 128–151):** The test publishes a QStash event targeting `${url}/api/integration-route` on `lagebild-sync`. However, `services/lagebild-sync/src/index.ts` (lines 21–30) only handles `/health` and returns 404 for all other paths. `lagebild-sync` is a scheduled worker (`scheduled: worker.scheduled.bind(worker)`) — it has no HTTP handler for QStash callbacks. QStash callbacks are received by site API routes (`packages/werkstatt-site/src/domain/ui/integration-routes/integration-inbound.api.ts`), not by this service. The RFC's primary example, the `qstash-callback.test.ts` file structure entry (line 101), and the acceptance criterion (line 264) are all based on a flow that does not exist on this service.
- **Operator prerequisite not noted:** The acceptance criterion "Integration tests for lagebild-sync (health, QStash callback) pass against dev channel" (line 264) requires an operator-configured `.env.test` with real QStash credentials. The RFC should distinguish between what an agent can implement (command, helpers, test files) and what requires operator action (credential configuration, dev-deployed target).

## Axis F — Pragmatism

- **`.env.test` not justified vs `.env.dev` (lines 155–168):** The RFC introduces `.env.test` but doesn't justify why `.env.dev` (which already exists per RFC-0806 and contains the same dev credentials) can't be reused. The `.env.test` template says "copy from .env.dev and adjust test-specific values" — but no test-specific values are shown. If the values are identical, `.env.test` is unnecessary duplication. The RFC should either use `.env.dev` directly or explain what test-specific values require a separate file.
- **QStash test doesn't verify what it claims (lines 128–151):** The test is named "receives QStash callback and verifies signature" but only checks `health.status === "ok"` after publishing. The comment at lines 145–146 claims "we verify via the health endpoint which exposes last-callback status" — but the current `/health` endpoint returns only `{"status":"ok","service":"lagebild-sync"}` (see `services/lagebild-sync/src/index.ts:24`). No callback status is exposed. The test does not verify callback delivery, signature verification, or any service-side processing.

## Axis G — Blind spots

- **No global run timeout (line 179):** The `timeout` field in `ServiceIntegrationRunInput` is per-test (default 60s). A run with multiple test files (e.g., health + QStash + Supabase = 3 tests × 60s = 180s) could block `leitstand.service.dev-deploy` for minutes. The RFC should specify a global run timeout or document the expected total duration.
- **Forward reference to RFC-0829 (line 214):** `leitstand.service.promote` verification is deferred to RFC-0829, which doesn't exist yet (it's listed in RFC-0823's downstream table but has no file). The RFC should note this as a forward reference to a not-yet-created RFC.
- **`supabase-write.test.ts` can't trigger sync (line 102):** The test "trigger sync → verify Supabase buffer write" assumes an HTTP trigger for sync, but `lagebild-sync` is a scheduled worker — sync runs via Cloudflare Cron (`scheduled` handler), not via HTTP. There's no HTTP endpoint to trigger a sync manually. The test would need to either wait for the cron schedule (impractical) or the service would need a new HTTP endpoint for manual sync triggering (out of scope for this RFC).

## Questions for the author

1. Why does `lagebild-sync` have a `qstash-callback.test.ts` when the service has no QStash callback endpoint? Should the integration test target a different service, or should the test be removed?
2. Why introduce `.env.test` instead of reusing `.env.dev`? What test-specific values require a separate file?
3. Should RFC-0825 be added to `dependsOn` given that the pipeline integration acceptance criterion requires the smoke test step to exist first?
