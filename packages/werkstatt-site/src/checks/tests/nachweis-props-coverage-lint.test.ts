/*
<MODULE_CONTRACT>
<purpose>
Tests for nachweis.props.coverage.lint — NACHWEIS-PROPS-01 detects required
component props that resolveNachweisEvidenceProps does not assign.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { test, expect } from "vitest";
import { parseVariantInterfaces, extractResolverProps } from "../nachweis-props-coverage-lint.ts";

test("parseVariantInterfaces extracts attestation variant with required fields", () => {
  const source = `
interface NachweisAttestationDetailContent {
  variant: "attestation";
  slug: string;
  title: string;
  result: string;
  scope?: string;
  status: "draft" | "preview" | "published" | "withdrawn";
  labels: NachweisDetailLabels;
}
`;
  const variants = parseVariantInterfaces(source);
  expect(variants).toHaveLength(1);
  expect(variants[0].variant).toBe("attestation");
  expect(variants[0].requiredFields).toContain("slug");
  expect(variants[0].requiredFields).toContain("title");
  expect(variants[0].requiredFields).toContain("result");
  expect(variants[0].requiredFields).toContain("status");
  expect(variants[0].requiredFields).toContain("labels");
  expect(variants[0].requiredFields).not.toContain("scope");
});

test("parseVariantInterfaces extracts technical-assessment variant with required fields", () => {
  const source = `
interface NachweisTechnicalAssessmentDetailContent {
  variant: "technical-assessment";
  slug: string;
  title: string;
  provider: { id: string; name: string };
  tool: { name: string; version?: string };
  executionMode: "operator-run" | "provider-run";
  overall?: { score?: number; level?: string };
  dimensions: NachweisAssessmentDimension[];
  limitation: string;
  labels: NachweisDetailLabels;
}
`;
  const variants = parseVariantInterfaces(source);
  expect(variants).toHaveLength(1);
  expect(variants[0].variant).toBe("technical-assessment");
  expect(variants[0].requiredFields).toContain("provider");
  expect(variants[0].requiredFields).toContain("tool");
  expect(variants[0].requiredFields).toContain("executionMode");
  expect(variants[0].requiredFields).toContain("dimensions");
  expect(variants[0].requiredFields).toContain("limitation");
  expect(variants[0].requiredFields).not.toContain("overall");
});

test("parseVariantInterfaces handles multi-line nested types", () => {
  const source = `
interface NachweisTechnicalAssessmentDetailContent {
  variant: "technical-assessment";
  methodology: {
    id: string;
    version: string;
    runCount: number;
    aggregation: "provider" | "median" | "none";
  };
  dimensions: NachweisAssessmentDimension[];
  labels: NachweisDetailLabels;
}
`;
  const variants = parseVariantInterfaces(source);
  expect(variants).toHaveLength(1);
  expect(variants[0].requiredFields).toContain("methodology");
  expect(variants[0].requiredFields).toContain("dimensions");
  expect(variants[0].requiredFields).toContain("labels");
  // Nested fields inside methodology should NOT be top-level required fields
  expect(variants[0].requiredFields).not.toContain("id");
  expect(variants[0].requiredFields).not.toContain("version");
  expect(variants[0].requiredFields).not.toContain("runCount");
});

test("parseVariantInterfaces ignores interfaces without variant discriminant", () => {
  const source = `
interface NachweisDetailLabels {
  pdfDocument: string;
  pdfNotSupported: string;
}
`;
  const variants = parseVariantInterfaces(source);
  expect(variants).toHaveLength(0);
});

test("extractResolverProps finds props assignments in function body", () => {
  const source = `
async function resolveNachweisEvidenceProps(
  slug: string,
  lang: string,
  defaultLang: string,
): Promise<Record<string, unknown>> {
  const props: Record<string, unknown> = {};
  props.variant = "attestation";
  props.title = data.name;
  props.status = data.status;
  if (assessment && kind === "technical-assessment") {
    props.provider = { id: "test" };
    props.tool = { name: "test" };
  }
  return props;
}
`;
  const propsAssigned = extractResolverProps(source);
  expect(propsAssigned.has("variant")).toBe(true);
  expect(propsAssigned.has("title")).toBe(true);
  expect(propsAssigned.has("status")).toBe(true);
  expect(propsAssigned.has("provider")).toBe(true);
  expect(propsAssigned.has("tool")).toBe(true);
});

test("extractResolverProps returns empty set when function not found", () => {
  const source = `
function someOtherFunction() {
  props.foo = "bar";
}
`;
  const propsAssigned = extractResolverProps(source);
  expect(propsAssigned.size).toBe(0);
});
