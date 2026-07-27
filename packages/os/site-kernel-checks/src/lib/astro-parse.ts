/*
<MODULE_CONTRACT>
<purpose>
[RFC-0120] Shared Astro AST utility for the section framework validators.
Wraps @astrojs/compiler `parse` and exposes a small, validator-friendly
query API: walk the component tree, find elements/components by name,
inspect imports, and check identifier ancestry.
</purpose>
<non-goals>
  <item>Do not interpret expression contents — return them as raw strings.</item>
  <item>Do not perform any rule logic — validators own that.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0133: backfilled MODULE_MAP and CHANGE_SUMMARY markers for compass.validate compliance.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { parse as parseAstro } from "@astrojs/compiler";
import type { AttributeNode, Node, ParentNode, TagLikeNode } from "@astrojs/compiler/types";

export interface AstroImport {
  /** Local specifier (e.g. "SectionShell", "Image"). */
  specifier: string;
  /** Source path (e.g. "@warpgogol/ui/components/section-shell.astro"). */
  source: string;
}

export interface AstroParseHandle {
  /** Walk every node in the document tree (depth-first). */
  walk(visitor: (node: Node, ancestors: TagLikeNode[]) => void): void;
  /** Every tag-like node whose `.name` matches (case-sensitive). */
  findByName(name: string): TagLikeNode[];
  /** Parsed `import X from "…"` lines from the frontmatter. */
  imports(): AstroImport[];
  /** True when any ancestor in the chain matches the predicate. */
  insideAncestor(ancestors: TagLikeNode[], predicate: (n: TagLikeNode) => boolean): boolean;
  /** Returns attribute value by name, or undefined. Quoted/expression values are returned raw. */
  attr(node: TagLikeNode, name: string): string | undefined;
  /** Raw source. */
  source: string;
}

function isParent(node: Node): node is ParentNode {
  return (
    node.type === "root" ||
    node.type === "element" ||
    node.type === "component" ||
    node.type === "custom-element" ||
    node.type === "fragment" ||
    node.type === "expression"
  );
}

function isTagLike(node: Node): node is TagLikeNode {
  return (
    node.type === "element" ||
    node.type === "component" ||
    node.type === "custom-element" ||
    node.type === "fragment"
  );
}

function parseFrontmatterImports(frontmatter: string): AstroImport[] {
  const out: AstroImport[] = [];
  // Match: import X from "...";  and  import { A, B } from "...";
  const re = /import\s+(?:([A-Za-z_$][\w$]*)|(?:\{\s*([^}]+)\s*\}))\s+from\s+["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(frontmatter)) !== null) {
    const defaultSpec = m[1];
    const namedGroup = m[2];
    const source = m[3];
    if (defaultSpec) {
      out.push({ specifier: defaultSpec, source });
    } else if (namedGroup) {
      for (const part of namedGroup.split(",")) {
        const name = part
          .trim()
          .split(/\s+as\s+/)[0]
          ?.trim();
        if (name) out.push({ specifier: name, source });
      }
    }
  }
  return out;
}

export async function parseAstroFile(filePath: string): Promise<AstroParseHandle> {
  const source = await readFile(filePath, "utf8");
  return parseAstroSource(source);
}

export async function parseAstroSource(source: string): Promise<AstroParseHandle> {
  const result = await parseAstro(source, { position: false });
  const root = result.ast;

  // Extract frontmatter imports
  let frontmatterRaw = "";
  for (const child of root.children) {
    if (child.type === "frontmatter") {
      frontmatterRaw = child.value;
      break;
    }
  }
  const cachedImports = parseFrontmatterImports(frontmatterRaw);

  // fs.walk.lint: allow — walks the parsed Astro AST in memory, not the filesystem.
  function walk(visitor: (node: Node, ancestors: TagLikeNode[]) => void): void {
    const stack: TagLikeNode[] = [];
    function visit(node: Node): void {
      visitor(node, stack);
      if (!isParent(node)) return;
      const pushed = isTagLike(node);
      if (pushed) stack.push(node);
      for (const child of node.children) visit(child);
      if (pushed) stack.pop();
    }
    visit(root);
  }

  function findByName(name: string): TagLikeNode[] {
    const out: TagLikeNode[] = [];
    walk((node) => {
      if (isTagLike(node) && node.name === name) out.push(node);
    });
    return out;
  }

  function insideAncestor(
    ancestors: TagLikeNode[],
    predicate: (n: TagLikeNode) => boolean,
  ): boolean {
    for (const a of ancestors) if (predicate(a)) return true;
    return false;
  }

  function attr(node: TagLikeNode, name: string): string | undefined {
    const a = node.attributes.find((x: AttributeNode) => x.name === name);
    return a?.value;
  }

  return {
    walk,
    findByName,
    imports: () => cachedImports,
    insideAncestor,
    attr,
    source,
  };
}
