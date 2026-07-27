/*
<MODULE_CONTRACT>
<purpose>RFC-0364: Dispatcher that selects the correct normalizer based on file extension.</purpose>
<non-goals>
  <item>Do not implement individual normalizers — each lives in its own file.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0364: initial dispatcher.</item>
</CHANGE_SUMMARY>
*/

import path from "node:path";
import { normalizeTypeScript } from "./typescript.ts";
import { normalizeAstro } from "./astro.ts";
import { normalizeCss } from "./css.ts";
import { normalizeJson } from "./json.ts";
import { normalizeJsonc } from "./jsonc.ts";
import { normalizeYaml } from "./yaml.ts";
import { normalizeMarkdown } from "./markdown.ts";
import { normalizeText } from "./text.ts";
import { hashHtml } from "./html.ts";

export interface NormalizeResult {
  normalizer: string;
  hash: string;
}

const TS_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".mts", ".cjs"]);
const YAML_EXTENSIONS = new Set([".yaml", ".yml"]);
const MD_EXTENSIONS = new Set([".md", ".mdx"]);

export async function normalizeFile(absPath: string, bytes: Uint8Array): Promise<NormalizeResult> {
  const ext = path.extname(absPath).toLowerCase();
  const content = new TextDecoder("utf-8", { fatal: false }).decode(bytes);

  try {
    if (TS_EXTENSIONS.has(ext)) {
      return { normalizer: "typescript", hash: normalizeTypeScript(content) };
    }
    if (ext === ".astro") {
      return { normalizer: "astro", hash: await normalizeAstro(content) };
    }
    if (ext === ".css") {
      return { normalizer: "css", hash: normalizeCss(content) };
    }
    if (ext === ".html" || ext === ".htm") {
      return { normalizer: "html", hash: hashHtml(content) };
    }
    if (ext === ".json") {
      return { normalizer: "json", hash: normalizeJson(content) };
    }
    if (ext === ".jsonc") {
      return { normalizer: "jsonc", hash: normalizeJsonc(content) };
    }
    if (YAML_EXTENSIONS.has(ext)) {
      return { normalizer: "yaml", hash: normalizeYaml(content) };
    }
    if (MD_EXTENSIONS.has(ext)) {
      return { normalizer: "markdown", hash: normalizeMarkdown(content) };
    }
  } catch {
    // fall through to text normalizer
  }

  return { normalizer: "text", hash: normalizeText(content) };
}

export { normalizeBinary } from "./binary.ts";
