---
id: RFC-0812
title: "Add DNS SVCB/HTTPS record format unit tests"
status: draft
kind: command
scope: workspace
owners:
  - architecture
reviewers: []
createdAt: 2026-08-12
updatedAt: 2026-08-12
implementedAt:
closedAt:
supersedes: []
supersededBy:
amends: []
amendedBy: []
related: []
satisfies: []
versionBump: patch
commands:
  proposed: []
  added: []
  changed: []
  removed: []
appsImpacted: []
packagesImpacted:
  - "@warpgogol/werkstatt"
successSignals:
  - "toApiRecord unit test covers SVCB and HTTPS record types"
  - "Test verifies Cloudflare API payload structure for SVCB records"
  - "Test catches regressions in SVCB content/data field handling"
nonGoals:
  - "Integration test hitting real Cloudflare API"
  - "Testing all DNS record types"
  - "Changing the toApiRecord implementation"
acceptance:
  - probe: run
    command: "werkstatt run vitest -- packages/werkstatt/src/dns/tests/dns-record-upsert.test.ts"
    expect:
      exitCode: 0
---

# RFC-0812: Add DNS SVCB/HTTPS record format unit tests

## Context

During the warpgogol-com-m000050 release, `dns.record.upsert` failed with Cloudflare API HTTP 400 errors for SVCB records. The `toApiRecord` function in `packages/werkstatt/src/dns/dns-record-upsert.ts` did not correctly format SVCB/HTTPS records for the Cloudflare API. Three iterations were needed to find the correct payload structure (`content` string + `data` object with `priority`, `target`, `value`).

There are currently no unit tests for `toApiRecord`. The function was only tested indirectly through the full `dns.record.upsert` pipeline, which requires Cloudflare API credentials and a live zone.

## Problem

The `toApiRecord` function handles type-specific formatting for DNS records (A, AAAA, CNAME, TXT, SVCB, HTTPS). SVCB and HTTPS records require special handling: the Cloudflare API accepts either a `content` string or a `data` object with `priority`, `target`, and `value` fields. The current implementation includes both, but there is no test verifying that the payload structure is correct.

Without unit tests, any future change to `toApiRecord` could silently break SVCB/HTTPS record formatting, causing Cloudflare API failures that are only discovered during a release pipeline.

## Decision

Add unit tests for `toApiRecord` covering:

1. **SVCB record**: Verify `content`, `data.priority`, `data.target`, `data.value` are correctly parsed from the content string.
2. **HTTPS record**: Same as SVCB.
3. **A record**: Verify `content` is passed through, no `data` object.
4. **TXT record**: Verify `content` is passed through.
5. **CNAME record**: Verify `content` is passed through.
6. **Edge cases**: Empty value, missing target, single-part content.

## Architectural fit

- This is a pure unit test RFC — no architectural changes.
- The tests live in `packages/werkstatt/src/dns/tests/` following the existing test placement convention.

## Design

### Test structure

```ts
// packages/werkstatt/src/dns/tests/dns-record-upsert.test.ts

import { describe, it, expect } from "vitest";
// toApiRecord is not currently exported — export it or test via a helper

describe("toApiRecord", () => {
  describe("SVCB records", () => {
    it("parses content into data object with priority, target, value", () => {
      const result = toApiRecord({
        type: "SVCB",
        name: "_dns.resolver.example.com",
        content: "1 . alpn=h2 dohpath=/dns-query{?dns}",
        proxied: false,
      });
      expect(result.type).toBe("SVCB");
      expect(result.content).toBe("1 . alpn=h2 dohpath=/dns-query{?dns}");
      expect(result.data).toEqual({
        priority: 1,
        target: ".",
        value: "alpn=h2 dohpath=/dns-query{?dns}",
      });
    });

    it("handles content with only priority and target", () => {
      const result = toApiRecord({
        type: "SVCB",
        name: "_dns.resolver.example.com",
        content: "1 .",
        proxied: false,
      });
      expect(result.data).toEqual({
        priority: 1,
        target: ".",
        value: "",
      });
    });
  });

  describe("HTTPS records", () => {
    it("parses content into data object", () => {
      const result = toApiRecord({
        type: "HTTPS",
        name: "example.com",
        content: "1 . alpn=h2",
        proxied: false,
      });
      expect(result.data).toEqual({
        priority: 1,
        target: ".",
        value: "alpn=h2",
      });
    });
  });

  describe("A records", () => {
    it("passes content through without data object", () => {
      const result = toApiRecord({
        type: "A",
        name: "example.com",
        content: "192.0.2.1",
        proxied: true,
      });
      expect(result.content).toBe("192.0.2.1");
      expect(result.data).toBeUndefined();
      expect(result.proxied).toBe(true);
    });
  });
});
```

### File system responsibilities

| Path | Role |
| --- | --- |
| `packages/werkstatt/src/dns/dns-record-upsert.ts` | Export `toApiRecord` (if not already exported) |
| `packages/werkstatt/src/dns/tests/dns-record-upsert.test.ts` | New test file |

## Rollout

- No pipeline changes. Tests run as part of the normal `vitest` suite.
- If `toApiRecord` is not currently exported, add an export — it is a pure function with no side effects, safe to export.

## Alternatives considered

- **Integration test with mocked Cloudflare API**: Rejected — over-engineered for a pure formatting function. Unit tests on `toApiRecord` are sufficient.
- **Testing via `runDnsRecordUpsert` with mocked fetch**: Rejected — tests the full command but obscures the formatting logic. Direct unit tests on `toApiRecord` are clearer and more maintainable.

## Risks

- **Export visibility**: `toApiRecord` may need to be exported from the module. This is a minimal API surface change — the function is already used internally.
- **Content parsing fragility**: The current parsing uses `split(/\s+/)` which is simple but may not handle all edge cases (e.g. quoted values with spaces). Tests should document the current behavior, not aspirational behavior.

## Acceptance criteria

- [ ] `toApiRecord` exported from `dns-record-upsert.ts` (if not already)
- [ ] Unit test for SVCB record formatting
- [ ] Unit test for HTTPS record formatting
- [ ] Unit test for A record formatting
- [ ] Unit test for TXT record formatting
- [ ] Unit test for CNAME record formatting
- [ ] Edge case tests (empty value, missing target)
- [ ] All tests pass with `pnpm exec vitest run`
- [ ] `rfc.validate` passes on this file before merging

## Implementation notes for agents

- Agents MAY implement code changes ONLY when this RFC has status: accepted (or implemented).
- The tests should verify the **current** behavior of `toApiRecord`, not change it.
- If the current parsing has bugs (e.g. incorrect handling of quoted values), document them in the test as known issues — do not fix them in this RFC. A fix would require its own RFC.
- The `DnsRecordDeclaration` type used in tests should match the existing type in `dns-record-upsert.ts`.
