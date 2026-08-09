import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "vitest";
import {
  emitType,
  jsonSchemaToInterface,
  propsSchemaSourceHash,
  discoverManifestPropsInfo,
  runPropsTypesGenerate,
} from "../props-types.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

/*
<MODULE_CONTRACT>
<purpose>
  RFC-0262: verify the pure JSON-Schema -> TypeScript emitter (deterministic,
  byte-stable) and the props.types.generate command (discovery, idempotent
  write, manifest contentTypesPath surgical update).
</purpose>
<non-goals>
  <item>Do not test props.contract.validate (PROPS-01/02) — see site-kernel-checks tests.</item>
  <item>Do not test the dev-time validateProps hook — see @warpgogol/werkstatt-site/share tests.</item>
</non-goals>
</MODULE_CONTRACT>
*/

test("emitType: primitives, enum, const, array, oneOf", () => {
  expect(emitType({ type: "string" })).toBe("string");
  expect(emitType({ type: "number" })).toBe("number");
  expect(emitType({ type: "boolean" })).toBe("boolean");
  expect(emitType({ enum: ["a", "b"] })).toBe('"a" | "b"');
  expect(emitType({ const: "fixed" })).toBe('"fixed"');
  expect(emitType({ type: "array", items: { type: "string" } })).toBe("string[]");
  expect(emitType({ oneOf: [{ type: "string" }, { type: "number" }] })).toBe("string | number");
});

test("jsonSchemaToInterface: object with required/optional fields is deterministic across two calls", () => {
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["title"],
    properties: {
      title: { type: "string" },
      count: { type: "number" },
    },
  };
  const first = jsonSchemaToInterface(schema, "SampleContent");
  const second = jsonSchemaToInterface(schema, "SampleContent");
  expect(first).toBe(second);
  expect(first).toMatch(/export interface SampleContent \{/);
  expect(first).toMatch(/\btitle: string;/);
  expect(first).toMatch(/\bcount\?: number;/);
});

test("propsSchemaSourceHash: identical schema in different key order hashes identically", () => {
  const a = { type: "object", properties: { x: { type: "string" }, y: { type: "number" } } };
  const b = { properties: { y: { type: "number" }, x: { type: "string" } }, type: "object" };
  expect(propsSchemaSourceHash(a)).toBe(propsSchemaSourceHash(b));
});

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

async function fixtureWorkspace(
  manifestYaml: string,
  layer: "sections" | "components",
  id: string,
): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "props-types-"));
  const dir = path.join(root, "packages", "werkstatt-site", "src", "domain", "ui", "src", layer, id);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, `${id}.manifest.yaml`), manifestYaml, "utf8");
  return root;
}

const SAMPLE_MANIFEST = `id: sample-section
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
contentTypesPath: "./sample-section.types.ts"
propsSchema:
  type: object
  additionalProperties: false
  required:
    - title
  properties:
    title:
      type: string
`;

test("discoverManifestPropsInfo: resolves a local propsSchema manifest", async () => {
  const root = await fixtureWorkspace(SAMPLE_MANIFEST, "sections", "sample-section");
  const infos = await discoverManifestPropsInfo(root);
  expect(infos.length).toBe(1);
  expect(infos[0]?.id).toBe("sample-section");
  expect(infos[0]?.interfaceName).toBe("SampleSectionContent");
  expect(infos[0]?.resolvedSchema).toBeTruthy();
  await fs.rm(root, { recursive: true, force: true });
});

test("runPropsTypesGenerate: writes a generated file, updates contentTypesPath, and second run is a no-op", async () => {
  const root = await fixtureWorkspace(SAMPLE_MANIFEST, "sections", "sample-section");
  const input = { argv: [], flags: {} } as unknown as KernelCommandInput;
  const context = {
    workspaceRoot: root,
    siteExplicit: false,
    logger,
    dryRun: false,
    outputFormat: "json",
  } as unknown as KernelRuntimeContext;

  const first = await runPropsTypesGenerate(input, context);
  expect(first.data?.written.length).toBe(1);
  expect(first.data?.unchanged.length).toBe(0);

  const generatedPath = path.join(
    root,
    "packages",
    "ui",
    "src",
    "sections",
    "sample-section",
    "sample-section.types.generated.ts",
  );
  const generated = await fs.readFile(generatedPath, "utf8");
  expect(generated).toMatch(/GENERATED\. Do not change this line/);
  expect(generated).toMatch(/sourceHash: [0-9a-f]{64}/);
  expect(generated).toMatch(/export interface SampleSectionContent \{/);
  expect(generated).toMatch(/title: string;/);

  const manifestRaw = await fs.readFile(
    path.join(
      root,
      "packages",
      "ui",
      "src",
      "sections",
      "sample-section",
      "sample-section.manifest.yaml",
    ),
    "utf8",
  );
  expect(manifestRaw).toMatch(/contentTypesPath: "\.\/sample-section\.types\.generated\.ts"/);

  const second = await runPropsTypesGenerate(input, context);
  expect(second.data?.written.length).toBe(0);
  expect(second.data?.unchanged.length).toBe(1);

  await fs.rm(root, { recursive: true, force: true });
});
