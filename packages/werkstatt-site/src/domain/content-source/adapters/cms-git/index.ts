/*
<MODULE_CONTRACT>
<purpose>
  [RFC-0171] The git-based (Decap/Tina-class) CMS adapter behind the Content Source
  Provider port — the FIRST reference CMS adapter. A git CMS commits the same Markdown
  the filesystem adapter already reads, so at build time content still flows through the
  fs Astro provider and a production build resolves only published (merged) Markdown
  (fail-closed by construction). What this adapter adds is (1) its own capability
  descriptor and (2) a pure, node-safe Decap admin config builder derived from the
  content the code already validates — so the CMS field config has a single source of
  truth and cannot silently drift from the on-disk content.
</purpose>
<non-goals>
  <item>Do not perform I/O or import yaml/astro — the kernel command reads files and serializes.</item>
  <item>Do not implement a separate read provider — git markdown is read through the fs Astro provider.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0171: git-based Decap reference adapter — capabilities + pure config builder.</item>
</CHANGE_SUMMARY>
*/

import type { ContentSourceCapabilities } from "../../types.ts";

/**
 * The git-based CMS adapter resolves local, build-time-optimized images (content lives in
 * the repo, same as fs) and offers a rich-text → markdown bridge (the CMS editor writes
 * markdown), but does NOT live-fetch: a static build reflects an edit only after the
 * publish → rebuild webhook fires. Drafts live on branches/PRs (Decap editorial workflow),
 * so a production build of the default branch resolves only published content (fail-closed).
 */
export const CMS_GIT_CAPABILITIES: ContentSourceCapabilities = {
  localAssets: true,
  remoteAssets: false,
  liveFetch: false,
  richText: true,
};

// ---------------------------------------------------------------------------
// Decap admin config object shapes (YAML-serializable; serialization is the caller's job)
// ---------------------------------------------------------------------------

/** A single Decap field (recursive — object/list widgets carry nested `fields`). */
export interface DecapField {
  name: string;
  label: string;
  widget: string;
  required: boolean;
  /** number widget: "int" | "float". */
  value_type?: string;
  /** object / list-of-objects widgets carry nested field definitions. */
  fields?: DecapField[];
}

/** A Decap folder collection (one per RFC-0047 content domain). */
export interface DecapCollection {
  name: string;
  label: string;
  folder: string;
  create: boolean;
  extension: string;
  format: string;
  /** Browse nested {lang}/… subfolders. */
  nested?: { depth: number };
  /** Surface the file path so editors can place a new entry under a locale folder. */
  meta?: { path: { widget: string; label: string; index_file?: string } };
  fields: DecapField[];
}

/** The full Decap `config.yml` object. */
export interface DecapConfig {
  backend: { name: string; branch?: string; repo?: string };
  publish_mode?: string;
  media_folder: string;
  public_folder: string;
  site_url?: string;
  locale?: string;
  collections: DecapCollection[];
}

export interface BuildDecapConfigOptions {
  backend: { name: string; branch?: string; repo?: string };
  mediaFolder: string;
  publicFolder: string;
  siteUrl?: string;
  /** Decap editorial workflow → drafts become PRs (keeps production fail-closed). */
  editorialWorkflow?: boolean;
  collections: DecapCollection[];
}

/** Assemble the canonical Decap config object from already-resolved collections. */
export function buildDecapConfig(options: BuildDecapConfigOptions): DecapConfig {
  const config: DecapConfig = {
    backend: options.backend,
    media_folder: options.mediaFolder,
    public_folder: options.publicFolder,
    collections: options.collections,
  };
  if (options.editorialWorkflow) config.publish_mode = "editorial_workflow";
  if (options.siteUrl) config.site_url = options.siteUrl;
  return config;
}

// ---------------------------------------------------------------------------
// Frontmatter → Decap field inference (pure)
// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Recursively union two frontmatter samples so a collection's generated fields cover the
 * keys present across every file (no field is dropped because one file omitted it). Scalars
 * keep the first non-null value seen; objects merge key-wise; arrays concatenate so their
 * element shapes can be merged downstream.
 */
export function mergeSamples(a: unknown, b: unknown): unknown {
  if (a === undefined || a === null) return b;
  if (b === undefined || b === null) return a;
  if (isPlainObject(a) && isPlainObject(b)) {
    const out: Record<string, unknown> = { ...a };
    for (const [key, value] of Object.entries(b)) {
      out[key] = mergeSamples(out[key], value);
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
  return a;
}

/** Merge every element of an array into one representative sample (for list-of-objects fields). */
function mergeArrayElements(items: unknown[]): unknown {
  return items.reduce<unknown>((acc, item) => mergeSamples(acc, item), undefined);
}

function toLabel(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * Infer a Decap widget tree from an observed frontmatter value. Every field is emitted as
 * `required: false` (the Zod schemas remain the real validation gate; Decap only edits).
 * Nested objects and lists-of-objects recurse so structured content round-trips losslessly.
 */
export function inferDecapField(name: string, value: unknown): DecapField {
  const label = toLabel(name);
  if (typeof value === "boolean") return { name, label, widget: "boolean", required: false };
  if (typeof value === "number") {
    return {
      name,
      label,
      widget: "number",
      required: false,
      value_type: Number.isInteger(value) ? "int" : "float",
    };
  }
  if (typeof value === "string") {
    const widget = value.includes("\n") ? "text" : "string";
    return { name, label, widget, required: false };
  }
  if (Array.isArray(value)) {
    const sample = mergeArrayElements(value);
    if (isPlainObject(sample)) {
      return { name, label, widget: "list", required: false, fields: inferFields(sample) };
    }
    // List of scalars (or empty/unknown) — a plain string list.
    return { name, label, widget: "list", required: false };
  }
  if (isPlainObject(value)) {
    return { name, label, widget: "object", required: false, fields: inferFields(value) };
  }
  // null / undefined / unknown — safest editable default.
  return { name, label, widget: "string", required: false };
}

/** Infer a deterministic, alphabetically-ordered field list from a frontmatter object. */
export function inferFields(sample: Record<string, unknown>): DecapField[] {
  return Object.keys(sample)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => inferDecapField(key, sample[key]));
}
