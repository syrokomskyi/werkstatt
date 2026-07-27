/*
<MODULE_CONTRACT>
<purpose>
RFC-0262: the dev-only fail-fast prop validator wired into buildPage's
`validateProps` hook. Resolves each block's manifest propsSchema at runtime
(packages/ui/src, workspace-relative, resolved by walking up from cwd to
pnpm-workspace.yaml — this package never ships a hand-rolled path guess) and
throws PAGE-PROPS-01 on a genuine shape violation. Infrastructure failures
(workspace root not found, manifest unreadable, schema unresolved) are
swallowed with a console.warn — this is a dev convenience feature and must
never crash rendering for a reason unrelated to the author's actual props.
</purpose>
<non-goals>
  <item>Do not replace page.block.validate — that remains the authoritative build.check gate.</item>
  <item>Do not run in production — callers must gate construction behind a dev check.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0262: initial implementation.</item>
  <item>Replaced hand-rolled validateShape with ajv standard validator.</item>
</CHANGE_SUMMARY>
*/

import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getSectionPropsSchema } from "@gogol/ontology/schemas";
import Ajv, { type ValidateFunction } from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });

/**
 * Block-level props consumed by blocks-renderer.astro (NOT by section components).
 * These are valid on every block regardless of section archetype, so the
 * validator strips them before per-section propsSchema validation.
 *
 * Must stay in sync with packages/os/site-kernel-checks/src/page-block.ts
 * UNIVERSAL_BLOCK_PROPS and packages/ui/src/blocks-renderer.astro.
 */
const UNIVERSAL_BLOCK_PROPS: ReadonlySet<string> = new Set(["hideSectionNumber", "anchorId"]);

let packagesUiRootPromise: Promise<string | null> | undefined;

async function resolvePackagesUiRoot(): Promise<string | null> {
  if (!packagesUiRootPromise) {
    packagesUiRootPromise = (async () => {
      let dir = process.cwd();
      for (let depth = 0; depth < 12; depth += 1) {
        try {
          await stat(join(dir, "pnpm-workspace.yaml"));
          return join(dir, "packages", "ui", "src");
        } catch {
          const parent = dirname(dir);
          if (parent === dir) return null;
          dir = parent;
        }
      }
      return null;
    })();
  }
  return packagesUiRootPromise;
}

const schemaCache = new Map<string, Record<string, unknown> | null>();
const validateCache = new Map<string, ValidateFunction | null>();

async function resolveSchema(planetName: string): Promise<Record<string, unknown> | null> {
  if (schemaCache.has(planetName)) return schemaCache.get(planetName)!;
  try {
    const packagesUiRoot = await resolvePackagesUiRoot();
    if (!packagesUiRoot) {
      schemaCache.set(planetName, null);
      return null;
    }
    const resolved = await getSectionPropsSchema(planetName, packagesUiRoot);
    const schema = resolved?.propsSchema ?? null;
    schemaCache.set(planetName, schema);
    return schema;
  } catch (error) {
    console.warn(
      `[dev-props-validator] Could not resolve propsSchema for "${planetName}": ${String(error)}`,
    );
    schemaCache.set(planetName, null);
    return null;
  }
}

function resolveValidator(planetName: string, schema: Record<string, unknown>): ValidateFunction {
  const cached = validateCache.get(planetName);
  if (cached) return cached;
  const validate = ajv.compile(schema);
  validateCache.set(planetName, validate);
  return validate;
}

/**
 * RFC-0262: build the `validateProps` callback for `BuildPageOptions`. Callers
 * MUST only pass this in dev contexts (`import.meta.env.DEV` /
 * `process.env.NODE_ENV !== "production"`) — it is never active during
 * `astro build`.
 */
export function createDevPropsValidator(): (
  planetName: string,
  props: Record<string, unknown>,
  blockId: string | null,
) => Promise<void> {
  return async (planetName, props, blockId) => {
    const schema = await resolveSchema(planetName);
    if (!schema) return; // No pinned schema (or resolution failed) — nothing to check.

    // Strip UNIVERSAL_BLOCK_PROPS before validation — these are consumed by
    // blocks-renderer.astro (not by the section component) and are valid on
    // every block regardless of section archetype. Must stay in sync with
    // packages/os/site-kernel-checks/src/page-block.ts.
    const strippedProps: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(props)) {
      if (!UNIVERSAL_BLOCK_PROPS.has(k)) strippedProps[k] = v;
    }

    const validate = resolveValidator(planetName, schema);
    if (validate(strippedProps)) return;

    const errors = (validate.errors ?? []).map(
      (e) => `props${e.instancePath}: ${e.message ?? "validation failed"}`,
    );
    const blockLabel = blockId ? `block "${blockId}"` : "a shell block";
    throw new Error(
      `[PAGE-PROPS-01] ${blockLabel} (${planetName}) violates its pinned propsSchema:\n` +
        errors.map((e) => `  - ${e}`).join("\n"),
    );
  };
}
