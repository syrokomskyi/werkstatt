/*
<MODULE_CONTRACT>
<purpose>
  Pipeline orchestrator for passport emission. Extracted from emit.ts
  so each pipeline step is independently testable and the orchestration
  logic is separate from the I/O concerns.
</purpose>
<non-goals>
  <item>Do not perform file I/O — steps return data, the caller writes it.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Architecture review 2026-07-14: extract pipeline steps from emit.ts.</item>
</CHANGE_SUMMARY>
*/

import { createHash } from "node:crypto";
import type { SystemManifest } from "@warpgogol/werkstatt-site/ontology/schemas";
import { computeNebulaScore, toPassportScores } from "@warpgogol/werkstatt-site/nebula/compute";
import type { NebulaInputs, NebulaScore } from "@warpgogol/werkstatt-site/nebula";
import type { UniRegistry } from "@warpgogol/werkstatt-site/star-map";
import {
  signCredential,
  assembleVerifiableCredential,
  type CredentialSubjectDigest,
} from "./sign.ts";
import type { PassportJson } from "./schema.ts";

export interface PipelineContext {
  manifest: SystemManifest;
  systemRaw: string;
  registry: UniRegistry;
  nebulaInputs: NebulaInputs;
  privateKeyHex: string;
  keyVersion: string;
  domain: string;
  commitSha: string;
  commitAt: string;
  builtAt: string;
  buildDurationMs: number;
  builder: string;
  starMapDepth: 3 | 4;
}

export interface PipelineResult {
  passport: PassportJson;
  nebulaScore: NebulaScore;
  systemHash: string;
}

export function computeSystemHash(systemRaw: string): string {
  return "sha256:" + createHash("sha256").update(systemRaw).digest("hex");
}

export function computeNebula(inputs: NebulaInputs): NebulaScore {
  return computeNebulaScore(inputs);
}

export function buildProvenance(ctx: PipelineContext, systemHash: string) {
  const subject: CredentialSubjectDigest = {
    appId: ctx.manifest.app,
    systemHash,
    commitSha: ctx.commitSha,
    issuedAt: ctx.builtAt,
  };
  return { subject };
}

export async function signPassportCredential(
  ctx: PipelineContext,
  systemHash: string,
): Promise<PassportJson> {
  const nebulaScore = computeNebula(ctx.nebulaInputs);
  const { subject } = buildProvenance(ctx, systemHash);
  const proof = await signCredential(
    subject,
    ctx.privateKeyHex,
    `did:web:${ctx.domain}#key-${ctx.keyVersion}`,
  );
  const vc = assembleVerifiableCredential(
    ctx.manifest.app,
    ctx.domain,
    subject,
    proof,
    ctx.keyVersion,
  );

  const passport: PassportJson = {
    schemaVersion: "1.0",
    appId: ctx.manifest.app,
    issuedAt: ctx.builtAt,
    composition: {
      systemHash,
      constellation: (ctx.manifest.constellations ?? [])[0] ?? ctx.manifest.app,
      biome: ctx.manifest.identity.biome,
      stars: (ctx.manifest.pages ?? []).map((page) => {
        const defaultLang = ctx.manifest.i18n?.default ?? "de";
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
      commitSha: ctx.commitSha,
      commitAt: ctx.commitAt,
      builtAt: ctx.builtAt,
      buildDurationMs: ctx.buildDurationMs,
      builder: ctx.builder,
      keyVersion: ctx.keyVersion,
      verifiableCredential: vc,
    },
    scores: toPassportScores(nebulaScore) satisfies PassportJson["scores"],
    links: {
      starMapSvg: "/.well-known/cosmic-star-map.svg",
      publicKey: "/.well-known/cosmic-passport-key.json",
      dnaReport: "/.well-known/dna-compliance.json",
    },
  };

  return passport;
}

export async function runPipeline(ctx: PipelineContext): Promise<PipelineResult> {
  const systemHash = computeSystemHash(ctx.systemRaw);
  const passport = await signPassportCredential(ctx, systemHash);
  const nebulaScore = computeNebula(ctx.nebulaInputs);
  return { passport, nebulaScore, systemHash };
}
