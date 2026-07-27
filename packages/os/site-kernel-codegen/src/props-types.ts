/*
<MODULE_CONTRACT>
<purpose>
props.types.generate — RFC-0262: the manifest `propsSchema` (with
`propsSchemaCompose` fragments resolved) is the ONLY authored prop contract
for packages/ui section/component surfaces. This command emits
`<id>.types.generated.ts` next to each manifest — a deterministic,
marker-carrying, sourceHash-stamped TypeScript mirror of the resolved
schema — replacing hand-written `.types.ts` files.
</purpose>
<non-goals>
  <item>Do not support the full JSON Schema spec — only the subset actually used by packages/ui manifests (object/array/string/number/boolean/enum/const/oneOf/anyOf).</item>
  <item>Do not reformat or reflow the manifest YAML — only a surgical contentTypesPath string replace.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0262: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { parse as parseYaml } from "yaml";
import { composeManifestPropsSchema } from "@gogol/ontology/shared-section-props";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { GENERATED_MARKER, buildGeneratedHeader } from "./generated-marker.ts";

// ---------------------------------------------------------------------------
// JSON Schema -> TypeScript emission (pure, deterministic)
// ---------------------------------------------------------------------------

type JsonSchema = Record<string, unknown>;

const IDENTIFIER_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function emitPropKey(key: string): string {
  return IDENTIFIER_PATTERN.test(key) ? key : JSON.stringify(key);
}

function emitObjectType(schema: JsonSchema, indent: string): string {
  const properties = (schema.properties as Record<string, JsonSchema> | undefined) ?? {};
  const required = new Set((schema.required as string[] | undefined) ?? []);
  const nextIndent = `${indent}  `;
  const keys = Object.keys(properties);
  if (keys.length === 0) return "Record<string, never>";

  const lines: string[] = ["{"];
  for (const key of keys) {
    const optional = required.has(key) ? "" : "?";
    lines.push(
      `${nextIndent}${emitPropKey(key)}${optional}: ${emitType(properties[key]!, nextIndent)};`,
    );
  }
  lines.push(`${indent}}`);
  return lines.join("\n");
}

/** Pure recursive JSON-Schema (draft-07 subset) -> TypeScript type-expression emitter. */
export function emitType(schema: unknown, indent = ""): string {
  if (!schema || typeof schema !== "object") return "unknown";
  const s = schema as JsonSchema;

  if (s.const !== undefined) return JSON.stringify(s.const);

  if (Array.isArray(s.enum)) {
    return s.enum.map((value) => JSON.stringify(value)).join(" | ");
  }

  const variants = (s.oneOf ?? s.anyOf) as JsonSchema[] | undefined;
  if (Array.isArray(variants) && variants.length > 0) {
    return variants.map((variant) => emitType(variant, indent)).join(" | ");
  }

  if (s.type === "object") return emitObjectType(s, indent);

  if (s.type === "array") {
    const itemsSchema = s.items as JsonSchema | undefined;
    const itemType = itemsSchema ? emitType(itemsSchema, indent) : "unknown";
    return itemType.includes("|") ? `(${itemType})[]` : `${itemType}[]`;
  }

  if (s.type === "string") return "string";
  if (s.type === "number" || s.type === "integer") return "number";
  if (s.type === "boolean") return "boolean";

  return "unknown";
}

/** Top-level `export interface <Name> { ... }` from a resolved object schema. */
export function jsonSchemaToInterface(schema: JsonSchema, interfaceName: string): string {
  const body = emitObjectType(schema, "");
  return `export interface ${interfaceName} ${body}\n`;
}

/** Recursively sort object keys so hashing is independent of insertion order. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/** Deterministic sha256 over a canonicalized (key-sorted) resolved schema. */
export function propsSchemaSourceHash(schema: JsonSchema): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(schema)))
    .digest("hex");
}

// ---------------------------------------------------------------------------
// Manifest discovery
// ---------------------------------------------------------------------------

export interface ManifestPropsInfo {
  /** Absolute path to the manifest YAML. */
  manifestPath: string;
  /** Absolute path to the target generated types file. */
  generatedTypesPath: string;
  /** Manifest `id`, e.g. "hero-section". */
  id: string;
  layer: "section" | "component";
  /** Resolved TypeScript interface name, e.g. "HeroSectionContent". */
  interfaceName: string;
  /** Composed JSON Schema (compose fragments + local), or null when the manifest declares neither. */
  resolvedSchema: JsonSchema | null;
  /** Raw contentTypesPath string from the manifest, if declared. */
  contentTypesPath: string | null;
}

function toPascalCase(kebab: string): string {
  return kebab
    .split("-")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join("");
}

function interfaceNameFor(id: string, layer: "section" | "component"): string {
  const suffix = layer === "section" ? "-section" : "-component";
  const base = id.endsWith(suffix) ? id.slice(0, -suffix.length) : id;
  return `${toPascalCase(base)}${layer === "section" ? "Section" : "Component"}Content`;
}

