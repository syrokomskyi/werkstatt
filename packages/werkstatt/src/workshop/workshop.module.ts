/*
<MODULE_CONTRACT>
  <purpose>Workshop kernel module (RFC-0779) — registers the workshop.scaffold command.</purpose>
  <non-goals>
    <item>Do not register mission, sternsystem, or other engine commands — those have their own modules.</item>
    <item>Do not import stack plugins — this module is stack-agnostic (DNA-64).</item>
  </non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>RFC-0779: initial workshop module registering workshop.scaffold command.</item>
</CHANGE_SUMMARY>
*/

import type { KernelModule } from "../kernel/types.ts";

export function createWorkshopModule(): KernelModule {
  return {
    name: "workshop",
    version: "0.1.0",
    async register(registry) {
      const { runWorkshopScaffold } = await import("./workshop-scaffold.ts");

      registry.registerCommand({
        name: "workshop.scaffold",
        description:
          "Scaffold a consumer workshop monorepo from a stack profile (RFC-0779). Creates workshop files, delegates forge artifacts to forge.init.",
        scope: "workspace",
        supportsAllSites: false,
        mutatesState: true,
        requiresNetwork: true,
        longRunning: true,
        flags: {
          name: {
            kind: "string",
            required: true,
            description: "Workshop name (kebab-case).",
          },
          stack: {
            kind: "string",
            required: true,
            description:
              "Stack profile id. Available: astro-typescript-turborepo, phaser-turborepo, editframe.",
          },
          dest: {
            kind: "string",
            required: true,
            description: "Absolute path for the new workshop directory.",
          },
          "dry-run": {
            kind: "boolean",
            description: "Preview generated files without writing.",
          },
          verify: {
            kind: "boolean",
            description:
              "Run post-scaffold verification (pnpm install + forge.doctor + plugin.validate + autonomy.validate). Requires valid .npmrc token.",
          },
        },
        writes: ["{dest}/**"],
        cacheable: false,
        execute: runWorkshopScaffold,
      });
    },
  };
}
