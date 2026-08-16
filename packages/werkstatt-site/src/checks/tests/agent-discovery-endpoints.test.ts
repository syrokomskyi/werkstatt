/*
<MODULE_CONTRACT>
<purpose>
Tests for agent.discovery-endpoints.generate: verifies auth.md, agent-skills/index.json,
oauth-protected-resource, and oauth-authorization-server are generated correctly.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial: tests for discovery endpoints generator.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { stringify as yamlStringify } from "yaml";
import { runAgentDiscoveryEndpointsGenerate } from "../agent/agent-discovery-endpoints.ts";
import { buildAgentSurfaceManifest } from "@warpgogol/werkstatt-site/share/agent";
import type {
  KernelCommandInput,
  KernelRuntimeContext,
  WorkspaceIO,
} from "@warpgogol/werkstatt/kernel";

const SYSTEM_MD_ENABLED = `---
cosmicStar: Vega
app: test-site
identity:
  domain: test.example
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
identity:
  domain: test.example
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
    commandName: "agent.discovery-endpoints.generate",
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    dryRun: false,
    outputFormat: "json",
    io: makeIO(),
  } as unknown as KernelRuntimeContext;
}

function manifestYaml(overrides?: {
  knowledge?: { domain: string; url: string; schema: string }[];
}): string {
  const m = buildAgentSurfaceManifest({
    site: "test-site",
    baseUrl: "https://test.example",
    languages: { default: "de", supported: ["de"] },
    knowledge: overrides?.knowledge,
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
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "discovery-ep-"));
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
  knowledge?: { domain: string; url: string; schema: string }[];
}): Promise<void> {
  await fs.writeFile(
    path.join(appDir, "src", "agent-surface.generated.yaml"),
    manifestYaml(overrides),
    "utf-8",
  );
}

const input: KernelCommandInput = { flags: {} } as unknown as KernelCommandInput;

test("generate: writes all four discovery endpoint files", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest({
    knowledge: [
      { domain: "offer", url: "/api/agent/v1/offer.json", schema: "gogol.agent.knowledge/offer@1" },
    ],
  });

  const result = await runAgentDiscoveryEndpointsGenerate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(0);

  // auth.md
  const authMd = await fs.readFile(path.join(appDir, "public", "auth.md"), "utf-8");
  expect(authMd).toContain("auth.md");
  expect(authMd).toContain("test.example");

  // agent-skills/index.json
  const skillsRaw = await fs.readFile(
    path.join(appDir, "public", ".well-known", "agent-skills", "index.json"),
    "utf-8",
  );
  const skills = JSON.parse(skillsRaw);
  expect(skills.$schema).toContain("agentskills");
  expect(skills.skills.length).toBeGreaterThanOrEqual(4);
  const skillNames = skills.skills.map((s: { name: string }) => s.name);
  expect(skillNames).toContain("offer");
  expect(skillNames).toContain("agent-manifest");
  expect(skillNames).toContain("openapi-spec");
  expect(skillNames).toContain("llms-txt");

  // oauth-protected-resource
  const oprRaw = await fs.readFile(
    path.join(appDir, "public", ".well-known", "oauth-protected-resource"),
    "utf-8",
  );
  const opr = JSON.parse(oprRaw);
  expect(opr.resource).toBe("https://test.example/");
  expect(opr.authorization_servers).toBeDefined();
  expect(opr.bearer_methods_supported).toContain("header");
  expect(opr.scopes_supported).toBeDefined();

  // oauth-authorization-server
  const oasRaw = await fs.readFile(
    path.join(appDir, "public", ".well-known", "oauth-authorization-server"),
    "utf-8",
  );
  const oas = JSON.parse(oasRaw);
  expect(oas.issuer).toBe("https://test.example/");
  expect(oas.authorization_endpoint).toBe("https://test.example/auth");
  expect(oas.response_types_supported).toContain("code");
  expect(oas.agent_auth).toBeDefined();
  expect(oas.agent_auth.skill).toBe("auth.md");
  expect(oas.agent_auth.register_uri).toBe("https://test.example/auth");
  expect(oas.agent_auth.identity_types_supported).toContain("anonymous");
});

test("generate: skip when agent.enabled is false and remove stale files", async () => {
  await writeSystemMd(SYSTEM_MD_DISABLED);
  await writeManifest();

  // Create stale files
  await fs.writeFile(path.join(appDir, "public", "auth.md"), "stale", "utf-8");
  await fs.mkdir(path.join(appDir, "public", ".well-known", "agent-skills"), { recursive: true });
  await fs.writeFile(
    path.join(appDir, "public", ".well-known", "agent-skills", "index.json"),
    "stale",
    "utf-8",
  );
  await fs.writeFile(
    path.join(appDir, "public", ".well-known", "oauth-protected-resource"),
    "stale",
    "utf-8",
  );
  await fs.writeFile(
    path.join(appDir, "public", ".well-known", "oauth-authorization-server"),
    "stale",
    "utf-8",
  );

  const result = await runAgentDiscoveryEndpointsGenerate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(0);
  expect(existsSync(path.join(appDir, "public", "auth.md"))).toBe(false);
  expect(existsSync(path.join(appDir, "public", ".well-known", "agent-skills", "index.json"))).toBe(
    false,
  );
  expect(existsSync(path.join(appDir, "public", ".well-known", "oauth-protected-resource"))).toBe(
    false,
  );
  expect(existsSync(path.join(appDir, "public", ".well-known", "oauth-authorization-server"))).toBe(
    false,
  );
});

test("generate: is idempotent — second run produces identical output", async () => {
  await writeSystemMd(SYSTEM_MD_ENABLED);
  await writeManifest();

  await runAgentDiscoveryEndpointsGenerate(input, makeContext(tmpDir, appDir));
  const authMd1 = await fs.readFile(path.join(appDir, "public", "auth.md"), "utf-8");
  const skills1 = await fs.readFile(
    path.join(appDir, "public", ".well-known", "agent-skills", "index.json"),
    "utf-8",
  );
  const opr1 = await fs.readFile(
    path.join(appDir, "public", ".well-known", "oauth-protected-resource"),
    "utf-8",
  );
  const oas1 = await fs.readFile(
    path.join(appDir, "public", ".well-known", "oauth-authorization-server"),
    "utf-8",
  );

  const result = await runAgentDiscoveryEndpointsGenerate(input, makeContext(tmpDir, appDir));
  expect(result.exitCode).toBe(0);

  const authMd2 = await fs.readFile(path.join(appDir, "public", "auth.md"), "utf-8");
  const skills2 = await fs.readFile(
    path.join(appDir, "public", ".well-known", "agent-skills", "index.json"),
    "utf-8",
  );
  const opr2 = await fs.readFile(
    path.join(appDir, "public", ".well-known", "oauth-protected-resource"),
    "utf-8",
  );
  const oas2 = await fs.readFile(
    path.join(appDir, "public", ".well-known", "oauth-authorization-server"),
    "utf-8",
  );

  expect(authMd2).toBe(authMd1);
  expect(skills2).toBe(skills1);
  expect(opr2).toBe(opr1);
  expect(oas2).toBe(oas1);
});
