---
id: ADR-0055
title: "Testing conventions for route generators and resolvePageRoute"
status: accepted
scope: package
decider: architecture
createdAt: 2026-08-19
updatedAt: 2026-08-19
implementedAt:
closedAt:
supersedes: []
supersededBy:
related:
  - RFC-0880
  - RFC-048
  - RFC-0708
  - DNA-66
reviewers:
  - human:andrii-syrokomskyi
---

# ADR-0055: Testing conventions for route generators and resolvePageRoute

## Context

Route generators (`nachweis-routes.ts`, `getRouteRegistry`, `getStaticPathsFromRegistry`) and the page resolver (`resolvePageRoute`) are critical build-time code that maps content collections to Astro static paths. During mission `warpgogol-com-m000077`, four cascading build failures were caused by bugs in these modules — none of which were caught by unit tests because no tests existed for them.

RFC-0880 formalizes the slug contract for Nachweis routes. This ADR establishes the testing conventions that ensure route generators and `resolvePageRoute` are covered by unit tests going forward.

## Decision

- Route generators (`nachweis-routes.ts`, `getRouteRegistry`, `getStaticPathsFromRegistry`) MUST have unit tests covering: slug present → correct route, slug absent → error, route format (no leading/trailing slashes), multi-language route generation.
- `resolvePageRoute` MUST have unit tests covering: standard page IDs, synthetic page IDs (`nachweis:{slug}`, `nachweis-verify:{slug}:{version}`), block prop injection for synthetic routes, missing page → error.
- Tests use vitest with mocked Astro `getCollection` — no real content collections are loaded.
- Test files live alongside the source files in `packages/werkstatt-site/src/domain/share/astro/tests/` or in `packages/werkstatt-site/src/checks/tests/` for validator-adjacent code.

## Justification

- **Four cascading failures in one mission** (m000077) were all in untested route generation and resolution code. Each failure required a ~4 minute validate cycle to discover.
- **Route generators are pure functions** of content collection data — they are straightforward to unit test with mocked `getCollection` calls.
- **`resolvePageRoute` is a pure function** of the route registry and page ID — it can be tested with a mock registry.
- **DNA-66 (workshop testing pyramid)**: This ADR aligns with DNA-66 by ensuring the foundation layer (route generation) has unit test coverage, reducing reliance on expensive integration tests (full `mission.validate`).

## Consequences

- **Positive**: Route generation bugs are caught in <1 second by unit tests instead of ~4 minutes by `mission.validate`. Regression prevention for the specific failure modes encountered in m000077.
- **Positive**: New route types (e.g. future evidence kinds) come with test coverage by convention.
- **Negative**: Test maintenance — when route generation logic changes, tests must be updated. This is standard for critical code.
- **Technical debt**: Existing route generators that predate this ADR (e.g. `getStaticPathsFromRegistry`) may not have full test coverage yet. This ADR establishes the convention; backfilling tests is an implementation task.

## Evolution

- If route generators become more complex (e.g. async data fetching, conditional route generation), tests should be extended to cover those scenarios.
- If a new synthetic page ID pattern is introduced (beyond `nachweis:` and `nachweis-verify:`), the `resolvePageRoute` tests must be extended with the new pattern.
- This ADR may be superseded by a broader testing policy RFC if one is introduced in the future.
