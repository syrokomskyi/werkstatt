---
id: ADR-0027
title: "sourceDotenv skips empty values to allow process.env fallback"
# Lifecycle (RFC-0367 parity with RFCs):
#   proposed → reviewing → accepted → implemented
#   any → superseded (requires supersededBy)
#   any → rejected
status: implemented
scope: package
decider: architecture
createdAt: 2026-08-05
updatedAt: 2026-08-05
implementedAt: 2026-08-05
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0379
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0027: sourceDotenv skips empty values to allow process.env fallback

## Context

`sourceDotenv` in `packages/os/site-kernel-handoff/src/leitstand/adapters/cloudflare-workers.ts:115-131` parses `.env` files for the Cloudflare Workers adapter. It reads key=value pairs and includes every key in the result object, even when the value is an empty string. The `purgeCdnCache` function (line 350-358) merges `secretsEnv` over `filterEnv(process.env)`, so an empty value in `.env.alt` overrides a real value in `process.env`. This causes `CLOUDFLARE_ZONE_ID` to be empty when the workpiece `.env.alt` contains `CLOUDFLARE_ZONE_ID=` (a template placeholder), even though the root `.env` has the real value in `process.env`.

This was observed during the warpgogol-com-r000012 release cycle: `leitstand.propagate` logged `CLOUDFLARE_ZONE_ID not set — skipping CDN cache purge` despite the variable being present in the root `.env`.

## Decision

`sourceDotenv` skips entries with empty values, so keys with `KEY=` (no value) are excluded from the parsed result.

- The merge order `{ ...filterEnv(process.env), ...secretsEnv }` then allows `process.env` to provide the value when the `.env` file has a placeholder empty entry.
- Applies only to `sourceDotenv` in `cloudflare-workers.ts`; other env parsing is unaffected.

## Justification

The `.env.alt` and `.env.main` files in workpieces are generated from `.env.example` templates with empty values as placeholders. `mission.materialize` preserves operator-filled `.env` files, but operators typically fill the root `.env` (which exports to `process.env`) rather than each workpiece `.env.alt`. When `sourceDotenv` includes empty values, they shadow real values from `process.env`.

Alternatives considered:

- **`purgeCdnCache` falls back to `process.env` explicitly**: would require changing every call site that reads from the merged env. Fragile and violates DRY.
- **`mission.materialize` copies real values into workpiece `.env.alt`**: couples materialization to secret management and risks leaking secrets into git-tracked workpiece files.
- **Remove empty entries from `.env.example` templates**: doesn't help existing workpieces that already have empty entries.

Skipping empty values in `sourceDotenv` is the minimal upstream fix — it makes the merge order work as intended: `.env` file values override `process.env` only when they are actually set.

## Consequences

- Positive: `CLOUDFLARE_ZONE_ID`, `CLOUDFLARE_API_TOKEN`, and other secrets from the root `.env` (via `process.env`) are no longer shadowed by empty placeholder entries in workpiece `.env.alt` / `.env.main`.
- Positive: CDN cache purge works without manual intervention after `leitstand.propagate` or `leitstand.dev-deploy`.
- Negative: An `.env` file with an intentionally empty value (e.g. `SOME_FLAG=` to mean "empty string") will no longer override `process.env`. This is unlikely in practice — env files use unset/absent keys for "not set" and empty strings are almost always placeholders.
- Technical debt: None.

## Evolution

If a legitimate use case for empty-string env values emerges, add a `--keep-empty` flag to `sourceDotenv` or use a sentinel like `KEY=__EMPTY__` for explicit empty strings. Monitor for `CLOUDFLARE_ZONE_ID not set` warnings after deployment — they should disappear.