async function collectManifestFiles(dir: string): Promise<string[]> {
  const results: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectManifestFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith(".manifest.yaml")) {
      results.push(full);
    }
  }
  return results;
}

/** Walk packages/ui/src/{sections,components} and resolve each manifest's composed schema. */
export async function discoverManifestPropsInfo(
  workspaceRoot: string,
): Promise<ManifestPropsInfo[]> {
  const roots: Array<{ dir: string; layer: "section" | "component" }> = [
    { dir: join(workspaceRoot, "packages", "ui", "src", "sections"), layer: "section" },
    { dir: join(workspaceRoot, "packages", "ui", "src", "components"), layer: "component" },
  ];

  const infos: ManifestPropsInfo[] = [];
  for (const { dir, layer } of roots) {
    for (const manifestPath of await collectManifestFiles(dir)) {
      const raw = await readFile(manifestPath, "utf8");
      let parsed: unknown;
      try {
        parsed = parseYaml(raw);
      } catch {
        continue;
      }
      if (!parsed || typeof parsed !== "object") continue;
      const record = parsed as Record<string, unknown>;
      const id = String(record.id ?? "");
      if (!id) continue;

      const compose = Array.isArray(record.propsSchemaCompose)
        ? (record.propsSchemaCompose as string[])
        : undefined;
      const local = record.propsSchema as Record<string, unknown> | undefined;

      const resolvedSchema =
        compose || local ? composeManifestPropsSchema({ compose, local }) : null;
      const contentTypesPath =
        typeof record.contentTypesPath === "string" ? record.contentTypesPath : null;

      infos.push({
        manifestPath,
        generatedTypesPath: join(manifestPath, "..", `${id}.types.generated.ts`),
        id,
        layer,
        interfaceName: interfaceNameFor(id, layer),
        resolvedSchema,
        contentTypesPath,
      });
    }
  }
  return infos.sort((a, b) => a.manifestPath.localeCompare(b.manifestPath));
}

// ---------------------------------------------------------------------------
// props.types.generate
// ---------------------------------------------------------------------------

function renderGeneratedTypesFile(info: ManifestPropsInfo, sourceRelPath: string): string {
  const schema = info.resolvedSchema!;
  const sourceHash = propsSchemaSourceHash(schema);
  const header = [
    buildGeneratedHeader({
      ownerCommand: "props.types.generate",
      filePath: sourceRelPath,
    }).trimEnd(),
    `// sourceHash: ${sourceHash}`,
    `// Source: ${sourceRelPath}`,
    "// Generated by: props.types.generate (RFC-0262). Do not hand-edit — edit the manifest propsSchema and regenerate.",
    "",
  ].join("\n");
  return `${header}\n${jsonSchemaToInterface(schema, info.interfaceName)}`;
}

export interface PropsTypesGenerateResult {
  written: string[];
  unchanged: string[];
  skipped: string[];
}

export async function runPropsTypesGenerate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<PropsTypesGenerateResult>> {
  const dryRun = Boolean(input.flags["dry-run"]) || context.dryRun;
  const infos = await discoverManifestPropsInfo(context.workspaceRoot);

  const written: string[] = [];
  const unchanged: string[] = [];
  const skipped: string[] = [];

  for (const info of infos) {
    const relManifest = relative(context.workspaceRoot, info.manifestPath).split("\\").join("/");
    const relGenerated = relative(context.workspaceRoot, info.generatedTypesPath)
      .split("\\")
      .join("/");

    if (!info.resolvedSchema) {
      skipped.push(relManifest);
      continue;
    }

    const nextContent = renderGeneratedTypesFile(info, relManifest);
    let currentContent: string | null = null;
    try {
      currentContent = await readFile(info.generatedTypesPath, "utf8");
    } catch {
      currentContent = null;
    }

    if (currentContent === nextContent) {
      unchanged.push(relGenerated);
      continue;
    }

    if (!dryRun) {
      await writeFile(info.generatedTypesPath, nextContent, "utf8");

      // Surgically point contentTypesPath at the generated file when the
      // manifest already declares one (never reflow the rest of the YAML).
      const expectedContentTypesPath = `./${info.id}.types.generated.ts`;
      if (info.contentTypesPath && info.contentTypesPath !== expectedContentTypesPath) {
        const raw = await readFile(info.manifestPath, "utf8");
        const updated = raw.replace(
          /contentTypesPath:\s*"[^"]*"/,
          `contentTypesPath: "${expectedContentTypesPath}"`,
        );
        if (updated !== raw) await writeFile(info.manifestPath, updated, "utf8");
      }
    }
    written.push(relGenerated);
  }

  const summary = `props.types.generate: ${written.length} written, ${unchanged.length} unchanged, ${skipped.length} skipped`;
  return {
    data: { written, unchanged, skipped },
    exitCode: 0,
    summary,
  };
}
