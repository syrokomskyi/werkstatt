/*
<MODULE_CONTRACT>
<purpose>
passport.emit, passport.verify, passport.key.rotate, star-map.render,
nebula.score.compute, pulsar.heartbeat — validators and commands for the
Cosmic Passport pipeline (DNA-31..34, RFC-0028).
</purpose>
<non-goals>
  <item>Do not implement signing key storage — keys live in GitHub Actions secrets.</item>
  <item>Do not implement Lighthouse CI — that is a separate CI job; inputs are read from artifact files.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Wave 1 (RFC-0028): Initial creation.</item>
  <item>Fix (RFC-0029 review): Wrap return values in canonical { data, exitCode, summary } shape so non-zero exits propagate to CI.</item>
  <item>Use collectNebulaInputs from @gogol/nebula/collect for full 4-pillar input collection.</item>
</CHANGE_SUMMARY>
*/

import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  KernelCommandInput,
  KernelCommandResult,
  KernelRuntimeContext,
} from "@gogol/site-kernel";
import { requireAstroSitePaths } from "@gogol/site-kernel-astro";
import { optionalEnv } from "@gogol/site-kernel-integrity";
import { emitPassport } from "@gogol/passport/emit";
import { verifyPassport } from "@gogol/passport/verify";
import { rotateKey } from "@gogol/passport/key-rotate";
import { manifestToStarMapInput, emitStarMap } from "@gogol/star-map/render";
import { computeNebulaScore } from "@gogol/nebula/compute";
import { collectNebulaInputs } from "@gogol/nebula/collect";
import { loadSystemManifest } from "@gogol/site-kernel-content";
import type { SystemManifest } from "@gogol/site-kernel-content";

// ---------------------------------------------------------------------------
// Result helpers — all OS check commands MUST return KernelCommandResult shape
// { data, exitCode, summary } so the kernel runtime can propagate exit codes
// and CI gates can detect failures.
// ---------------------------------------------------------------------------

function fail(command: string, violations: string[]): KernelCommandResult {
  return {
    data: { command, status: "fail", violations },
    exitCode: 1,
    summary: `${command}: ${violations.length} violation(s)`,
  };
}

function pass(command: string, summary?: string): KernelCommandResult {
  return {
    data: { command, status: "pass", violations: [] },
    exitCode: 0,
    summary: summary ?? `${command}: OK`,
  };
}

// ---------------------------------------------------------------------------
// runPassportEmit
// ---------------------------------------------------------------------------

export async function runPassportEmit(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  let paths: ReturnType<typeof requireAstroSitePaths>;
  try {
    paths = requireAstroSitePaths(context);
  } catch (err) {
    return fail("passport.emit", [(err as Error).message]);
  }

  const privateKeyHex =
    (await optionalEnv("PASSPORT_SIGNING_KEY", paths.appDirectory)) ??
    process.env["PASSPORT_SIGNING_KEY"] ??
    "";
  if (!privateKeyHex) {
    context.logger.warn(
      "[passport.emit] PASSPORT_SIGNING_KEY is not set — skipping passport emission. " +
        "Set it to the 32-byte Ed25519 private key hex string to enable this step.",
    );
    return pass("passport.emit", "skipped — PASSPORT_SIGNING_KEY not set");
  }

  // Read system manifest for app identity
  let manifest: SystemManifest;
  try {
    const systemResult = await loadSystemManifest(paths.contentDirectory);
    manifest = systemResult.manifest;
  } catch (err) {
    return fail("passport.emit", [
      `PE-02: Could not read system manifest: ${(err as Error).message}`,
    ]);
  }

  const release = (manifest as unknown as Record<string, unknown>)["release"] as
    Record<string, unknown> | undefined;
  const passportConfig = release?.["passport"] as Record<string, unknown> | undefined;
  const keyVersion = (passportConfig?.["keyVersion"] as string) ?? "v1";

  const domain = `${manifest.app}.example.org`;

  const distDirectory = join(paths.appDirectory, "dist");
  await mkdir(join(distDirectory, ".well-known"), { recursive: true });

  try {
    await emitPassport({
      appDirectory: paths.appDirectory,
      distDirectory,
      privateKeyHex,
      keyVersion,
      domain,
      heartbeatUrl: passportConfig?.["heartbeatUrl"] as string | undefined,
    });
  } catch (err) {
    return fail("passport.emit", [`PE-03: passport.emit failed: ${(err as Error).message}`]);
  }

  return pass("passport.emit", "passport emitted successfully");
}

