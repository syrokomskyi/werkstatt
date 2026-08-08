---
id: ADR-0036
title: "Registry builder helper for test fixtures via yaml.stringify"
status: accepted
scope: package
decider: architecture
createdAt: 2026-08-08
updatedAt: 2026-08-08
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0752
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0036: Registry builder helper for test fixtures via yaml.stringify

## Context

During RFC-0752 implementation, test fixtures for `subdomain-register.test.ts` built `systems/registry.yaml` via string interpolation. Optional fields (`cloudflareZoneId`, `workersDevUrl`) were inserted with `\n` prefixes, but one combination produced invalid YAML: `Nested mappings are not allowed in compact mappings at line 30, column 15: hostedBy: studio`. The root cause was a missing newline before an optional field insertion.

This problem will recur for any test that constructs YAML registry fixtures with conditional fields.

## Decision

Build registry fixtures using `yaml.stringify()` from a JS object instead of string interpolation. Provide a shared helper `buildRegistry(opts)` in `src/tests/helpers/registry-builder.ts` that accepts a typed options object and returns a valid YAML string.

## Justification

String interpolation of YAML is fragile: conditional fields require manual `\n` prefix management, and any mistake produces cryptic YAML parser errors at test runtime. The `yaml` package is already a dependency of `site-kernel-handoff` (used by `registry-io.ts` for reading and writing `registry.yaml`), so no new dependency is introduced. The typed options interface catches field-name typos at compile time, which string interpolation cannot do. The alternative — hand-writing YAML templates per test — was the status quo that produced the bug motivating this ADR.

## Consequences

- **Positive**: YAML validity is guaranteed by the serializer — no manual newline management.
- **Positive**: optional fields are simply `undefined` in the JS object, and `yaml.stringify` omits them automatically.
- **Positive**: the helper is reusable across all tests that need registry fixtures (subdomain, leitstand, mission, sternsystem).
- **Negative**: the helper adds a dependency on the `yaml` package in test files (already a dependency of the package).

## Evolution

If the registry schema grows (e.g. PBP fields, new deployment channels), the helper's options type is extended. If the registry format changes to JSON, the helper is updated to use `JSON.stringify` — the interface stays the same. Monitor for tests that still hand-write YAML and migrate them.
