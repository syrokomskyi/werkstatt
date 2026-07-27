/*
<MODULE_CONTRACT>
<purpose>
props.contract.validate — RFC-0262: verifies the manifest propsSchema stays the
single source of truth for packages/ui prop types. PROPS-01 catches a missing,
non-marker-carrying, or stale (sourceHash mismatch) generated types file.
PROPS-02 validates a manifest's optional `example` block against its own
resolved propsSchema.
</purpose>
<non-goals>
  <item>Do not validate authored content blocks — that is page.block.validate (build.check gate).</item>
  <item>Do not regenerate anything — that is props.types.generate.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0262: initial implementation.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { hasGeneratedMarker } from "@warpgogol/site-kernel";
import { discoverManifestPropsInfo, propsSchemaSourceHash } from "@warpgogol/site-kernel-codegen";
import { diagnosticsResult } from "./result-helpers.ts";

type JsonSchema = Record<string, unknown>;

/**
 * Minimal recursive JSON-Schema (draft-07 subset) validator for PROPS-02.
 * Mirrors the subset emitted/understood by props.types.generate: type,
 * properties, required, additionalProperties, enum, const, oneOf/anyOf, items.
 */
export function validateExampleAgainstSchema(
  value: unknown,
  schema: unknown,
  path: string,
): string[] {
  if (!schema || typeof schema !== "object") return [];
  const s = schema as JsonSchema;
  const errors: string[] = [];

  if (s.const !== undefined) {
    if (JSON.stringify(value) !== JSON.stringify(s.const)) {
      errors.push(
        `${path}: expected constant ${JSON.stringify(s.const)}, got ${JSON.stringify(value)}`,
      );
    }
    return errors;
  }

  if (Array.isArray(s.enum)) {
    if (!s.enum.some((allowed) => JSON.stringify(allowed) === JSON.stringify(value))) {
      errors.push(
        `${path}: value ${JSON.stringify(value)} is not one of ${JSON.stringify(s.enum)}`,
      );
    }
    return errors;
  }

  const variants = (s.oneOf ?? s.anyOf) as JsonSchema[] | undefined;
  if (Array.isArray(variants) && variants.length > 0) {
    const anyValid = variants.some(
      (variant) => validateExampleAgainstSchema(value, variant, path).length === 0,
    );
    if (!anyValid) errors.push(`${path}: value does not match any variant`);
    return errors;
  }

  if (s.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path}: expected an object`);
      return errors;
    }
    const record = value as Record<string, unknown>;
    const properties = (s.properties as Record<string, JsonSchema> | undefined) ?? {};
    const required = (s.required as string[] | undefined) ?? [];
    for (const key of required) {
      if (!(key in record)) errors.push(`${path}.${key}: required property is missing`);
    }
    if (s.additionalProperties === false) {
      for (const key of Object.keys(record)) {
        if (!(key in properties))
          errors.push(`${path}.${key}: unknown property (additionalProperties: false)`);
      }
    }
    for (const [key, propSchema] of Object.entries(properties)) {
      if (key in record)
        errors.push(...validateExampleAgainstSchema(record[key], propSchema, `${path}.${key}`));
    }
    return errors;
  }

  if (s.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected an array`);
      return errors;
    }
    const itemsSchema = s.items as JsonSchema | undefined;
    if (itemsSchema) {
      value.forEach((item, index) => {
        errors.push(...validateExampleAgainstSchema(item, itemsSchema, `${path}[${index}]`));
      });
    }
    return errors;
  }

  if (s.type === "string" && typeof value !== "string") errors.push(`${path}: expected a string`);
  if ((s.type === "number" || s.type === "integer") && typeof value !== "number") {
    errors.push(`${path}: expected a number`);
  }
  if (s.type === "boolean" && typeof value !== "boolean")
    errors.push(`${path}: expected a boolean`);

  return errors;
}

export async function runPropsContractValidate(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const infos = await discoverManifestPropsInfo(context.workspaceRoot);
  const diagnostics: Diagnostic[] = [];

  for (const info of infos) {
    if (!info.resolvedSchema) continue;

    // PROPS-01: the generated file must exist, carry the marker, and its
    // declared sourceHash must match the freshly recomputed schema hash.
    const relGenerated = info.generatedTypesPath
      .slice(context.workspaceRoot.length + 1)
      .split("\\")
      .join("/");
    const expectedHash = propsSchemaSourceHash(info.resolvedSchema);

    let content: string | null = null;
    try {
      content = await readFile(info.generatedTypesPath, "utf8");
    } catch {
      content = null;
    }

    if (content === null) {
      diagnostics.push({
        ruleId: "PROPS-01",
        severity: "error",
        file: relGenerated,
        message: `Generated types file is missing for ${info.id}.`,
        fixHint: "Run: pnpm exec site-kernel run props.types.generate",
        data: { manifest: info.id },
      });
    } else if (!hasGeneratedMarker(content)) {
      diagnostics.push({
        ruleId: "PROPS-01",
        severity: "error",
        file: relGenerated,
        message: `Generated types file for ${info.id} does not carry the GENERATED_MARKER (hand-edited?).`,
        fixHint:
          "Never hand-edit a *.types.generated.ts file — fix the manifest propsSchema and run props.types.generate.",
        data: { manifest: info.id },
      });
    } else {
      const hashMatch = content.match(/sourceHash:\s*([0-9a-f]{64})/);
      const declaredHash = hashMatch?.[1];
      if (declaredHash !== expectedHash) {
        diagnostics.push({
          ruleId: "PROPS-01",
          severity: "error",
          file: relGenerated,
          message: `Generated types file for ${info.id} is stale: declared sourceHash does not match the current manifest propsSchema.`,
          fixHint: "Run: pnpm exec site-kernel run props.types.generate",
          data: { manifest: info.id, declaredHash, expectedHash },
        });
      }
    }

    // PROPS-02: an optional manifest `example` block validates against its own schema.
    let raw: string;
    try {
      raw = await readFile(info.manifestPath, "utf8");
    } catch {
      continue;
    }
    let parsed: unknown;
    try {
      parsed = parseYaml(raw);
    } catch {
      continue;
    }
    const example = (parsed as Record<string, unknown> | null)?.example;
    if (example !== undefined) {
      const relManifest = info.manifestPath
        .slice(context.workspaceRoot.length + 1)
        .split("\\")
        .join("/");
      const errors = validateExampleAgainstSchema(example, info.resolvedSchema, "example");
      for (const error of errors) {
        diagnostics.push({
          ruleId: "PROPS-02",
          severity: "error",
          file: relManifest,
          message: `Manifest example fails its own propsSchema: ${error}`,
          fixHint: "Fix the example block, or the propsSchema, so the two agree.",
          data: { manifest: info.id },
        });
      }
    }
  }

  return diagnosticsResult("props.contract.validate", diagnostics);
}
