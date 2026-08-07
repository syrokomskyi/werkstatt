/*
<MODULE_CONTRACT>
<purpose>Unit tests for loadTargetCurrencies (RFC-0743) — verifies currency extraction from CurrencyPricingPolicy and error propagation.</purpose>
<non-goals>
  <item>Does not test compilePbpProfile itself — that is covered by compiler-pipeline.test.ts.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Established by review fix — tests for loadTargetCurrencies error handling and policy extraction.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

vi.mock("astro:content", () => ({
  getEntry: vi.fn(),
  getCollection: vi.fn(),
}));

import { loadTargetCurrencies } from "../semantic-profile.js";

let testDir: string;

beforeEach(() => {
  testDir = join(
    tmpdir(),
    `pbp-load-currencies-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

function writeEntity(locale: string, filename: string, data: Record<string, unknown>): void {
  const dir = join(testDir, locale);
  mkdirSync(dir, { recursive: true });
  const yaml = Object.entries(data)
    .map(([k, v]) => `${k}: ${JSON.stringify(v)}`)
    .join("\n");
  writeFileSync(join(dir, filename), `---\n${yaml}\n---\n`);
}

describe("loadTargetCurrencies", () => {
  it("returns currencies from CurrencyPricingPolicy", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://example.com/business",
      type: "business",
      status: "published",
      name: "Test Business",
    });
    writeEntity("de", "currency-pricing-policy.md", {
      schema: "pbp/currency-pricing-policy@1",
      id: "https://example.com/policy/currency-pricing",
      type: "currency-pricing-policy",
      status: "published",
      name: "Currency Pricing Policy",
      businessRef: { ref: "https://example.com/business" },
      baseCurrency: "EUR",
      targetCurrencies: {
        uah: {
          currency: "UAH",
          strategy: "derived",
          ratePolicyRef: { ref: "https://example.com/policy/rate-eur-uah" },
          currentUses: {
            presentation: true,
            aiAnswers: true,
            quote: false,
            contract: false,
            invoice: false,
            settlement: false,
          },
        },
        usd: {
          currency: "USD",
          strategy: "derived",
          ratePolicyRef: { ref: "https://example.com/policy/rate-eur-usd" },
          currentUses: {
            presentation: true,
            aiAnswers: true,
            quote: false,
            contract: false,
            invoice: false,
            settlement: false,
          },
        },
      },
    });

    const result = await loadTargetCurrencies(testDir, "de");

    expect(result).toHaveLength(2);
    const codes = result.map((c) => c.code).sort();
    expect(codes).toEqual(["UAH", "USD"]);
  });

  it("returns empty array when no CurrencyPricingPolicy exists", async () => {
    writeEntity("de", "business.md", {
      schema: "pbp/business@1",
      id: "https://example.com/business",
      type: "business",
      status: "published",
      name: "Test Business",
    });

    const result = await loadTargetCurrencies(testDir, "de");

    expect(result).toEqual([]);
  });

  it("throws on invalid source directory", async () => {
    await expect(
      loadTargetCurrencies("/nonexistent/path/that/does/not/exist", "de"),
    ).rejects.toThrow();
  });
});
