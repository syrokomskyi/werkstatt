/*
<MODULE_CONTRACT>
<purpose>
RFC-0784: tests for Content-Signal directive in robots.txt and agent discovery
Link headers in _headers. Tests cover buildRobotsTxt output, robots.generate
default contentSignal, robots.validate PUBTXT-CS rule, public.infrastructure.generate
AGENT_LINK_HEADERS token resolution, and headers.security.validate HDR-07 rule.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0784: initial tests for Content-Signal directive and agent discovery Link headers.</item>
</CHANGE_SUMMARY>
*/

import { test, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildRobotsTxt, type RobotsPolicy } from "@warpgogol/werkstatt-site/share/semantic";
import { runRobotsGenerate, runRobotsValidate } from "../robots.ts";
import { runGeneratePublicInfrastructure } from "../../codegen/app-boilerplate.ts";
import { runHeadersSecurityValidate } from "../public-surface/security.ts";
import type {
  KernelCommandInput,
  KernelRuntimeContext,
  WorkspaceIO,
} from "@warpgogol/werkstatt/kernel";

const SYSTEM_MD_BASE = `---
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

const SYSTEM_MD_AGENT_DISABLED = `---
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
    commandName: "test",
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    dryRun: false,
    outputFormat: "json",
    io: makeIO(),
  } as unknown as KernelRuntimeContext;
}

let tmpDir: string;
let appDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rfc0784-test-"));
  appDir = path.join(tmpDir, "test-site");
  await fs.mkdir(path.join(appDir, "src", "content"), { recursive: true });
  await fs.mkdir(path.join(appDir, "public"), { recursive: true });
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

async function writeSystemMd(content: string): Promise<void> {
  await fs.writeFile(path.join(appDir, "src", "content", "system.md"), content, "utf-8");
}

const input: KernelCommandInput = { flags: {} } as unknown as KernelCommandInput;

// ---------------------------------------------------------------------------
// buildRobotsTxt — Content-Signal directive
// ---------------------------------------------------------------------------

test("buildRobotsTxt: emits Content-Signal when contentSignal is present", () => {
  const policy: RobotsPolicy = {
    contentSignal: ["ai-train=no", "search=yes", "ai-input=yes"],
    sitemap: "/sitemap.xml",
  };
  const output = buildRobotsTxt(policy);
  expect(output).toContain("Content-Signal: ai-train=no, search=yes, ai-input=yes");
});

test("buildRobotsTxt: Content-Signal placed after header comment, before User-agent", () => {
  const output = buildRobotsTxt({
    contentSignal: ["ai-train=no"],
    sitemap: "/sitemap.xml",
  });
  const csIdx = output.indexOf("Content-Signal:");
  const uaIdx = output.indexOf("User-agent: *");
  expect(csIdx).toBeGreaterThan(-1);
  expect(uaIdx).toBeGreaterThan(-1);
  expect(csIdx).toBeLessThan(uaIdx);
  expect(output.indexOf("# robots.txt")).toBeLessThan(csIdx);
});

test("buildRobotsTxt: omits Content-Signal when contentSignal is absent", () => {
  const output = buildRobotsTxt({ sitemap: "/sitemap.xml" });
  expect(output).not.toContain("Content-Signal:");
});

test("buildRobotsTxt: omits Content-Signal when contentSignal is empty array", () => {
  const output = buildRobotsTxt({ contentSignal: [], sitemap: "/sitemap.xml" });
  expect(output).not.toContain("Content-Signal:");
});

// ---------------------------------------------------------------------------
// robots.generate — default contentSignal
// ---------------------------------------------------------------------------

test("robots.generate: passes default contentSignal when absent from manifest", async () => {
  await writeSystemMd(SYSTEM_MD_BASE);
  const ctx = makeContext(tmpDir, appDir);
  await runRobotsGenerate(input, ctx);
  const robotsTxt = await fs.readFile(path.join(appDir, "public", "robots.txt"), "utf-8");
  expect(robotsTxt).toContain("Content-Signal: ai-train=no, search=yes, ai-input=yes");
});

test("robots.generate: passes custom contentSignal from manifest robots block", async () => {
  const systemMd = `---
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
robots:
  contentSignal:
    - ai-train=no
    - search=yes
---
`;
  await writeSystemMd(systemMd);
  const ctx = makeContext(tmpDir, appDir);
  await runRobotsGenerate(input, ctx);
  const robotsTxt = await fs.readFile(path.join(appDir, "public", "robots.txt"), "utf-8");
  expect(robotsTxt).toContain("Content-Signal: ai-train=no, search=yes");
});

// ---------------------------------------------------------------------------
// robots.validate — PUBTXT-CS rule
// ---------------------------------------------------------------------------

