/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0744: tests for rate-snapshot.resolve external mode — verifies Supabase
    rate_observations query and RateSnapshot creation from external observations.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by RFC-0744 — external mode Supabase query tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { makeTestSiteContext } from "./helpers.ts";

const originalEnv = { ...process.env };

function makeTmpWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), "tmp-rate-fetcher-XXXX-"));
  const contentDir = join(dir, "src", "content");
  mkdirSync(contentDir, { recursive: true });
  mkdirSync(join(contentDir, "business-profile"), { recursive: true });

  const systemMd = `---
schema: pbp/system@1
id: https://warpgogol.com
type: system
status: published
i18n:
  default: de
  supported:
    de:
      name: Deutsch
      hreflang: de
---
# Test System
`;
  writeFileSync(join(contentDir, "system.md"), systemMd);

  const entitlementsYaml = "features:\n  - multi-currency\n";
  mkdirSync(join(dir, "src"), { recursive: true });
  writeFileSync(join(dir, "src", "entitlements.generated.yaml"), entitlementsYaml);

  return dir;
}

function makeBusinessContent(): string {
  return `---
schema: pbp/business@1
id: https://warpgogol.com/id/business
type: business
status: published
name: Test Business
---
# Test Business
`;
}

function makeRatePolicyContent(): string {
  return `---
schema: pbp/rate-policy@1
id: https://warpgogol.com/id/rate-policy/eur-uah
type: rate-policy
status: published
pair:
  sourceCurrency: EUR
  targetCurrency: UAH
quotation:
  direction: target-per-source
mode: external
sources:
  primary:
    ref: https://warpgogol.com/id/rate-source/ecb-primary
    expectedType: rate-source
freshness:
  maximumAge: P1D
  allowLastKnownValue: true
failure:
  noAcceptableRate: source-price-only
---
# EUR/UAH Rate Policy
`;
}

interface MockFetchResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
  text: () => Promise<string>;
}

function createMockFetch(
  observations: Array<{
    value: string;
    observed_at: string;
    metadata?: Record<string, unknown>;
  }>,
): typeof fetch {
  return vi.fn().mockImplementation(async (url: string | URL | Request) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr.includes("rate_observations")) {
      const response: MockFetchResponse = {
        ok: true,
        status: 200,
        json: async () => observations,
        text: async () => JSON.stringify(observations),
      };
      return response as unknown as Response;
    }
    const response: MockFetchResponse = {
      ok: false,
      status: 404,
      json: async () => [],
      text: async () => "",
    };
    return response as unknown as Response;
  });
}

beforeEach(() => {
  process.env.RATE_FETCHER_SUPABASE_URL = "https://test.supabase.co";
  process.env.RATE_FETCHER_SUPABASE_KEY = "test-key";
});

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

test("external mode creates RateSnapshot from Supabase observation", async () => {
  const workspace = makeTmpWorkspace();
  try {
    writeFileSync(
      join(workspace, "src", "content", "business-profile", "business.md"),
      makeBusinessContent(),
    );
    writeFileSync(
      join(workspace, "src", "content", "business-profile", "rate-policy-eur-uah.md"),
      makeRatePolicyContent(),
    );

    const mockFetch = createMockFetch([
      { value: "44.1234", observed_at: "2026-08-07T08:00:00Z", metadata: { source: "ecb" } },
    ]);
    vi.stubGlobal("fetch", mockFetch);

    const { runRateSnapshotResolve } = await import("../rate-snapshot-resolve.ts");

    const result = await runRateSnapshotResolve(
      { flags: { system: "test" }, args: [] } as never,
      makeTestSiteContext(workspace, workspace, "test"),
    );

    expect(result.exitCode).toBe(0);
    const data = result.data as Record<string, unknown>;
    expect(data.status).toBe("ok");
    expect(data.snapshotsCreated).toBe(1);

    const snapshotDir = join(
      workspace,
      "src",
      "content",
      "business-profile",
      "rate-snapshots",
      "de",
    );
    const files = existsSync(snapshotDir)
      ? readFileSync(join(snapshotDir, "EUR-UAH-2026-08-07T08-00-00.md"), "utf-8")
      : "";
    expect(files).toContain("44.1234");
    expect(files).toContain("external");
    expect(files).toContain("rate-snapshot");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("external mode with no observations returns warning for source-price-only", async () => {
  const workspace = makeTmpWorkspace();
  try {
    writeFileSync(
      join(workspace, "src", "content", "business-profile", "business.md"),
      makeBusinessContent(),
    );
    writeFileSync(
      join(workspace, "src", "content", "business-profile", "rate-policy-eur-uah.md"),
      makeRatePolicyContent(),
    );

    const mockFetch = createMockFetch([]);
    vi.stubGlobal("fetch", mockFetch);

    const { runRateSnapshotResolve } = await import("../rate-snapshot-resolve.ts");

    const result = await runRateSnapshotResolve(
      { flags: { system: "test" }, args: [] } as never,
      makeTestSiteContext(workspace, workspace, "test"),
    );

    expect(result.exitCode).toBe(0);
    const data = result.data as Record<string, unknown>;
    expect(data.snapshotsCreated).toBe(0);
    expect(data.warnings).toContain("No rate observation found for pair EUR/UAH in Supabase");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("external mode without Supabase env vars returns warning", async () => {
  const workspace = makeTmpWorkspace();
  try {
    writeFileSync(
      join(workspace, "src", "content", "business-profile", "business.md"),
      makeBusinessContent(),
    );
    writeFileSync(
      join(workspace, "src", "content", "business-profile", "rate-policy-eur-uah.md"),
      makeRatePolicyContent(),
    );

    delete process.env.RATE_FETCHER_SUPABASE_URL;
    delete process.env.RATE_FETCHER_SUPABASE_KEY;

    const { runRateSnapshotResolve } = await import("../rate-snapshot-resolve.ts");

    const result = await runRateSnapshotResolve(
      { flags: { system: "test" }, args: [] } as never,
      makeTestSiteContext(workspace, workspace, "test"),
    );

    expect(result.exitCode).toBe(0);
    const data = result.data as Record<string, unknown>;
    expect(data.snapshotsCreated).toBe(0);
    expect(data.warnings).toContain(
      "External mode for pair EUR/UAH requires RATE_FETCHER_SUPABASE_URL and RATE_FETCHER_SUPABASE_KEY env vars (RFC-0744)",
    );
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("external mode dev skip produces warning", async () => {
  const workspace = makeTmpWorkspace();
  try {
    writeFileSync(
      join(workspace, "src", "content", "business-profile", "business.md"),
      makeBusinessContent(),
    );
    writeFileSync(
      join(workspace, "src", "content", "business-profile", "rate-policy-eur-uah.md"),
      makeRatePolicyContent(),
    );

    const { runRateSnapshotResolve } = await import("../rate-snapshot-resolve.ts");

    const result = await runRateSnapshotResolve(
      { flags: { system: "test", dev: true }, args: [] } as never,
      makeTestSiteContext(workspace, workspace, "test"),
    );

    expect(result.exitCode).toBe(0);
    const data = result.data as Record<string, unknown>;
    expect(data.snapshotsCreated).toBe(0);
    expect(data.warnings).toContain("External mode for pair EUR/UAH skipped in dev mode");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
