/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0493: fixture coverage for yaml.parse.validate — proves
    YAML-PARSE-01 fires when a .yaml file has a syntax error (red),
    YAML-PARSE-02 fires when a .yaml file has duplicate mapping keys (red),
    passes when a valid .yaml file exists (green),
    and passes when an empty .yaml file exists (edge case).
  </purpose>
  <keywords>RFC-0493, yaml.parse.validate, YAML-PARSE-01, YAML-PARSE-02, fixtures</keywords>
  <responsibilities>
    <item>Red: .yaml file with syntax error -> YAML-PARSE-01, exitCode 1.</item>
    <item>Red: .yaml file with duplicate mapping key -> YAML-PARSE-02, exitCode 1.</item>
    <item>Green: valid .yaml file -> exitCode 0.</item>
    <item>Edge: empty .yaml file -> exitCode 0.</item>
  </responsibilities>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">Vitest red/green/edge cases for runYamlParseValidate.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0493: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/site-kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { runYamlParseValidate } from "../yaml-parse-validate.ts";

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
    io: createDefaultIO().io,
  } as unknown as KernelRuntimeContext;
}

describe("yaml.parse.validate (RFC-0493)", () => {
  it("red: reports YAML-PARSE-01 when a .yaml file has a syntax error", async () => {
    const root = await mkdtemp(join(tmpdir(), "yaml-parse-syntax-"));
    try {
      await writeFile(
        join(root, "broken.yaml"),
        "id: test\n  bad: indentation\n    extra: indent\n",
        "utf8",
      );

      const result = await runYamlParseValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      const data = result.data as { diagnostics: Array<{ ruleId: string }> };
      expect(data.diagnostics.some((d) => d.ruleId === "YAML-PARSE-01")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("red: reports YAML-PARSE-02 when a .yaml file has duplicate mapping keys", async () => {
    const root = await mkdtemp(join(tmpdir(), "yaml-parse-dup-"));
    try {
      await writeFile(join(root, "duplicates.yaml"), "key: a\nkey: b\n", "utf8");

      const result = await runYamlParseValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      const data = result.data as { diagnostics: Array<{ ruleId: string }> };
      expect(data.diagnostics.some((d) => d.ruleId === "YAML-PARSE-02")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: passes when a valid .yaml file exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "yaml-parse-green-"));
    try {
      await writeFile(join(root, "valid.yaml"), "id: test\nkind: worker\nenabled: true\n", "utf8");

      const result = await runYamlParseValidate(input, ctx(root));
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("edge: passes when an empty .yaml file exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "yaml-parse-empty-"));
    try {
      await writeFile(join(root, "empty.yaml"), "", "utf8");

      const result = await runYamlParseValidate(input, ctx(root));
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
