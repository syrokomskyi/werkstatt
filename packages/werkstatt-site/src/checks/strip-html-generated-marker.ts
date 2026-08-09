/*
<MODULE_CONTRACT>
<purpose>
  ADR-0018: parser-based HTML comment removal for RFC-0081 GENERATED_MARKER.
  Uses parse5 to parse HTML into a DOM tree, find the comment node containing
  the marker, and remove only that node. Structurally impossible to accidentally
  remove non-comment content.
</purpose>
<keywords>ADR-0018, generated marker, parse5, HTML comment stripping, RFC-0081</keywords>
<responsibilities>
  <item>Parse HTML content with parse5 into a document tree.</item>
  <item>Traverse the tree to find comment nodes containing GENERATED_MARKER.</item>
  <item>Remove only the matching comment node(s) from the tree.</item>
  <item>Serialize the tree back to HTML and report whether content changed.</item>
</responsibilities>
<non-goals>
  <item>Do not handle CSS, markdown, or line-comment formats — those remain in site-kernel's regex-based stripGeneratedMarker.</item>
  <item>Do not perform file I/O — operates on in-memory content strings only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>ADR-0018: initial implementation — parse5-based HTML comment removal.</item>
  <item>ADR-0018 review fix: typed DefaultTreeNode instead of any, try/catch on parse() for malformed HTML, removed unused sourceCodeLocationInfo.</item>
</CHANGE_SUMMARY>
*/

import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";
import { GENERATED_MARKER } from "@warpgogol/werkstatt/kernel";

type TreeNode = DefaultTreeAdapterMap["node"];
type TreeParentNode = DefaultTreeAdapterMap["parentNode"];
type TreeCommentNode = DefaultTreeAdapterMap["commentNode"];

function isCommentNode(node: TreeNode): node is TreeCommentNode {
  return node.nodeName === "#comment";
}

function hasChildNodes(node: TreeNode): node is TreeParentNode {
  return "childNodes" in node;
}

export interface StripHtmlGeneratedMarkerResult {
  changed: boolean;
  content: string;
}

/**
 * Remove HTML comment nodes containing the RFC-0081 GENERATED_MARKER from
 * the given HTML content using parse5. This is structurally correct — it
 * parses the HTML into a DOM tree, finds comment nodes containing the marker,
 * and removes only those nodes. It cannot accidentally swallow content between
 * separate comments (the bug that affected the regex-based approach).
 *
 * ADR-0018: replaces the regex-based HTML block-comment stripping in
 * stripGeneratedMarker for .html files in dist/client.
 */
export function stripHtmlGeneratedMarker(content: string): StripHtmlGeneratedMarkerResult {
  if (!content.includes(GENERATED_MARKER)) {
    return { changed: false, content };
  }

  let document: TreeParentNode;
  try {
    document = parse(content);
  } catch {
    return { changed: false, content };
  }

  let removed = false;

  function removeMarkerComments(node: TreeParentNode): void {
    const children = node.childNodes;
    if (!children) return;

    const toRemove: number[] = [];
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      if (isCommentNode(child) && child.data?.includes(GENERATED_MARKER)) {
        toRemove.push(i);
        removed = true;
      } else if (hasChildNodes(child)) {
        removeMarkerComments(child);
      }
    }

    // Remove in reverse order to preserve indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      children.splice(toRemove[i], 1);
    }
  }

  removeMarkerComments(document);

  if (!removed) {
    return { changed: false, content };
  }

  const serialized = serialize(document);
  return { changed: true, content: serialized };
}
