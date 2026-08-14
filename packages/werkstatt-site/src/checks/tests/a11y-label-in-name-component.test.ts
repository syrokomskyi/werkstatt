/*
<MODULE_CONTRACT>
  <purpose>
    Test coverage for a11y.label-in-name.component.validate — proves the validator
    catches aria-label/visible text mismatches in .astro component source files
    and passes when the aria-label references the visible text variable.
  </purpose>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0836: initial — unit tests for component-level WCAG 2.5.3 Label in Name validator.</item>
</CHANGE_SUMMARY>
*/

import { describe, it, expect } from "vitest";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultIO } from "@warpgogol/werkstatt/kernel";
import type { KernelCommandInput, KernelRuntimeContext } from "@warpgogol/werkstatt/kernel";
import { runA11yLabelInNameComponentValidate } from "../a11y-label-in-name-component.ts";
import { extractComponentLabelInNameViolations } from "../a11y-label-in-name-component.ts";

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

async function createUiDir(root: string): Promise<string> {
  const uiDir = join(root, "packages", "werkstatt-site", "src", "domain", "ui");
  await mkdir(uiDir, { recursive: true });
  return uiDir;
}

describe("extractComponentLabelInNameViolations (pure function)", () => {
  it("red: flags aria-label without visible text variable reference", () => {
    const source = `---
---
<a aria-label={props.ctaAriaLabel}>
  {props.ctaLabel}
</a>`;
    const findings = extractComponentLabelInNameViolations(source);
    expect(findings.length).toBe(1);
    expect(findings[0].rule).toBe("A11Y-LIN-COMP-01");
    expect(findings[0].element).toBe("a");
    expect(findings[0].ariaLabelExpr).toBe("{props.ctaAriaLabel}");
    expect(findings[0].visibleTextExpr).toBe("{props.ctaLabel}");
  });

  it("green: resolvedAriaLabel containing label variable name is safe", () => {
    const source = `---
---
<a aria-label={resolvedAriaLabel}>
  <span>{label}</span>
</a>`;
    const findings = extractComponentLabelInNameViolations(source);
    expect(findings.length).toBe(0);
  });

  it("green: resolveLabelInName helper call is safe", () => {
    const source = `---
---
<a aria-label={resolveLabelInName(ariaLabel, label)}>
  {label}
</a>`;
    const findings = extractComponentLabelInNameViolations(source);
    expect(findings.length).toBe(0);
  });

  it("green: template literal with label variable is safe", () => {
    const source = `---
---
<a aria-label={\`\${label} — \${ariaLabel}\`}>
  {label}
</a>`;
    const findings = extractComponentLabelInNameViolations(source);
    expect(findings.length).toBe(0);
  });

  it("green: icon-only button with no visible text expression is safe", () => {
    const source = `---
---
<button aria-label={content.copyButtonLabel}>
  <svg>...</svg>
</button>`;
    const findings = extractComponentLabelInNameViolations(source);
    expect(findings.length).toBe(0);
  });

  it("green: non-interactive element with aria-label is not checked", () => {
    const source = `---
---
<div aria-label={someLabel}>
  {otherLabel}
</div>`;
    const findings = extractComponentLabelInNameViolations(source);
    expect(findings.length).toBe(0);
  });

  it("green: element with role=button is interactive", () => {
    const source = `---
---
<span role="button" aria-label={props.actionAriaLabel}>
  {props.actionLabel}
</span>`;
    const findings = extractComponentLabelInNameViolations(source);
    expect(findings.length).toBe(1);
    expect(findings[0].element).toBe("span");
  });

  it("green: no aria-label means no violation", () => {
    const source = `---
---
<a href={props.href}>
  {props.ctaLabel}
</a>`;
    const findings = extractComponentLabelInNameViolations(source);
    expect(findings.length).toBe(0);
  });

  it("green: self-closing element is skipped", () => {
    const source = `---
---
<input aria-label={props.inputLabel} type="text" />`;
    const findings = extractComponentLabelInNameViolations(source);
    expect(findings.length).toBe(0);
  });

  it("red: multiple violations in one file", () => {
    const source = `---
---
<a aria-label={props.linkAriaLabel}>
  {props.linkLabel}
</a>
<button aria-label={props.btnAriaLabel}>
  {props.btnLabel}
</button>`;
    const findings = extractComponentLabelInNameViolations(source);
    expect(findings.length).toBe(2);
  });

  it("green: empty file produces no findings", () => {
    const findings = extractComponentLabelInNameViolations("");
    expect(findings.length).toBe(0);
  });

  it("green: frontmatter with aria-label-like text is not flagged", () => {
    const source = `---
const ariaLabel = "test";
const label = "test";
---
<div>no interactive elements here</div>`;
    const findings = extractComponentLabelInNameViolations(source);
    expect(findings.length).toBe(0);
  });

  it("green: content.xxxLabel variable recognized as visible text", () => {
    const source = `---
---
<a aria-label={content.brandAriaLabel}>
  <span>{content.brandLabel}</span>
</a>`;
    const findings = extractComponentLabelInNameViolations(source);
    expect(findings.length).toBe(1);
    expect(findings[0].visibleTextExpr).toBe("{content.brandLabel}");
  });
});

describe("runA11yLabelInNameComponentValidate (handler)", () => {
  it("red: flags violation in .astro file", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-lin-comp-red-"));
    try {
      const uiDir = await createUiDir(root);
      await mkdir(join(uiDir, "sections", "test-section"), { recursive: true });
      await writeFile(
        join(uiDir, "sections", "test-section", "test-section.astro"),
        `---
---
<a aria-label={props.ctaAriaLabel}>
  {props.ctaLabel}
</a>`,
        "utf8",
      );

      const result = await runA11yLabelInNameComponentValidate(input, ctx(root));
      expect(result.exitCode).toBe(1);
      const diags = result.data?.diagnostics ?? [];
      expect(diags.some((d) => d.ruleId === "A11Y-LIN-COMP-01")).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: safe pattern passes", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-lin-comp-green-"));
    try {
      const uiDir = await createUiDir(root);
      await mkdir(join(uiDir, "sections", "hero"), { recursive: true });
      await writeFile(
        join(uiDir, "sections", "hero", "hero-section.astro"),
        `---
---
<a aria-label={resolvedAriaLabel}>
  <span>{label}</span>
</a>`,
        "utf8",
      );

      const result = await runA11yLabelInNameComponentValidate(input, ctx(root));
      expect(result.exitCode).toBe(0);
      expect(result.data?.diagnostics.length).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("green: empty ui directory passes", async () => {
    const root = await mkdtemp(join(tmpdir(), "a11y-lin-comp-empty-"));
    try {
      await createUiDir(root);

      const result = await runA11yLabelInNameComponentValidate(input, ctx(root));
      expect(result.exitCode).toBe(0);
      expect(result.data?.diagnostics.length).toBe(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
