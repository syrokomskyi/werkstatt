import { describe, it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPropsContractValidate, validateExampleAgainstSchema } from "../props-contract.ts";
import { runPropsTypesGenerate } from "@warpgogol/werkstatt-site/codegen";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0262: fixture tests for props.contract.validate — PROPS-01 (missing /
    hand-edited / stale generated types file) and PROPS-02 (manifest example
    violating its own propsSchema).
  </purpose>
</MODULE_CONTRACT>
*/

const logger = {
  section() {},
  info() {},
  warn() {},
  error() {},
  success() {},
  getEvents() {
    return [];
  },
};

const input = { argv: [], flags: {} } as unknown as KernelCommandInput;

function ctx(root: string): KernelRuntimeContext {
  return {
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;
}

const MANIFEST = `id: sample-section
uniName: sample-section
layer: section
semanticId: sample
archetype: sample
cosmicName: Europa
role: approach
version: "1.0.0"
intent:
  - explain-approach
industryFit: []
contentSchemaKey: sample-section
contentTypesPath: "./sample-section.types.generated.ts"
propsSchema:
  type: object
  additionalProperties: false
  required:
    - title
  properties:
    title:
      type: string
`;

async function fixtureWorkspace(manifestYaml: string): Promise<{ root: string; dir: string }> {
  const root = await mkdtemp(join(tmpdir(), "props-contract-"));
  const dir = join(root, "packages", "werkstatt-site", "src", "domain", "ui", "src", "sections", "sample-section");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "sample-section.manifest.yaml"), manifestYaml, "utf8");
  return { root, dir };
}

describe("props.contract.validate (RFC-0262)", () => {
  it("PROPS-01: fails when the generated types file is missing", async () => {
    const { root } = await fixtureWorkspace(MANIFEST);
    const result = await runPropsContractValidate(input, ctx(root));
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("PROPS-01");
    await rm(root, { recursive: true, force: true });
  });

  it("PROPS-01: fails when the generated file has no GENERATED_MARKER (hand-edited)", async () => {
    const { root, dir } = await fixtureWorkspace(MANIFEST);
    await writeFile(
      join(dir, "sample-section.types.generated.ts"),
      "export interface SampleSectionContent { title: string; }\n",
      "utf8",
    );
    const result = await runPropsContractValidate(input, ctx(root));
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("PROPS-01");
    await rm(root, { recursive: true, force: true });
  });

  it("PROPS-01: fails when the declared sourceHash is stale", async () => {
    const { root, dir } = await fixtureWorkspace(MANIFEST);
    await writeFile(
      join(dir, "sample-section.types.generated.ts"),
      [
        "// GENERATED. Do not change this line unless the file contains project specific changes.",
        "// sourceHash: 0000000000000000000000000000000000000000000000000000000000000000",
        "export interface SampleSectionContent { title: string; }",
        "",
      ].join("\n"),
      "utf8",
    );
    const result = await runPropsContractValidate(input, ctx(root));
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("PROPS-01");
    await rm(root, { recursive: true, force: true });
  });

  it("PROPS-02: fails when the manifest example violates its own propsSchema", async () => {
    const manifestWithBadExample = `${MANIFEST}example:\n  notTitle: "oops"\n`;
    const { root } = await fixtureWorkspace(manifestWithBadExample);
    const result = await runPropsContractValidate(input, ctx(root));
    expect(result.exitCode).toBe(1);
    const ruleIds = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.map(
      (d) => d.ruleId,
    );
    expect(ruleIds).toContain("PROPS-02");
    await rm(root, { recursive: true, force: true });
  });

  it("passes when the generated file is fresh, marker-carrying, and the example (if any) matches its schema", async () => {
    const manifestWithGoodExample = `${MANIFEST}example:\n  title: "Hello"\n`;
    const { root } = await fixtureWorkspace(manifestWithGoodExample);
    // Produce a real, correctly-hashed generated file the same way props.types.generate would.
    await runPropsTypesGenerate(input, ctx(root));

    const result = await runPropsContractValidate(input, ctx(root));
    expect(result.exitCode ?? 0).toBe(0);
    await rm(root, { recursive: true, force: true });
  });
});

describe("validateExampleAgainstSchema (RFC-0262)", () => {
  it("passes a matching example", () => {
    const errors = validateExampleAgainstSchema(
      { title: "Hello" },
      {
        type: "object",
        additionalProperties: false,
        required: ["title"],
        properties: { title: { type: "string" } },
      },
      "example",
    );
    expect(errors).toEqual([]);
  });

  it("flags a missing required property and an unknown property", () => {
    const errors = validateExampleAgainstSchema(
      { extra: 1 },
      {
        type: "object",
        additionalProperties: false,
        required: ["title"],
        properties: { title: { type: "string" } },
      },
      "example",
    );
    expect(errors.some((e) => e.includes("required"))).toBe(true);
    expect(errors.some((e) => e.includes("unknown property"))).toBe(true);
  });
});
