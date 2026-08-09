/*
<MODULE_CONTRACT>
<purpose>Unit tests for surface.heading-uniqueness.validate (RFC-0690, RFC-0696) — pure function extractBlockHeadings and kernel handler runSurfaceHeadingUniquenessValidate.</purpose>
<non-goals>
  <item>Do not test Axiom landmark-unique — that is Axiom's responsibility.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0690: initial test suite.</item>
  <item>RFC-0696: update import to extractBlockHeadings; add test cases for non-section block headings and nested block double-counting prevention.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  extractBlockHeadings,
  runSurfaceHeadingUniquenessValidate,
} from "../surface-heading-uniqueness.ts";
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

function extractDiagnostics(result: { data?: unknown }): Array<{
  ruleId: string;
  severity: string;
  message: string;
  file?: string;
  fixHint?: string;
}> {
  const data = result.data as
    | {
        diagnostics?: Array<{
          ruleId: string;
          severity: string;
          message: string;
          file?: string;
          fixHint?: string;
        }>;
      }
    | undefined;
  return data?.diagnostics ?? [];
}

describe("extractBlockHeadings (pure function)", () => {
  it("unique headings — no duplicates", () => {
    const html = `
      <html><body>
        <section><h2>Alpha</h2><p>content</p></section>
        <section><h2>Beta</h2><p>content</p></section>
        <section><h2>Gamma</h2><p>content</p></section>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("alpha")).toBe(1);
    expect(counts.get("beta")).toBe(1);
    expect(counts.get("gamma")).toBe(1);
  });

  it("duplicate h2 text in two sections — count is 2", () => {
    const html = `
      <html><body>
        <section><h2>Focus</h2><p>content</p></section>
        <section><h2>Focus</h2><p>content</p></section>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("focus")).toBe(2);
  });

  it("duplicate h3 text — count is 3", () => {
    const html = `
      <html><body>
        <section><h3>Practical</h3></section>
        <section><h3>Practical</h3></section>
        <section><h3>Practical</h3></section>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("practical")).toBe(3);
  });

  it("section without h2 or h3 — skipped", () => {
    const html = `
      <html><body>
        <section><p>No heading here</p></section>
        <section><h2>Only One</h2></section>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.size).toBe(1);
    expect(counts.get("only one")).toBe(1);
  });

  it("section with h3 but no h2 — uses h3 text", () => {
    const html = `
      <html><body>
        <section><h3>Subheading</h3></section>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("subheading")).toBe(1);
  });

  it("h2 takes precedence over h3 — first h2 descendant is used", () => {
    const html = `
      <html><body>
        <section>
          <h2>Primary</h2>
          <h3>Secondary</h3>
        </section>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("primary")).toBe(1);
    expect(counts.has("secondary")).toBe(false);
  });

  it("whitespace normalization — extra spaces collapsed", () => {
    const html = `
      <html><body>
        <section><h2>  Hello   World  </h2></section>
        <section><h2>Hello World</h2></section>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("hello world")).toBe(2);
  });

  it("case normalization — uppercase and lowercase match", () => {
    const html = `
      <html><body>
        <section><h2>HEADING</h2></section>
        <section><h2>heading</h2></section>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("heading")).toBe(2);
  });

  it("empty HTML string — no violations", () => {
    const counts = extractBlockHeadings("");
    expect(counts.size).toBe(0);
  });

  it("nested sections — inner section heading also counted", () => {
    const html = `
      <html><body>
        <section>
          <h2>Outer</h2>
          <section><h2>Inner</h2></section>
        </section>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("outer")).toBe(1);
    expect(counts.get("inner")).toBe(1);
  });

  it("heading with nested elements — text content extracted", () => {
    const html = `
      <html><body>
        <section><h2><span>Contact</span> Us</h2></section>
        <section><h2>Contact Us</h2></section>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("contact us")).toBe(2);
  });

  it("non-section block with aria-labelledby — heading counted", () => {
    const html = `
      <html><body>
        <div aria-labelledby="lbl-1"><h2>Overview</h2></div>
        <div aria-labelledby="lbl-2"><h2>Details</h2></div>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("overview")).toBe(1);
    expect(counts.get("details")).toBe(1);
  });

  it("duplicate heading in non-section blocks with aria-labelledby — count is 2", () => {
    const html = `
      <html><body>
        <div aria-labelledby="lbl-1"><h2>Focus</h2></div>
        <div aria-labelledby="lbl-2"><h2>Focus</h2></div>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("focus")).toBe(2);
  });

  it("div without aria-labelledby — heading not counted", () => {
    const html = `
      <html><body>
        <div><h2>Ignored</h2></div>
        <section><h2>Counted</h2></section>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.has("ignored")).toBe(false);
    expect(counts.get("counted")).toBe(1);
  });

  it("article and aside with aria-labelledby — headings counted", () => {
    const html = `
      <html><body>
        <article aria-labelledby="lbl-1"><h2>Article Title</h2></article>
        <aside aria-labelledby="lbl-2"><h2>Aside Title</h2></aside>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("article title")).toBe(1);
    expect(counts.get("aside title")).toBe(1);
  });

  it("nested block double-counting prevention — section heading not double-counted via child div", () => {
    const html = `
      <html><body>
        <section>
          <div aria-labelledby="lbl-1"><h2>Inner Heading</h2></div>
        </section>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("inner heading")).toBe(1);
  });

  it("section and child div with different headings — both counted independently", () => {
    const html = `
      <html><body>
        <section>
          <h2>Outer Heading</h2>
          <div aria-labelledby="lbl-1"><h2>Inner Heading</h2></div>
        </section>
      </body></html>
    `;
    const counts = extractBlockHeadings(html);
    expect(counts.get("outer heading")).toBe(1);
    expect(counts.get("inner heading")).toBe(1);
  });
});

describe("runSurfaceHeadingUniquenessValidate (handler)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "heading-uniq-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("no app context — returns error", async () => {
    const ctx = makeContext(tmpDir);
    const result = await runSurfaceHeadingUniquenessValidate(makeInput(), ctx);
    expect(result.exitCode).toBe(1);
  });

  it("no surface artifact — no-op pass", async () => {
    const ctx = makeContext(tmpDir, tmpDir);
    const result = await runSurfaceHeadingUniquenessValidate(makeInput(), ctx);
    expect(result.exitCode).toBe(0);
  });

  it("no dist/client — no-op pass", async () => {
    const artifact = {
      entries: [
        {
          pageId: "test-page",
          surfaceId: "website-local",
          indexable: true,
          routes: { de: "/de/test/" },
        },
      ],
    };
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src/surface.generated.yaml"), JSON.stringify(artifact));
    const ctx = makeContext(tmpDir, tmpDir);
    const result = await runSurfaceHeadingUniquenessValidate(makeInput(), ctx);
    expect(result.exitCode).toBe(0);
  });

  it("duplicate headings on surface page — HEADING-UNIQ-01 diagnostic", async () => {
    const artifact = {
      entries: [
        {
          pageId: "test-page",
          surfaceId: "website-local",
          indexable: true,
          routes: { de: "/de/test/" },
        },
      ],
    };
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src/surface.generated.yaml"), JSON.stringify(artifact));
    mkdirSync(join(tmpDir, "dist/client/de/test"), { recursive: true });
    writeFileSync(
      join(tmpDir, "dist/client/de/test/index.html"),
      `<html><body>
        <section><h2>Focus</h2><p>content</p></section>
        <section><h2>Focus</h2><p>content</p></section>
        <section><h2>Focus</h2><p>content</p></section>
      </body></html>`,
    );
    const ctx = makeContext(tmpDir, tmpDir);
    const result = await runSurfaceHeadingUniquenessValidate(makeInput(), ctx);
    expect(result.exitCode).toBe(1);
    const diags = extractDiagnostics(result);
    expect(diags).toHaveLength(1);
    expect(diags[0].ruleId).toBe("HEADING-UNIQ-01");
    expect(diags[0].severity).toBe("error");
    expect(diags[0].message).toContain("focus");
    expect(diags[0].message).toContain("3 times");
    expect(diags[0].message).toContain("block heading");
    expect(diags[0].fixHint).toContain("aria-labelledby");
  });

  it("unique headings on surface page — pass", async () => {
    const artifact = {
      entries: [
        {
          pageId: "test-page",
          surfaceId: "website-local",
          indexable: true,
          routes: { de: "/de/test/" },
        },
      ],
    };
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src/surface.generated.yaml"), JSON.stringify(artifact));
    mkdirSync(join(tmpDir, "dist/client/de/test"), { recursive: true });
    writeFileSync(
      join(tmpDir, "dist/client/de/test/index.html"),
      `<html><body>
        <section><h2>Alpha</h2><p>content</p></section>
        <section><h2>Beta</h2><p>content</p></section>
      </body></html>`,
    );
    const ctx = makeContext(tmpDir, tmpDir);
    const result = await runSurfaceHeadingUniquenessValidate(makeInput(), ctx);
    expect(result.exitCode).toBe(0);
    const diags = extractDiagnostics(result);
    expect(diags).toHaveLength(0);
  });

  it("non-surface page — skipped (no diagnostic)", async () => {
    const artifact = {
      entries: [
        {
          pageId: "test-page",
          surfaceId: "website-local",
          indexable: true,
          routes: { de: "/de/test/" },
        },
      ],
    };
    mkdirSync(join(tmpDir, "src"), { recursive: true });
    writeFileSync(join(tmpDir, "src/surface.generated.yaml"), JSON.stringify(artifact));
    mkdirSync(join(tmpDir, "dist/client/de/other"), { recursive: true });
    writeFileSync(
      join(tmpDir, "dist/client/de/other/index.html"),
      `<html><body>
        <section><h2>Duplicate</h2></section>
        <section><h2>Duplicate</h2></section>
      </body></html>`,
    );
    const ctx = makeContext(tmpDir, tmpDir);
    const result = await runSurfaceHeadingUniquenessValidate(makeInput(), ctx);
    expect(result.exitCode).toBe(0);
    const diags = extractDiagnostics(result);
    expect(diags).toHaveLength(0);
  });
});
