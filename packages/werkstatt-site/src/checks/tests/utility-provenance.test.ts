/*
<MODULE_CONTRACT>
  <purpose>RFC-0916: unit tests for utility provenance validator.</purpose>
  <keywords>RFC-0916, utility, provenance, validator, DNA-88</keywords>
  <responsibilities>
    <item>Test UTIL-PROV-01: forbidden import detection outside canonical path.</item>
    <item>Test UTIL-PROV-02: function name detection outside canonical path.</item>
    <item>Test UTIL-PROV-03: pattern detection outside canonical path.</item>
    <item>Test allowlist and canonical path exemptions.</item>
    <item>Test --mode warning vs --mode fail behavior.</item>
    <item>Test UTIL-REG-01 and UTIL-REG-02 registry error cases.</item>
  </responsibilities>
</MODULE_CONTRACT>
<CHANGE_SUMMARY><item>RFC-0916: initial unit tests for utility provenance validator.</item></CHANGE_SUMMARY>
*/

import { test, expect, describe, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { runUtilityProvenanceValidate } from "../utility-provenance.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

function makeContext(workspaceRoot: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    io: {
      readFile: async (p: string) => {
        const { readFile } = await import("node:fs/promises");
        return readFile(p, "utf-8");
      },
      writeFile: async () => {},
      readdir: async (p: string) => {
        const { readdir } = await import("node:fs/promises");
        return readdir(p);
      },
      stat: async (p: string) => {
        const { stat } = await import("node:fs/promises");
        return stat(p);
      },
      exists: async (p: string) => {
        const { access } = await import("node:fs/promises");
        try {
          await access(p);
          return true;
        } catch {
          return false;
        }
      },
    },
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as KernelRuntimeContext;
}

function makeInput(mode: string): KernelCommandInput {
  return {
    command: "utility.provenance.validate",
    flags: { mode },
    args: [],
    positional: [],
  } as unknown as KernelCommandInput;
}

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(process.cwd(), "tmp-util-prov-XXXX-"));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

const REGISTRY_YAML = `utilities:
  - id: slug
    canonicalPath: packages/werkstatt-shared/src/share/slug/
    forbiddenImports:
      - "@sindresorhus/slugify"
      - "cyrillic-to-translit-js"
      - "github-slugger"
    functionNames:
      - slugify
      - toSlug
      - makeSlug
      - createSlug
      - slugUrl
      - slugId
    patterns:
      - id: nkfd-diacritic-strip
        regex: "\\\\.normalize\\\\(.{0,5}NFKD.{0,5}\\\\)\\\\.replace"
        description: NFKD normalize + diacritic strip
    allowlist:
      - path: packages/werkstatt-shared/src/share/slug/
        reason: Canonical slug module
      - path: packages/werkstatt-shared/src/share/semantic/extract.ts
        reason: CHANGE_SUMMARY reference only
`;

function setupRegistry(workspaceRoot: string) {
  mkdirSync(join(workspaceRoot, "packages", "werkstatt-shared", "src", "share", "slug"), {
    recursive: true,
  });
  writeFileSync(
    join(workspaceRoot, "packages", "werkstatt-shared", "src", "share", "utility-registry.yaml"),
    REGISTRY_YAML,
  );
}