// ---------------------------------------------------------------------------
// runPassportVerify
// ---------------------------------------------------------------------------

export async function runPassportVerify(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  let paths: ReturnType<typeof requireAstroSitePaths>;
  try {
    paths = requireAstroSitePaths(context);
  } catch (err) {
    return fail("passport.verify", [(err as Error).message]);
  }

  const artifactDirectory = join(paths.appDirectory, "dist");
  const result = await verifyPassport(artifactDirectory, paths.appDirectory);
  const privateKeyHex =
    (await optionalEnv("PASSPORT_SIGNING_KEY", paths.appDirectory)) ??
    process.env["PASSPORT_SIGNING_KEY"] ??
    "";

  if (!privateKeyHex && result.errors.some((error) => error.includes("passport.json not found"))) {
    return pass(
      "passport.verify",
      "skipped — PASSPORT_SIGNING_KEY not set and passport artifact not emitted",
    );
  }

  if (result.errors.length > 0) {
    return fail("passport.verify", result.errors);
  }

  if (!result.signatureValid) {
    return fail("passport.verify", ["PV-05: VC signature is invalid"]);
  }

  if (!result.systemHashMatch) {
    return fail("passport.verify", ["PV-06: systemHash does not match current system.yaml"]);
  }

  return pass("passport.verify", "VC signature + systemHash verified");
}

// ---------------------------------------------------------------------------
// runPassportKeyRotate
// ---------------------------------------------------------------------------

export async function runPassportKeyRotate(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  let paths: ReturnType<typeof requireAstroSitePaths>;
  try {
    paths = requireAstroSitePaths(context);
  } catch (err) {
    return fail("passport.key.rotate", [(err as Error).message]);
  }

  let manifest: SystemManifest;
  try {
    const systemResult = await loadSystemManifest(paths.contentDirectory);
    manifest = systemResult.manifest;
  } catch (err) {
    return fail("passport.key.rotate", [
      `PKR-01: Could not read system manifest: ${(err as Error).message}`,
    ]);
  }

  const isInitial = !input.flags["existingKey"];

  try {
    const result = await rotateKey({
      appDirectory: paths.appDirectory,
      appId: manifest.app,
      initial: isInitial,
    });

    // Print private key to stdout for secure storage — NEVER write to disk
    console.log("\n" + "=".repeat(70));
    console.log("PASSPORT KEY ROTATION COMPLETE");
    console.log("=".repeat(70));
    console.log(`App:         ${manifest.app}`);
    console.log(`New version: ${result.newVersion}`);
    console.log(`Public key file: ${result.publicKeyFilePath}`);
    console.log("\n⚠️  PRIVATE KEY (copy to GitHub Actions secret PASSPORT_SIGNING_KEY):");
    console.log(result.privateKeyHex);
    console.log("\nNext steps:");
    console.log(`  1. Update system.yaml: release.passport.keyVersion: ${result.newVersion}`);
    console.log(
      "  2. Add PASSPORT_SIGNING_KEY secret to GitHub Actions (scoped to deploy workflow)",
    );
    console.log("  3. Commit the updated public key file");
    console.log("=".repeat(70) + "\n");
  } catch (err) {
    return fail("passport.key.rotate", [`PKR-02: Key rotation failed: ${(err as Error).message}`]);
  }

  return pass("passport.key.rotate", "key rotated; private key printed to stdout");
}

// ---------------------------------------------------------------------------
// runStarMapRender
// ---------------------------------------------------------------------------

