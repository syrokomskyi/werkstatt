/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0741: tests for multi-currency pipeline integration — verifies rate-snapshot.resolve,
    currency-pricing.compile, and derived-prices.materialize are in both build-prepare pipelines
    after entitlements.resolve and before surface.generate.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0741: initial multi-currency pipeline membership and entitlement catalog tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import {
  SITES_BUILD_PREPARE_PIPELINE,
  SITES_BUILD_PREPARE_DEV_PIPELINE,
} from "../pipelines/build-prepare.ts";
import { ENTITLED_FEATURES, STRIPE_FEATURE_LOOKUP_MAP } from "@warpgogol/werkstatt-site/share/entitlement";

const mainCommands = SITES_BUILD_PREPARE_PIPELINE.map((s) => s.command);
const devCommands = SITES_BUILD_PREPARE_DEV_PIPELINE.map((s) => s.command);

// Entitlement catalog tests

test("multi-currency is in ENTITLED_FEATURES", () => {
  expect(ENTITLED_FEATURES).toContain("multi-currency");
});

test("feature_multi_currency maps to multi-currency in STRIPE_FEATURE_LOOKUP_MAP", () => {
  expect(STRIPE_FEATURE_LOOKUP_MAP["feature_multi_currency"]).toBe("multi-currency");
});

// Pipeline membership tests — main pipeline

test("rate-snapshot.resolve is in SITES_BUILD_PREPARE_PIPELINE", () => {
  expect(mainCommands).toContain("rate-snapshot.resolve");
});

test("currency-pricing.compile is in SITES_BUILD_PREPARE_PIPELINE", () => {
  expect(mainCommands).toContain("currency-pricing.compile");
});

test("derived-prices.materialize is in SITES_BUILD_PREPARE_PIPELINE", () => {
  expect(mainCommands).toContain("derived-prices.materialize");
});

test("multi-currency steps appear after entitlements.resolve in main pipeline", () => {
  const entitlementsIdx = mainCommands.indexOf("entitlements.resolve");
  const rateSnapshotIdx = mainCommands.indexOf("rate-snapshot.resolve");
  const currencyPricingIdx = mainCommands.indexOf("currency-pricing.compile");
  const derivedPricesIdx = mainCommands.indexOf("derived-prices.materialize");

  expect(entitlementsIdx).toBeGreaterThan(-1);
  expect(rateSnapshotIdx).toBeGreaterThan(-1);
  expect(currencyPricingIdx).toBeGreaterThan(-1);
  expect(derivedPricesIdx).toBeGreaterThan(-1);

  expect(rateSnapshotIdx).toBeGreaterThan(entitlementsIdx);
  expect(currencyPricingIdx).toBeGreaterThan(rateSnapshotIdx);
  expect(derivedPricesIdx).toBeGreaterThan(currencyPricingIdx);
});

test("multi-currency steps appear before surface.generate in main pipeline", () => {
  const derivedPricesIdx = mainCommands.indexOf("derived-prices.materialize");
  const surfaceIdx = mainCommands.indexOf("surface.generate");

  expect(derivedPricesIdx).toBeGreaterThan(-1);
  expect(surfaceIdx).toBeGreaterThan(-1);
  expect(derivedPricesIdx).toBeLessThan(surfaceIdx);
});

// Pipeline membership tests — dev pipeline

test("rate-snapshot.resolve is in SITES_BUILD_PREPARE_DEV_PIPELINE", () => {
  expect(devCommands).toContain("rate-snapshot.resolve");
});

test("currency-pricing.compile is in SITES_BUILD_PREPARE_DEV_PIPELINE", () => {
  expect(devCommands).toContain("currency-pricing.compile");
});

test("derived-prices.materialize is in SITES_BUILD_PREPARE_DEV_PIPELINE", () => {
  expect(devCommands).toContain("derived-prices.materialize");
});

test("multi-currency steps appear after entitlements.resolve in dev pipeline", () => {
  const entitlementsIdx = devCommands.indexOf("entitlements.resolve");
  const rateSnapshotIdx = devCommands.indexOf("rate-snapshot.resolve");
  const currencyPricingIdx = devCommands.indexOf("currency-pricing.compile");
  const derivedPricesIdx = devCommands.indexOf("derived-prices.materialize");

  expect(entitlementsIdx).toBeGreaterThan(-1);
  expect(rateSnapshotIdx).toBeGreaterThan(entitlementsIdx);
  expect(currencyPricingIdx).toBeGreaterThan(rateSnapshotIdx);
  expect(derivedPricesIdx).toBeGreaterThan(currencyPricingIdx);
});
