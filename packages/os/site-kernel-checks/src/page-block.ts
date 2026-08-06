/*
<MODULE_CONTRACT>
<purpose>
page.block.validate — verifies block-declarative page content entries against
the system.yaml pin list and section manifest propsSchemas (DNA-24, RFC-0026).

Checks performed (fail-first):
  B-01: Every page .md under src/content/pages/ parses as PageEntrySchema.
  B-02: Every blocks[].use is pinned in system.yaml pages[route].planets[].
  B-03: Every blocks[].props validates against the pinned manifest's propsSchema (strict).
  B-04: entry.cosmicStar matches the system.yaml pages[route].cosmicStar for this route.
  B-05: No two blocks on the same page share the same id.
  B-06: No markdown body present in page entries (frontmatter-only contract, DNA-24).
  B-07: body.kind matches the body fragment's declared kind in the composed propsSchema (RFC-0719).
</purpose>
<non-goals>
  <item>Do not render blocks or invoke buildPage at validate time.</item>
  <item>Do not validate visibility expressions (visibility.expr.validate does that).</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0026): Initial creation.</item>
  <item>RFC-0719: add B-07 body.kind mismatch check for clearer diagnostics.</item>
</CHANGE_SUMMARY>
*/

import { readFile, readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@warpgogol/site-kernel";
import { requireAstroSitePaths } from "@warpgogol/site-kernel-astro";
import { resultFromViolations } from "./result-helpers.ts";
import { collectMarkdownFiles, parseMarkdownFrontmatter } from "@warpgogol/site-kernel-content";
import { PageEntrySchema } from "@warpgogol/ontology";
import { getSectionPropsSchema } from "@warpgogol/ontology/schemas/manifest-resolver";
import { systemManifestSchema } from "@warpgogol/ontology";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import { normalizeBlockType } from "@warpgogol/share/page";
import { resolveSharedContextProps } from "@warpgogol/share/shared-context";
import { readScopeFiles, outOfScope } from "./scope.ts";

/**
 * Block-level props consumed by blocks-renderer.astro (NOT by section components).
 * These are valid on every block regardless of section archetype, so the
 * validator strips them before per-section propsSchema validation.
 *
 * Keep this list in sync with packages/ui/src/blocks-renderer.astro.
 */
const UNIVERSAL_BLOCK_PROPS: ReadonlySet<string> = new Set([
  "hideSectionNumber", // suppress auto-generated "01"/"02" section number
  "anchorId", // RFC-0048: stable anchor id for resolveSectionAnchor, not a section prop
]);

// ---------------------------------------------------------------------------
// JSON Schema strict validator (minimal implementation for additionalProperties)
// ---------------------------------------------------------------------------

type JsonSchemaObject = {
  type?: string;
  additionalProperties?: boolean | JsonSchemaObject;
  required?: string[];
  properties?: Record<string, JsonSchemaObject>;
  items?: JsonSchemaObject;
  minLength?: number;
  minimum?: number;
};

function validateAgainstJsonSchema(
  data: unknown,
  schema: JsonSchemaObject,
  path: string,
): string[] {
  const errors: string[] = [];

  if (schema.type === "object") {
    if (typeof data !== "object" || data === null || Array.isArray(data)) {
      errors.push(`${path}: expected object, got ${Array.isArray(data) ? "array" : typeof data}`);
      return errors;
    }
    const obj = data as Record<string, unknown>;

    // Check required fields
    for (const req of schema.required ?? []) {
      if (!(req in obj)) {
        errors.push(`${path}.${req}: required field is missing`);
      }
    }

    // Check no extra keys (strict mode: additionalProperties: false)
    if (schema.additionalProperties === false && schema.properties) {
      for (const key of Object.keys(obj)) {
        if (!(key in schema.properties)) {
          errors.push(`${path}.${key}: extra key not allowed (additionalProperties: false)`);
        }
      }
    }

    // Recurse into properties
    if (schema.properties) {
      for (const [key, childSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          errors.push(...validateAgainstJsonSchema(obj[key], childSchema, `${path}.${key}`));
        }
      }
    }
    return errors;
  }

  if (schema.type === "array") {
    if (!Array.isArray(data)) {
      errors.push(`${path}: expected array, got ${typeof data}`);
      return errors;
    }
    if (schema.items) {
      for (let i = 0; i < data.length; i++) {
        errors.push(...validateAgainstJsonSchema(data[i], schema.items, `${path}[${i}]`));
      }
    }
    return errors;
  }

  if (schema.type === "string") {
    if (typeof data !== "string") {
      errors.push(`${path}: expected string, got ${typeof data}`);
    } else if (schema.minLength !== undefined && data.length < schema.minLength) {
      errors.push(`${path}: string too short (min ${schema.minLength})`);
    }
    return errors;
  }

  if (schema.type === "number" || schema.type === "integer") {
    if (typeof data !== "number") {
      errors.push(`${path}: expected number, got ${typeof data}`);
    }
    return errors;
  }

  if (schema.type === "boolean") {
    if (typeof data !== "boolean") {
      errors.push(`${path}: expected boolean, got ${typeof data}`);
    }
    return errors;
  }

  // No type constraint — any value is allowed
  return errors;
}

// ---------------------------------------------------------------------------
// runPageBlockValidate
// ---------------------------------------------------------------------------

export async function runPageBlockValidate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  const violations: string[] = [];
  const allow = readScopeFiles(input); // RFC-0139: optional --scope-files (null = whole-app)

  try {
    let paths: ReturnType<typeof requireAstroSitePaths>;
    try {
      paths = requireAstroSitePaths(context);
    } catch (err) {
      return resultFromViolations("page.block.validate", [(err as Error).message]);
    }

    const pagesDir = join(paths.appDirectory, "src", "content", "pages");
    const contentDir = join(paths.appDirectory, "src", "content");
    const packagesUiSrc = resolve(paths.appDirectory, "../../packages/ui/src");

    // Load system manifest for planet-pin cross-reference
    let systemManifest: ReturnType<typeof systemManifestSchema.parse> | null = null;
    try {
      const systemResult = await loadSystemManifest(contentDir);
      systemManifest = systemManifestSchema.parse(systemResult.manifest);
    } catch (err) {
      violations.push(`src/content/system.md: failed to parse — ${(err as Error).message}`);
    }

    // Build a lookup: pageId → planets[] from system.md.
    const pageIdToPlanets = new Map<string, Set<string>>();
    const pageIdToCosmicStar = new Map<string, string>();
    if (systemManifest?.pages) {
      for (const page of systemManifest.pages) {
        const set = new Set<string>();
        for (const planet of page.planets ?? []) {
          set.add(planet.cosmicPlanet);
        }
        pageIdToPlanets.set(page.pageId, set);
        pageIdToCosmicStar.set(page.pageId, page.cosmicStar);
      }
    }

    // Collect all page markdown files
    let markdownFiles: string[];
    try {
      markdownFiles = await collectMarkdownFiles(pagesDir);
    } catch {
      // No pages dir — let app.layout.validate report this
      return resultFromViolations("page.block.validate", violations);
    }

    const parsedPages = new Map<
      string,
      {
        rel: string;
        entry: import("@warpgogol/ontology").PageEntry;
      }
    >();

    for (const filePath of markdownFiles) {
      const rel = relative(paths.appDirectory, filePath).replace(/\\/g, "/");
      // RFC-0139: skip pages outside the amend delta (scope is repo-relative).
      if (outOfScope(allow, relative(context.workspaceRoot, filePath).replace(/\\/g, "/")))
        continue;

      let rawContent: string;
      try {
        rawContent = await readFile(filePath, "utf8");
      } catch {
        violations.push(`${rel}: could not read file`);
        continue;
      }

      const { data: frontmatter, content: body } = parseMarkdownFrontmatter(rawContent);

      // B-06: No markdown body in page entries (generated marker comments are OK)
      const bodyWithoutComments = body.replace(/<!--[\s\S]*?-->/g, "").trim();
      if (bodyWithoutComments.length > 0) {
        violations.push(
          `${rel}: B-06 page content must be frontmatter-only — markdown body is forbidden (DNA-24, RFC-0026)`,
        );
      }

      // B-01: Parse as PageEntrySchema
      const parsed = PageEntrySchema.safeParse(frontmatter);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          violations.push(`${rel}: B-01 ${issue.path.join(".")} — ${issue.message}`);
        }
        continue;
      }

      const entry = parsed.data;
      const pageId =
        typeof (frontmatter as Record<string, unknown>).pageId === "string"
          ? ((frontmatter as Record<string, unknown>).pageId as string)
          : undefined;
      if (pageId) {
        parsedPages.set(pageId, { rel, entry });
      }

      // B-04a: pageId must exist in system manifest when present
      if (pageId && !pageIdToPlanets.has(pageId)) {
        violations.push(
          `${rel}: B-04 pageId="${pageId}" is not declared in src/content/system.md pages[]`,
        );
      }

      const expectedCosmicStar = pageId ? pageIdToCosmicStar.get(pageId) : undefined;
      if (expectedCosmicStar && expectedCosmicStar !== entry.cosmicStar) {
        violations.push(
          `${rel}: B-04 cosmicStar="${entry.cosmicStar}" does not match src/content/system.md pages[pageId=${pageId}].cosmicStar="${expectedCosmicStar}"`,
        );
      }

      // B-05: No duplicate block ids within a page
      const seenIds = new Set<string>();
      for (const block of entry.blocks) {
        if (block.id !== undefined) {
          if (seenIds.has(block.id)) {
            violations.push(
              `${rel}: B-05 duplicate block id="${block.id}" — block ids must be unique within a page`,
            );
          }
          seenIds.add(block.id);
        }
      }

      const pageEntries = new Map(
        [...parsedPages.entries()].map(([pageId, item]) => [
          pageId,
          { pageId, blocks: item.entry.blocks },
        ]),
      );
      const requiredPageIds = systemManifest?.sharedContext?.requiredPageIds ?? [];
      const allowedPlanets = pageId ? pageIdToPlanets.get(pageId) : undefined;

      for (let i = 0; i < entry.blocks.length; i++) {
        const block = entry.blocks[i];
        const mergedProps = resolveSharedContextProps({
          currentPageId: pageId ?? "",
          block,
          pages: pageEntries,
          requiredPageIds,
        });
        const blockCosmicName = normalizeBlockType(block);
        const blockPath = `${rel}: blocks[${i}] (type=${block.type ?? block.use})`;

        // B-02: use is pinned in system.yaml
        if (allowedPlanets !== undefined && !allowedPlanets.has(blockCosmicName)) {
          violations.push(
            `${blockPath}: B-02 "${blockCosmicName}" is not listed in src/content/system.md pages[cosmicStar=${entry.cosmicStar}].planets[]`,
          );
        }

        // B-03: props validates against propsSchema.
        // Strip UNIVERSAL_BLOCK_PROPS first — these are consumed by
        // blocks-renderer.astro (not by the section component itself) and are
        // valid on every block regardless of section. Each section's
        // propsSchema only declares section-specific props.
        const schemaDef = await getSectionPropsSchema(blockCosmicName, packagesUiSrc);
        if (schemaDef?.propsSchema) {
          const sectionProps: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(mergedProps)) {
            if (!UNIVERSAL_BLOCK_PROPS.has(k)) sectionProps[k] = v;
          }
          const propsErrors = validateAgainstJsonSchema(
            sectionProps,
            schemaDef.propsSchema as JsonSchemaObject,
            `props`,
          );
          for (const err of propsErrors) {
            violations.push(`${blockPath}: B-03 ${err}`);
          }

          // B-07 (RFC-0719): body.kind must match the body fragment's declared kind.
          // The composed propsSchema includes a `body` property from the body fragment.
          // Extract the expected kind const and compare with the actual body.kind.
          const bodySchema = (schemaDef.propsSchema as JsonSchemaObject).properties?.body as
            JsonSchemaObject | undefined;
          const expectedBodyKind = bodySchema?.properties?.kind as { const?: string } | undefined;
          const actualBody = sectionProps.body as Record<string, unknown> | undefined;
          const actualBodyKind =
            actualBody && typeof actualBody.kind === "string" ? actualBody.kind : undefined;
          if (
            expectedBodyKind?.const &&
            actualBodyKind &&
            expectedBodyKind.const !== actualBodyKind
          ) {
            violations.push(
              `${blockPath}: B-07 body.kind="${actualBodyKind}" does not match expected bodyKind="${expectedBodyKind.const}" from section manifest`,
            );
          }
        }
      }
    }

    return resultFromViolations("page.block.validate", violations);
  } catch (err) {
    return resultFromViolations("page.block.validate", [
      `Unexpected error: ${(err as Error).message}`,
    ]);
  }
}
