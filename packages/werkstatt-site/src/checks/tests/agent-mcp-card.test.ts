/*
<MODULE_CONTRACT>
<purpose>
RFC-0783: tests for agent.mcp-card.generate and agent.mcp-card.validate.
Tests generate writes correct content, skip patterns (agent.enabled=false and
mcp=null) remove stale file, validate passes/fails appropriately.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0783: initial MCP Server Card handler tests.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { stringify as yamlStringify } from "yaml";
import { runAgentMcpCardGenerate, runAgentMcpCardValidate } from "../agent/agent-mcp-card.ts";
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
    commandName: "agent.mcp-card.generate",
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    dryRun: false,
    outputFormat: "json",
    io: makeIO(),
  } as unknown as KernelRuntimeContext;
}

function manifestYaml(overrides?: {
  mcp?: { url: string; protocolVersion: string } | null;
}): string {
  const m = buildAgentSurfaceManifest({
    site: "test-site",
    baseUrl: "https://test.example",
    languages: { default: "de", supported: ["de"] },
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "amc-test-"));
  appDir = path.join(tmpDir, "test-site");
  await fs.mkdir(path.join(appDir, "src", "content"), { recursive: true });
  await fs.mkdir(path.join(appDir, "public", ".well-known", "mcp"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeSystemMd(content: string): Promise<void> {
  await fs.writeFile(path.join(appDir, "src", "content", "system.md"), content, "utf-8");
}

async function writeManifest(overrides?: {
  mcp?: { url: string; protocolVersion: string } | null;
}): Promise<void> {
  await fs.writeFile(
    path.join(appDir, "src", "agent-surface.generated.yaml"),
    manifestYaml(overrides),
    "utf-8",
  );
}

function cardPath(): string {
  return path.join(appDir, "public", ".well-known", "mcp", "server-card.json");
}

const input: KernelCommandInput = { flags: {} } as unknown as KernelCommandInput;

test("generate: writes server-card.json with correct fields", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest({ mcp: { url: "/api/agent/mcp", protocolVersion: "2025-06-18" } });

  const result = await runAgentMcpCardGenerate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(0);
  expect(existsSync(cardPath())).toBe(true);

  const raw = await fs.readFile(cardPath(), "utf-8");
  const card = JSON.parse(raw);
  expect(card.serverInfo.name).toBe("test-site-agent-gate");
  expect(card.transport.type).toBe("streamable-http");
  expect(card.transport.url).toBe("/api/agent/mcp");
  expect(card.protocolVersion).toBe("2025-06-18");
});

test("generate: skip when agent.enabled is false and remove stale file", async () => {
  await writeSystemMd(SYSTEM_MD_DISABLED);
  await writeManifest({ mcp: { url: "/api/agent/mcp", protocolVersion: "2025-06-18" } });
  await fs.writeFile(cardPath(), "stale", "utf-8");
  expect(existsSync(cardPath())).toBe(true);

  const result = await runAgentMcpCardGenerate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(0);
  expect(existsSync(cardPath())).toBe(false);
});

test("generate: skip when mcp is null and remove stale file", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest({ mcp: null });
  await fs.writeFile(cardPath(), "stale", "utf-8");
  expect(existsSync(cardPath())).toBe(true);

  const result = await runAgentMcpCardGenerate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(0);
  expect(existsSync(cardPath())).toBe(false);
});

test("validate: passes on valid generated file", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest({ mcp: { url: "/api/agent/mcp", protocolVersion: "2025-06-18" } });
  await runAgentMcpCardGenerate(input, makeContext(tmpDir, appDir));

  const result = await runAgentMcpCardValidate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(0);
});

test("validate: fails when file is missing", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest({ mcp: { url: "/api/agent/mcp", protocolVersion: "2025-06-18" } });

  const result = await runAgentMcpCardValidate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(1);
});

test("validate: fails when file is invalid JSON", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest({ mcp: { url: "/api/agent/mcp", protocolVersion: "2025-06-18" } });
  await fs.writeFile(cardPath(), "not json", "utf-8");

  const result = await runAgentMcpCardValidate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(1);
});

test("validate: fails when transport.url diverges from manifest", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest({ mcp: { url: "/api/agent/mcp", protocolVersion: "2025-06-18" } });
  await fs.writeFile(
    cardPath(),
    JSON.stringify({
      serverInfo: { name: "test-site-agent-gate", version: "1.0.0" },
      transport: { type: "streamable-http", url: "/wrong/url" },
      protocolVersion: "2025-06-18",
      capabilities: {
        tools: { listChanged: false },
        resources: { listChanged: false, subscribe: false },
        prompts: { listChanged: false },
      },
    }),
    "utf-8",
  );

  const result = await runAgentMcpCardValidate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(1);
});

test("validate: passes when mcp is null and no file exists", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest({ mcp: null });

  const result = await runAgentMcpCardValidate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(0);
});

test("validate: fails when mcp is null but stale file exists", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest({ mcp: null });
  await fs.writeFile(cardPath(), "stale", "utf-8");

  const result = await runAgentMcpCardValidate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(1);
});
