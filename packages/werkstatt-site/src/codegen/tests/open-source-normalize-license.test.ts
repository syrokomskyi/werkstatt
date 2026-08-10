import { test, expect } from "vitest";
import {
  normalizeLicense,
  buildRegistryData,
  type ClassifiedDependency,
  type OpenSourceLabels,
} from "../open-source-page.js";

/*
<MODULE_CONTRACT>
<purpose>
  Verify RFC-0793: SPDX license normalization fixes in open-source-page generator.
  Tests parentheses stripping, Apache2 alias, Python-2.0 dead alias removal,
  and Unknown license filtering from licenseDistribution.
</purpose>
<responsibilities>
  <item>Assert parenthesized OR expressions normalize to first valid SPDX ID.</item>
  <item>Assert parenthesized AND expressions normalize to the joined SPDX IDs.</item>
  <item>Assert Apache2 alias resolves to Apache-2.0.</item>
  <item>Assert Python-2.0 is NOT aliased to PSF-2.0 (dead alias removed).</item>
  <item>Assert empty license string returns unknown status.</item>
  <item>Assert direct SPDX IDs and existing aliases still work (regression).</item>
</responsibilities>
<non-goals>
  <item>Do not test buildRegistryData output — that requires constructing full ClassifiedDependency fixtures and is covered by integration tests.</item>
  <item>Do not test the full pnpm-licenses pipeline.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0793: initial test suite for SPDX license normalization fixes.</item>
</CHANGE_SUMMARY>
*/

test("parenthesized OR expression normalizes to first valid SPDX ID", () => {
  const result = normalizeLicense("(MIT OR CC0-1.0)");
  expect(result.status).toBe("verified");
  expect(result.spdxId).toBe("MIT");
});

test("parenthesized OR expression with alias resolves via alias", () => {
  const result = normalizeLicense("(MIT OR Apache2)");
  expect(result.status).toBe("verified");
  expect(result.spdxId).toBe("MIT");
});

test("parenthesized OR expression where first part is alias-only", () => {
  const result = normalizeLicense("(Apache2 OR MIT)");
  expect(result.status).toBe("normalized");
  expect(result.spdxId).toBe("Apache-2.0");
});

test("parenthesized AND expression normalizes to joined SPDX IDs", () => {
  const result = normalizeLicense("(MIT AND Zlib)");
  expect(result.status).toBe("verified");
  expect(result.spdxId).toBe("MIT AND Zlib");
});

test("non-parenthesized OR expression still works (regression)", () => {
  const result = normalizeLicense("MIT OR Apache-2.0");
  expect(result.status).toBe("verified");
  expect(result.spdxId).toBe("MIT");
});

test("non-parenthesized AND expression still works (regression)", () => {
  const result = normalizeLicense("MIT AND Zlib");
  expect(result.status).toBe("verified");
  expect(result.spdxId).toBe("MIT AND Zlib");
});

test("Apache2 alias resolves to Apache-2.0", () => {
  const result = normalizeLicense("Apache2");
  expect(result.status).toBe("normalized");
  expect(result.spdxId).toBe("Apache-2.0");
});

test("Python-2.0 is NOT aliased to PSF-2.0 (dead alias removed)", () => {
  const result = normalizeLicense("Python-2.0");
  expect(result.status).toBe("verified");
  expect(result.spdxId).toBe("Python-2.0");
});

test("empty license string returns unknown status", () => {
  const result = normalizeLicense("");
  expect(result.status).toBe("unknown");
  expect(result.spdxId).toBeNull();
});

test("direct SPDX ID still works (regression)", () => {
  const result = normalizeLicense("MIT");
  expect(result.status).toBe("verified");
  expect(result.spdxId).toBe("MIT");
});

test("existing alias still works (regression)", () => {
  const result = normalizeLicense("Apache 2.0");
  expect(result.status).toBe("normalized");
  expect(result.spdxId).toBe("Apache-2.0");
});

test("case-insensitive alias lookup still works (regression)", () => {
  const result = normalizeLicense("apache2");
  expect(result.status).toBe("normalized");
  expect(result.spdxId).toBe("Apache-2.0");
});

test("unknown license string returns unknown status", () => {
  const result = normalizeLicense("Some-Fake-License-XYZ");
  expect(result.status).toBe("unknown");
  expect(result.spdxId).toBeNull();
});

test("OR expression with no valid SPDX IDs returns unknown", () => {
  const result = normalizeLicense("(FakeLicenseA OR FakeLicenseB)");
  expect(result.status).toBe("unknown");
  expect(result.spdxId).toBeNull();
});

test("AND expression with one invalid part returns unknown", () => {
  const result = normalizeLicense("(MIT AND FakeLicense)");
  expect(result.status).toBe("unknown");
  expect(result.spdxId).toBeNull();
});

const stubLabels: OpenSourceLabels = {
  heading: "Open Source",
  leadText: "Lead",
  summaryHeading: "Summary",
  componentsTotalLabel: "Total",
  directDependenciesLabel: "Direct",
  transitiveDependenciesLabel: "Transitive",
  licensesTotalLabel: "Licenses",
  componentsWithNoticeLabel: "Notices",
  licenseDistributionHeading: "Distribution",
  deploymentMetadataHeading: "Metadata",
  deploymentIdLabel: "ID",
  buildTimestampLabel: "Built",
  commitShaLabel: "SHA",
  scopeHeading: "Scope",
  scopeIncludedLabel: "Included",
  scopeIncludedText: "Included text",
  scopeExcludedLabel: "Excluded",
  scopeExcludedText: "Excluded text",
  downloadsHeading: "Downloads",
  noticeFileLabel: "Notices",
  licenseFileLabel: "Licenses",
  sbomFileLabel: "SBOM",
  componentTableHeading: "Components",
  processNoteText: "Note",
};

const mitDep: ClassifiedDependency = {
  name: "mit-pkg",
  version: "1.0.0",
  license: "MIT",
  normalizedLicense: { status: "verified", spdxId: "MIT" },
  scope: "runtime",
  relationship: "direct",
};

const unknownDep: ClassifiedDependency = {
  name: "unknown-pkg",
  version: "2.0.0",
  license: "Some-Fake-License",
  normalizedLicense: { status: "unknown", spdxId: null },
  scope: "runtime",
  relationship: "direct",
};

function parseRegistryJson(json: string): {
  summary: { licenseDistribution: { license: string }[]; componentsTotal: number };
  components: { name: string }[];
} {
  const jsonStart = json.indexOf("{");
  return JSON.parse(json.slice(jsonStart));
}

test("buildRegistryData excludes unknown licenses from licenseDistribution", () => {
  const json = buildRegistryData([mitDep, unknownDep], stubLabels, "en");
  const data = parseRegistryJson(json);
  const licenses = data.summary.licenseDistribution.map((d) => d.license);
  expect(licenses).not.toContain("UNKNOWN");
  expect(licenses).toEqual(["MIT"]);
});

test("buildRegistryData includes unknown-license packages in components array", () => {
  const json = buildRegistryData([mitDep, unknownDep], stubLabels, "en");
  const data = parseRegistryJson(json);
  const componentNames = data.components.map((c) => c.name);
  expect(componentNames).toContain("unknown-pkg");
  expect(componentNames).toContain("mit-pkg");
});

test("buildRegistryData componentsTotal counts all public deps including unknown", () => {
  const json = buildRegistryData([mitDep, unknownDep], stubLabels, "en");
  const data = parseRegistryJson(json);
  expect(data.summary.componentsTotal).toBe(2);
});
