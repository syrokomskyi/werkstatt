import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";

function parseFrontmatter(source: string): { data: Record<string, unknown> } {
  const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {} };
  const data = parseYaml(match[1]) as Record<string, unknown>;
  return { data };
}

export async function readDefaultLanguageCode(contentRoot: string): Promise<string> {
  const systemPath = join(contentRoot, "system.md");
  const raw = await readFile(systemPath, "utf-8");
  const { data } = parseFrontmatter(raw);
  const i18n = (data as Record<string, unknown>).i18n as { default?: unknown } | undefined;
  if (typeof i18n?.default === "string" && i18n.default.trim() !== "") {
    return i18n.default.trim();
  }
  throw new Error("[i18n] src/content/system.md must declare i18n.default.");
}

export function defaultLanguageFromManifest(manifest: { i18n?: unknown }): string {
  const i18n = manifest.i18n as { default?: unknown } | undefined;
  const defaultLanguage = i18n?.default;
  if (typeof defaultLanguage === "string" && defaultLanguage.trim() !== "") {
    return defaultLanguage.trim();
  }
  throw new Error("[i18n] manifest must declare i18n.default.");
}
