/*
<MODULE_CONTRACT>
<purpose>Phaser project scaffold hook — generates a new Phaser project with scene boilerplate.</purpose>
<keywords>scaffold, onboarding, phaser</keywords>
<responsibilities>
  <item>Creates src/scenes/boot.ts with a minimal boot scene.</item>
  <item>Creates src/assets/manifest.yaml with an empty manifest skeleton.</item>
  <item>Creates phaser.config.ts with boot scene registered and bundleBudget: 5242880.</item>
  <item>Creates package.json, tsconfig.json, vite.config.ts for the game project.</item>
</responsibilities>
<non-goals>
  <item>Does not install dependencies — the consumer runs pnpm install after scaffold.</item>
  <item>Does not create game content — games are projects, not plugin content.</item>
</non-goals>
</MODULE_CONTRACT>
<CHANGE_SUMMARY>
  <item>Initial Phaser project scaffold — boot scene, asset manifest, phaser.config.ts, package.json, tsconfig.json, vite.config.ts.</item>
  <item>Migration from werkstatt-game: renamed from game to phaser.</item>
  <item>Fix boot scene infinite loop, add missing Phaser import in phaser.config.ts, use writeFileIfChanged for idempotent writes (RFC-0345).</item>
</CHANGE_SUMMARY>
*/

import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { writeFileIfChanged } from "@warpgogol/werkstatt/kernel";
import type { PluginHookContext, HookResult } from "@warpgogol/werkstatt/plugin";

const BOOT_SCENE_TS = `export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: "BootScene" });
  }

  preload() {
    // Load assets here
  }

  create() {
    // Boot scene — initialise global game systems here.
    // Transition to the next scene via this.scene.start("NextScene").
  }
}
`;

const PHASER_CONFIG_TS = `import Phaser from "phaser";
import { BootScene } from "./src/scenes/boot.ts";

export interface PhaserGameConfig {
  type: number;
  width: number;
  height: number;
  scene: Array<{ key: string; scene: unknown }>;
  bundleBudget: number;
}

const config: PhaserGameConfig = {
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  scene: [
    { key: "BootScene", scene: BootScene },
  ],
  bundleBudget: 5242880, // 5 MB gzipped
};

export default config;
`;

const MANIFEST_YAML = `# Asset manifest — list all game assets here
# Each entry: { path: <relative-to-src/assets>, type: <image|audio|spritesheet|atlas> }
assets: []
`;

const PACKAGE_JSON = `{
  "name": "my-phaser-game",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "phaser": "^3.90.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vite": "^5.4.0"
  }
}
`;

const TSCONFIG_JSON = `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["phaser"]
  },
  "include": ["src/**/*.ts", "phaser.config.ts"]
}
`;

const VITE_CONFIG_TS = `import { defineConfig } from "vite";

export default defineConfig({
  build: {
    outDir: "dist",
    target: "es2022",
  },
  server: {
    port: 3000,
  },
});
`;

const MAIN_TS = `import Phaser from "phaser";
import config from "../phaser.config.ts";

const game = new Phaser.Game(config as Phaser.Types.Core.GameConfig);
export default game;
`;

export async function scaffoldPhaserProject(ctx: PluginHookContext): Promise<HookResult> {
  const projectPath = ctx.workpiecePath ?? ctx.workspaceRoot;
  const projectId = (ctx as PluginHookContext & { projectId?: string }).projectId ?? "my-phaser-game";

  ctx.logger.info(`scaffold-project: creating Phaser project at ${projectPath}`);

  try {
    await mkdir(join(projectPath, "src", "scenes"), { recursive: true });
    await mkdir(join(projectPath, "src", "assets"), { recursive: true });
    await mkdir(join(projectPath, "public"), { recursive: true });

    await writeFileIfChanged(join(projectPath, "src", "scenes", "boot.ts"), BOOT_SCENE_TS);
    await writeFileIfChanged(join(projectPath, "src", "assets", "manifest.yaml"), MANIFEST_YAML);
    await writeFileIfChanged(join(projectPath, "src", "main.ts"), MAIN_TS);
    await writeFileIfChanged(join(projectPath, "phaser.config.ts"), PHASER_CONFIG_TS);
    await writeFileIfChanged(join(projectPath, "vite.config.ts"), VITE_CONFIG_TS);

    const pkgJson = PACKAGE_JSON.replace('"my-phaser-game"', `"${projectId}"`);
    await writeFileIfChanged(join(projectPath, "package.json"), pkgJson);

    await writeFileIfChanged(join(projectPath, "tsconfig.json"), TSCONFIG_JSON);

    ctx.logger.info("scaffold-project: project created successfully");
    return {
      success: true,
      data: {
        projectPath,
        filesCreated: [
          "src/scenes/boot.ts",
          "src/assets/manifest.yaml",
          "src/main.ts",
          "phaser.config.ts",
          "vite.config.ts",
          "package.json",
          "tsconfig.json",
        ],
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.logger.error("scaffold-project: failed", { error: message });
    return {
      success: false,
      errors: [`scaffoldProject failed: ${message}`],
    };
  }
}