describe("utility.provenance.validate", () => {
  test("UTIL-PROV-01: forbidden import outside canonical path", async () => {
    setupRegistry(tmpDir);
    const filePath = join(tmpDir, "packages", "werkstatt-site", "src", "bad.ts");
    mkdirSync(join(tmpDir, "packages", "werkstatt-site", "src"), { recursive: true });
    writeFileSync(filePath, `import slugify from "@sindresorhus/slugify";\n`);
    const result = await runUtilityProvenanceValidate(makeInput("fail"), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "UTIL-PROV-01")).toBe(true);
  });

  test("UTIL-PROV-02: function name outside canonical path", async () => {
    setupRegistry(tmpDir);
    const filePath = join(tmpDir, "packages", "werkstatt-site", "src", "bad.ts");
    mkdirSync(join(tmpDir, "packages", "werkstatt-site", "src"), { recursive: true });
    writeFileSync(filePath, `function slugify(value: string): string { return value; }\n`);
    const result = await runUtilityProvenanceValidate(makeInput("fail"), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "UTIL-PROV-02")).toBe(true);
  });

  test("UTIL-PROV-03: pattern outside canonical path", async () => {
    setupRegistry(tmpDir);
    const filePath = join(tmpDir, "packages", "werkstatt-site", "src", "bad.ts");
    mkdirSync(join(tmpDir, "packages", "werkstatt-site", "src"), { recursive: true });
    writeFileSync(
      filePath,
      `function normalize(s: string) { return s.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); }\n`,
    );
    const result = await runUtilityProvenanceValidate(makeInput("fail"), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "UTIL-PROV-03")).toBe(true);
  });

  test("Allowlist: allowlisted file with forbidden import produces no violation", async () => {
    setupRegistry(tmpDir);
    const filePath = join(
      tmpDir,
      "packages",
      "werkstatt-shared",
      "src",
      "share",
      "semantic",
      "extract.ts",
    );
    mkdirSync(join(tmpDir, "packages", "werkstatt-shared", "src", "share", "semantic"), {
      recursive: true,
    });
    writeFileSync(filePath, `import slugify from "@sindresorhus/slugify";\n`);
    const result = await runUtilityProvenanceValidate(makeInput("fail"), makeContext(tmpDir));
    expect(result.exitCode).toBe(0);
  });

  test("Canonical path: file inside canonical path with forbidden import produces no violation", async () => {
    setupRegistry(tmpDir);
    const filePath = join(
      tmpDir,
      "packages",
      "werkstatt-shared",
      "src",
      "share",
      "slug",
      "strategies.ts",
    );
    writeFileSync(filePath, `import slugify from "@sindresorhus/slugify";\n`);
    const result = await runUtilityProvenanceValidate(makeInput("fail"), makeContext(tmpDir));
    expect(result.exitCode).toBe(0);
  });

  test("Clean file: no slug-related code produces no violation", async () => {
    setupRegistry(tmpDir);
    const filePath = join(tmpDir, "packages", "werkstatt-site", "src", "clean.ts");
    mkdirSync(join(tmpDir, "packages", "werkstatt-site", "src"), { recursive: true });
    writeFileSync(
      filePath,
      `export function add(a: number, b: number): number { return a + b; }\n`,
    );
    const result = await runUtilityProvenanceValidate(makeInput("fail"), makeContext(tmpDir));
    expect(result.exitCode).toBe(0);
  });

  test("--mode warning: violations have severity warning, exit 0", async () => {
    setupRegistry(tmpDir);
    const filePath = join(tmpDir, "packages", "werkstatt-site", "src", "bad.ts");
    mkdirSync(join(tmpDir, "packages", "werkstatt-site", "src"), { recursive: true });
    writeFileSync(filePath, `import slugify from "@sindresorhus/slugify";\n`);
    const result = await runUtilityProvenanceValidate(makeInput("warning"), makeContext(tmpDir));
    expect(result.exitCode).toBe(0);
    const warnings = result.data?.diagnostics?.filter((d) => d.severity === "warning") ?? [];
    expect(warnings.length).toBeGreaterThan(0);
  });

  test("--mode fail: violations have severity error, exit 1", async () => {
    setupRegistry(tmpDir);
    const filePath = join(tmpDir, "packages", "werkstatt-site", "src", "bad.ts");
    mkdirSync(join(tmpDir, "packages", "werkstatt-site", "src"), { recursive: true });
    writeFileSync(filePath, `import slugify from "@sindresorhus/slugify";\n`);
    const result = await runUtilityProvenanceValidate(makeInput("fail"), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    const errors = result.data?.diagnostics?.filter((d) => d.severity === "error") ?? [];
    expect(errors.length).toBeGreaterThan(0);
  });

  test("UTIL-REG-01: missing registry file produces error", async () => {
    mkdirSync(join(tmpDir, "packages", "werkstatt-site", "src"), { recursive: true });
    const result = await runUtilityProvenanceValidate(makeInput("fail"), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "UTIL-REG-01")).toBe(true);
  });

  test("UTIL-REG-02: invalid regex in registry produces error", async () => {
    mkdirSync(join(tmpDir, "packages", "werkstatt-shared", "src", "share", "slug"), {
      recursive: true,
    });
    const badYaml = `utilities:
  - id: slug
    canonicalPath: packages/werkstatt-shared/src/share/slug/
    forbiddenImports: []
    functionNames: []
    patterns:
      - id: bad-regex
        regex: "[invalid("
        description: Invalid regex
    allowlist: []
`;
    writeFileSync(
      join(tmpDir, "packages", "werkstatt-shared", "src", "share", "utility-registry.yaml"),
      badYaml,
    );
    const result = await runUtilityProvenanceValidate(makeInput("fail"), makeContext(tmpDir));
    expect(result.exitCode).toBe(1);
    expect(result.data?.diagnostics?.some((d) => d.ruleId === "UTIL-REG-02")).toBe(true);
  });
});