test("robots.validate: fails when Content-Signal is absent", async () => {
  await writeSystemMd(SYSTEM_MD_BASE);
  const ctx = makeContext(tmpDir, appDir);
  await runRobotsGenerate(input, ctx);
  // Remove Content-Signal line manually
  const robotsPath = path.join(appDir, "public", "robots.txt");
  let robotsTxt = await fs.readFile(robotsPath, "utf-8");
  robotsTxt = robotsTxt.replace(/Content-Signal:.*\n/, "");
  await fs.writeFile(robotsPath, robotsTxt, "utf-8");

  const result = await runRobotsValidate(input, ctx);
  const pubtxtCs = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.find(
    (d) => d.ruleId === "PUBTXT-CS",
  );
  expect(pubtxtCs).toBeDefined();
});

test("robots.validate: passes when Content-Signal is present", async () => {
  await writeSystemMd(SYSTEM_MD_BASE);
  const ctx = makeContext(tmpDir, appDir);
  await runRobotsGenerate(input, ctx);
  const result = await runRobotsValidate(input, ctx);
  const pubtxtCs = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.find(
    (d) => d.ruleId === "PUBTXT-CS",
  );
  expect(pubtxtCs).toBeUndefined();
});

// ---------------------------------------------------------------------------
// public.infrastructure.generate — AGENT_LINK_HEADERS token
// ---------------------------------------------------------------------------

test("public.infrastructure.generate: includes Link headers when agent.enabled !== false", async () => {
  await writeSystemMd(SYSTEM_MD_BASE);
  const ctx = makeContext(tmpDir, appDir);
  await runGeneratePublicInfrastructure(input, ctx);
  const headers = await fs.readFile(path.join(appDir, "public", "_headers"), "utf-8");
  expect(headers).toContain('Link: < /.well-known/agent.json>; rel="service-meta"');
  expect(headers).toContain('Link: < /.well-known/agent.openapi.json>; rel="service-desc"');
  expect(headers).toContain('Link: < /.well-known/api-catalog>; rel="service-desc"');
  expect(headers).toContain('Link: < /.well-known/mcp/server-card.json>; rel="service-desc"');
  expect(headers).toContain('Link: < /llms.txt>; rel="service-doc"');
});

test("public.infrastructure.generate: omits Link headers when agent.enabled: false", async () => {
  await writeSystemMd(SYSTEM_MD_AGENT_DISABLED);
  const ctx = makeContext(tmpDir, appDir);
  await runGeneratePublicInfrastructure(input, ctx);
  const headers = await fs.readFile(path.join(appDir, "public", "_headers"), "utf-8");
  expect(headers).not.toContain("Link: < /.well-known/agent.json>");
  expect(headers).not.toContain("Link: < /llms.txt>");
});

// ---------------------------------------------------------------------------
// headers.security.validate — HDR-07 rule
// ---------------------------------------------------------------------------

test("headers.security.validate: HDR-07 passes when Link headers present and agent enabled", async () => {
  await writeSystemMd(SYSTEM_MD_BASE);
  const ctx = makeContext(tmpDir, appDir);
  await runGeneratePublicInfrastructure(input, ctx);
  const result = await runHeadersSecurityValidate(input, ctx);
  const hdr07 = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.find(
    (d) => d.ruleId === "HDR-07",
  );
  expect(hdr07).toBeUndefined();
});

test("headers.security.validate: HDR-07 fails when Link headers absent and agent enabled", async () => {
  await writeSystemMd(SYSTEM_MD_BASE);
  const ctx = makeContext(tmpDir, appDir);
  await runGeneratePublicInfrastructure(input, ctx);
  // Remove Link headers manually
  const headersPath = path.join(appDir, "public", "_headers");
  let headers = await fs.readFile(headersPath, "utf-8");
  headers = headers.replace(/Link:.*\n/g, "");
  await fs.writeFile(headersPath, headers, "utf-8");

  const result = await runHeadersSecurityValidate(input, ctx);
  const hdr07 = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.find(
    (d) => d.ruleId === "HDR-07",
  );
  expect(hdr07).toBeDefined();
});

test("headers.security.validate: HDR-07 silent when agent.enabled: false", async () => {
  await writeSystemMd(SYSTEM_MD_AGENT_DISABLED);
  const ctx = makeContext(tmpDir, appDir);
  await runGeneratePublicInfrastructure(input, ctx);
  const result = await runHeadersSecurityValidate(input, ctx);
  const hdr07 = (result.data as { diagnostics: Array<{ ruleId: string }> }).diagnostics.find(
    (d) => d.ruleId === "HDR-07",
  );
  expect(hdr07).toBeUndefined();
});
