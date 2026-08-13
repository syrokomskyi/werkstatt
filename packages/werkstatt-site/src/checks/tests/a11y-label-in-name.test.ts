/*
<MODULE_CONTRACT>
<purpose>Unit tests for a11y.label-in-name.validate (RFC-0832) — pure function extractLabelInNameViolations and kernel handler runA11yLabelInNameValidate.</purpose>
<non-goals>
  <item>Do not test WCAG 2.5.3 compliance in general — only the A11Y-LIN-01 rule as defined in RFC-0832.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0832: initial test suite.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  extractLabelInNameViolations,
  runA11yLabelInNameValidate,
} from "../a11y-label-in-name.ts";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";

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

describe("extractLabelInNameViolations (pure function)", () => {
  it("matching aria-label contains visible text — no violation", () => {
    const html = `<html><body><a href="/" aria-label="Contact us">Contact us</a></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("aria-label does not contain visible text — A11Y-LIN-01 violation", () => {
    const html = `<html><body><a href="/" aria-label="Click here">Contact us</a></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(1);
    expect(violations[0].visibleText).toBe("contact us");
    expect(violations[0].accessibleName).toBe("click here");
  });

  it("icon-only button (no text content) — skipped, no violation", () => {
    const html = `<html><body><button aria-label="Close menu"></button></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("nav aria-label with link text — skipped (non-interactive element), no violation", () => {
    const html = `<html><body><nav aria-label="Main navigation"><a href="/">Home</a></nav></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("a with aria-label not containing visible text — violation", () => {
    const html = `<html><body><a href="/" aria-label="Click here">Contact us</a></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(1);
    expect(violations[0].visibleText).toBe("contact us");
    expect(violations[0].accessibleName).toBe("click here");
  });

  it("a with aria-label containing visible text — no violation", () => {
    const html = `<html><body><a href="/" aria-label="Contact us — send message">Contact us</a></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("button with aria-hidden=true — skipped", () => {
    const html = `<html><body><button aria-hidden="true" aria-label="Hidden">Close</button></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("input type=hidden with aria-label — skipped", () => {
    const html = `<html><body><input type="hidden" aria-label="Token" /></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("div role=button with matching text — no violation", () => {
    const html = `<html><body><div role="button" aria-label="Open menu">Open menu</div></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("div role=button with mismatched text — violation", () => {
    const html = `<html><body><div role="button" aria-label="Expand">Open</div></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(1);
    expect(violations[0].visibleText).toBe("open");
    expect(violations[0].accessibleName).toBe("expand");
  });

  it("span with aria-label (non-interactive, no role) — skipped", () => {
    const html = `<html><body><span aria-label="Label">Text</span></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("case-insensitive matching — no violation", () => {
    const html = `<html><body><a href="/" aria-label="CONTACT US">Contact us</a></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("whitespace normalization — no violation", () => {
    const html = `<html><body><a href="/" aria-label="Contact  Us">Contact us</a></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("empty HTML — no violations", () => {
    const violations = extractLabelInNameViolations("");
    expect(violations).toHaveLength(0);
  });

  it("malformed HTML — no crash, returns empty", () => {
    const html = `<html><body><a href="/" aria-label="Click"><div><span>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("button with nested span text — text content extracted", () => {
    const html = `<html><body><button aria-label="Submit form"><span>Submit</span></button></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("select with aria-label and visible text — checked", () => {
    const html = `<html><body><select aria-label="Choose language">Choose language</select></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("textarea with aria-label mismatch — violation", () => {
    const html = `<html><body><textarea aria-label="Your message">Enter text here</textarea></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(1);
    expect(violations[0].visibleText).toBe("enter text here");
    expect(violations[0].accessibleName).toBe("your message");
  });

  it("svg with aria-label — skipped", () => {
    const html = `<html><body><svg aria-label="Icon"><text>Icon</text></svg></body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(0);
  });

  it("multiple violations in one document", () => {
    const html = `<html><body>
      <a href="/" aria-label="Click here">Contact us</a>
      <button aria-label="Close">Submit</button>
    </body></html>`;
    const violations = extractLabelInNameViolations(html);
    expect(violations).toHaveLength(2);
  });
});

describe("runA11yLabelInNameValidate (handler)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "a11y-lin-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("no app context — returns error", async () => {
    const ctx = makeContext(tmpDir);
    const result = await runA11yLabelInNameValidate(makeInput(), ctx);
    expect(result.exitCode).toBe(1);
  });

  it("no dist/client — pass with exitCode 0", async () => {
    const ctx = makeContext(tmpDir, tmpDir);
    const result = await runA11yLabelInNameValidate(makeInput(), ctx);
    expect(result.exitCode).toBe(0);
  });

  it("HTML with violation — exitCode 1, A11Y-LIN-01 diagnostic", async () => {
    mkdirSync(join(tmpDir, "dist/client/de"), { recursive: true });
    writeFileSync(
      join(tmpDir, "dist/client/de/index.html"),
      `<html><body><a href="/" aria-label="Click here">Contact us</a></body></html>`,
    );
    const ctx = makeContext(tmpDir, tmpDir);
    const result = await runA11yLabelInNameValidate(makeInput(), ctx);
    expect(result.exitCode).toBe(1);
    const diags = extractDiagnostics(result);
    expect(diags).toHaveLength(1);
    expect(diags[0].ruleId).toBe("A11Y-LIN-01");
    expect(diags[0].severity).toBe("error");
    expect(diags[0].message).toContain("contact us");
    expect(diags[0].message).toContain("click here");
    expect(diags[0].fixHint).toContain("aria-label");
    expect(diags[0].file).toContain("dist/client/de/index.html");
  });

  it("HTML with no violations — exitCode 0", async () => {
    mkdirSync(join(tmpDir, "dist/client/de"), { recursive: true });
    writeFileSync(
      join(tmpDir, "dist/client/de/index.html"),
      `<html><body><a href="/" aria-label="Contact us">Contact us</a></body></html>`,
    );
    const ctx = makeContext(tmpDir, tmpDir);
    const result = await runA11yLabelInNameValidate(makeInput(), ctx);
    expect(result.exitCode).toBe(0);
    const diags = extractDiagnostics(result);
    expect(diags).toHaveLength(0);
  });

  it("nav landmark false-positive guard — no violation", async () => {
    mkdirSync(join(tmpDir, "dist/client/de"), { recursive: true });
    writeFileSync(
      join(tmpDir, "dist/client/de/index.html"),
      `<html><body><nav aria-label="Main"><a href="/">Home</a></nav></body></html>`,
    );
    const ctx = makeContext(tmpDir, tmpDir);
    const result = await runA11yLabelInNameValidate(makeInput(), ctx);
    expect(result.exitCode).toBe(0);
    const diags = extractDiagnostics(result);
    expect(diags).toHaveLength(0);
  });

  it("multiple HTML files — violations from all files", async () => {
    mkdirSync(join(tmpDir, "dist/client/de"), { recursive: true });
    mkdirSync(join(tmpDir, "dist/client/en"), { recursive: true });
    writeFileSync(
      join(tmpDir, "dist/client/de/index.html"),
      `<html><body><a href="/" aria-label="Klick">Kontakt</a></body></html>`,
    );
    writeFileSync(
      join(tmpDir, "dist/client/en/index.html"),
      `<html><body><button aria-label="Close">Submit</button></body></html>`,
    );
    const ctx = makeContext(tmpDir, tmpDir);
    const result = await runA11yLabelInNameValidate(makeInput(), ctx);
    expect(result.exitCode).toBe(1);
    const diags = extractDiagnostics(result);
    expect(diags).toHaveLength(2);
  });
});
