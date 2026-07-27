---
rfc: RFC-0381
title: "Execute the pilot migration wave and retire apps"
emittedAt: 2026-07-13
verifier: agent
status: pass
---

# Verification Evidence — RFC-0381

## Summary

Pilot migration of `warpgogol-com` to a Sternsystem completed successfully. The app was retired from the monorepo after a valid Notausgang export.

## Acceptance Criteria

- [x] `sternsystem.register` — `warpgogol-com` registered in `systems/registry.yaml`
- [x] `sternsystem.extract` — `system.pin.json` generated with correct platform metadata
- [x] `sternsystem.validate` — Schema-valid pin, 0 violations
- [x] `mission.reconcile` — Mission `warpgogol-com-m000001` reconciled
- [x] `mission.close` — Mission closed, `currentMission: null` in registry
- [x] `release.prepare` — Release manifest with resolved `platformVersion: 4.5.0`
- [x] `release.publish` — Release `warpgogol-com-r000001` published
- [x] `notausgang.export` — Export package created
- [x] `notausgang.validate` — 0 violations, clean export
- [x] `apps/warpgogol-com` retired via `git rm -r`
- [x] CI workflows cleaned (changelog.yml, ci.yml, cache-parity.yml)
- [x] `fleet.sites.generate` — 0 sites (expected post-retirement)
- [x] `ecosystem.manifest.generate` — Regenerated without `apps/warpgogol-com`
- [x] `ecosystem.manifest.validate` — 0 errors, 0 warnings
- [x] `workspace.surface.validate` — 0 errors, 0 warnings
- [x] `rfc.validate RFC-0381` — Pass, 0 errors, 0 warnings

## Code Changes

- `packages/os/site-kernel/src/site-workspace-resolver.ts` — Prefer mission workpiece during active mission
- `packages/os/site-kernel-handoff/src/notausgang/notausgang-commands.ts` — Fix bordbuch field names, nested pin access, optional artifact manifest
- `packages/os/site-kernel-handoff/src/release/release-commands.ts` — Resolve platformVersion/commitSha/platformSemanticHash from ecosystem
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-extract.ts` — Schema-compliant pin generation, case-insensitive RFC regex
- `packages/os/site-kernel-handoff/src/sternsystem/sternsystem-pin.ts` — Case-insensitive RFC regex
- `packages/os/site-kernel-handoff/src/tests/notausgang.test.ts` — Updated test fixtures to match schema
- `packages/os/site-kernel-checks/src/ecosystem/debt.ts` — Handle zero-sites gracefully

## Commits

1. `implement: RFC-0381 steps 8-13 — fix notausgang validation, release.prepare, and dual-representation resolver`
2. `retire: RFC-0381 — remove apps/warpgogol-com and clean stale CI references`
3. `chore: RFC-0381 — regenerate ecosystem manifest after warpgogol-com retirement`
