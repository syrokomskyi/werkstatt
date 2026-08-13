/*
<MODULE_CONTRACT>
<purpose>
  Shared parse5 DOM traversal helpers for check validators that scan rendered
  HTML. Eliminates duplicated ElementNode interface, isElementNode/hasChildNodes
  guards, getAttr, and walk-pattern boilerplate across image-delivery.ts and
  csp-origins.ts.
</purpose>
<non-goals>
  <item>Do not implement validator-specific logic — only generic DOM traversal utilities.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0831: initial extraction from image-delivery.ts and csp-origins.ts — shared ElementNode, isElementNode, hasChildNodes, getAttr, isTextNode, getTextContent.</item>
</CHANGE_SUMMARY>
*/

import type { DefaultTreeAdapterMap } from "parse5";

type TreeNode = DefaultTreeAdapterMap["node"];
type TreeParentNode = DefaultTreeAdapterMap["parentNode"];

export interface ElementNode {
  nodeName: string;
  tagName: string;
  attrs: Array<{ name: string; value: string }>;
  childNodes: TreeNode[];
  sourceCodeLocation?: { startLine?: number };
}

export function isElementNode(node: unknown): node is ElementNode {
  return node !== null && typeof node === "object" && "tagName" in node;
}

export function hasChildNodes(node: TreeNode): node is TreeParentNode {
  return node !== null && typeof node === "object" && "childNodes" in node;
}

export function getAttr(el: ElementNode, name: string): string | undefined {
  return el.attrs?.find((a: { name: string; value: string }) => a.name === name)?.value;
}

interface TextNode {
  nodeName: string;
  value: string;
}

export function isTextNode(node: unknown): node is TextNode {
  return node !== null && typeof node === "object" && "nodeName" in node && (node as { nodeName: string }).nodeName === "#text";
}

export function getTextContent(node: TreeParentNode): string {
  if (!node.childNodes) return "";
  let text = "";
  for (const child of node.childNodes) {
    if (isTextNode(child)) {
      text += child.value;
    } else if (hasChildNodes(child) && isElementNode(child)) {
      text += getTextContent(child as TreeParentNode);
    }
  }
  return text;
}

export type { TreeNode, TreeParentNode };
