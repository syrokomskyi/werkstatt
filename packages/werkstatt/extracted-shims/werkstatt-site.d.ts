declare module "@warpgogol/werkstatt-site/checks" {
  export const GENERATOR_OWNERSHIP_MAP: Array<{
    markerPolicy: string;
    conditional: boolean;
    path: string;
    generator: string;
  }>;
  export const MISSION_PREFLIGHT_CRITICAL: Array<{ name: string; run: (systemId: string) => Promise<{ ok: boolean }> }>;
  export const MISSION_PREFLIGHT_WARNING: Array<{ name: string; run: (systemId: string) => Promise<{ ok: boolean }> }>;
  export const ensureChromium: (workspaceRoot: string, logger: { info: (msg: string) => void }) => Promise<void>;
  export function createStandardCheckModule(): unknown;
  export function runSemanticMirrorValidate(...args: unknown[]): Promise<unknown>;
}

declare module "@warpgogol/werkstatt-site/checks/pipelines" {
  export const SITES_CHECK_PIPELINE: unknown;
  export const STANDARD_COMPASS_PIPELINE: unknown;
  export const SITES_BUILD_PREPARE_PIPELINE: unknown;
  export const SITES_BUILD_PREPARE_DEV_PIPELINE: unknown;
  export const SITES_BUILD_CHECK_PIPELINE: unknown;
  export const SITES_BUILD_POST_PIPELINE: unknown;
}

declare module "@warpgogol/werkstatt-site/checks/generator-ownership" {
  export const GENERATOR_OWNERSHIP_MAP: Array<{
    markerPolicy: string;
    conditional: boolean;
    path: string;
    generator: string;
  }>;
}

declare module "@warpgogol/werkstatt-site/codegen" {
  export function runCleanIcons(...args: unknown[]): Promise<unknown>;
  export function runGenerateIcons(...args: unknown[]): Promise<unknown>;
  export function runGenerateMaterialCreditsPage(...args: unknown[]): Promise<unknown>;
  export function runGenerateOpenSourcePage(...args: unknown[]): Promise<unknown>;
  export function runMaterialMetadataWrite(...args: unknown[]): Promise<unknown>;
  export function runContentRefIndexGenerate(...args: unknown[]): Promise<unknown>;
  export function runContentRefMigrate(...args: unknown[]): Promise<unknown>;
  export function runContentFormulaMigrate(...args: unknown[]): Promise<unknown>;
}

declare module "@warpgogol/werkstatt-site/onboarding" {
  export function createOnboardingModule(): unknown;
}

declare module "@warpgogol/werkstatt-site/deploy" {
  export function runClientExport(...args: unknown[]): Promise<unknown>;
}

declare module "@warpgogol/werkstatt-site/paths" {
  export function requireAstroSitePaths(...args: unknown[]): unknown;
}

declare module "@warpgogol/werkstatt-site/domain/pbp/schemas/evidence-source" {
  import type { z } from "zod";
  export const evidenceSourceSchema: z.ZodType;
  export type EvidenceSource = z.infer<typeof evidenceSourceSchema>;
}
