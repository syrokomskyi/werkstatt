/*
<MODULE_CONTRACT>
<purpose>Facilitates the passport emission process, integrating various data sources to produce a structured output.</purpose>
<non-goals>
  <item>Do not perform raw content parsing outside of defined data structures.</item>
  <item>Do not manage transport or configuration orchestration for external services.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Added Compass scaffolding to clarify module purpose, responsibilities, and boundaries.</item>
  <item>Use collectNebulaInputs + toPassportScores from @warpgogol/nebula instead of manual stub + field mapping.</item>
</CHANGE_SUMMARY>
*/

/**
 * @warpgogol/passport — Passport emission pipeline
 *
 * DNA-31 / RFC-0028
 *
 * Orchestrates the 10-step passport emission pipeline:
 *   1. Collect DNA check results
 *   2. Collect Lighthouse + axe results
 *   3. Collect content check results
 *   4. Assemble composition from system.yaml + uni.registry.yaml
 *   5. Assemble provenance from Git metadata + build environment
 *   6. Compute Nebula Score
 *   7. Sign provenance+composition as W3C VC
 *   8. Write cosmic-passport.json
 *   9. Render + write cosmic-star-map.svg
 *  10. Fire pulsar heartbeat (optional, never fails build)
 */

import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { SystemManifest } from "@warpgogol/ontology/schemas";
import { loadSystemManifest } from "@warpgogol/site-kernel-content";
import { computeNebulaScore, toPassportScores } from "@warpgogol/nebula/compute";
import { collectNebulaInputs } from "@warpgogol/nebula/collect";
import type { NebulaInputs } from "@warpgogol/nebula";
import { manifestToStarMapInput, emitStarMap } from "@warpgogol/star-map/render";
import type { UniRegistry } from "@warpgogol/star-map";
import {
  signCredential,
  assembleVerifiableCredential,
  type CredentialSubjectDigest,
} from "./sign.ts";
import type { PassportJson } from "./schema.ts";

// ---------------------------------------------------------------------------
// Emission context
// ---------------------------------------------------------------------------

export interface PassportEmitOptions {
  /** Absolute path to the app directory (contains system.yaml) */
  appDirectory: string;
  /** Absolute path to the dist output directory */
  distDirectory: string;
  /**
   * 32-byte Ed25519 private key as hex string.
   * Sourced from PASSPORT_SIGNING_KEY environment variable.
   * Never written to disk.
   */
  privateKeyHex: string;
  /** Active key version (from system.yaml release.passport.keyVersion) */
  keyVersion: string;
  /** App's public domain for DID construction (e.g. "nicaragua-projekt.de") */
  domain: string;
  /**
   * Nebula inputs collected from CI artifacts.
   * If absent, stub inputs are used (all-zero — development mode).
   */
  nebulaInputs?: NebulaInputs;
  /**
   * Path to uni.registry.yaml (workspace root).
   * Required only for depth=4 star map.
   */
  registryPath?: string;
  /** Star map depth (default: 3) */
  starMapDepth?: 3 | 4;
  /** Git commit SHA (sourced from CI environment) */
  commitSha?: string;
  /** Git commit ISO timestamp */
  commitAt?: string;
  /** Build start timestamp (ISO) */
  builtAt?: string;
  /** Build duration in ms */
  buildDurationMs?: number;
  /** CI builder identity (e.g. "github-actions/deploy/run-12345") */
  builder?: string;
  /** If set, performs a GET request to this URL after emission. Never fails build. */
  heartbeatUrl?: string;
}

// ---------------------------------------------------------------------------
// Main emission function
// ---------------------------------------------------------------------------

/**
 * Run the full passport emission pipeline.
 * Writes cosmic-passport.json and cosmic-star-map.svg to dist/.well-known/.
 *
 * @param options — emission context (app path, dist path, signing key, etc.)
 * @returns the emitted PassportJson (for testing / validation)
 */
