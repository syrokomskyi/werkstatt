---
id: ADR-0032
title: "Site content validation lives in site-kernel-checks validators, not in shared package tests"
status: accepted
scope: package
decider: architecture
createdAt: 2026-08-07
updatedAt: 2026-08-07
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0468
  - RFC-0024
  - RFC-0073
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0032: Site content validation lives in site-kernel-checks validators, not in shared package tests

## Context

RFC-0468 defines two site-level content files — `owner-decision-register.yaml` and `migration-coverage-report.yaml` — that every PBP site must maintain. Validation of these files was implemented as a unit test in `packages/pbp/src/__tests__/rfc-0468-register-and-coverage.test.ts`.

This test hardcoded a path to `systems/warpgogol-com/src/content/business-profile/`, which does not exist in the werkstatt monorepo (Sternsystemen live in cache clones outside the monorepo per RFC-0574). The test failed in every CI run because the path was unreachable.

Existing PBP validators (`pbp.profile.validate` in `pbp-profile.ts`, `pbp.content.validate` in `content-pbp.ts`) already follow the correct pattern: they receive `KernelRuntimeContext` with `context.site.directory` pointing to the active site workspace, and run as part of the `build.prepare`/`build.check` pipeline for any site.

## Decision

Site content validation MUST be implemented as a validator in `packages/os/site-kernel-checks`, not as a unit test in a shared package.

- **Rule**: No test in `packages/*` may hardcode paths to `systems/<site-id>/` or cache clone directories.
- **Enforcement**: The `pbp.migration.validate` validator replaces the deleted test and runs for every site through the standard check pipeline.
- **Scope**: This applies to all validation that checks site-specific content files (YAML, markdown, frontmatter) against a PBP contract. Unit tests in `packages/*` are reserved for package-internal logic (schemas, pure functions, type guards).

## Justification

- **Alternatives considered**:
  - _Skip tests when site dir unavailable_ — masks the problem; tests silently stop running in CI.
  - _Parameterise tests via registry discovery_ — duplicates the validator runtime; tests still don't run in `build.check` pipeline where content drift is caught.
  - _Move tests to cache clone_ — cache clones have no vitest infrastructure; they are thin composition workspaces.
- **Alignment**: `site-kernel-checks` is the documented home for content validation (`packages/AGENTS.md`). Existing validators (`pbp.profile.validate`, `pbp.content.validate`) already validate PBP content structure for any site.
- **Scaling**: As new sites are registered, they automatically inherit validation without copying or parameterising tests.

## Consequences

- Positive: Validation runs automatically in `build.prepare`/`build.check` for every site; no hardcoded paths; no silent skips.
- Positive: New sites get RFC-0468 validation for free by registering in `systems/registry.yaml`.
- Negative: Validators are async kernel commands — slightly more boilerplate than a unit test.
- Technical debt: The deleted test also checked concrete values specific to `warpgogol-com` (28 items, specific topic names, 18 legacy files). These concrete checks are dropped; the validator checks structural invariants only. Site-specific concrete values should be validated in site-level overlays if needed.

## Evolution

If a future site needs concrete-value validation (e.g. "exactly 28 decision items"), the validator can accept a site-level config file with expected counts. Revisit this ADR if validators need to differentiate between structural and concrete-value checks across sites.