export async function runStarMapRender(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  let paths: ReturnType<typeof requireAstroSitePaths>;
  try {
    paths = requireAstroSitePaths(context);
  } catch (err) {
    return fail("star-map.render", [(err as Error).message]);
  }

  let manifest: SystemManifest;
  try {
    const systemResult = await loadSystemManifest(paths.contentDirectory);
    manifest = systemResult.manifest;
  } catch (err) {
    return fail("star-map.render", [
      `SMR-01: Could not read system manifest: ${(err as Error).message}`,
    ]);
  }

  const depthFlag = input.flags["depth"];
  const depth = depthFlag === "4" || depthFlag === true ? 4 : 3;

  // Note: this check command passes {} as the registry, so --depth=4 produces
  // star and planet nodes but no moon nodes (resolveMoons returns [] for an
  // empty registry). To get full depth-4 output, use the passport.emit pipeline
  // which loads the real uni.registry.yaml.
  try {
    const svgPath = join(paths.appDirectory, "dist", ".well-known", "cosmic-star-map.svg");
    await emitStarMap(manifestToStarMapInput(manifest, {}, depth), svgPath);
  } catch (err) {
    return fail("star-map.render", [`SMR-02: Star map render failed: ${(err as Error).message}`]);
  }

  return pass("star-map.render", `SVG written (depth=${depth})`);
}

// ---------------------------------------------------------------------------
// runNebulaScoreCompute
// ---------------------------------------------------------------------------

export async function runNebulaScoreCompute(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  let paths: ReturnType<typeof requireAstroSitePaths>;
  try {
    paths = requireAstroSitePaths(context);
  } catch (err) {
    return fail("nebula.score.compute", [(err as Error).message]);
  }

  const nebulaInputs = await collectNebulaInputs({ appDirectory: paths.appDirectory });

  let scoreValue = 0;
  try {
    const score = computeNebulaScore(nebulaInputs);
    scoreValue = score.nebula;
    const distDir = join(paths.appDirectory, "dist", ".well-known");
    await mkdir(distDir, { recursive: true });
    await writeFile(join(distDir, "nebula-score.json"), JSON.stringify(score, null, 2), "utf8");
    context.logger.info(`[nebula.score.compute] Nebula Score: ${score.nebula}/100`);
  } catch (err) {
    return fail("nebula.score.compute", [
      `NSC-01: Score computation failed: ${(err as Error).message}`,
    ]);
  }

  return pass("nebula.score.compute", `Nebula Score: ${scoreValue}/100`);
}

// ---------------------------------------------------------------------------
// runPulsarHeartbeat — never fails the build
// ---------------------------------------------------------------------------

export async function runPulsarHeartbeat(
  input: KernelCommandInput,
  context: KernelRuntimeContext,
): Promise<KernelCommandResult> {
  let paths: ReturnType<typeof requireAstroSitePaths>;
  try {
    paths = requireAstroSitePaths(context);
  } catch (err) {
    // pulsar.heartbeat is informational — never fails the build
    context.logger.warn(`[pulsar.heartbeat] paths resolution failed: ${(err as Error).message}`);
    return pass("pulsar.heartbeat", "skipped (no app paths)");
  }

  let manifest: SystemManifest;
  try {
    const raw = await readFile(join(paths.appDirectory, "system.yaml"), "utf8");
    manifest = parseYaml(raw) as SystemManifest;
  } catch {
    return pass("pulsar.heartbeat", "skipped (no system.yaml)");
  }

  const release = (manifest as unknown as Record<string, unknown>)["release"] as
    Record<string, unknown> | undefined;
  const passportConfig = release?.["passport"] as Record<string, unknown> | undefined;
  const heartbeatUrl = passportConfig?.["heartbeatUrl"] as string | undefined;

  if (!heartbeatUrl) {
    context.logger.info("[pulsar.heartbeat] No heartbeatUrl configured in system.yaml — skipping.");
    return pass("pulsar.heartbeat", "no heartbeatUrl configured");
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(heartbeatUrl, { signal: controller.signal });
    clearTimeout(timeout);
    context.logger.info(`[pulsar.heartbeat] Pinged ${heartbeatUrl} — HTTP ${response.status}`);
    return pass("pulsar.heartbeat", `pinged HTTP ${response.status}`);
  } catch (err) {
    context.logger.warn(
      `[pulsar.heartbeat] Heartbeat to ${heartbeatUrl} failed (non-fatal):`,
      (err as Error).message,
    );
    return pass("pulsar.heartbeat", "heartbeat failed (non-fatal)");
  }
}
