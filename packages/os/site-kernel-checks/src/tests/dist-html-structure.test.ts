/*
<MODULE_CONTRACT>
<purpose>Unit tests for dist.html-structure.validate (RFC-0654) — pure function checkHtmlStructure and kernel handler runDistHtmlStructureValidate.</purpose>
<non-goals>
  <item>Do not test accessibility landmark correctness — that is Axiom's responsibility.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0654: initial test suite.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { checkHtmlStructure, runDistHtmlStructureValidate } from "../dist-html-structure.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/site-kernel";

function makeContext(workspaceRoot: string, siteDir?: string): KernelRuntimeContext {
  return {
    workspaceRoot,
    site: siteDir ? { name: "test-app", directory: siteDir } : undefined,
    logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
    dryRun: false,
  } as unknown as KernelRuntimeContext;
}

function makeInput(flags: Record<string, string | boolean> = {}): KernelCommandInput {
  return { args: [], flags } as unknown as KernelCommandInput;
}

function extractViolations(result: { data?: unknown }): Array<{
  file: string;
  rule: string;
  tag: string;
  openCount: number;
  closeCount: number;
  message: string;
}> {
  const data = result.data as
    | {
        violations?: Array<{
          file: string;
          rule: string;
          tag: string;
          openCount: number;
          closeCount: number;
          message: string;
        }>;
      }
    | undefined;
  return data?.violations ?? [];
}

describe("checkHtmlStructure (pure function)", () => {
  it("balanced HTML passes — no violations", () => {
    const html = "<html><head></head><body><main><header></header></main></body></html>";
    const violations = checkHtmlStructure(html);
    expect(violations).toHaveLength(0);
  });

  it("missing opening tag fails", () => {
    const html = "<html><body></main></body></html>";
    const violations = checkHtmlStructure(html);
    expect(violations).toHaveLength(1);
    expect(violations[0].tag).toBe("main");
    expect(violations[0].openCount).toBe(0);
    expect(violations[0].closeCount).toBe(1);
    expect(violations[0].rule).toBe("HTML-STRUCT-01");
  });

  it("missing closing tag fails", () => {
    const html = "<html><body><main></body></html>";
    const violations = checkHtmlStructure(html);
    expect(violations).toHaveLength(1);
    expect(violations[0].tag).toBe("main");
    expect(violations[0].openCount).toBe(1);
    expect(violations[0].closeCount).toBe(0);
  });

  it("void elements are ignored — not in structural tag list", () => {
    const html = '<html><body><br><img src="x"><input type="text"></body></html>';
    const violations = checkHtmlStructure(html);
    expect(violations).toHaveLength(0);
  });

  it("HTML comments with tag-like strings do not cause false positives", () => {
    const html = "<!-- <main> --><html><body></body></html><!-- </main> -->";
    const violations = checkHtmlStructure(html);
    expect(violations).toHaveLength(0);
  });

  it("multiple structural tags checked simultaneously", () => {
    const html =
      "<html><head></head><body><header><nav></nav></header><main></main><footer></footer></body></html>";
    const violations = checkHtmlStructure(html);
    expect(violations).toHaveLength(0);
  });

  it("self-closing variant counted as opening tag", () => {
    const html = "<main />";
    const violations = checkHtmlStructure(html);
    expect(violations).toHaveLength(1);
    expect(violations[0].tag).toBe("main");
    expect(violations[0].openCount).toBe(1);
    expect(violations[0].closeCount).toBe(0);
  });

  it("multiple violations in one file", () => {
    const html = "<html><body></main><header></body></html>";
    const violations = checkHtmlStructure(html);
    expect(violations).toHaveLength(2);
    const tags = violations.map((v) => v.tag).sort();
    expect(tags).toEqual(["header", "main"]);
  });
});

describe("runDistHtmlStructureValidate (kernel handler)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "dist-html-struct-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("no dist/client directory — returns pass with skip message", async () => {
    const result = await runDistHtmlStructureValidate(
      makeInput({ site: "test-app" }),
      makeContext(tmpDir, tmpDir),
    );
    expect(result.exitCode).toBe(0);
    expect(result.summary).toContain("skipped");
  });

  it("clean build passes — balanced HTML files", async () => {
    const distClient = join(tmpDir, "dist", "client");
    mkdirSync(distClient, { recursive: true });
    writeFileSync(
      join(distClient, "index.html"),
      "<html><head></head><body><main></main></body></html>",
    );
    writeFileSync(
      join(distClient, "about.html"),
      "<html><head></head><body><main><header></header></main></body></html>",
    );

    const result = await runDistHtmlStructureValidate(
      makeInput({ site: "test-app" }),
      makeContext(tmpDir, tmpDir),
    );
    expect(result.exitCode).toBe(0);
    const data = result.data as { filesScanned: number; status: string };
    expect(data.filesScanned).toBe(2);
    expect(data.status).toBe("pass");
  });

  it("violations detected — imbalanced HTML files", async () => {
    const distClient = join(tmpDir, "dist", "client");
    mkdirSync(distClient, { recursive: true });
    writeFileSync(join(distClient, "broken.html"), "<html><body></main></body></html>");

    const result = await runDistHtmlStructureValidate(
      makeInput({ site: "test-app" }),
      makeContext(tmpDir, tmpDir),
    );
    expect(result.exitCode).toBe(1);
    const violations = extractViolations(result);
    expect(violations).toHaveLength(1);
    expect(violations[0].tag).toBe("main");
    expect(violations[0].file).toContain("broken.html");
  });

  it("--json output shape matches HtmlStructureValidateResult interface", async () => {
    const distClient = join(tmpDir, "dist", "client");
    mkdirSync(distClient, { recursive: true });
    writeFileSync(
      join(distClient, "index.html"),
      "<html><head></head><body><main></main></body></html>",
    );

    const result = await runDistHtmlStructureValidate(
      makeInput({ site: "test-app" }),
      makeContext(tmpDir, tmpDir),
    );
    const data = result.data as {
      command: string;
      status: string;
      filesScanned: number;
      violations?: unknown[];
    };
    expect(data.command).toBe("dist.html-structure.validate");
    expect(data.status).toBe("pass");
    expect(typeof data.filesScanned).toBe("number");
    expect(data.violations).toBeUndefined();
  });
});
