/*
<MODULE_CONTRACT>
<purpose>
RFC-0786: Integration tests for agent.dns-aid.generate and agent.dns-aid.validate.
Tests create/update/unchanged/skip/remove for generate, and AGD-01..04 for validate.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0786: initial integration tests for DNS-AID generate + validate.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/werkstatt/kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { runAgentDnsAidGenerate, runAgentDnsAidValidate } from "./agent-dns-aid.ts";

function resolveDnsPath(context: KernelRuntimeContext): string {
  return join(context.workspaceRoot, "..", "systems-cache", "test-site", "dns-records.yaml");
}

const SYSTEM_MD = `---
app: test-site
agent:
  enabled: true
---
# Test Site
`;

const MANIFEST_YAML = `surfaceVersion: "1.0.0"
site: test-site
baseUrl: https://test-site.example.com
languages:
  default: de
  supported:
    - de
contentHash: abc123
knowledge: []
actions: []
interfaces:
  llms: ""
  twins: null
  openapi: null
  mcp: null
proof: null
`;

function makeInput(flags: Record<string, unknown> = {}): KernelCommandInput {
  return { argv: [], flags } as unknown as KernelCommandInput;
}

async function fixture(
  systemMdContent: string = SYSTEM_MD,
  manifestContent: string = MANIFEST_YAML,
): Promise<{
  root: string;
  appDir: string;
  context: KernelRuntimeContext;
  cleanup: () => Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "dns-aid-"));
  const appDir = join(root, "apps", "test-site");
  const systemsDir = join(root, "systems", "test-site");
  const cacheCloneDir = join(root, "..", "systems-cache", "test-site");
  // Clean up any leftover cache clone from previous test runs
  await rm(cacheCloneDir, { recursive: true, force: true });
  await mkdir(join(appDir, "src", "content"), { recursive: true });
  await mkdir(systemsDir, { recursive: true });
  await mkdir(cacheCloneDir, { recursive: true });
  await writeFile(join(appDir, "src", "content", "system.md"), systemMdContent);
  await writeFile(join(appDir, "src", "agent-surface.generated.yaml"), manifestContent);

  const { io } = createDefaultIO();
  const context = {
    workspaceRoot: root,
    site: { name: "test-site", directory: appDir, toolsDirectory: join(appDir, "tools") },
    dryRun: false,
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    outputFormat: "json" as const,
    io,
  } as unknown as KernelRuntimeContext;

  return {
    root,
    appDir,
    context,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
      await rm(join(root, "..", "systems-cache", "test-site"), { recursive: true, force: true });
    },
  };
}

describe("agent.dns-aid.generate (RFC-0786)", () => {
  it("creates dns-records.yaml when it does not exist", async () => {
    const { context, cleanup } = await fixture();
    try {
      const result = await runAgentDnsAidGenerate(makeInput(), context);
      expect(result.exitCode).toBe(0);
      expect((result.data as Record<string, unknown>)?.action).toBe("created");
      const dnsPath = resolveDnsPath(context);
      const content = await readFile(dnsPath, "utf8");
      expect(content).toContain("# BEGIN dns-aid");
      expect(content).toContain("# END dns-aid");
      expect(content).toContain("_index._agents.test-site.example.com");
      expect(content).toContain("type: SVCB");
      expect(content).toContain("alpn=h2");
      expect(content).toContain("port=443");
      expect(content).toContain("test-site.example.com alpn=h2 port=443");
      expect(content).toContain("ttl: 3600");
    } finally {
      await cleanup();
    }
  });

  it("is idempotent — second run produces byte-identical output (DNA-58)", async () => {
    const { context, cleanup } = await fixture();
    try {
      await runAgentDnsAidGenerate(makeInput(), context);
      const dnsPath = resolveDnsPath(context);
      const firstRun = await readFile(dnsPath, "utf8");
      const result = await runAgentDnsAidGenerate(makeInput(), context);
      expect((result.data as Record<string, unknown>)?.action).toBe("unchanged");
      const secondRun = await readFile(dnsPath, "utf8");
      expect(secondRun).toBe(firstRun);
    } finally {
      await cleanup();
    }
  });

  it("updates existing DNS-AID section when manifest changes", async () => {
    const { context, cleanup } = await fixture();
    try {
      await runAgentDnsAidGenerate(makeInput(), context);
      // Change manifest URL
      const manifestPath = join(context.site!.directory, "src", "agent-surface.generated.yaml");
      await writeFile(
        manifestPath,
        MANIFEST_YAML.replace("https://test-site.example.com", "https://new-domain.com"),
      );
      const result = await runAgentDnsAidGenerate(makeInput(), context);
      expect((result.data as Record<string, unknown>)?.action).toBe("updated");
      const dnsPath = resolveDnsPath(context);
      const content = await readFile(dnsPath, "utf8");
      expect(content).toContain("_index._agents.new-domain.com");
      expect(content).toContain("new-domain.com alpn=h2 port=443");
    } finally {
      await cleanup();
    }
  });

  it("skips and removes stale section when agent.enabled is false", async () => {
    const disabledMd = SYSTEM_MD.replace("enabled: true", "enabled: false");
    const { context, cleanup } = await fixture(disabledMd);
    try {
      // First create with enabled=true
      const enabledContext = { ...context };
      // Temporarily write enabled manifest to create the file
      const manifestPath = join(context.site!.directory, "src", "agent-surface.generated.yaml");
      const systemMdPath = join(context.site!.directory, "src", "content", "system.md");
      await writeFile(systemMdPath, SYSTEM_MD);
      await runAgentDnsAidGenerate(makeInput(), context);
      const dnsPath = resolveDnsPath(context);
      let content = await readFile(dnsPath, "utf8");
      expect(content).toContain("# BEGIN dns-aid");

      // Now disable agent
      await writeFile(systemMdPath, disabledMd);
      const result = await runAgentDnsAidGenerate(makeInput(), context);
      expect((result.data as Record<string, unknown>)?.action).toBe("removed");
      content = await readFile(dnsPath, "utf8");
      expect(content).not.toContain("# BEGIN dns-aid");
    } finally {
      await cleanup();
    }
  });

  it("returns skipped when agent.enabled is false and no stale section", async () => {
    const disabledMd = SYSTEM_MD.replace("enabled: true", "enabled: false");
    const { context, cleanup } = await fixture(disabledMd);
    try {
      const result = await runAgentDnsAidGenerate(makeInput(), context);
      expect((result.data as Record<string, unknown>)?.action).toBe("skipped");
    } finally {
      await cleanup();
    }
  });

  it("fails with exit 1 when no agent surface manifest exists", async () => {
    const { context, cleanup } = await fixture();
    try {
      const manifestPath = join(context.site!.directory, "src", "agent-surface.generated.yaml");
      await rm(manifestPath);
      const result = await runAgentDnsAidGenerate(makeInput(), context);
      expect(result.exitCode).toBe(1);
    } finally {
      await cleanup();
    }
  });
});

describe("agent.dns-aid.validate (RFC-0786)", () => {
  it("reports AGD-01 when dns-records.yaml does not exist", async () => {
    const { context, cleanup } = await fixture();
    try {
      const result = await runAgentDnsAidValidate(makeInput(), context);
      expect(result.exitCode).toBe(0);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "AGD-01")).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("reports AGD-01 when marked section is missing", async () => {
    const { context, cleanup } = await fixture();
    try {
      const dnsPath = resolveDnsPath(context);
      await mkdir(join(context.workspaceRoot, "..", "systems-cache", "test-site"), {
        recursive: true,
      });
      await writeFile(
        dnsPath,
        "kind: dns-records\nschemaVersion: 1\nzone: test-site.example.com\nupdatedAt: 2026-01-01\nrecords: []\n",
      );
      const result = await runAgentDnsAidValidate(makeInput(), context);
      expect(result.exitCode).toBe(0);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "AGD-01")).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("reports AGD-02 when content does not match manifest", async () => {
    const { context, cleanup } = await fixture();
    try {
      // Generate first
      await runAgentDnsAidGenerate(makeInput(), context);
      // Corrupt the content
      const dnsPath = resolveDnsPath(context);
      let content = await readFile(dnsPath, "utf8");
      content = content.replace(
        "test-site.example.com alpn=h2 port=443",
        "wrong-host.com alpn=h2 port=443",
      );
      await writeFile(dnsPath, content);
      const result = await runAgentDnsAidValidate(makeInput(), context);
      expect(result.exitCode).toBe(0);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "AGD-02")).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("reports AGD-03 when agent.enabled is false but section exists", async () => {
    const disabledMd = SYSTEM_MD.replace("enabled: true", "enabled: false");
    const { context, cleanup } = await fixture(disabledMd);
    try {
      // Create the file with a stale section (using enabled manifest first)
      const systemMdPath = join(context.site!.directory, "src", "content", "system.md");
      await writeFile(systemMdPath, SYSTEM_MD);
      await runAgentDnsAidGenerate(makeInput(), context);
      // Now disable
      await writeFile(systemMdPath, disabledMd);
      const result = await runAgentDnsAidValidate(makeInput(), context);
      expect(result.exitCode).toBe(0);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "AGD-03")).toBe(true);
    } finally {
      await cleanup();
    }
  });

  it("passes with no diagnostics when record is correct (no CLOUDFLARE_API_TOKEN)", async () => {
    const { context, cleanup } = await fixture();
    try {
      await runAgentDnsAidGenerate(makeInput(), context);
      const originalToken = process.env["CLOUDFLARE_API_TOKEN"];
      delete process.env["CLOUDFLARE_API_TOKEN"];
      const result = await runAgentDnsAidValidate(makeInput(), context);
      expect(result.exitCode).toBe(0);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.length).toBe(0);
      if (originalToken) process.env["CLOUDFLARE_API_TOKEN"] = originalToken;
    } finally {
      await cleanup();
    }
  });

  it("is advisory — exit 0 even with AGD-01 errors", async () => {
    const { context, cleanup } = await fixture();
    try {
      const result = await runAgentDnsAidValidate(makeInput(), context);
      expect(result.exitCode).toBe(0);
    } finally {
      await cleanup();
    }
  });
});

describe("agent.dns-aid YAML indentation regression (RFC-0786)", () => {
  it("generated dns-records.yaml parses as valid YAML", async () => {
    const { parse: parseYaml } = await import("yaml");
    const { context, cleanup } = await fixture();
    try {
      await runAgentDnsAidGenerate(makeInput(), context);
      const dnsPath = resolveDnsPath(context);
      const content = await readFile(dnsPath, "utf8");
      const parsed = parseYaml(content);
      expect(parsed).toBeTruthy();
      expect(parsed.kind).toBe("dns-records");
      expect(parsed.records).toBeInstanceOf(Array);
      expect(parsed.records.length).toBeGreaterThan(0);
      const svcb = parsed.records.find((r: { type: string }) => r.type === "SVCB");
      expect(svcb).toBeTruthy();
      expect(svcb.name).toContain("_index._agents");
    } finally {
      await cleanup();
    }
  });

  it("inserts DNS-AID section into existing dns-records.yaml with 2-space indented records and produces valid YAML", async () => {
    const { parse: parseYaml } = await import("yaml");
    const { context, cleanup } = await fixture();
    try {
      const dnsPath = resolveDnsPath(context);
      const existingContent = `kind: dns-records
schemaVersion: 1
zone: test-site.example.com
updatedAt: 2026-01-01
records:
  - name: _agent.test-site.example.com
    type: TXT
    content: "https://test-site.example.com/.well-known/agent.json"
    ttl: 3600
    proxied: false
`;
      await context.io.writeFile(dnsPath, existingContent);

      const result = await runAgentDnsAidGenerate(makeInput(), context);
      expect(result.exitCode).toBe(0);
      const action = (result.data as Record<string, unknown>)?.action;
      expect(["created", "updated"]).toContain(action);

      const content = await readFile(dnsPath, "utf8");
      const parsed = parseYaml(content);
      expect(parsed).toBeTruthy();
      expect(parsed.records).toBeInstanceOf(Array);
      expect(parsed.records.length).toBe(2);
      const svcb = parsed.records.find((r: { type: string }) => r.type === "SVCB");
      expect(svcb).toBeTruthy();
      const txt = parsed.records.find((r: { type: string }) => r.type === "TXT");
      expect(txt).toBeTruthy();
    } finally {
      await cleanup();
    }
  });
});