export async function emitPassport(options: PassportEmitOptions): Promise<PassportJson> {
  const { appDirectory, distDirectory, privateKeyHex, keyVersion, domain } = options;

  const builtAt = options.builtAt ?? new Date().toISOString();
  const buildStart = Date.now();

  // Step 1+3: Read system manifest
  const systemResult = await loadSystemManifest(join(appDirectory, "src", "content"));
  const systemRaw = await readFile(systemResult.filePath, "utf8");
  const manifest = systemResult.manifest as SystemManifest;

  // Step 4: Compute system hash (SHA-256 of canonical YAML content)
  const systemHash = "sha256:" + createHash("sha256").update(systemRaw).digest("hex");

  // Step 2: Load registry for depth-4 star map (optional)
  let registry: UniRegistry = {};
  if (options.registryPath) {
    try {
      const registryRaw = await readFile(options.registryPath, "utf8");
      registry = JSON.parse(registryRaw) as UniRegistry;
    } catch {
      // registry not found — depth=3 is fine without it
    }
  }

  // Step 3: Nebula Score — collect from CI artifacts or use provided inputs
  const nebulaInputs = options.nebulaInputs ?? (await collectNebulaInputs({ appDirectory }));
  const nebulaScore = computeNebulaScore(nebulaInputs);

  // Step 5: Provenance
  const commitSha = options.commitSha ?? process.env["GITHUB_SHA"] ?? "unknown";
  const commitAt = options.commitAt ?? builtAt;
  const builder =
    options.builder ??
    (process.env["GITHUB_WORKFLOW"]
      ? `github-actions/${process.env["GITHUB_WORKFLOW"]}/${process.env["GITHUB_RUN_ID"]}`
      : "local");

  // Step 7: Sign
  const issuedAt = builtAt;
  const subject: CredentialSubjectDigest = { appId: manifest.app, systemHash, commitSha, issuedAt };
  const proof = await signCredential(subject, privateKeyHex, `did:web:${domain}#key-${keyVersion}`);
  const vc = assembleVerifiableCredential(manifest.app, domain, subject, proof, keyVersion);

  // Step 8: Assemble passport JSON
  const buildDurationMs = options.buildDurationMs ?? Date.now() - buildStart;

  const passport: PassportJson = {
    schemaVersion: "1.0",
    appId: manifest.app,
    issuedAt,
    composition: {
      systemHash,
      constellation: (manifest.constellations ?? [])[0] ?? manifest.app,
      biome: manifest.identity.biome,
      stars: (manifest.pages ?? []).map((page) => {
        const defaultLang = manifest.i18n?.default ?? "de";
        const rawRoute = (page.routes && page.routes[defaultLang]) ?? page.route ?? "";
        const route = rawRoute === "" ? "/" : rawRoute;
        return {
          route,
          cosmicStar: page.cosmicStar,
          planets: (page.planets ?? []).map((p) => ({
            cosmicPlanet: p.cosmicPlanet,
            pin: p.pin,
          })),
        };
      }),
    },
    provenance: {
      commitSha,
      commitAt,
      builtAt,
      buildDurationMs,
      builder,
      keyVersion,
      verifiableCredential: vc,
    },
    scores: toPassportScores(nebulaScore) satisfies PassportJson["scores"],
    links: {
      starMapSvg: "/.well-known/cosmic-star-map.svg",
      publicKey: "/.well-known/cosmic-passport-key.json",
      dnaReport: "/.well-known/dna-compliance.json",
    },
  };

  // Ensure dist/.well-known/ exists
  const wellKnownDir = join(distDirectory, ".well-known");
  await mkdir(wellKnownDir, { recursive: true });

  // Write passport.json
  const passportPath = join(wellKnownDir, "cosmic-passport.json");
  await writeFile(passportPath, JSON.stringify(passport, null, 2), "utf8");

  // Write nebula-score.json (standalone)
  const nebulaScoragePath = join(wellKnownDir, "nebula-score.json");
  await writeFile(nebulaScoragePath, JSON.stringify(nebulaScore, null, 2), "utf8");

  // Step 9: Render + write star map SVG
  const svgPath = join(wellKnownDir, "cosmic-star-map.svg");
  await emitStarMap(manifestToStarMapInput(manifest, registry, options.starMapDepth ?? 3), svgPath);

  // Step 10: Heartbeat (never fails build)
  if (options.heartbeatUrl) {
    await fireHeartbeat(options.heartbeatUrl);
  }

  return passport;
}

// ---------------------------------------------------------------------------
// Heartbeat
// ---------------------------------------------------------------------------

/**
 * Fire a GET request to the heartbeat URL.
 * Never throws — heartbeat failure is informational.
 */
async function fireHeartbeat(url: string): Promise<void> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
  } catch (err) {
    void err;
  }
}
