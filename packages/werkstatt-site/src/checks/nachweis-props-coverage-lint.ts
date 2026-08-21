/*
<MODULE_CONTRACT>
<purpose>
Static lint (NACHWEIS-PROPS-01) that cross-references required props in
nachweis-detail and nachweis-card component interfaces against prop assignments
in resolveNachweisEvidenceProps. If a component declares a required field that
the resolver never assigns (and it is not in the page-block-provided exclusion
list), the validator flags it. This prevents runtime crashes where a component
accesses props.X.id when props.X is undefined.
</purpose>
<non-goals>
  <item>Does not check optional fields — only required (non-optional) fields are validated.</item>
  <item>Does not check branch-specific assignment (whether a field is set in the correct kind branch) — only checks presence of assignment anywhere in the resolver function.</item>
  <item>Does not validate labels or page-block-provided UI config fields.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial implementation — prevents recurrence of missing prop mapping in resolveNachweisEvidenceProps.</item>
</CHANGE_SUMMARY>
*/

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  CheckResult,
  Diagnostic,
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/werkstatt/kernel";
import { diagnosticsResult } from "./result-helpers.ts";

const COMPONENT_FILES = [
  "packages/werkstatt-site/src/domain/ui/components/nachweis-detail/nachweis-detail-component.astro",
  "packages/werkstatt-site/src/domain/ui/components/nachweis-card/nachweis-card-component.astro",
];

const RESOLVER_FILE =
  "packages/werkstatt-site/src/domain/share/astro/page-handler/resolve-route.ts";

/**
 * Fields provided by the page block, not the resolver.
 * If a required field is in this set, the validator does not expect the resolver to assign it.
 */
const PAGE_BLOCK_PROVIDED_FIELDS = new Set([
  "slug",
  "labels",
  "cardLabels",
  "background",
  "effects",
  "density",
  "tone",
  "compact",
  "lang",
  "scope",
  "context",
  "limitations",
  "quote",
  "quoteLang",
  "verifiedScope",
  "notVerifiedScope",
  "verifiedByLabel",
  "verifiedDate",
  "display",
  "websiteTagline",
  "websiteFooterTagline",
  "observationHistory",
  "displayHashCode",
]);

interface VariantInterface {
  name: string;
  variant: string;
  requiredFields: string[];
}

/**
 * Parse an .astro component file to find interfaces with a `variant` discriminant
 * and extract their required (non-optional) top-level fields.
 */
export function parseVariantInterfaces(source: string): VariantInterface[] {
  const results: VariantInterface[] = [];
  const lines = source.split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const ifaceMatch = line.match(/interface\s+(\w+)\s*\{/);
    if (!ifaceMatch) {
      i++;
      continue;
    }

    const ifaceName = ifaceMatch[1];
    let braceDepth = 1;
    let variant: string | undefined;
    const requiredFields: string[] = [];

    i++;
    while (i < lines.length && braceDepth > 0) {
      const bodyLine = lines[i];
      const depthBefore = braceDepth;

      for (const ch of bodyLine) {
        if (ch === "{") braceDepth++;
        else if (ch === "}") braceDepth--;
      }

      if (braceDepth === 0) break;

      if (depthBefore === 1) {
        const variantMatch = bodyLine.match(/^\s+variant:\s*"([^"]+)"/);
        if (variantMatch) {
          variant = variantMatch[1];
        }

        const fieldMatch = bodyLine.match(/^\s+(\w+)(\?)?\s*:/);
        if (fieldMatch && !fieldMatch[2]) {
          requiredFields.push(fieldMatch[1]);
        }
      }

      i++;
    }

    if (variant) {
      results.push({ name: ifaceName, variant, requiredFields });
    }
  }

  return results;
}

/**
 * Extract all `props.X = ` assignments from the resolver function body.
 */
export function extractResolverProps(source: string): Set<string> {
  const propsAssigned = new Set<string>();

  const funcMatch = source.match(
    /async\s+function\s+resolveNachweisEvidenceProps\s*\([^)]*\)[^{]*\{/,
  );
  if (!funcMatch) return propsAssigned;

  const funcStart = funcMatch.index! + funcMatch[0].length;
  let braceDepth = 1;
  const lines = source.slice(funcStart).split("\n");

  for (const line of lines) {
    for (const ch of line) {
      if (ch === "{") braceDepth++;
      else if (ch === "}") braceDepth--;
    }

    if (braceDepth <= 0) break;

    const propMatch = line.match(/props\.(\w+)\s*=/);
    if (propMatch) {
      propsAssigned.add(propMatch[1]);
    }
  }

  return propsAssigned;
}

export async function runNachweisPropsCoverageLint(
  _input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult<CheckResult>> {
  const { workspaceRoot } = context;
  const diagnostics: Diagnostic[] = [];

  const resolverSource = await readFile(join(workspaceRoot, RESOLVER_FILE), "utf8");
  const resolverProps = extractResolverProps(resolverSource);

  const allVariants: Array<{ file: string } & VariantInterface> = [];

  for (const compFile of COMPONENT_FILES) {
    const source = await readFile(join(workspaceRoot, compFile), "utf8");
    const variants = parseVariantInterfaces(source);
    for (const v of variants) {
      allVariants.push({ file: compFile, ...v });
    }
  }

  for (const { file, name, variant, requiredFields } of allVariants) {
    for (const field of requiredFields) {
      if (field === "variant") continue;
      if (PAGE_BLOCK_PROVIDED_FIELDS.has(field)) continue;
      if (resolverProps.has(field)) continue;

      diagnostics.push({
        ruleId: "NACHWEIS-PROPS-01",
        severity: "error",
        file: RESOLVER_FILE,
        message:
          `resolveNachweisEvidenceProps does not assign props.${field}, but component ` +
          `interface ${name} (variant "${variant}") in ${file} declares it as a required field. ` +
          `The component will crash at runtime when accessing props.${field}. ` +
          `Add props.${field} = ... to the resolver, or mark the field as optional in the interface.`,
        fixHint:
          `Add \`props.${field} = ...\` in resolveNachweisEvidenceProps ` +
          `(inside the kind === "${variant}" branch if variant-specific), ` +
          `or add "${field}" to PAGE_BLOCK_PROVIDED_FIELDS if it is provided by the page block.`,
        data: { componentFile: file, interfaceName: name, variant, field },
      });
    }
  }

  return diagnosticsResult("nachweis.props.coverage.lint", diagnostics);
}
