/*
<MODULE_CONTRACT>
<purpose>
RFC-0783: tests for agent.api-catalog.generate and agent.api-catalog.validate.
Tests generate writes correct content, skip pattern removes stale file,
validate passes on valid file, fails on missing/invalid/divergent file.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0783: initial API Catalog handler tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { stringify as yamlStringify } from "yaml";
import {
  runAgentApiCatalogGenerate,
  runAgentApiCatalogValidate,
} from "../agent/agent-api-catalog.ts";
import { buildAgentSurfaceManifest } from "@warpgogol/werkstatt-site/share/agent";
import type {
  KernelCommandInput,
  KernelRuntimeContext,
  WorkspaceIO,
} from "@warpgogol/werkstatt/kernel";

const SYSTEM_MD_ENABLED = `---
cosmicStar: Vega
app: test-site
i18n:
  default: de
  languages:
    - de
agent:
  enabled: true
---
`;

const SYSTEM_MD_DISABLED = `---
cosmicStar: Vega
app: test-site
i18n:
  default: de
  languages:
    - de
agent:
  enabled: false
---
`;

function makeIO(): WorkspaceIO {
  return {
    readFile: (p: string) => fs.readFile(p, "utf-8"),
    readFileBytes: (p: string) => fs.readFile(p).then((b) => new Uint8Array(b)),
    exists: (p: string) => Promise.resolve(existsSync(p)),
    glob: () => Promise.resolve([]),
    readdir: () => Promise.resolve([]),
    writeFile: (p: string, c: string | Uint8Array) =>
      typeof c === "string" ? fs.writeFile(p, c, "utf-8") : fs.writeFile(p, c),
    mkdir: (p: string) => fs.mkdir(p, { recursive: true }).then(() => undefined),
    rm: (p: string) => fs.rm(p, { recursive: true, force: true }).then(() => undefined),
    exec: () => Promise.resolve({ exitCode: 0, stdout: "", stderr: "" }),
  };
}

function makeContext(workspaceRoot: string, appDir: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    site: { name: "test-site", directory: appDir },
    siteExplicit: true,
    commandName: "agent.api-catalog.generate",
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    dryRun: false,
    outputFormat: "json",
    io: makeIO(),
  } as unknown as KernelRuntimeContext;
}

function manifestYaml(overrides?: {
  mcp?: { url: string; protocolVersion: string } | null;
  knowledge?: { domain: string; url: string; schema: string }[];
}): string {
  const m = buildAgentSurfaceManifest({
    site: "test-site",
    baseUrl: "https://test.example",
    languages: { default: "de", supported: ["de"] },
    knowledge: overrides?.knowledge,
    mcp: overrides?.mcp,
  });
  const { contentHash: _ch, proof: _p, ...rest } = m;
  return yamlStringify({
    generatedMarker: "agent.manifest.generate",
    doNotEdit: true,
    ownerCommand: "agent.manifest.generate",
    regenerateCommand: "pnpm exec werkstatt run agent.manifest.generate",
    ...rest,
  });
}

let tmpDir: string;
let appDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "agc-test-"));
  appDir = path.join(tmpDir, "test-site");
  await fs.mkdir(path.join(appDir, "src", "content"), { recursive: true });
  await fs.mkdir(path.join(appDir, "public", ".well-known"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeSystemMd(content: string): Promise<void> {
  await fs.writeFile(path.join(appDir, "src", "content", "system.md"), content, "utf-8");
}

async function writeManifest(overrides?: {
  mcp?: { url: string; protocolVersion: string } | null;
  knowledge?: { domain: string; url: string; schema: string }[];
}): Promise<void> {
  await fs.writeFile(
    path.join(appDir, "src", "agent-surface.generated.yaml"),
    manifestYaml(overrides),
    "utf-8",
  );
}

function catalogPath(): string {
  return path.join(appDir, "public", ".well-known", "api-catalog");
}

const input: KernelCommandInput = { flags: {} } as unknown as KernelCommandInput;

test("generate: writes api-catalog with correct linkset", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest({
    knowledge: [
      { domain: "offer", url: "/api/agent/v1/offer.json", schema: "gogol.agent.knowledge/offer@1" },
    ],
    mcp: { url: "/api/agent/mcp", protocolVersion: "2025-06-18" },
  });

  const result = await runAgentApiCatalogGenerate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(0);
  expect(existsSync(catalogPath())).toBe(true);

  const raw = await fs.readFile(catalogPath(), "utf-8");
  const doc = JSON.parse(raw);
  expect(doc.linkset).toBeDefined();
  expect(Array.isArray(doc.linkset)).toBe(true);
  const entry = doc.linkset[0];
  expect(entry.anchor).toBe("https://test.example/");
  // Check all relations are present
  expect(entry["service-meta"][0].href).toBe("/.well-known/agent.json");
  expect(
    entry["service-desc"].some(
      (l: { href: string }) => l.href === "/.well-known/mcp/server-card.json",
    ),
  ).toBe(true);
  expect(entry["service"][0].href).toBe("/api/agent/mcp");
  expect(entry["item"][0].href).toBe("/api/agent/v1/offer.json");
  expect(entry["service-doc"][0].href).toBe("/llms.txt");
});

test("generate: skip when agent.enabled is false and remove stale file", async () => {
  await writeSystemMd(SYSTEM_MD_DISABLED);
  await writeManifest();
  await fs.writeFile(catalogPath(), "stale", "utf-8");
  expect(existsSync(catalogPath())).toBe(true);

  const result = await runAgentApiCatalogGenerate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(0);
  expect(existsSync(catalogPath())).toBe(false);
});

test("validate: passes on valid generated file", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest();
  await runAgentApiCatalogGenerate(input, makeContext(tmpDir, appDir));

  const result = await runAgentApiCatalogValidate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(0);
});

test("validate: fails when file is missing", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest();

  const result = await runAgentApiCatalogValidate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(1);
});

test("validate: fails when file is invalid JSON", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest();
  await fs.writeFile(catalogPath(), "not json", "utf-8");

  const result = await runAgentApiCatalogValidate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(1);
});

test("validate: fails when linkset diverges from manifest", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest({
    knowledge: [
      { domain: "offer", url: "/api/agent/v1/offer.json", schema: "gogol.agent.knowledge/offer@1" },
    ],
  });
  await fs.writeFile(catalogPath(), JSON.stringify({ linkset: [] }), "utf-8");

  const result = await runAgentApiCatalogValidate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(1);
});
