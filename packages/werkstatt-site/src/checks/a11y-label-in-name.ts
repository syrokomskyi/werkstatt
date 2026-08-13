/*
<MODULE_CONTRACT>
<purpose>
RFC-0832: a11y.label-in-name.validate — scan all rendered HTML in dist/client/
for interactive elements with aria-label and check that the accessible name
includes the element's visible text content (WCAG 2.5.3 Label in Name).
Checks <a>, <button>, <input>, <select>, <textarea> and elements with
interactive ARIA roles. Skips landmark/structural elements like <nav aria-label>
where the label names the region, not the content.
</purpose>
<non-goals>
  <item>Do not check non-interactive elements (nav, main, aside, header, footer, section, div, span) — WCAG 2.5.3 applies to user interface components with labels, not landmark regions.</item>
  <item>Do not check elements with aria-hidden="true" — not exposed to assistive technology.</item>
  <item>Do not check <input type="hidden"> — not visible.</item>
  <item>Do not check SVG elements — visible text is often not the accessible name.</item>
  <item>Do not modify HTML — this is a read-only validator.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0832: initial — WCAG 2.5.3 Label in Name validator using parse5 and interactive element filtering.</item>
</CHANGE_SUMMARY>
*/

import { join, relative } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { collectFiles } from "@warpgogol/werkstatt-site/share/fs";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult, passResult } from "./result-helpers.ts";

type TreeNode = DefaultTreeAdapterMap["node"];
type TreeParentNode = DefaultTreeAdapterMap["parentNode"];
type TreeElementNode = DefaultTreeAdapterMap["element"];
type TreeTextNode = DefaultTreeAdapterMap["textNode"];

const DIST_CLIENT_DIR = "dist/client";

const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea"]);

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "checkbox",
  "radio",
  "tab",
  "menuitem",
  "option",
  "switch",
  "textbox",
]);

export interface LabelInNameViolation {
  visibleText: string;
  accessibleName: string;
  element: string;
}

function isElementNode(node: TreeNode): node is TreeElementNode {
  return "tagName" in node;
}

function hasChildNodes(node: TreeNode): node is TreeParentNode {
  return "childNodes" in node;
}

function isTextNode(node: TreeNode): node is TreeTextNode {
  return node.nodeName === "#text";
}

function getAttr(element: TreeElementNode, name: string): string | undefined {
  const attrs = element.attrs ?? [];
  for (const attr of attrs) {
    if (attr.name === name) return attr.value;
  }
  return undefined;
}

function isInteractiveElement(node: TreeNode): node is TreeElementNode {
  if (!isElementNode(node)) return false;
  if (INTERACTIVE_TAGS.has(node.tagName)) return true;
  const role = getAttr(node, "role");
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  return false;
}

function hasAriaHidden(element: TreeElementNode): boolean {
  return getAttr(element, "aria-hidden") === "true";
}

function isHiddenInput(element: TreeElementNode): boolean {
  return element.tagName === "input" && getAttr(element, "type") === "hidden";
}

function isSvgElement(node: TreeNode): boolean {
  if (!isElementNode(node)) return false;
  return node.tagName === "svg" || node.tagName === "SVG";
}

function collectTextContent(node: TreeNode): string {
  if (isTextNode(node)) {
    return node.value;
  }
  if (!hasChildNodes(node)) {
    return "";
  }
  return node.childNodes.map(collectTextContent).join("");
}

function normalizeWhitespace(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildElementSelector(element: TreeElementNode): string {
  const id = getAttr(element, "id");
  const classAttr = getAttr(element, "class");
  const classList = classAttr
    ? classAttr
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((c) => `.${c}`)
        .join("")
    : "";
  const role = getAttr(element, "role");
  const roleSuffix = role && !INTERACTIVE_TAGS.has(element.tagName) ? `[role=${role}]` : "";
  return `${element.tagName}${id ? `#${id}` : ""}${classList}${roleSuffix}`;
}

function findInteractiveElementsWithAriaLabel(
  node: TreeParentNode,
  results: TreeElementNode[] = [],
): TreeElementNode[] {
  const children = node.childNodes;
  if (!children) return results;
  for (const child of children) {
    if (isSvgElement(child)) continue;
    if (isInteractiveElement(child) && getAttr(child, "aria-label")) {
      if (!hasAriaHidden(child) && !isHiddenInput(child)) {
        results.push(child);
      }
    }
    if (hasChildNodes(child)) {
      findInteractiveElementsWithAriaLabel(child, results);
    }
  }
  return results;
}

export function extractLabelInNameViolations(html: string): LabelInNameViolation[] {
  const violations: LabelInNameViolation[] = [];
  let document: TreeParentNode;
  try {
    document = parse(html);
  } catch {
    return violations;
  }

  const elements = findInteractiveElementsWithAriaLabel(document);
  for (const element of elements) {
    const ariaLabel = getAttr(element, "aria-label");
    if (!ariaLabel) continue;

    const visibleText = normalizeWhitespace(collectTextContent(element));
    if (visibleText.length === 0) continue;

    const accessibleName = normalizeWhitespace(ariaLabel);
    if (!accessibleName.includes(visibleText)) {
      violations.push({
        visibleText,
        accessibleName,
        element: buildElementSelector(element),
      });
    }
  }

  return violations;
}

export async function runA11yLabelInNameValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const app = context.site;
  if (!app) {
    return {
      exitCode: 1,
      summary: "a11y.label-in-name.validate must run inside an app context.",
    };
  }

  const distClientDir = join(app.directory, DIST_CLIENT_DIR);
  if (!existsSync(distClientDir)) {
    return passResult(
      "a11y.label-in-name.validate",
      "skipped (no dist/client — run astro build first)",
    );
  }

  const htmlFiles = await collectFiles(distClientDir, {
    extensions: [".html"],
    ignore: () => false,
  });
  const diagnostics: Diagnostic[] = [];

  for (const htmlFile of htmlFiles) {
    let rawHtml: string;
    try {
      rawHtml = await readFile(htmlFile, "utf8");
    } catch {
      continue;
    }

    const violations = extractLabelInNameViolations(rawHtml);
    for (const v of violations) {
      diagnostics.push({
        ruleId: "A11Y-LIN-01",
        severity: "error" as const,
        message: `Element with aria-label='${v.accessibleName}' does not include visible text '${v.visibleText}' in its accessible name`,
        file: relative(app.directory, htmlFile).replace(/\\/g, "/"),
        fixHint:
          "Either include the visible text in aria-label (e.g. 'Situation beschreiben — Anfrage senden') or remove aria-label and let the visible text be the accessible name",
        data: {
          visibleText: v.visibleText,
          accessibleName: v.accessibleName,
          element: v.element,
        },
      });
    }
  }

  return diagnosticsResult("a11y.label-in-name.validate", diagnostics);
}
