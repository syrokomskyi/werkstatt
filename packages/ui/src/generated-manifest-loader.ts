/*
<MODULE_CONTRACT>
<purpose>
  Shared loader for build-time generated YAML manifests (RFC-0204/RFC-0210/RFC-0234).
  Centralizes the import.meta.glob + comment-strip + yaml.parse + warn pattern that
  image-provider-init, video-manifest, and live-video-manifest previously duplicated.
  Resolved by Vite at the consuming app's build call site.
</purpose>
<non-goals>
  <item>Do not validate manifest shape — callers own their domain types.</item>
  <item>Do not run at request time in workerd — Astro SSG only.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Extracted shared generated-manifest loading pattern from 3 modules into one reusable loader.</item>
</CHANGE_SUMMARY>
*/

/**
 * Load a generated YAML manifest at build time. The path must be a root-absolute
 * Vite path (e.g. "/src/image-variants.generated.yaml"). Strips a leading `#`
 * comment line if present (generated markers), then parses YAML. Returns null
 * and warns if the file is missing or unparseable.
 */
import { parse as yamlParse } from "yaml";

const allGeneratedYaml = import.meta.glob<{ default: string }>("/src/*.generated.yaml", {
  eager: true,
  query: "?raw",
});

export function loadGeneratedManifest<T>(path: string): T | null {
  const module = allGeneratedYaml[path];
  if (!module) return null;

  try {
    const yamlText = module.default.replace(/^#[^\n]*\n/, "");
    return yamlParse(yamlText) as T;
  } catch (err) {
    console.warn(`[generated-manifest-loader] Could not parse ${path}:`, err);
    return null;
  }
}
