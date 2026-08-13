/*
<MODULE_CONTRACT>
<purpose>
  Test coverage for csp.origins.validate (RFC-0831) — proves the validator
  catches missing script/style/image/connect origins in CSP, handles edge cases
  (same-origin, data: URIs, srcset, module scripts, preload, malformed HTML),
  and correctly skips when _headers or dist/client/ are missing.
</purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0831: initial test suite — parseCsp, originMatchesSource, extractOriginsFromHtml, runCspOriginsValidate (skip cases, CSP-ORIGIN-01..04).</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { testLogger, makeTestSiteContext, testInput, unwrapData } from "./helpers.ts";
import {
  parseCsp,
  originMatchesSource,
  extractOriginsFromHtml,
  runCspOriginsValidate,
} from "../csp-origins.ts";
import type { KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

let tmpRoot: string;
let appDir: string;
let publicDir: string;
let distDir: string;
let contentDir: string;

async function setupApp(): Promise<void> {
  tmpRoot = await mkdtemp(join(tmpdir(), "csp-origins-"));
  appDir = join(tmpRoot, "test-app");
  publicDir = join(appDir, "public");
  distDir = join(appDir, "dist", "client");
  contentDir = join(appDir, "src", "content");
  await mkdir(publicDir, { recursive: true });
  await mkdir(distDir, { recursive: true });
  await mkdir(contentDir, { recursive: true });
}

async function writeHeaders(content: string): Promise<void> {
  await writeFile(join(publicDir, "_headers"), content, "utf8");
}

async function writeHtml(name: string, html: string): Promise<void> {
  await writeFile(join(distDir, name), html, "utf8");
}

async function writeSystemMd(domain: string): Promise<void> {
  await writeFile(
    join(contentDir, "system.md"),
    `---\napp: test-app\nidentity:\n  domain: ${domain}\ni18n:\n  default: de\n  supported:\n    de: {}\n---\n\n# Test App\n`,
    "utf8",
  );
}

function ctx(): KernelRuntimeContext {
  return makeTestSiteContext(tmpRoot, appDir, "test-app");
}

const input = testInput();

interface CspResultData {
  command: string;
  status: string;
  findings: Array<{
    rule: string;
    severity: string;
    message: string;
    origin: string;
    directive: string;
  }>;
  cspDirectives: Record<string, string[]>;
  checkedOrigins: number;
}

function getData(result: Awaited<ReturnType<typeof runCspOriginsValidate>>): CspResultData {
  return unwrapData(result) as CspResultData;
}

beforeEach(async () => {
  await setupApp();
});

afterEach(async () => {
  await rm(tmpRoot, { recursive: true, force: true });
});

// ─── parseCsp ───────────────────────────────────────────────────────────────

describe("parseCsp", () => {
  it("parses a single directive with multiple sources", () => {
    const csp = parseCsp("script-src 'self' 'unsafe-inline'");
    expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it("parses multiple directives", () => {
    const csp = parseCsp(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; img-src 'self' data:",
    );
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp.get("img-src")).toEqual(["'self'", "data:"]);
  });

  it("handles empty CSP string", () => {
    const csp = parseCsp("");
    expect(csp.size).toBe(0);
  });

  it("handles directive with no sources", () => {
    const csp = parseCsp("frame-ancestors");
    expect(csp.get("frame-ancestors")).toEqual([]);
  });

  it("handles malformed CSP (leading semicolons)", () => {
    const csp = parseCsp(";; script-src 'self' ;;");
    expect(csp.get("script-src")).toEqual(["'self'"]);
  });
});

// ─── originMatchesSource ────────────────────────────────────────────────────

describe("originMatchesSource", () => {
  it("matches 'self' with site origin", () => {
    expect(originMatchesSource("https://example.com", ["'self'"], "https://example.com")).toBe(
      true,
    );
  });

  it("does not match 'self' when site origin is undefined", () => {
    expect(originMatchesSource("https://example.com", ["'self'"], undefined)).toBe(false);
  });

  it("matches exact origin", () => {
    expect(
      originMatchesSource(
        "https://matomo.example.com",
        ["https://matomo.example.com"],
        "https://example.com",
      ),
    ).toBe(true);
  });

  it("matches wildcard subdomain", () => {
    expect(
      originMatchesSource(
        "https://matomo-proxy.example.com",
        ["*.example.com"],
        "https://example.com",
      ),
    ).toBe(true);
  });

  it("matches wildcard subdomain for exact domain", () => {
    expect(
      originMatchesSource("https://example.com", ["*.example.com"], "https://example.com"),
    ).toBe(true);
  });

  it("does not match 'none'", () => {
    expect(originMatchesSource("https://example.com", ["'none'"], "https://example.com")).toBe(
      false,
    );
  });

  it("matches bare wildcard *", () => {
    expect(originMatchesSource("https://anything.com", ["*"], undefined)).toBe(true);
  });

  it("does not match keyword tokens as origins", () => {
    expect(
      originMatchesSource("https://example.com", ["'unsafe-inline'"], "https://example.com"),
    ).toBe(false);
  });

  it("returns false for undefined sources", () => {
    expect(originMatchesSource("https://example.com", undefined, "https://example.com")).toBe(
      false,
    );
  });

  it("returns false for empty sources", () => {
    expect(originMatchesSource("https://example.com", [], "https://example.com")).toBe(false);
  });
});

// ─── extractOriginsFromHtml ─────────────────────────────────────────────────

describe("extractOriginsFromHtml", () => {
  it("extracts external script src", () => {
    const html = `<html><body><script src="https://cdn.example.com/lib.js"></script></body></html>`;
    const origins = extractOriginsFromHtml(html, "test.html");
    expect(origins).toHaveLength(1);
    expect(origins[0]).toMatchObject({ origin: "https://cdn.example.com", kind: "script" });
  });

  it("extracts module script src", () => {
    const html = `<html><body><script type="module" src="https://cdn.example.com/mod.js"></script></body></html>`;
    const origins = extractOriginsFromHtml(html, "test.html");
    expect(origins).toHaveLength(1);
    expect(origins[0]).toMatchObject({ origin: "https://cdn.example.com", kind: "script" });
  });

  it("extracts stylesheet href", () => {
    const html = `<html><head><link rel="stylesheet" href="https://cdn.example.com/style.css"></head></html>`;
    const origins = extractOriginsFromHtml(html, "test.html");
    expect(origins).toHaveLength(1);
    expect(origins[0]).toMatchObject({ origin: "https://cdn.example.com", kind: "style" });
  });

  it("extracts preload as=script href", () => {
    const html = `<html><head><link rel="preload" as="script" href="https://cdn.example.com/preload.js"></head></html>`;
    const origins = extractOriginsFromHtml(html, "test.html");
    expect(origins).toHaveLength(1);
    expect(origins[0]).toMatchObject({ origin: "https://cdn.example.com", kind: "script" });
  });

  it("extracts img src", () => {
    const html = `<html><body><img src="https://cdn.example.com/img.png"></body></html>`;
    const origins = extractOriginsFromHtml(html, "test.html");
    expect(origins).toHaveLength(1);
    expect(origins[0]).toMatchObject({ origin: "https://cdn.example.com", kind: "image" });
  });

  it("extracts img srcset origins", () => {
    const html = `<html><body><img srcset="https://cdn.example.com/small.png 400w, https://cdn.example.com/large.png 800w"></body></html>`;
    const origins = extractOriginsFromHtml(html, "test.html");
    expect(origins).toHaveLength(2);
    expect(origins[0]).toMatchObject({ origin: "https://cdn.example.com", kind: "image" });
    expect(origins[1]).toMatchObject({ origin: "https://cdn.example.com", kind: "image" });
  });

  it("extracts source srcset origins in picture", () => {
    const html = `<html><body><picture><source srcset="https://cdn.example.com/webp.webp"><img src="/local.png"></picture></body></html>`;
    const origins = extractOriginsFromHtml(html, "test.html");
    expect(origins).toHaveLength(1);
    expect(origins[0]).toMatchObject({ origin: "https://cdn.example.com", kind: "image" });
  });

  it("extracts fetch() calls from inline scripts", () => {
    const html = `<html><body><script>fetch("https://api.example.com/data");</script></body></html>`;
    const origins = extractOriginsFromHtml(html, "test.html");
    expect(origins).toHaveLength(1);
    expect(origins[0]).toMatchObject({ origin: "https://api.example.com", kind: "connect" });
  });

  it("extracts new URL() calls from inline scripts", () => {
    const html = `<html><body><script>const u = new URL("https://api.example.com/endpoint");</script></body></html>`;
    const origins = extractOriginsFromHtml(html, "test.html");
    expect(origins).toHaveLength(1);
    expect(origins[0]).toMatchObject({ origin: "https://api.example.com", kind: "connect" });
  });

  it("skips same-origin resources", () => {
    const html = `<html><body><script src="/local.js"></script><img src="/local.png"></body></html>`;
    const origins = extractOriginsFromHtml(html, "test.html");
    expect(origins).toHaveLength(0);
  });

  it("skips data: URIs", () => {
    const html = `<html><body><img src="data:image/png;base64,abc="></body></html>`;
    const origins = extractOriginsFromHtml(html, "test.html");
    expect(origins).toHaveLength(0);
  });

  it("does not throw on malformed HTML", () => {
    const html = `<html><body><script src="https://cdn.example.com/lib.js"><img`;
    const origins = extractOriginsFromHtml(html, "test.html");
    expect(origins.length).toBeGreaterThanOrEqual(0);
  });

  it("returns empty for empty HTML", () => {
    const origins = extractOriginsFromHtml("", "test.html");
    expect(origins).toHaveLength(0);
  });
});

// ─── runCspOriginsValidate ──────────────────────────────────────────────────

describe("runCspOriginsValidate (RFC-0831)", () => {
  it("skips with pass when public/_headers does not exist", async () => {
    await writeHtml("index.html", "<html></html>");
    const result = await runCspOriginsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("pass");
    expect(data.findings).toHaveLength(0);
    expect(data.checkedOrigins).toBe(0);
  });

  it("skips with pass when dist/client/ does not exist", async () => {
    await writeHeaders("Content-Security-Policy: script-src 'self'\n");
    await rm(distDir, { recursive: true, force: true });
    const result = await runCspOriginsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("pass");
    expect(data.findings).toHaveLength(0);
  });

  it("skips with pass when CSP header is not found in _headers", async () => {
    await writeHeaders("Cache-Control: public\n");
    await writeHtml("index.html", "<html></html>");
    const result = await runCspOriginsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("pass");
    expect(data.findings).toHaveLength(0);
  });

  it("skips with pass when dist/client/ has no HTML files", async () => {
    await writeHeaders("Content-Security-Policy: script-src 'self'\n");
    await writeSystemMd("example.com");
    const result = await runCspOriginsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("pass");
    expect(data.findings).toHaveLength(0);
  });

  it("emits CSP-ORIGIN-01 error for missing script origin", async () => {
    await writeHeaders(
      "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'\n",
    );
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><script src="https://matomo-proxy.example.com/lib.js"></script></body></html>`,
    );
    const result = await runCspOriginsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("fail");
    expect(result.exitCode).toBe(1);
    const errors = data.findings.filter((f) => f.rule === "CSP-ORIGIN-01");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(errors[0].origin).toBe("https://matomo-proxy.example.com");
    expect(errors[0].directive).toBe("script-src");
  });

  it("passes when all script origins are covered by script-src", async () => {
    await writeHeaders(
      "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' matomo-proxy.example.com\n",
    );
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><script src="https://matomo-proxy.example.com/lib.js"></script></body></html>`,
    );
    const result = await runCspOriginsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("pass");
    expect(data.findings).toHaveLength(0);
  });

  it("passes when script origin is covered by wildcard subdomain in script-src", async () => {
    await writeHeaders(
      "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' *.example.com\n",
    );
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><script src="https://matomo-proxy.example.com/lib.js"></script></body></html>`,
    );
    const result = await runCspOriginsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("pass");
  });

  it("passes when script origin is covered by default-src fallback", async () => {
    await writeHeaders("Content-Security-Policy: default-src 'self' matomo-proxy.example.com\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><script src="https://matomo-proxy.example.com/lib.js"></script></body></html>`,
    );
    const result = await runCspOriginsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("pass");
  });

  it("emits CSP-ORIGIN-02 error for missing style origin", async () => {
    await writeHeaders("Content-Security-Policy: default-src 'self'; style-src 'self'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><head><link rel="stylesheet" href="https://cdn.example.com/style.css"></head></html>`,
    );
    const result = await runCspOriginsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("fail");
    const errors = data.findings.filter((f) => f.rule === "CSP-ORIGIN-02");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(errors[0].directive).toBe("style-src");
  });

  it("emits CSP-ORIGIN-03 warning for missing image origin (exitCode 0)", async () => {
    await writeHeaders("Content-Security-Policy: default-src 'self'; img-src 'self' data:\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><img src="https://cdn.example.com/img.png"></body></html>`,
    );
    const result = await runCspOriginsValidate(input, ctx());
    const data = getData(result);
    const warnings = data.findings.filter((f) => f.rule === "CSP-ORIGIN-03");
    expect(warnings).toHaveLength(1);
    expect(warnings[0].severity).toBe("warning");
    expect(result.exitCode).toBe(0);
  });

  it("emits CSP-ORIGIN-04 error for missing connect origin in fetch()", async () => {
    await writeHeaders("Content-Security-Policy: default-src 'self'; connect-src 'self'\n");
    await writeSystemMd("example.com");
    await writeHtml(
      "index.html",
      `<html><body><script>fetch("https://api.example.com/data");</script></body></html>`,
    );
    const result = await runCspOriginsValidate(input, ctx());
    const data = getData(result);
    expect(data.status).toBe("fail");
    const errors = data.findings.filter((f) => f.rule === "CSP-ORIGIN-04");
    expect(errors).toHaveLength(1);
    expect(errors[0].severity).toBe("error");
    expect(errors[0].directive).toBe("connect-src");
  });

  it("deduplicates findings for the same origin across multiple files", async () => {
    await writeHeaders("Content-Security-Policy: default-src 'self'; script-src 'self'\n");
    await writeSystemMd("example.com");
    const html = `<html><body><script src="https://cdn.example.com/lib.js"></script></body></html>`;
    await writeHtml("page1.html", html);
    await writeHtml("page2.html", html);
    const result = await runCspOriginsValidate(input, ctx());
    const data = getData(result);
    const errors = data.findings.filter((f) => f.rule === "CSP-ORIGIN-01");
    expect(errors).toHaveLength(1);
  });

  it("includes parsed cspDirectives in result", async () => {
    await writeHeaders(
      "Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'\n",
    );
    await writeSystemMd("example.com");
    await writeHtml("index.html", "<html></html>");
    const result = await runCspOriginsValidate(input, ctx());
    const data = getData(result);
    expect(data.cspDirectives).toHaveProperty("default-src", ["'self'"]);
    expect(data.cspDirectives).toHaveProperty("script-src", ["'self'", "'unsafe-inline'"]);
  });
});
