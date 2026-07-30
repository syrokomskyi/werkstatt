/*
<MODULE_CONTRACT>
  <purpose>
    RFC-0376: fixture coverage for yaml.contract.lint — proves
    YAML-CONTRACT-01 fires when a non-whitelisted .json file exists (red),
    YAML-CONTRACT-05 fires when a .yaml file contains JSON content (red),
    and passes when only whitelisted .json files and proper .yaml files exist (green).
  </purpose>
  <keywords>RFC-0376, yaml.contract.lint, YAML-CONTRACT-01, YAML-CONTRACT-05, fixtures</keywords>
  <responsibilities>
    <item>Red: non-whitelisted .json file -> exitCode 1.</item>
    <item>Red: .yaml file with JSON content -> exitCode 1.</item>
    <item>Green: only whitelisted .json files and proper .yaml files -> exitCode 0.</item>
  </responsibilities>
</MODULE_CONTRACT>
<MODULE_MAP>
  <entry key="tests">Vitest red/green cases for runYamlContractLint.</entry>
</MODULE_MAP>
<CHANGE_SUMMARY>
  <item>RFC-0376: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/site-kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";
import { runYamlContractLint } from "../yaml-contract-lint.ts";

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

const WHITELIST_CONTENT = `
toolMandatory:
  - "package.json"
  - "tsconfig.json"
  - "tsconfig.*.json"
  - "packages/*/tsconfig.json"
  - "apps/*/tsconfig.json"
  - "packages/*/package.json"
  - "apps/*/package.json"
  - "pnpm-workspace.yaml"
  - "packages/*/package.json"
publicApi:
  - "apps/*/public/.well-known/*.json"
  - "apps/*/public/api/**/*.json"
  - "apps/*/public/manifest.webmanifest"
`;

describe("yaml.contract.lint (RFC-0376)", () => {
  it("red: reports YAML-CONTRACT-01 when a non-whitelisted .json file exists", async () => {
    const root = await mkdtemp(join(tmpdir(), "yaml-contract-red-"));
    try {
      await writeFile(join(root, "yaml-contract.whitelist.yaml"), WHITELIST_CONTENT, "utf8");
      await writeFile(join(root, "rogue-config.json"), "{}", "utf8");

      const result = await runYamlContractLint(input, ctx(root));
      expect(result.exitCode).toBe(1);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("red: reports YAML-CONTRACT-05 when a .yaml file contains JSON content", async () => {
    const root = await mkdtemp(join(tmpdir(), "yaml-contract-json-content-"));
    try {
      await writeFile(join(root, "yaml-contract.whitelist.yaml"), WHITELIST_CONTENT, "utf8");
      await writeFile(join(root, "service.config.yaml"), '{\n  "id": "test"\n}\n', "utf8");

      const result = await runYamlContractLint(input, ctx(root));
      expect(result.exitCode).toBe(1);
      const data = result.data as { diagnostics: Array<{ ruleId: string }> };
      expect(data.diagnostics.some((d) => d.ruleId === "YAML-CONTRACT-05")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: passes when only whitelisted .json files and proper .yaml files exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "yaml-contract-green-"));
    try {
      await writeFile(join(root, "yaml-contract.whitelist.yaml"), WHITELIST_CONTENT, "utf8");
      await writeFile(join(root, "package.json"), "{}", "utf8");
      await mkdir(join(root, "packages", "test-pkg"), { recursive: true });
      await writeFile(join(root, "packages", "test-pkg", "package.json"), "{}", "utf8");
      await writeFile(join(root, "proper.yaml"), "id: test\nkind: worker\n", "utf8");

      const result = await runYamlContractLint(input, ctx(root));
      expect(result.exitCode).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
